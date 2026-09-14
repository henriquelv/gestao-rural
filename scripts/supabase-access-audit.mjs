import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((line) => /^\w+=/.test(line))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1).trim().replace(/^["']|["']$/g, '')];
    })
);
const headers = {
  apikey: env.VITE_SUPABASE_ANON_KEY,
  Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`
};
const probe = async (table, select) => {
  const response = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=1`, { headers });
  let rows = [];
  try { rows = await response.json(); } catch { /* status is sufficient */ }
  return { status: response.status, readable: response.ok, returnedRows: Array.isArray(rows) ? rows.length : 0 };
};

const checks = {
  farms: await probe('farms', 'id'),
  licenses: await probe('licenses', 'id'),
  employeesWithPins: await probe('employees', 'id,access_pin,admin_pin'),
  devices: await probe('devices', 'device_id,employee_id,status'),
  clients: await probe('clients', 'id,name'),
  workOrdersWithValues: await probe('anomalies', 'id,employee_id,projectValue,visitValue,kmValue'),
  appointments: await probe('appointments', 'id,employee_id'),
  fuelings: await probe('fuelings', 'id,employee_id,totalValue'),
  notices: await probe('notices', 'id')
};
console.log(JSON.stringify(checks));
