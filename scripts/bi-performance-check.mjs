import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((line) => /^\w+=/.test(line)).map((line) => {
  const index = line.indexOf('=');
  return [line.slice(0, index), line.slice(index + 1).trim().replace(/^["']|["']$/g, '')];
}));
const apiHeaders = { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}` };
const employees = await (await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/employees?role=eq.Administrador&status=eq.active&select=id,farm_id,access_pin,admin_pin&limit=1`, { headers: apiHeaders })).json();
assert.ok(employees[0]);
const headers = {
  'x-campo-farm-id': employees[0].farm_id,
  'x-campo-employee-id': employees[0].id,
  'x-campo-admin-pin': employees[0].access_pin || employees[0].admin_pin
};
const base = 'https://campo-legado-gestao-rural.vercel.app';
const timedJson = async (url) => {
  const start = performance.now();
  const response = await fetch(url, { headers });
  const data = await response.json();
  return { status: response.status, seconds: Math.round((performance.now() - start) / 10) / 100, data };
};

const farms = await timedJson(`${base}/api/rumina/farms`);
assert.equal(farms.status, 200);
const selected = farms.data.farms.filter((farm) => !farm.isAggregate).sort((a, b) => (b.lastProcessedAt || '').localeCompare(a.lastProcessedAt || ''))[0];
assert.ok(selected);
const endMonth = new Date().toISOString().slice(0, 7);
const farmFresh = await timedJson(`${base}/api/rumina/dashboard?farmId=${selected.id}&months=6&endMonth=${endMonth}&refresh=1`);
const farmWarm = await timedJson(`${base}/api/rumina/dashboard?farmId=${selected.id}&months=6&endMonth=${endMonth}`);
const managementFresh = await timedJson(`${base}/api/rumina/dashboard?farmId=__all__&months=3&endMonth=${endMonth}&refresh=1`);
const managementWarm = await timedJson(`${base}/api/rumina/dashboard?farmId=__all__&months=3&endMonth=${endMonth}`);
console.log(JSON.stringify({
  farmsSeconds: farms.seconds,
  farmFreshSeconds: farmFresh.seconds,
  farmWarmSeconds: farmWarm.seconds,
  managementFreshSeconds: managementFresh.seconds,
  managementWarmSeconds: managementWarm.seconds,
  farmStatus: farmFresh.status,
  managementStatus: managementWarm.status
}));
