const debugPort = process.env.CHROME_DEBUG_PORT || '9224';
const runSqliteBatchSmoke = process.env.NATIVE_SQLITE_BATCH_SMOKE === '1';
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function connect() {
  const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
  const target = targets.find((item) => item.type === 'page' && item.url.startsWith('https://localhost/'));
  if (!target) throw new Error('WebView do app nao encontrado');

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
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });

  return { socket, send, runtimeErrors };
}

async function evaluate(send, expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function waitFor(send, expression, timeoutMs = 60000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await evaluate(send, expression)) return;
    await wait(500);
  }
  throw new Error(`Tempo esgotado aguardando: ${expression}`);
}

const screens = [
  { path: '/anomalies/list', title: 'LISTA DE ANOMALIAS' },
  { path: '/anomalies/add', title: 'NOVA ANOMALIA' },
  { path: '/anomalies/quantity', title: 'QUANTIDADE DE ANOMALIAS' },
  { path: '/notices/list', title: 'COMUNICADOS' },
  { path: '/improvements/list', title: 'LISTA DE MELHORIAS' },
  { path: '/instructions/list', title: 'LISTA DE INSTRUÇÕES' },
  { path: '/data/milk', title: 'VOLUME DE LEITE' },
  { path: '/data/lactation', title: 'VACAS EM LACTAÇÃO' },
  { path: '/data/discard', title: 'VACAS DE DESCARTE' },
  { path: '/data/births', title: 'NASCIMENTOS' },
  { path: '/diagnostics', title: 'DIAGNOSTICO' }
];

const { socket, send, runtimeErrors } = await connect();
try {
  await send('Runtime.enable');
  await waitFor(send, `Boolean(globalThis.Capacitor?.Plugins?.CapacitorSQLite)`);
  await waitFor(send, `(async () => {
    try {
      const result = await globalThis.Capacitor.Plugins.CapacitorSQLite.isDBOpen({ database: 'FarmDB_Native_v1' });
      return Boolean(result?.result);
    } catch { return false; }
  })()`);
  const sqliteBatch = runSqliteBatchSmoke
    ? await evaluate(send, `(async () => {
        const sqlite = globalThis.Capacitor?.Plugins?.CapacitorSQLite;
        if (!sqlite) throw new Error('Plugin CapacitorSQLite indisponivel');
        const prefix = '__native_batch_smoke__';
        const statement = 'INSERT OR REPLACE INTO kv_store (table_name, id, data, updated_at, synced) VALUES (?, ?, ?, ?, ?)';
        const set = Array.from({ length: 120 }, (_, index) => ({
          statement,
          values: [prefix, prefix + index, JSON.stringify({ index }), new Date().toISOString(), 1]
        }));
        await sqlite.executeSet({ database: 'FarmDB_Native_v1', set, transaction: true, readonly: false, isSQL92: true });
        const inserted = await sqlite.query({
          database: 'FarmDB_Native_v1',
          statement: 'SELECT count(*) AS c FROM kv_store WHERE table_name = ?',
          values: [prefix], readonly: false, isSQL92: true
        });
        await sqlite.run({
          database: 'FarmDB_Native_v1',
          statement: 'DELETE FROM kv_store WHERE table_name = ?',
          values: [prefix], transaction: true, readonly: false, isSQL92: true
        });
        const remaining = await sqlite.query({
          database: 'FarmDB_Native_v1',
          statement: 'SELECT count(*) AS c FROM kv_store WHERE table_name = ?',
          values: [prefix], readonly: false, isSQL92: true
        });
        return { inserted: Number(inserted.values?.[0]?.c || 0), remaining: Number(remaining.values?.[0]?.c || 0) };
      })()`)
    : null;
  const context = await evaluate(send, `(() => {
    const value = localStorage.getItem('gestao_rural_farm_context_v2');
    const parsed = value ? JSON.parse(value) : null;
    if (!parsed) return null;
    return {
      farm_id: parsed.farm_id || null,
      farm_name: parsed.farm_name || null,
      employee_id: parsed.employee_id || null,
      employee_name: parsed.employee_name || null,
      device_id: parsed.device_id || null,
      status: parsed.status || null,
      license_status: parsed.license_status || null
    };
  })()`);

  const results = [];
  for (const screen of screens) {
    await evaluate(send, `(() => { location.hash = ${JSON.stringify(`#${screen.path}`)}; return true; })()`);
    await waitFor(send, `document.body.innerText.toUpperCase().includes(${JSON.stringify(screen.title)})`);
    await wait(700);
    const state = await evaluate(send, `({
      path: location.hash,
      textLength: document.body.innerText.trim().length,
      titleVisible: document.body.innerText.toUpperCase().includes(${JSON.stringify(screen.title)})
    })`);
    if (!state.titleVisible || state.textLength < 20) throw new Error(`Tela vazia ou incompleta: ${screen.path}`);
    results.push(state);
  }

  await evaluate(send, `(() => { location.hash = '#/anomalies/list'; return true; })()`);
  await waitFor(send, `document.querySelector('[aria-label="Baixar planilha de anomalias"]') !== null`);
  await evaluate(send, `(() => {
    document.querySelector('[aria-label="Baixar planilha de anomalias"]')?.click();
    return true;
  })()`);
  await waitFor(send, `document.body.innerText.toUpperCase().includes('EXCEL COMPLETO') && document.body.innerText.includes('CSV')`);
  const anomalyExport = await evaluate(send, `(() => {
    const button = document.querySelector('[aria-label="Baixar planilha de anomalias"]');
    const dialog = document.querySelector('[role="dialog"][aria-label="Baixar planilha"]');
    const result = {
      visible: Boolean(button),
      disabled: Boolean(button?.disabled),
      excelOption: Boolean(dialog?.innerText.toUpperCase().includes('EXCEL COMPLETO')),
      csvOption: Boolean(dialog?.innerText.includes('CSV'))
    };
    dialog?.querySelector('[aria-label="Fechar"]')?.click();
    return result;
  })()`);

  await evaluate(send, `(() => { location.hash = '#/anomalies/quantity'; return true; })()`);
  await waitFor(send, `document.body.innerText.toUpperCase().includes('QUANTIDADE DE ANOMALIAS')`);
  await evaluate(send, `(() => {
    const filters = Array.from(document.querySelectorAll('button')).find((item) => item.innerText.trim().toUpperCase() === 'FILTROS');
    if (!filters) throw new Error('Botao Filtros nao encontrado');
    filters.click();
    return true;
  })()`);
  await waitFor(send, `Array.from(document.querySelectorAll('button')).some((item) => item.innerText.trim().toUpperCase() === 'PARETO')`);
  await evaluate(send, `(() => {
    const button = Array.from(document.querySelectorAll('button')).find((item) => item.innerText.trim().toUpperCase() === 'PARETO');
    if (!button) throw new Error('Botao Pareto nao encontrado');
    button.click();
    return true;
  })()`);
  await waitFor(send, `document.body.innerText.toUpperCase().includes('PARETO POR SETOR')`);
  const pareto = await evaluate(send, `(() => ({
    visible: document.body.innerText.toUpperCase().includes('PARETO POR SETOR'),
    hasExport: document.querySelector('[aria-label="Baixar planilha do Pareto"]') !== null,
    hasCumulative: document.body.innerText.toUpperCase().includes('ACUMULADO')
  }))()`);

  await evaluate(send, `(() => { location.hash = '#/data/milk'; return true; })()`);
  await waitFor(send, `document.body.innerText.toUpperCase().includes('MEDIAS DE JANEIRO A DEZEMBRO') || document.body.innerText.toUpperCase().includes('MÉDIAS DE JANEIRO A DEZEMBRO')`);
  await evaluate(send, `(() => {
    const button = Array.from(document.querySelectorAll('button')).find((item) => item.innerText.toUpperCase().includes('JANEIRO A DEZEMBRO'));
    if (!button) throw new Error('Botao de medias mensais nao encontrado');
    button.click();
    return true;
  })()`);
  await waitFor(send, `document.body.innerText.toUpperCase().includes('MEDIAS MENSAIS') || document.body.innerText.toUpperCase().includes('MÉDIAS MENSAIS')`);
  const milkSummary = await evaluate(send, `(() => {
    const text = document.body.innerText.toUpperCase();
    const monthLabels = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
    return {
      visible: text.includes('MEDIAS MENSAIS') || text.includes('MÉDIAS MENSAIS'),
      monthsVisible: monthLabels.filter((month) => text.split(/\\s+/).includes(month)),
      hasYearTotal: text.includes('TOTAL DO ANO'),
      hasYearAverage: text.includes('MEDIA DO ANO') || text.includes('MÉDIA DO ANO'),
      hasAllTimeTotal: text.includes('TOTAL GERAL'),
      hasAllTimeAverage: text.includes('MEDIA GERAL') || text.includes('MÉDIA GERAL')
    };
  })()`);
  if (milkSummary.monthsVisible.length !== 12) {
    throw new Error(`Resumo mensal incompleto: ${JSON.stringify(milkSummary)}`);
  }

  await evaluate(send, `(() => { location.hash = '#/'; return true; })()`);
  await waitFor(send, `document.body.innerText.toUpperCase().includes('ANOMALIAS')`);

  const diagnostics = await evaluate(send, `(() => {
    const logs = JSON.parse(localStorage.getItem('sync_diagnostic_logs_v1') || '[]');
    return {
      lastAccessError: localStorage.getItem('last_access_error_v1'),
      lastRuntimeError: localStorage.getItem('last_runtime_error'),
      recentSyncLogs: logs.slice(-20)
    };
  })()`);

  if (runtimeErrors.length > 0) {
    throw new Error(`Excecoes JavaScript: ${JSON.stringify(runtimeErrors)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    sqliteBatch,
    context,
    screens: results,
    features: { anomalyExport, pareto, milkSummary },
    diagnostics
  }, null, 2));
} finally {
  socket.close();
}
