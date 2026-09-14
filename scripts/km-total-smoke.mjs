const endpoint = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9334';
const appUrlMatch = process.env.APP_URL_MATCH || '127.0.0.1';

const pages = await fetch(`${endpoint}/json/list`).then((response) => response.json());
const page = pages.find((item) => item.type === 'page' && item.url.includes(appUrlMatch));
if (!page?.webSocketDebuggerUrl) throw new Error(`Página do app não encontrada (${appUrlMatch}).`);

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let sequence = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const payload = JSON.parse(String(event.data));
  if (!payload.id || !pending.has(payload.id)) return;
  const request = pending.get(payload.id);
  pending.delete(payload.id);
  if (payload.error) request.reject(new Error(payload.error.message));
  else request.resolve(payload.result);
});

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Erro ao avaliar a página.');
  return result.result?.value;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (expression, label, timeout = 20_000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await evaluate(expression)) return;
    await sleep(150);
  }
  throw new Error(`Tempo esgotado: ${label}`);
};
const bodyIncludes = (text) => `document.body.textContent.toLocaleLowerCase('pt-BR').includes(${JSON.stringify(text.toLocaleLowerCase('pt-BR'))})`;
const setInput = (selector, value) => evaluate(`(() => {
  const input = document.querySelector(${JSON.stringify(selector)});
  if (!input) return false;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
const clickText = (text) => evaluate(`(() => {
  const normalized = ${JSON.stringify(text)}.toLocaleLowerCase('pt-BR');
  const button = [...document.querySelectorAll('button')].find((item) => item.textContent.trim().toLocaleLowerCase('pt-BR').includes(normalized));
  if (!button) return false;
  button.click();
  return true;
})()`);

const origin = new URL(page.url).origin;

try {
  await send('Network.enable');
  await send('Storage.clearDataForOrigin', { origin, storageTypes: 'all' });
  await evaluate(`location.hash = '#/'`);
  await send('Page.reload', { ignoreCache: true });
  await waitFor(`navigator.serviceWorker?.getRegistration().then(Boolean)`, 'service worker registrado');
  await send('Page.reload', { ignoreCache: false });
  await waitFor(`navigator.serviceWorker.controller !== null`, 'app controlado pelo cache offline');

  // Injeta somente o contexto local depois de desligar a rede. Assim a
  // simulação nunca cadastra dispositivo ou OS de QA no Supabase.
  await send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
    connectionType: 'none'
  });
  await evaluate(`localStorage.setItem('gestao_rural_farm_context_v2', JSON.stringify({
    farm_id: 'ca4f1e9a-2026-4e57-8000-000000000001',
    farm_name: 'Campo Legado Consultoria',
    employee_id: 'tecnico-01',
    employee_name: 'Ana Victória Freitas Ribeiro',
    employee_role: 'Técnico',
    is_admin: false,
    device_id: 'qa-km-read-only'
  })); localStorage.setItem('campo_legado_test_period_reset_2026_08_03_v1', 'true'); localStorage.setItem('campo_legado_remove_legacy_records_v1', 'true'); localStorage.setItem('error_cleanup_v1', 'true'); location.hash = '#/anomalies/add';`);
  await send('Page.reload', { ignoreCache: false });
  await waitFor(bodyIncludes('Nova Ordem de Serviço'), 'formulário offline');
  await evaluate(`document.querySelector('button[aria-haspopup="dialog"]')?.click()`);
  await waitFor(bodyIncludes('Acir Braga Coelho'), 'clientes offline');
  await clickText('Acir Braga Coelho');
  await clickText('Despesa');
  await setInput('input[inputmode="decimal"]', '3');
  await setInput('input[aria-label="Valor total do deslocamento"]', '10000');
  await setInput('input[aria-label="Outros valores a receber"]', '2500');
  await setInput('input[aria-label="Descrição dos outros valores"]', 'Pedágio');
  await waitFor(`${bodyIncludes('R$ 100,00')} && ${bodyIncludes('R$ 33,33')} && ${bodyIncludes('R$ 125,00')}`, 'cálculo sem perda por arredondamento');
  const saveButtonReady = await evaluate(`(() => { const button = [...document.querySelectorAll('button')].find((item) => item.textContent.toLocaleLowerCase('pt-BR').includes('salvar os')); return Boolean(button && !button.disabled); })()`);
  if (!saveButtonReady) throw new Error('Botão Salvar OS indisponível.');
  const saveSubmitted = await evaluate(`(() => { const form = document.querySelector('form'); if (!form) return false; form.requestSubmit(); return true; })()`);
  if (!saveSubmitted) throw new Error('Formulário da OS não encontrado.');
  await sleep(500);
  const immediateSaveState = await evaluate(`JSON.stringify({ hash: location.hash, alerts: [...document.querySelectorAll('[role="alert"]')].map((item) => item.textContent.trim()), bodyEnd: document.body.innerText.slice(-500) })`);
  if (!(await evaluate(`location.hash === '#/anomalies/list'`))) console.error(immediateSaveState);
  try {
    await waitFor(`location.hash === '#/anomalies/list' && ${bodyIncludes('Acir Braga Coelho')}`, 'salvamento offline');
  } catch (error) {
    console.error(await evaluate(`JSON.stringify({ hash: location.hash, body: document.body.innerText })`));
    throw error;
  }
  const detailClicked = await clickText('Acir Braga Coelho');
  if (!detailClicked) throw new Error('Cartão da OS salva não encontrado.');
  await waitFor(`location.hash.startsWith('#/anomalies/detail/')`, 'abrir detalhes da OS');
  try {
    await waitFor(`${bodyIncludes('KM rodados')} && ${bodyIncludes('Valor total do deslocamento')} && ${bodyIncludes('R$ 100,00')} && ${bodyIncludes('Valor médio por KM')} && ${bodyIncludes('R$ 33,33')} && ${bodyIncludes('Outros valores a receber')} && ${bodyIncludes('R$ 25,00')} && ${bodyIncludes('Pedágio')} && ${bodyIncludes('R$ 125,00')}`, 'detalhes da despesa');
  } catch (error) {
    console.error(await evaluate(`document.body.innerText`));
    throw error;
  }

  console.log(JSON.stringify({
    ok: true,
    scenario: '3 km com deslocamento de R$ 100,00 e outros R$ 25,00',
    expectedAverage: 'R$ 33,33',
    preservedKmTotal: 'R$ 100,00',
    finalExpenseTotal: 'R$ 125,00'
  }, null, 2));
} finally {
  try {
    await send('Storage.clearDataForOrigin', { origin, storageTypes: 'all' });
    await send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
      connectionType: 'wifi'
    });
  } finally {
    socket.close();
  }
}
