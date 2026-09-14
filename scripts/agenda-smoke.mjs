const endpoint = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9333';
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
  const { resolve, reject } = pending.get(payload.id);
  pending.delete(payload.id);
  if (payload.error) reject(new Error(payload.error.message));
  else resolve(payload.result);
});

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});

const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Falha ao avaliar página.');
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

const setInput = (selector, value) => evaluate(`(() => {
  const input = document.querySelector(${JSON.stringify(selector)});
  if (!input) return false;
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, ${JSON.stringify(value)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);

const clickText = (text) => evaluate(`(() => {
  const normalized = ${JSON.stringify(text)}.toLocaleLowerCase('pt-BR');
  const element = [...document.querySelectorAll('button')].find((item) => item.textContent.trim().toLocaleLowerCase('pt-BR').includes(normalized));
  if (!element) return false;
  element.click();
  return true;
})()`);

const bodyIncludes = (text) => `document.body.textContent.toLocaleLowerCase('pt-BR').includes(${JSON.stringify(text.toLocaleLowerCase('pt-BR'))})`;
const results = [];
const check = async (name, expression) => {
  const ok = Boolean(await evaluate(expression));
  results.push({ name, ok });
  if (!ok) throw new Error(`Falhou: ${name}`);
};

const origin = new URL(page.url).origin;

try {
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Network.enable');
  await send('Storage.clearDataForOrigin', { origin, storageTypes: 'all' });
  await send('Network.clearBrowserCache');
  await evaluate(`location.hash = '#/'`);
  await send('Page.reload', { ignoreCache: true });
  await waitFor(`navigator.serviceWorker?.getRegistration().then(Boolean)`, 'service worker registrado');
  await send('Page.reload', { ignoreCache: false });
  await waitFor(`navigator.serviceWorker.controller !== null`, 'app controlado pelo cache offline');

  // Todo o cenário usa apenas IndexedDB/localStorage. Desliga a rede antes de
  // criar o contexto para não registrar dispositivo ou fixture no Supabase.
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
    employee_id: 'administrador-campo-legado',
    employee_name: 'Administrador',
    employee_role: 'Administrador',
    is_admin: true,
    device_id: 'qa-agenda-read-only'
  })); localStorage.setItem('campo_legado_test_period_reset_2026_08_03_v1', 'true'); localStorage.setItem('campo_legado_remove_legacy_records_v1', 'true'); localStorage.setItem('error_cleanup_v1', 'true'); location.hash = '#/agenda';`);
  await send('Page.reload', { ignoreCache: false });
  await waitFor(bodyIncludes('Quem estará onde'), 'agenda do administrador');
  await check('Administrador visualiza toda a equipe', bodyIncludes('Toda a equipe'));
  await check('Agenda possui manhã e tarde', `${bodyIncludes('Manhã')} && ${bodyIncludes('Tarde')}`);
  await check('Agenda oferece período de dia todo', bodyIncludes('Dia todo'));

  // Todo o registro de teste é criado offline e removido antes de reativar a rede.
  await send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
    connectionType: 'none'
  });

  await clickText('Marcar nova visita');
  await waitFor(bodyIncludes('Novo compromisso'), 'formulário de visita');
  await clickText('Selecione o cliente');
  await waitFor(bodyIncludes('Acir Braga Coelho'), 'busca de clientes offline');
  await clickText('Acir Braga Coelho');
  await clickText('Dia todo');
  await clickText('Visita técnica');
  await clickText('Confirmar visita');
  await waitFor(`document.querySelector('[aria-labelledby="appointment-form-title"]') === null`, 'formulário fechar após salvar visita');
  await waitFor(bodyIncludes('Acir Braga Coelho'), 'visita salva offline');
  await check('Visita offline aparece na agenda', `${bodyIncludes('Acir Braga Coelho')} && ${bodyIncludes('Agendado')}`);

  await evaluate(`(() => {
    const section = [...document.querySelectorAll('article')].find((item) => item.textContent.includes('Manhã'));
    const button = [...(section?.querySelectorAll('button') || [])].find((item) => item.textContent.includes('Marcar'));
    button?.click();
  })()`);
  await waitFor(bodyIncludes('Novo compromisso'), 'formulário de conflito de período');
  await clickText('Selecione o cliente');
  await waitFor(bodyIncludes('Acir Braga Coelho'), 'clientes no teste de conflito');
  await clickText('Acir Braga Coelho');
  await clickText('Visita técnica');
  await clickText('Confirmar visita');
  await waitFor(bodyIncludes('período que se sobrepõe'), 'bloqueio de conflito com dia todo');
  await check('Dia todo bloqueia manhã e tarde do funcionário', bodyIncludes('período que se sobrepõe'));
  await evaluate(`document.querySelector('button[aria-label="Fechar"]')?.click()`);

  await clickText('Atendido');
  await waitFor(`[...document.querySelectorAll('span')].some((item) => item.textContent.trim() === 'Atendido')`, 'visita atendida');
  await check('Situação da visita pode ser concluída', `[...document.querySelectorAll('span')].some((item) => item.textContent.trim() === 'Atendido')`);

  await evaluate(`document.querySelector('button[aria-label^="Editar visita de Acir Braga Coelho"]')?.click()`);
  await waitFor(bodyIncludes('Editar visita'), 'edição do agendamento');
  await check('Agenda permite editar o compromisso', bodyIncludes('Salvar alterações'));
  await evaluate(`document.querySelector('button[aria-label="Fechar"]')?.click()`);

  await evaluate(`document.querySelector('button[aria-label^="Excluir visita de Acir Braga Coelho"]')?.click()`);
  await waitFor(bodyIncludes('Excluir esta visita?'), 'confirmação de exclusão');
  await check('Exclusão exige confirmação', bodyIncludes('Confirmar exclusão'));
  await clickText('Cancelar');

  const adminContext = await evaluate(`localStorage.getItem('gestao_rural_farm_context_v2')`);
  if (!adminContext) throw new Error('Contexto administrativo não encontrado.');
  await evaluate(`(() => {
    const context = JSON.parse(localStorage.getItem('gestao_rural_farm_context_v2'));
    localStorage.setItem('gestao_rural_farm_context_v2', JSON.stringify({
      ...context,
      employee_id: 'tecnico-01',
      employee_name: 'Ana Victória Freitas Ribeiro',
      employee_role: 'Técnico',
      is_admin: false,
      is_owner: false,
      admin_pin: undefined
    }));
    localStorage.removeItem('app_gestao_rural_auth');
    location.hash = '#/agenda';
  })()`);
  await send('Page.reload', { ignoreCache: false });
  await waitFor(bodyIncludes('Minha agenda'), 'agenda do técnico offline');
  await check('Técnico não vê compromisso do administrador', `!${bodyIncludes('Acir Braga Coelho')}`);
  await check('Técnico não possui filtro de equipe', `!${bodyIncludes('Toda a equipe')}`);

  await evaluate(`localStorage.setItem('gestao_rural_farm_context_v2', ${JSON.stringify(adminContext)}); location.hash = '#/agenda'`);
  await send('Page.reload', { ignoreCache: false });
  await waitFor(bodyIncludes('Toda a equipe'), 'retorno do administrador');
  await waitFor(bodyIncludes('Acir Braga Coelho'), 'compromisso preservado para o administrador');
  await check('Administrador volta a visualizar o compromisso', bodyIncludes('Acir Braga Coelho'));

  console.log(JSON.stringify({ ok: results.every((item) => item.ok), results }, null, 2));
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
