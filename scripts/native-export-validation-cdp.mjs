import { mkdir, writeFile } from 'node:fs/promises';

const debugPort = process.env.CHROME_DEBUG_PORT || '9224';
const exportFormat = String(process.env.EXPORT_FORMAT || 'xlsx').toLowerCase() === 'csv' ? 'csv' : 'xlsx';
const exportOptionLabel = exportFormat === 'csv' ? 'CSV' : 'EXCEL COMPLETO';
const exportRoute = process.env.EXPORT_ROUTE || '#/anomalies/list';
const triggerAriaLabel = process.env.EXPORT_TRIGGER_ARIA || 'Baixar planilha de anomalias';
const triggerSelector = `[aria-label="${triggerAriaLabel.replace(/"/g, '\\"')}"]`;
const screenshotPath = process.env.EXPORT_SCREENSHOT || 'tmp/export-sheet-mobile.png';
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
const target = targets.find((item) => item.type === 'page' && item.url.startsWith('https://localhost/'));
if (!target) throw new Error('WebView do app não encontrado.');

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
const runtimeErrors = [];
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.method === 'Runtime.exceptionThrown') {
    runtimeErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text);
  }
  if (!message.id || !pending.has(message.id)) return;
  const request = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});

const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
};

const waitFor = async (expression, timeoutMs = 30000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await wait(150);
  }
  const state = await evaluate(`({ hash: location.hash, body: document.body.innerText.slice(0, 1200), dialogs: document.querySelectorAll('[role="dialog"]').length })`);
  throw new Error(`Tempo esgotado aguardando: ${expression}\nEstado: ${JSON.stringify(state)}`);
};

try {
  await send('Runtime.enable');
  await send('Page.enable');
  await evaluate(`location.hash = ${JSON.stringify(exportRoute)}`);
  await waitFor(`document.querySelector(${JSON.stringify(triggerSelector)}) !== null`);
  const buttonState = await evaluate(`(() => {
    const button = document.querySelector(${JSON.stringify(triggerSelector)});
    if (!button) throw new Error('Botão de download não encontrado');
    const state = { disabled: Boolean(button.disabled), visible: button.getBoundingClientRect().width > 0 };
    button.click();
    return state;
  })()`);
  await waitFor(`document.querySelector('[role="dialog"][aria-label="Baixar planilha"]') !== null && document.body.innerText.toUpperCase().includes('EXCEL COMPLETO')`);

  const screenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  await mkdir(screenshotPath.replace(/[\\/][^\\/]+$/, ''), { recursive: true });
  await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));

  await evaluate(`(() => {
    const dialog = document.querySelector('[role="dialog"][aria-label="Baixar planilha"]');
    const button = Array.from(dialog?.querySelectorAll('button') || []).find((item) => item.innerText.trim().toUpperCase().startsWith(${JSON.stringify(exportOptionLabel)}));
    if (!button) throw new Error('Opção de exportação não encontrada');
    button.click();
    return true;
  })()`);
  await waitFor(`document.body.innerText.toUpperCase().includes('PLANILHA PRONTA') || document.body.innerText.toUpperCase().includes('PLANILHA SALVA')`, 45000);
  const result = await evaluate(`({
    toast: document.body.innerText.split(String.fromCharCode(10)).find((line) => line.toUpperCase().includes('PLANILHA')) || '',
    lastRuntimeError: localStorage.getItem('last_runtime_error')
  })`);
  if (runtimeErrors.length > 0 || result.lastRuntimeError) {
    throw new Error(`Erro durante exportação: ${JSON.stringify({ runtimeErrors, last: result.lastRuntimeError })}`);
  }
  console.log(JSON.stringify({ ok: true, exportFormat, screenshotPath, buttonState, result, runtimeErrors }, null, 2));
} finally {
  socket.close();
}
