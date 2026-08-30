import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

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
if (!url || !anonKey) throw new Error('VITE_SUPABASE_URL/ANON_KEY ausentes em .env.local');

const projectRef = new URL(url).hostname.split('.')[0];
const supabase = createClient(url, anonKey, { auth: { persistSession: false } });
const requiredColumns = {
  anomalies: ['farm_id', 'employee_id', 'employee_name', 'device_id', 'createdAt'],
  notices: ['farm_id', 'employee_id', 'employee_name', 'device_id', 'createdAt'],
  improvements: ['farm_id', 'employee_id', 'employee_name', 'device_id', 'createdAt'],
  instructions: ['farm_id', 'employee_id', 'employee_name', 'device_id', 'createdAt'],
  farm_docs: ['farm_id', 'employee_id', 'employee_name', 'device_id', 'updatedAt'],
  milk_daily: ['farm_id', 'employee_id', 'employee_name', 'device_id', 'date'],
  daily_metrics: ['farm_id', 'employee_id', 'employee_name', 'device_id', 'date', 'type'],
  farm_monthly_stats: ['farm_id', 'employee_id', 'employee_name', 'device_id', 'monthKey']
};

const { data: farms, error: farmError } = await supabase
  .from('farms')
  .select('id,name,status,activation_code,max_devices,grace_period_days,expires_at')
  .order('created_at', { ascending: true });
if (farmError) throw farmError;
const farm = farms?.find((item) => String(item.activation_code || '').toLowerCase() === 'starmilk') || farms?.[0];
if (!farm) throw new Error('Nenhuma fazenda visível com a anon key.');

console.log(JSON.stringify({
  mode: 'READ_ONLY',
  projectRef,
  farm: {
    id: farm.id,
    name: farm.name,
    status: farm.status,
    maxDevices: farm.max_devices,
    gracePeriodDays: farm.grace_period_days,
    expiresAt: farm.expires_at
  },
  visibleFarms: farms.length
}, null, 2));

for (const [table, columns] of Object.entries(requiredColumns)) {
  const countQuery = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('farm_id', farm.id);
  const totalQuery = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true });
  const schemaQuery = await supabase
    .from(table)
    .select(columns.join(','))
    .eq('farm_id', farm.id)
    .limit(1);
  const deltaQuery = ['anomalies', 'notices', 'improvements', 'instructions', 'farm_docs'].includes(table)
    ? await supabase.from(table).select('updated_at').eq('farm_id', farm.id).limit(1)
    : null;

  const dateColumn = table === 'farm_monthly_stats'
    ? 'monthKey'
    : table === 'farm_docs'
      ? 'updatedAt'
      : ['milk_daily', 'daily_metrics'].includes(table)
        ? 'date'
        : 'createdAt';
  const [oldest, newest] = await Promise.all([
    supabase.from(table).select(dateColumn).eq('farm_id', farm.id).order(dateColumn, { ascending: true }).limit(1),
    supabase.from(table).select(dateColumn).eq('farm_id', farm.id).order(dateColumn, { ascending: false }).limit(1)
  ]);

  console.log(JSON.stringify({
    table,
    count: countQuery.count ?? null,
    visibleTotal: totalQuery.count ?? null,
    outsideCurrentFarm: countQuery.count !== null && totalQuery.count !== null ? totalQuery.count - countQuery.count : null,
    countError: countQuery.error?.code || null,
    requiredColumns: schemaQuery.error ? `ERROR ${schemaQuery.error.code}: ${schemaQuery.error.message}` : 'OK',
    deltaCursor: deltaQuery ? (deltaQuery.error ? `MISSING ${deltaQuery.error.code}` : 'OK') : 'FULL_FETCH',
    oldest: oldest.data?.[0]?.[dateColumn] ?? null,
    newest: newest.data?.[0]?.[dateColumn] ?? null,
    rangeError: oldest.error?.code || newest.error?.code || null
  }));
}

const { count: activeEmployees, error: employeeError } = await supabase
  .from('employees')
  .select('*', { count: 'exact', head: true })
  .eq('farm_id', farm.id)
  .eq('status', 'active');
console.log(JSON.stringify({ table: 'employees', active: activeEmployees ?? null, error: employeeError?.code || null }));

const { data: licenseRows, error: licenseError } = await supabase
  .from('licenses')
  .select('status,starts_at,expires_at')
  .eq('farm_id', farm.id);
console.log(JSON.stringify({
  table: 'licenses',
  statuses: licenseRows?.reduce((result, row) => {
    const status = String(row.status || 'unknown');
    result[status] = (result[status] || 0) + 1;
    return result;
  }, {}) || {},
  latestExpiry: licenseRows?.map((row) => row.expires_at).filter(Boolean).sort().at(-1) || null,
  activeNow: licenseRows?.filter((row) => {
    const starts = row.starts_at ? new Date(row.starts_at).getTime() : Number.NEGATIVE_INFINITY;
    const expires = row.expires_at ? new Date(row.expires_at).getTime() : Number.POSITIVE_INFINITY;
    return row.status === 'active' && starts <= Date.now() && expires >= Date.now();
  }).length || 0,
  error: licenseError?.code || null
}));

const { data: deviceRows, error: deviceError } = await supabase
  .from('devices')
  .select('status,device_id')
  .eq('farm_id', farm.id);
console.log(JSON.stringify({
  table: 'devices',
  total: deviceRows?.length ?? null,
  statuses: deviceRows?.reduce((result, row) => {
    const status = String(row.status || 'unknown');
    result[status] = (result[status] || 0) + 1;
    return result;
  }, {}) || {},
  duplicateDeviceIds: deviceRows ? deviceRows.length - new Set(deviceRows.map((row) => row.device_id)).size : null,
  error: deviceError?.code || null
}));

const { data: milkRows, error: milkError } = await supabase
  .from('milk_daily')
  .select('date,liters')
  .eq('farm_id', farm.id)
  .order('date', { ascending: true });
if (!milkError && milkRows) {
  const monthly = new Map();
  const seenDates = new Set();
  let duplicateDates = 0;
  let invalidValues = 0;
  for (const row of milkRows) {
    const month = String(row.date || '').slice(0, 7);
    const liters = Number(row.liters);
    if (!/^\d{4}-\d{2}$/.test(month) || !Number.isFinite(liters) || liters < 0) {
      invalidValues++;
      continue;
    }
    if (seenDates.has(row.date)) duplicateDates++;
    seenDates.add(row.date);
    const current = monthly.get(month) || { total: 0, days: 0 };
    current.total += liters;
    current.days += 1;
    monthly.set(month, current);
  }
  console.log(JSON.stringify({
    table: 'milk_daily_monthly',
    totalRecords: milkRows.length,
    oldest: milkRows.at(0)?.date || null,
    newest: milkRows.at(-1)?.date || null,
    duplicateDates,
    invalidValues,
    months: Object.fromEntries([...monthly.entries()].map(([month, stats]) => [month, {
      total: stats.total,
      days: stats.days,
      average: Number((stats.total / stats.days).toFixed(2))
    }]))
  }));

  const sampleIndexes = [...new Set(Array.from({ length: Math.min(20, milkRows.length) }, (_, index) => (
    Math.round(index * (milkRows.length - 1) / Math.max(1, Math.min(20, milkRows.length) - 1))
  )))];
  console.log(JSON.stringify({
    table: 'milk_daily_samples',
    samples: sampleIndexes.map((index) => ({
      index,
      date: milkRows[index].date,
      liters: Number(milkRows[index].liters)
    }))
  }));
}

const { data: metricRows, error: metricError } = await supabase
  .from('daily_metrics')
  .select('date,type,value')
  .eq('farm_id', farm.id);
if (!metricError && metricRows) {
  const seenKeys = new Set();
  let duplicateKeys = 0;
  let invalidValues = 0;
  const byType = metricRows.reduce((result, row) => {
    const type = String(row.type || 'unknown');
    const key = `${row.date}|${type}`;
    if (seenKeys.has(key)) duplicateKeys++;
    seenKeys.add(key);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(row.date || '')) || !Number.isFinite(Number(row.value)) || Number(row.value) < 0) invalidValues++;
    result[type] = (result[type] || 0) + 1;
    return result;
  }, {});
  console.log(JSON.stringify({ table: 'daily_metrics_by_type', counts: byType, duplicateKeys, invalidValues }));
}

const anomalyRows = [];
let anomalyError = null;
for (let page = 0; ; page++) {
  const pageSize = 500;
  const result = await supabase
    .from('anomalies')
    .select('*')
    .eq('farm_id', farm.id)
    .order('id', { ascending: true })
    .range(page * pageSize, (page + 1) * pageSize - 1);
  if (result.error || !result.data) {
    anomalyError = result.error || new Error('Resposta sem dados');
    break;
  }
  anomalyRows.push(...result.data);
  if (result.data.length < pageSize) break;
}
if (!anomalyError) {
  const bySector = anomalyRows.reduce((result, row) => {
    const sector = String(row.sector || 'Sem setor').trim() || 'Sem setor';
    result[sector] = (result[sector] || 0) + 1;
    return result;
  }, {});
  console.log(JSON.stringify({ table: 'anomalies_by_raw_sector', counts: bySector }));

  const byMonth = {};
  const fingerprints = new Set();
  let duplicateFingerprints = 0;
  let invalidCreatedAt = 0;
  let missingCamelCreatedAt = 0;
  let snakeCaseCreatedAtOnly = 0;
  let emptyDescription = 0;
  let missingEmployeeId = 0;
  let missingEmployeeName = 0;
  let missingDeviceId = 0;
  let legacyMediaPaths = 0;
  let scopedMediaPaths = 0;
  let invalidMediaItems = 0;

  for (const row of anomalyRows) {
    if (!row.createdAt) missingCamelCreatedAt++;
    if (!row.createdAt && row.created_at) snakeCaseCreatedAtOnly++;
    const createdAt = String(row.createdAt || row.created_at || '');
    const month = createdAt.match(/^(\d{4}-\d{2})/)?.[1];
    if (!month || Number.isNaN(new Date(createdAt).getTime())) invalidCreatedAt++;
    else byMonth[month] = (byMonth[month] || 0) + 1;

    const description = String(row.description || '').trim();
    if (!description) emptyDescription++;
    if (!row.employee_id) missingEmployeeId++;
    if (!row.employee_name) missingEmployeeName++;
    if (!row.device_id) missingDeviceId++;

    const fingerprint = `${createdAt}|${String(row.sector || '').trim().toLowerCase()}|${description.toLowerCase()}`;
    if (fingerprints.has(fingerprint)) duplicateFingerprints++;
    fingerprints.add(fingerprint);

    const media = Array.isArray(row.media) ? row.media : (row.media ? [row.media] : []);
    for (const item of media) {
      if (!item || typeof item !== 'object') {
        invalidMediaItems++;
        continue;
      }
      const path = String(item.remotePath || '');
      if (path.startsWith('farms/')) scopedMediaPaths++;
      else if (path) legacyMediaPaths++;
    }
  }

  console.log(JSON.stringify({
    table: 'anomalies_integrity',
    totalFetched: anomalyRows.length,
    byMonth,
    invalidCreatedAt,
    missingCamelCreatedAt,
    snakeCaseCreatedAtOnly,
    emptyDescription,
    duplicateFingerprints,
    missingEmployeeId,
    missingEmployeeName,
    missingDeviceId,
    mediaPaths: { legacy: legacyMediaPaths, farmScoped: scopedMediaPaths, invalid: invalidMediaItems }
  }));
}

const { data: allEmployees, error: allEmployeesError } = await supabase
  .from('employees')
  .select('id,name,status,farm_id,is_admin')
  .eq('farm_id', farm.id);
if (!allEmployeesError && allEmployees) {
  const employeeIds = new Set(allEmployees.map((row) => String(row.id)));
  const activeEmployeeIds = new Set(
    allEmployees
      .filter((row) => !row.status || row.status === 'active')
      .map((row) => String(row.id))
  );
  const normalizedNames = allEmployees.map((row) => String(row.name || '').trim().toLocaleLowerCase('pt-BR'));
  const duplicateNames = normalizedNames.length - new Set(normalizedNames).size;
  const anomalyEmployeeReferences = anomalyRows.reduce((result, row) => {
    if (!row.employee_id) return result;
    const id = String(row.employee_id);
    if (!employeeIds.has(id)) result.missingEmployee++;
    else if (!activeEmployeeIds.has(id)) result.inactiveEmployee++;
    else result.activeEmployee++;
    return result;
  }, { activeEmployee: 0, inactiveEmployee: 0, missingEmployee: 0 });
  console.log(JSON.stringify({
    table: 'employees_integrity',
    total: allEmployees.length,
    activeOrLegacyStatus: activeEmployeeIds.size,
    admins: allEmployees.filter((row) => row.is_admin === true).length,
    emptyNames: normalizedNames.filter((name) => !name).length,
    duplicateNames,
    anomalyEmployeeReferences
  }));
}
