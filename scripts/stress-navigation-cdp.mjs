const debugPort = process.env.CHROME_DEBUG_PORT || '9223';
const cycles = Number(process.env.STRESS_CYCLES || '100');
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
const target = targets.find((item) => item.type === 'page' && /^http:\/\/(localhost|127\.0\.0\.1):3011/.test(item.url));
if (!target) throw new Error('Pagina local de validacao nao encontrada');

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
  const handlers = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) handlers.reject(new Error(message.error.message));
  else handlers.resolve(message.result);
});

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});

async function evaluate(expression) {
  const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  }
  return response.result?.value;
}

async function waitFor(expression, timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await evaluate(expression)) return;
    await wait(100);
  }
  throw new Error(`Tempo esgotado aguardando: ${expression}`);
}

const routes = [
  ['#/anomalies/list', 'LISTA DE ANOMALIAS'],
  ['#/anomalies/add', 'NOVA ANOMALIA'],
  ['#/anomalies/quantity', 'QUANTIDADE DE ANOMALIAS'],
  ['#/data/milk', 'VOLUME DE LEITE'],
  ['#/', 'ANOMALIAS']
];

try {
  await send('Runtime.enable');
  await send('Network.enable');
  await evaluate(`localStorage.removeItem('last_runtime_error')`);

  let minimumBodyLength = Number.MAX_SAFE_INTEGER;
  for (let index = 0; index < cycles; index++) {
    if (index % 10 === 0) {
      await send('Network.emulateNetworkConditions', {
        offline: true,
        latency: 0,
        downloadThroughput: 0,
        uploadThroughput: 0
      });
    } else if (index % 10 === 5) {
      await send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 30,
        downloadThroughput: 2_000_000,
        uploadThroughput: 1_000_000
      });
    }

    const [path, title] = routes[index % routes.length];
    await evaluate(`location.hash = ${JSON.stringify(path)}`);
    await waitFor(`document.body.innerText.toUpperCase().includes(${JSON.stringify(title)})`);
    const bodyLength = await evaluate(`document.body.innerText.trim().length`);
    minimumBodyLength = Math.min(minimumBodyLength, bodyLength);
    if (bodyLength < 20) throw new Error(`Tela vazia no ciclo ${index + 1}: ${path}`);
  }

  await send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1
  });
  await wait(1500);
  const finalState = await evaluate(`({
    path: location.hash,
    bodyLength: document.body.innerText.trim().length,
    lastRuntimeError: localStorage.getItem('last_runtime_error')
  })`);
  if (runtimeErrors.length > 0 || finalState.lastRuntimeError) {
    throw new Error(`Falha de runtime: ${JSON.stringify({ runtimeErrors, finalState })}`);
  }
  console.log(JSON.stringify({ ok: true, cycles, minimumBodyLength, finalState, runtimeErrors }, null, 2));
} finally {
  socket.close();
}
