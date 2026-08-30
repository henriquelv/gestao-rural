const debugPort = process.env.CHROME_DEBUG_PORT || '9224';
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function findTarget(timeoutMs = 60000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
      const target = targets.find((item) => item.type === 'page' && item.url.startsWith('https://localhost/'));
      if (target) return target;
    } catch {
      // The WebView debugger is not ready yet.
    }
    await wait(500);
  }
  throw new Error('WebView do app nao ficou disponivel');
}

const target = await findTarget();
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
  const response = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  }
  return response.result?.value;
}

async function waitFor(expression, timeoutMs = 60000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await evaluate(expression)) return;
    await wait(300);
  }
  throw new Error(`Tempo esgotado aguardando: ${expression}`);
}

try {
  await send('Runtime.enable');
  await waitFor(`document.body.innerText.trim().length > 20`);
  await waitFor(`Boolean(globalThis.Capacitor?.Plugins?.CapacitorSQLite)`);
  await waitFor(`(async () => {
    try {
      const result = await globalThis.Capacitor.Plugins.CapacitorSQLite.isDBOpen({ database: 'FarmDB_Native_v1' });
      return Boolean(result?.result);
    } catch { return false; }
  })()`);
  await wait(1200);

  const state = await evaluate(`(async () => {
    const sqlite = globalThis.Capacitor.Plugins.CapacitorSQLite;
    const counts = await sqlite.query({
      database: 'FarmDB_Native_v1',
      statement: 'SELECT table_name, count(*) AS c FROM kv_store WHERE table_name IN (?, ?, ?) GROUP BY table_name ORDER BY table_name',
      values: ['anomalies', 'daily_metrics', 'milk_daily'], readonly: false, isSQL92: true
    });
    const outbox = await sqlite.query({
      database: 'FarmDB_Native_v1',
      statement: 'SELECT status, count(*) AS c FROM outbox GROUP BY status ORDER BY status',
      values: [], readonly: false, isSQL92: true
    });
    const contextRaw = localStorage.getItem('gestao_rural_farm_context_v2');
    const context = contextRaw ? JSON.parse(contextRaw) : null;
    return {
      path: location.hash,
      online: navigator.onLine,
      bodyLength: document.body.innerText.trim().length,
      hasExpectedUi: /ANOMALIA|VOLUME DE LEITE|GESTAO RURAL|GESTÃO RURAL/i.test(document.body.innerText),
      farm_id: context?.farm_id || null,
      employee_id: context?.employee_id || null,
      counts: counts.values || [],
      outbox: outbox.values || [],
      lastRuntimeError: localStorage.getItem('last_runtime_error')
    };
  })()`);

  if (!state.hasExpectedUi || !state.farm_id || state.bodyLength < 20 || runtimeErrors.length > 0 || state.lastRuntimeError) {
    throw new Error(`Inicializacao invalida: ${JSON.stringify({ state, runtimeErrors })}`);
  }
  console.log(JSON.stringify({ ok: true, state, runtimeErrors }));
} finally {
  socket.close();
}
