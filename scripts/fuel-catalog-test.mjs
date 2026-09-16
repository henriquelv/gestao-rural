import assert from 'node:assert/strict';
import { build } from 'esbuild';

const load = async entry => {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'esm' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};
const { default: handler } = await load('api/fueling/catalog.ts');
const { ownsFuelCatalog, normalizePlate } = await load('utils/fuel-catalog.ts');
assert.equal(normalizePlate('abc-1234'), 'ABC1234');
assert.equal(ownsFuelCatalog({ farm_id: 'farm-a', employee_id: 'a' }, { farm_id: 'farm-a', employee_id: 'a' }), true);
assert.equal(ownsFuelCatalog({ farm_id: 'farm-a', employee_id: 'a' }, { farm_id: 'farm-a', employee_id: 'b' }), false);
assert.equal(ownsFuelCatalog({ farm_id: 'farm-a', employee_id: 'a' }, { farm_id: 'farm-b', employee_id: 'a' }), false);

const previousFetch = globalThis.fetch;
const previousEnv = Object.fromEntries(['VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY'].map(key => [key, process.env[key]]));
process.env.VITE_SUPABASE_URL = 'https://fuel-catalog-test.invalid';
process.env.VITE_SUPABASE_ANON_KEY = 'fake-anon';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-server-key';
const vehicles = [{ id: 'vehicle-user-b', farm_id: 'farm-a', employee_id: 'b', name: 'Carro B', plate: 'BBB1234' }];
const stations = [{ id: 'station-user-b', farm_id: 'farm-a', employee_id: 'b', name: 'Posto B' }];
let calls = 0;
globalThis.fetch = async (input, options = {}) => {
  calls++;
  const url = new URL(input);
  assert.equal(url.origin, 'https://fuel-catalog-test.invalid', 'Teste nunca pode acessar um servidor real.');
  const response = data => new Response(JSON.stringify(data), { status: 200 });
  if (url.pathname.endsWith('/employees')) {
    const id = url.searchParams.get('id')?.slice(3);
    return response([{ id, name: `Usuário ${id}`, role: id === 'admin' ? 'Administrador' : 'Técnico', status: 'active', access_pin: 'fake-pin' }]);
  }
  const rows = url.pathname.endsWith('/fuel_vehicles') ? vehicles : stations;
  assert.equal(options.headers.apikey, 'fake-server-key');
  const filtered = rows.filter(row => ['id','farm_id','employee_id'].every(key => !url.searchParams.has(key) || row[key] === url.searchParams.get(key).slice(3)));
  if (!options.method || options.method === 'GET') return response(filtered);
  if (options.method === 'PATCH') { for (const row of filtered) Object.assign(row, JSON.parse(options.body)); return response({}); }
  if (options.method === 'POST') { rows.push(JSON.parse(options.body)); return response({}); }
  throw new Error('Método inesperado');
};
const request = async ({ employee = 'a', method = 'GET', kind = 'vehicle', payload, op = 'upsert', anonymous = false }) => {
  let status, body;
  const req = { method, query: { kind }, headers: anonymous ? {} : { 'x-campo-farm-id': 'farm-a', 'x-campo-employee-id': employee, 'x-campo-admin-pin': 'fake-pin' }, body: { op, payload } };
  const res = { setHeader() {}, status(code) { status = code; return this; }, json(value) { body = value; } };
  await handler(req, res); return { status, body };
};
try {
  assert.equal((await request({ anonymous: true })).status, 403);
  assert.equal((await request({ method: 'DELETE' })).status, 405);
  assert.equal((await request({ kind: 'unknown' })).status, 400);
  assert.deepEqual((await request({})).body.items, []);
  assert.deepEqual((await request({ employee: 'admin' })).body.items, [], 'Administrador também seleciona somente seus cadastros.');
  const payload = { id: 'vehicle-user-a', farm_id: 'farm-a', employee_id: 'a', name: '  Carro   A ', plate: 'aaa-1234', createdAt: '2026-09-15T12:00:00Z' };
  assert.equal((await request({ method: 'POST', payload })).status, 200);
  assert.equal(vehicles[1].name, 'Carro A'); assert.equal(vehicles[1].plate, 'AAA1234');
  assert.equal((await request({})).body.items.length, 1);
  assert.equal((await request({ employee: 'b' })).body.items[0].name, 'Carro B');
  assert.equal((await request({ method: 'POST', payload: { ...payload, employee_id: 'b' } })).status, 403);
  assert.equal((await request({ method: 'POST', payload: { ...payload, farm_id: 'farm-b' } })).status, 403);
  assert.equal((await request({ method: 'POST', payload: { ...payload, id: 'vehicle-user-b' } })).status, 403);
  assert.equal((await request({ method: 'POST', payload: { ...payload, plate: 'errada' } })).status, 400);
  assert.equal((await request({ method: 'POST', payload: { ...payload, name: '' } })).status, 400);
  assert.equal((await request({ method: 'POST', payload: { ...payload, name: 'Carro A editado' } })).status, 200);
  assert.equal(vehicles.length, 2, 'Retry não duplica o cadastro.');
  assert.equal(vehicles[0].name, 'Carro B', 'Cadastro alheio permanece intacto.');
  assert.equal((await request({ method: 'POST', kind: 'station', payload: { ...payload, id: 'station-user-a', name: 'Posto A', address: 'Rua A, 100' } })).status, 200);
  assert.equal((await request({ kind: 'station' })).body.items[0].address, 'Rua A, 100');
  assert.equal(stations[0].name, 'Posto B');
  console.log(JSON.stringify({ ok: true, isolation: 'employee + farm', adminCatalog: 'own only', tamperingDenied: true, retriesIdempotent: true, mockRequests: calls, externalWrites: false }));
} finally {
  globalThis.fetch = previousFetch;
  for (const [key, value] of Object.entries(previousEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
}
