import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((line) => /^\w+=/.test(line))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1).trim().replace(/^["']|["']$/g, '')];
    })
);

const tables = [
  'farms', 'licenses', 'employees', 'clients', 'devices', 'appointments',
  'fuelings', 'anomalies', 'notices', 'instructions', 'improvements', 'farm_docs'
];
const headers = {
  apikey: env.VITE_SUPABASE_ANON_KEY,
  Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`,
  Prefer: 'count=exact',
  Range: '0-0'
};

const probe = async (table) => {
  const startedAt = performance.now();
  const response = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${table}?select=id`, { headers });
  await response.arrayBuffer();
  return {
    table,
    status: response.status,
    milliseconds: Math.round(performance.now() - startedAt),
    count: Number((response.headers.get('content-range') || '').split('/')[1]) || 0
  };
};

const startedAt = performance.now();
const results = await Promise.all(tables.map(probe));
console.log(JSON.stringify({
  ok: results.every((item) => item.status >= 200 && item.status < 300),
  parallelMilliseconds: Math.round(performance.now() - startedAt),
  slowest: [...results].sort((a, b) => b.milliseconds - a.milliseconds).slice(0, 5),
  results
}));
