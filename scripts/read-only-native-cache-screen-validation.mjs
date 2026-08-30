import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const debugPort = process.env.CHROME_DEBUG_PORT || '9224';
const keepReadOnlyContext = process.env.KEEP_READONLY_CONTEXT === '1';
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, '')];
    })
);

const url = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;
if (!url || !anonKey) throw new Error('Configuracao Supabase ausente em .env.local');
const projectRef = new URL(url).hostname.split('.')[0];
const supabase = createClient(url, anonKey, { auth: { persistSession: false } });

async function readAll(tableName, farmId, orderBy) {
  const rows = [];
  const pageSize = 500;
  for (let page = 0; ; page++) {
    const result = await supabase
      .from(tableName)
      .select('*')
      .eq('farm_id', farmId)
      .order(orderBy, { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (result.error) throw result.error;
    rows.push(...(result.data || []));
    if (!result.data || result.data.length < pageSize) break;
  }
  return rows;
}

const farms = await supabase.from('farms').select('id,name,status,activation_code').order('created_at');
if (farms.error) throw farms.error;
const farm = farms.data?.find((item) => String(item.activation_code || '').toLowerCase() === 'starmilk') || farms.data?.[0];
if (!farm) throw new Error('Fazenda ativa nao encontrada');

const [anomalies, milkRows] = await Promise.all([
  readAll('anomalies', farm.id, 'id'),
  readAll('milk_daily', farm.id, 'date')
]);

const sampleIndexes = [...new Set(Array.from({ length: Math.min(20, milkRows.length) }, (_, index) => (
  Math.round(index * (milkRows.length - 1) / Math.max(1, Math.min(20, milkRows.length) - 1))
)))];
const milkSamples = sampleIndexes.map((index) => ({
  date: String(milkRows[index].date),
  liters: Number(milkRows[index].liters)
}));

const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
const target = targets.find((item) => item.type === 'page' && item.url.startsWith('https://localhost/'));
if (!target) throw new Error('WebView nativa nao encontrada');

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

async function evaluate(expression, timeoutMs = 120000) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Runtime.evaluate excedeu o tempo')), timeoutMs);
  });
  const response = await Promise.race([
    send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }),
    timeout
  ]).finally(() => clearTimeout(timeoutId));
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

const originalContext = await evaluate(`localStorage.getItem('gestao_rural_farm_context_v2')`);
try {
  await send('Runtime.enable');
  const insertRows = [
    ...anomalies.map((row) => ({
      tableName: 'anomalies',
      id: String(row.id),
      data: row,
      updatedAt: row.updated_at || row.createdAt || new Date().toISOString()
    })),
    ...milkRows.map((row) => ({
      tableName: 'milk_daily',
      id: `${farm.id}_${row.date}`,
      data: row,
      updatedAt: row.updated_at || `${row.date}T12:00:00.000Z`
    }))
  ];

  for (let offset = 0; offset < insertRows.length; offset += 200) {
    const chunk = insertRows.slice(offset, offset + 200);
    await evaluate(`(async () => {
      const sqlite = globalThis.Capacitor.Plugins.CapacitorSQLite;
      const rows = ${JSON.stringify(chunk)};
      const statement = 'INSERT OR REPLACE INTO kv_store (table_name, id, data, updated_at, synced) VALUES (?, ?, ?, ?, ?)';
      await sqlite.executeSet({
        database: 'FarmDB_Native_v1',
        set: rows.map((row) => ({ statement, values: [row.tableName, row.id, JSON.stringify(row.data), row.updatedAt, 1] })),
        transaction: true,
        readonly: false,
        isSQL92: true
      });
      return rows.length;
    })()`);
  }

  const testContext = {
    farm_id: farm.id,
    farm_name: farm.name,
    employee_id: '00000000-0000-4000-8000-000000000098',
    employee_name: 'FUNCIONARIO VALIDACAO',
    device_id: 'device-readonly-validation',
    status: 'active',
    license_status: 'active',
    grace_period_days: 7,
    last_license_check_at: new Date().toISOString()
  };
  await evaluate(`(() => {
    localStorage.setItem('gestao_rural_farm_context_v2', ${JSON.stringify(JSON.stringify(testContext))});
    localStorage.removeItem('last_runtime_error');
    location.hash = '#/anomalies/list';
    return true;
  })()`);

  await waitFor(`document.body.innerText.toUpperCase().includes('LISTA DE ANOMALIAS')`);
  await waitFor(`document.body.innerText.includes(${JSON.stringify(`de ${anomalies.length} anomalias`)})`);
  const anomalyScreen = await evaluate(`({
    path: location.hash,
    text: document.body.innerText,
    bodyLength: document.body.innerText.trim().length
  })`);

  const sqliteState = await evaluate(`(async () => {
    const sqlite = globalThis.Capacitor.Plugins.CapacitorSQLite;
    const counts = await sqlite.query({
      database: 'FarmDB_Native_v1',
      statement: "SELECT table_name, count(*) AS c FROM kv_store WHERE table_name IN (?, ?) AND json_extract(data, '$.farm_id') = ? GROUP BY table_name ORDER BY table_name",
      values: ['anomalies', 'milk_daily', ${JSON.stringify(farm.id)}], readonly: false, isSQL92: true
    });
    const milk = await sqlite.query({
      database: 'FarmDB_Native_v1',
      statement: "SELECT data FROM kv_store WHERE table_name = ? AND json_extract(data, '$.farm_id') = ? ORDER BY json_extract(data, '$.date')",
      values: ['milk_daily', ${JSON.stringify(farm.id)}], readonly: false, isSQL92: true
    });
    return { counts: counts.values || [], milk: (milk.values || []).map((row) => JSON.parse(row.data)) };
  })()`);

  const screenSamples = [];
  const samplesByMonth = Map.groupBy(milkSamples, (sample) => sample.date.slice(0, 7));
  for (const [month, samples] of samplesByMonth) {
    const monthStartedAt = Date.now();
    await evaluate(`(() => {
      location.hash = '#/';
      localStorage.setItem(${JSON.stringify(`selectedMonth_${farm.id}`)}, ${JSON.stringify(month)});
      return true;
    })()`);
    await waitFor(`document.body.innerText.toUpperCase().includes('ANOMALIAS')`);
    await evaluate(`location.hash = '#/data/milk'`);
    await waitFor(`document.body.innerText.includes(${JSON.stringify(`REGISTROS DIÁRIOS (${month})`)})`);
    const expectedPairs = samples.map((sample) => {
      const [, , monthNumber, day] = sample.date.match(/^(\d{4})-(\d{2})-(\d{2})$/) || [];
      return {
        dateLabel: `${day}/${monthNumber}`,
        valueLabel: `${sample.liters.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L`
      };
    });
    await waitFor(`(() => {
      const text = document.body.innerText;
      return ${JSON.stringify(expectedPairs)}.every((item) => {
        const dateIndex = text.indexOf(item.dateLabel);
        return dateIndex >= 0 && text.indexOf(item.valueLabel, dateIndex) >= dateIndex;
      });
    })()`);
    const text = await evaluate(`document.body.innerText`);
    for (const sample of samples) {
      const [, , monthNumber, day] = sample.date.match(/^(\d{4})-(\d{2})-(\d{2})$/) || [];
      const dateLabel = `${day}/${monthNumber}`;
      const valueLabel = `${sample.liters.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L`;
      const dateIndex = text.indexOf(dateLabel);
      const valueIndex = text.indexOf(valueLabel, Math.max(0, dateIndex));
      screenSamples.push({
        ...sample,
        month,
        dateLabel,
        valueLabel,
        dateIndex,
        valueIndex,
        loadMs: Date.now() - monthStartedAt,
        excerpt: dateIndex >= 0 ? text.slice(dateIndex, dateIndex + 90) : text.slice(0, 160),
        visible: dateIndex >= 0 && valueIndex >= dateIndex
      });
    }
  }

  const sqliteSamples = new Map(sqliteState.milk.map((row) => [String(row.date), Number(row.liters)]));
  const sampleComparison = milkSamples.map((sample) => {
    const screenResult = screenSamples.find((item) => item.date === sample.date);
    return {
      ...sample,
      sqlite: sqliteSamples.get(sample.date),
      screen: screenResult?.visible === true,
      screenDetails: screenResult
    };
  });
  const counts = Object.fromEntries(sqliteState.counts.map((row) => [row.table_name, Number(row.c)]));
  const result = {
    ok: counts.anomalies === anomalies.length
      && counts.milk_daily === milkRows.length
      && sampleComparison.every((sample) => sample.sqlite === sample.liters && sample.screen)
      && anomalyScreen.bodyLength > 20
      && runtimeErrors.length === 0,
    mode: 'REMOTE_READ_ONLY_LOCAL_SQLITE_WRITE',
    projectRef,
    farm: { id: farm.id, name: farm.name },
    server: { anomalies: anomalies.length, milk_daily: milkRows.length },
    sqlite: counts,
    anomalyScreen: {
      visibleTotal: anomalyScreen.text.includes(`de ${anomalies.length} anomalias`),
      bodyLength: anomalyScreen.bodyLength
    },
    milkSamples: sampleComparison,
    runtimeErrors
  };
  if (!result.ok) throw new Error(`Comparacao servidor-SQLite-tela falhou: ${JSON.stringify(result)}`);
  console.log(JSON.stringify(result, null, 2));
} finally {
  try {
    if (!keepReadOnlyContext) {
      await evaluate(`(() => {
        const original = ${JSON.stringify(originalContext)};
        if (original === null) localStorage.removeItem('gestao_rural_farm_context_v2');
        else localStorage.setItem('gestao_rural_farm_context_v2', original);
        location.hash = '#/';
        return true;
      })()`);
    }
  } catch {
    // The result above still records whether validation completed.
  }
  socket.close();
}
