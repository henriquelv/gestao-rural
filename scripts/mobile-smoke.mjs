import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
const waitFor = async (expression, label, timeout = 15_000) => {
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

await send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true
});
await send('Emulation.setTouchEmulationEnabled', {
  enabled: true,
  maxTouchPoints: 5
});
await send('Network.enable');
await send('Storage.clearDataForOrigin', {
  origin: new URL(page.url).origin,
  storageTypes: 'all'
});
await send('Network.clearBrowserCache');
await evaluate(`location.hash = '#/'`);
await send('Page.reload', { ignoreCache: true });
await waitFor(`document.querySelector('input[placeholder="TESTE"]') !== null`, 'tela de ativação');
await setInput('input[placeholder="TESTE"]', 'TESTE');
await evaluate(`document.querySelector('button[title="Validar código"]')?.click()`);
await waitFor(`document.querySelector('button[aria-haspopup="dialog"]') !== null`, 'validação do código', 20_000);
await evaluate(`document.querySelector('button[aria-haspopup="dialog"]')?.click()`);
await waitFor(bodyIncludes('Administrador'), 'lista de perfis');
await clickText('Administrador');
await setInput('input[aria-label^="Senha do perfil"]', '1234');
await clickText('Concluir ativação');
await waitFor(bodyIncludes('Ordem de Serviço (OS)'), 'home do administrador', 20_000);
await check('Administrador vê Configurações', bodyIncludes('Configurações'));
await check('Home do administrador exibe quatro módulos', `document.querySelectorAll('section[aria-label="Módulos disponíveis"] > button').length === 4`);
await check('Home exibe a Agenda', bodyIncludes('Agenda de visitas'));

await evaluate(`location.hash = '#/agenda'`);
await waitFor(bodyIncludes('Quem estará onde'), 'agenda do administrador', 20_000);
await check('Administrador acessa a agenda de toda a equipe', bodyIncludes('Toda a equipe'));
await check('Agenda divide o dia entre manhã e tarde', `${bodyIncludes('Manhã')} && ${bodyIncludes('Tarde')}`);

await evaluate(`location.hash = '#/settings'`);
await waitFor(`location.hash === '#/settings' && [...document.querySelectorAll('button')].some((item) => item.textContent.trim() === 'OS')`, 'configurações do administrador', 20_000);
await evaluate(`(() => {
  const button = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === 'OS');
  if (!button) return false;
  button.click();
  return true;
})()`);
await waitFor(bodyIncludes('Gestão de OS'), 'gestão de OS nas configurações', 20_000);
await check('Configurações oferece criação de OS', bodyIncludes('Nova OS'));
await waitFor(`document.querySelector('article button') !== null`, 'lista administrativa de OS', 20_000);
await check('Configurações lista OS para edição e exclusão', `${bodyIncludes('Editar')} && ${bodyIncludes('Excluir')}`);
await evaluate(`([...document.querySelectorAll('button')].find((item) => item.textContent.trim() === 'Excluir'))?.click()`);
await waitFor(bodyIncludes('Excluir esta OS?'), 'confirmação de exclusão de OS');
await check('Exclusão exige confirmação', bodyIncludes('Ação permanente'));
await clickText('Cancelar');

await evaluate(`location.hash = '#/anomalies/clients'`);
await waitFor(bodyIncludes('Carteira de clientes'), 'painel de clientes do administrador', 20_000);
await check('Painel administrativo usa toda a equipe', bodyIncludes('Toda a equipe'));
await check('Painel exibe indicadores de clientes', `${bodyIncludes('A receber')} && ${bodyIncludes('Clientes mais atendidos')} && ${bodyIncludes('Receitas')}`);

await evaluate(`location.hash = '#/anomalies/detail/856daeb5-78c7-495c-bc63-217801a92abf'`);
await waitFor(bodyIncludes('Detalhes da OS'), 'detalhes da OS');
await waitFor(bodyIncludes('Gerar comprovante'), 'carregamento da OS', 30_000);
await clickText('Gerar comprovante');
await waitFor(bodyIncludes('Comprovante da OS'), 'comprovante integrado');
await check('Comprovante possui retorno visível', bodyIncludes('Voltar para a OS'));
await check('Comprovante informa ausência de assinatura antiga', bodyIncludes('Esta OS foi salva sem assinatura.'));
await check('Comprovante oferece compartilhamento de PDF', bodyIncludes('Compartilhar'));
const downloadDirectory = await mkdtemp(join(tmpdir(), 'campo-legado-pdf-'));
await send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDirectory });
await clickText('Salvar PDF');
const pdfStartedAt = Date.now();
let downloadedPdf = '';
while (Date.now() - pdfStartedAt < 20_000) {
  const files = await readdir(downloadDirectory);
  downloadedPdf = files.find((name) => name.endsWith('.pdf')) || '';
  if (downloadedPdf) break;
  await sleep(200);
}
if (!downloadedPdf) throw new Error('PDF do comprovante não foi baixado.');
const pdfHeader = (await readFile(join(downloadDirectory, downloadedPdf))).subarray(0, 5).toString();
results.push({ name: 'Comprovante gerado é um PDF válido', ok: pdfHeader === '%PDF-' });
if (pdfHeader !== '%PDF-') throw new Error('O comprovante baixado não é um PDF válido.');
await rm(downloadDirectory, { recursive: true, force: true });
await clickText('Voltar para a OS');

await evaluate(`location.hash = '#/'`);
await waitFor(bodyIncludes('Trocar perfil'), 'retorno à home');
await clickText('Trocar perfil');
await waitFor(`document.querySelector('input[placeholder="TESTE"]') !== null`, 'nova ativação');
await setInput('input[placeholder="TESTE"]', 'TESTE');
await evaluate(`document.querySelector('button[title="Validar código"]')?.click()`);
await waitFor(`document.querySelector('button[aria-haspopup="dialog"]') !== null`, 'seletor de perfil');
await evaluate(`document.querySelector('button[aria-haspopup="dialog"]')?.click()`);
await waitFor(bodyIncludes('Ana Victória Freitas Ribeiro'), 'lista de técnicos');
await clickText('Ana Victória Freitas Ribeiro');
await setInput('input[aria-label^="Senha do perfil"]', '1234');
await clickText('Concluir ativação');
await waitFor(bodyIncludes('Ordem de Serviço (OS)'), 'home do técnico', 20_000);
await check('Técnico não vê Configurações', `!document.body.innerText.includes('Configurações')`);
await check('Home do técnico exibe três módulos', `document.querySelectorAll('section[aria-label="Módulos disponíveis"] > button').length === 3`);

await evaluate(`location.hash = '#/agenda'`);
await waitFor(bodyIncludes('Minha agenda'), 'agenda privada do técnico', 20_000);
await check('Técnico vê somente a própria agenda', `${bodyIncludes('Minha agenda')} && !${bodyIncludes('Toda a equipe')}`);

await evaluate(`location.hash = '#/anomalies/list'`);
await waitFor(bodyIncludes('Somente suas OS'), 'lista privada do técnico', 20_000);
await check('Técnico vê somente OS próprias', bodyIncludes('Somente suas OS'));
await evaluate(`location.hash = '#/anomalies/clients'`);
await waitFor(bodyIncludes('Carteira de clientes'), 'painel privado do técnico', 20_000);
await check('Painel técnico usa somente as próprias OS', bodyIncludes('Somente suas OS'));
await evaluate(`location.hash = '#/anomalies/detail/privacy-other-os'`);
const deniedWorkOrder = `document.body.textContent.toLocaleLowerCase('pt-BR').includes('não pertence ao seu perfil') || document.body.textContent.toLocaleLowerCase('pt-BR').includes('não encontrada')`;
await waitFor(deniedWorkOrder, 'bloqueio de OS alheia', 20_000);
await check('Acesso direto à OS de outro técnico é negado', deniedWorkOrder);

await evaluate(`location.hash = '#/'`);
await waitFor(bodyIncludes('Ordem de Serviço (OS)'), 'home antes do teste offline');
await sleep(1_500);
await send('Network.emulateNetworkConditions', {
  offline: true,
  latency: 0,
  downloadThroughput: 0,
  uploadThroughput: 0,
  connectionType: 'none'
});
await send('Page.reload', { ignoreCache: false });
await sleep(1_000);
await waitFor(bodyIncludes('Ordem de Serviço (OS)'), 'abertura offline', 20_000);
await check('PWA reabre sem internet', bodyIncludes('Ordem de Serviço (OS)'));

// Valida a falha relatada de assinatura sem enviar um registro de teste ao servidor.
await evaluate(`location.hash = '#/anomalies/add'`);
await waitFor(bodyIncludes('Nova Ordem de Serviço'), 'formulário de OS offline');
await evaluate(`document.querySelector('button[aria-haspopup="dialog"]')?.click()`);
await waitFor(bodyIncludes('Acir Braga Coelho'), 'lista de clientes offline');
await clickText('Acir Braga Coelho');
await setInput('input[inputmode="numeric"]', '12345');
const signatureDrawn = await evaluate(`(() => {
  const canvas = document.querySelector('canvas[aria-label="Área para assinatura do cliente"]');
  canvas?.scrollIntoView({ block: 'center' });
  const rect = canvas?.getBoundingClientRect();
  if (!canvas || !rect) return false;
  const points = [
    { type: 'pointerdown', x: rect.left + 50, y: rect.top + 70, buttons: 1 },
    { type: 'pointermove', x: rect.left + 120, y: rect.top + 90, buttons: 1 },
    { type: 'pointermove', x: rect.left + 190, y: rect.top + 60, buttons: 1 },
    { type: 'pointerup', x: rect.left + 210, y: rect.top + 75, buttons: 0 }
  ];
  points.forEach((point) => canvas.dispatchEvent(new PointerEvent(point.type, {
    bubbles: true,
    cancelable: true,
    pointerId: 17,
    pointerType: 'touch',
    isPrimary: true,
    clientX: point.x,
    clientY: point.y,
    buttons: point.buttons
  })));
  return true;
})()`);
if (!signatureDrawn) throw new Error('Área de assinatura não encontrada.');
await sleep(250);
await check('Assinatura desenhada é reconhecida', `![...document.querySelectorAll('button')].find((item) => item.textContent.includes('Confirmar assinatura'))?.disabled`);
await clickText('Salvar OS');
await waitFor(`location.hash === '#/anomalies/list' && document.body.textContent.includes('Acir Braga Coelho')`, 'salvamento da OS assinada offline', 20_000);
await clickText('Acir Braga Coelho');
await waitFor(`document.querySelector('img[alt="Assinatura do cliente"]')?.complete && document.querySelector('img[alt="Assinatura do cliente"]')?.naturalWidth > 0`, 'assinatura nos detalhes da OS', 20_000);
await check('Assinatura automática aparece na OS', `document.querySelector('img[alt="Assinatura do cliente"]')?.naturalWidth > 0`);
await clickText('Gerar comprovante');
await waitFor(bodyIncludes('Comprovante da OS'), 'comprovante da OS assinada');
await waitFor(`document.querySelector('img[alt="Assinatura do cliente"]')?.complete && document.querySelector('img[alt="Assinatura do cliente"]')?.naturalWidth > 0`, 'assinatura no comprovante', 20_000);
await check('Comprovante exibe a assinatura salva', `document.querySelector('img[alt="Assinatura do cliente"]')?.naturalWidth > 0`);
const signedPdfDirectory = await mkdtemp(join(tmpdir(), 'campo-legado-signed-pdf-'));
await send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: signedPdfDirectory });
await clickText('Salvar PDF');
const signedPdfStartedAt = Date.now();
let signedPdf = '';
while (Date.now() - signedPdfStartedAt < 20_000) {
  const files = await readdir(signedPdfDirectory);
  signedPdf = files.find((name) => name.endsWith('.pdf')) || '';
  if (signedPdf) break;
  await sleep(200);
}
if (!signedPdf) throw new Error('PDF da OS assinada não foi baixado.');
const signedPdfHeader = (await readFile(join(signedPdfDirectory, signedPdf))).subarray(0, 5).toString();
results.push({ name: 'PDF da OS assinada é válido', ok: signedPdfHeader === '%PDF-' });
if (signedPdfHeader !== '%PDF-') throw new Error('O PDF da OS assinada é inválido.');
await rm(signedPdfDirectory, { recursive: true, force: true });

// Limpa apenas o perfil automatizado ainda offline; nada dessa OS de teste é sincronizado.
await send('Storage.clearDataForOrigin', {
  origin: new URL(page.url).origin,
  storageTypes: 'all'
});
await send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 0,
  downloadThroughput: -1,
  uploadThroughput: -1,
  connectionType: 'wifi'
});

console.log(JSON.stringify({ ok: results.every((item) => item.ok), results }, null, 2));
socket.close();
