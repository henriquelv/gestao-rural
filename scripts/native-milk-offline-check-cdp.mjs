const debugPort = process.env.CHROME_DEBUG_PORT || '9224';
const expectedCount = Number(process.env.EXPECTED_MILK_COUNT || '246');
const expectedMonth = process.env.EXPECTED_MILK_MONTH || '2026-08';
const expectedDateLabel = process.env.EXPECTED_MILK_DATE || '28/08';
const expectedValueLabel = process.env.EXPECTED_MILK_VALUE || '38.221 L';
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function findTarget(timeoutMs = 60000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
      const target = targets.find((item) => item.type === 'page' && item.url.startsWith('https://localhost/'));
      if (target) return target;
    } catch {
      // WebView is still starting.
    }
    await wait(500);
  }
  throw new Error('WebView nativa nao encontrada');
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
  const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
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

  await evaluate(`(() => {
    const context = JSON.parse(localStorage.getItem('gestao_rural_farm_context_v2') || 'null');
    if (!context?.farm_id) throw new Error('Contexto da fazenda ausente');
    localStorage.setItem('selectedMonth_' + context.farm_id, ${JSON.stringify(expectedMonth)});
    location.hash = '#/data/milk';
    return true;
  })()`);
  await waitFor(`document.body.innerText.includes(${JSON.stringify(`REGISTROS DIÁRIOS (${expectedMonth})`)})`);
  await waitFor(`document.body.innerText.includes(${JSON.stringify(expectedDateLabel)}) && document.body.innerText.includes(${JSON.stringify(expectedValueLabel)})`);

  const state = await evaluate(`(async () => {
    const context = JSON.parse(localStorage.getItem('gestao_rural_farm_context_v2') || 'null');
    const sqlite = globalThis.Capacitor.Plugins.CapacitorSQLite;
    const result = await sqlite.query({
      database: 'FarmDB_Native_v1',
      statement: "SELECT count(*) AS c FROM kv_store WHERE table_name = ? AND json_extract(data, '$.farm_id') = ?",
      values: ['milk_daily', context.farm_id], readonly: false, isSQL92: true
    });
    return {
      farm_id: context.farm_id,
      count: Number(result.values?.[0]?.c || 0),
      online: navigator.onLine,
      bodyLength: document.body.innerText.trim().length,
      lastRuntimeError: localStorage.getItem('last_runtime_error')
    };
  })()`);

  if (state.count !== expectedCount || state.online || state.bodyLength < 20 || state.lastRuntimeError || runtimeErrors.length > 0) {
    throw new Error(`Leite offline invalido: ${JSON.stringify({ state, runtimeErrors })}`);
  }
  console.log(JSON.stringify({ ok: true, state, runtimeErrors }));
} finally {
  socket.close();
}
