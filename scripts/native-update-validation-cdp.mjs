const debugPort = process.env.CHROME_DEBUG_PORT || '9224';
const mode = process.argv[2] || 'verify';
const farmId = '00000000-0000-4000-8000-000000000099';
const employeeId = '00000000-0000-4000-8000-000000000098';

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function connect() {
  let targets = [];
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
      if (targets.some((item) => item.type === 'page')) break;
    } catch {
      // WebView de emuladores frios pode levar alguns segundos para responder.
    }
    await wait(1000);
  }
  const target = targets.find((item) => item.type === 'page');
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

  return { socket, send, runtimeErrors };
}

async function evaluate(send, expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function waitFor(send, expression, timeoutMs = 90000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      if (await evaluate(send, expression)) return;
    } catch {
      // A pagina pode estar no meio de um reload.
    }
    await wait(500);
  }
  throw new Error(`Tempo esgotado aguardando: ${expression}`);
}

const { socket, send, runtimeErrors } = await connect();
try {
  await send('Runtime.enable');

  if (mode === 'seed') {
    await waitFor(send, `globalThis.Capacitor?.Plugins?.CapacitorSQLite != null`);
    await waitFor(send, `(async () => {
      try {
        return (await globalThis.Capacitor.Plugins.CapacitorSQLite.isDBOpen({ database: 'FarmDB_Native_v1', readonly: false })).result === true;
      } catch {
        return false;
      }
    })()`, 120000);
    const seeded = await evaluate(send, `(async () => {
      const sqlite = globalThis.Capacitor?.Plugins?.CapacitorSQLite;
      if (!sqlite) throw new Error('Plugin CapacitorSQLite indisponivel');
      const now = new Date().toISOString();
      const context = {
        farm_id: '${farmId}', farm_name: 'Fazenda Validacao Local',
        employee_id: '${employeeId}', employee_name: 'FUNCIONARIO VALIDACAO',
        device_id: 'device-update-validation', status: 'active', license_status: 'active',
        grace_period_days: 7, last_license_check_at: now, admin_pin: '1234'
      };
      localStorage.setItem('gestao_rural_farm_context_v2', JSON.stringify(context));
      localStorage.removeItem('last_runtime_error');

      const rows = [
        {
          table: 'anomalies', id: 'validation-anomaly-old',
          data: { id: 'validation-anomaly-old', farm_id: '${farmId}', employee_id: '${employeeId}', employee_name: 'FUNCIONARIO VALIDACAO', device_id: 'device-update-validation', createdAt: '2026-08-30T01:00:00-03:00', sector: 'Ordenha', description: 'Anomalia local preservada na atualizacao', responsible: 'FUNCIONARIO VALIDACAO', media: [] }
        },
        {
          table: 'milk_daily', id: '${farmId}_2026-08-30',
          data: { farm_id: '${farmId}', employee_id: '${employeeId}', employee_name: 'FUNCIONARIO VALIDACAO', device_id: 'device-update-validation', date: '2026-08-30', liters: 43210 }
        },
        {
          table: 'daily_metrics', id: '${farmId}_2026-08-30_lactation',
          data: { farm_id: '${farmId}', employee_id: '${employeeId}', employee_name: 'FUNCIONARIO VALIDACAO', device_id: 'device-update-validation', date: '2026-08-30', type: 'lactation', value: 321 }
        }
      ];
      const statements = [];
      for (const row of rows) {
        statements.push({
          statement: 'INSERT OR REPLACE INTO kv_store (table_name, id, data, updated_at, synced) VALUES (?, ?, ?, ?, ?)',
          values: [row.table, row.id, JSON.stringify(row.data), now, 0]
        });
        statements.push({
          statement: 'INSERT INTO outbox (table_name, op, payload, created_at, status) VALUES (?, ?, ?, ?, ?)',
          values: [row.table, 'upsert', JSON.stringify(row.data), now, 'pending']
        });
      }
      await sqlite.executeSet({ database: 'FarmDB_Native_v1', set: statements, transaction: true, readonly: false, isSQL92: true });
      return { context, ids: rows.map((row) => row.id) };
    })()`);
    console.log(JSON.stringify({ mode, seeded }, null, 2));
  }

  await send('Page.reload', { ignoreCache: true });
  await waitFor(send, `document.body.innerText.trim().length > 0`);
  await waitFor(send, `globalThis.Capacitor?.Plugins?.CapacitorSQLite != null`);
  await waitFor(send, `(async () => {
    try {
      return (await globalThis.Capacitor.Plugins.CapacitorSQLite.isDBOpen({ database: 'FarmDB_Native_v1', readonly: false })).result === true;
    } catch {
      return false;
    }
  })()`, 120000);

  const state = await evaluate(send, `(async () => {
    const sqlite = globalThis.Capacitor.Plugins.CapacitorSQLite;
    const counts = await sqlite.query({
      database: 'FarmDB_Native_v1',
      statement: 'SELECT table_name, count(*) AS c FROM kv_store WHERE table_name IN (?, ?, ?) GROUP BY table_name ORDER BY table_name',
      values: ['anomalies', 'milk_daily', 'daily_metrics'], readonly: false, isSQL92: true
    });
    const outbox = await sqlite.query({
      database: 'FarmDB_Native_v1',
      statement: 'SELECT table_name, status, count(*) AS c FROM outbox GROUP BY table_name, status ORDER BY table_name, status',
      values: [], readonly: false, isSQL92: true
    });
    const ids = await sqlite.query({
      database: 'FarmDB_Native_v1',
      statement: 'SELECT table_name, id, synced FROM kv_store WHERE id LIKE ?',
      values: ['%validation%'], readonly: false, isSQL92: true
    });
    const uiConfig = await sqlite.query({
      database: 'FarmDB_Native_v1',
      statement: 'SELECT id, data, synced, updated_at FROM kv_store WHERE table_name = ? ORDER BY id',
      values: ['ui_config'], readonly: false, isSQL92: true
    });
    const uiConfigOutbox = await sqlite.query({
      database: 'FarmDB_Native_v1',
      statement: 'SELECT id, payload, status, created_at FROM outbox WHERE table_name = ? ORDER BY id',
      values: ['ui_config'], readonly: false, isSQL92: true
    });
    return {
      context: JSON.parse(localStorage.getItem('gestao_rural_farm_context_v2') || 'null'),
      counts: counts.values || [],
      outbox: outbox.values || [],
      ids: ids.values || [],
      uiConfig: (uiConfig.values || []).map((row) => ({
        id: row.id,
        synced: row.synced,
        updated_at: row.updated_at,
        farm_id: JSON.parse(row.data || '{}').farm_id || null,
        buttonCount: JSON.parse(row.data || '{}').buttons?.length || 0
      })),
      uiConfigOutbox: (uiConfigOutbox.values || []).map((row) => ({
        id: row.id,
        status: row.status,
        created_at: row.created_at,
        farm_id: JSON.parse(row.payload || '{}').farm_id || null,
        buttonCount: JSON.parse(row.payload || '{}').buttons?.length || 0
      })),
      lastRuntimeError: localStorage.getItem('last_runtime_error'),
      text: document.body.innerText
    };
  })()`);

  await evaluate(send, `(() => { location.hash = '#/anomalies/list'; return true; })()`);
  await waitFor(send, `document.body.innerText.toUpperCase().includes('LISTA DE ANOMALIAS')`);
  await waitFor(send, `document.body.innerText.includes('Anomalia local preservada na atualizacao')`);
  const anomalyVisible = true;

  await evaluate(send, `(() => { location.hash = '#/data/milk'; return true; })()`);
  await waitFor(send, `document.body.innerText.toUpperCase().includes('VOLUME DE LEITE')`);
  await waitFor(send, `document.body.innerText.includes('43.210') || document.body.innerText.includes('43210')`);
  const milkVisible = true;

  console.log(JSON.stringify({ mode, state, screens: { anomalyVisible, milkVisible }, runtimeErrors }, null, 2));

  if (!anomalyVisible || !milkVisible) {
    throw new Error(`Dados locais nao apareceram: anomaly=${anomalyVisible}, milk=${milkVisible}`);
  }
  if (runtimeErrors.length > 0 || state.lastRuntimeError) {
    throw new Error(`Erro de runtime: ${JSON.stringify({ runtimeErrors, last: state.lastRuntimeError })}`);
  }

} finally {
  socket.close();
}
