import { strict as assert } from 'node:assert';
import test from 'node:test';
import { getAnomalyDateParts } from './anomaly-months';
import { normalizeAnomaly } from './anomaly-normalize';

const monthOf = (value: string) => getAnomalyDateParts(value)?.monthIndex;

test('mantem limites de janeiro, fevereiro e marco', () => {
  assert.equal(monthOf('2026-01-01T00:00:00'), 0);
  assert.equal(monthOf('2026-01-31T23:59:59'), 0);
  assert.equal(monthOf('2026-02-01T00:00:00'), 1);
  assert.equal(monthOf('2026-02-28T23:59:59'), 1);
  assert.equal(monthOf('2026-03-01T00:00:00'), 2);
});

test('preserva a data de negocio em ISO com timezone', () => {
  assert.equal(monthOf('2026-02-01T00:00:00Z'), 1);
  assert.equal(monthOf('2026-02-01T00:00:00-03:00'), 1);
  assert.equal(monthOf('2026-02-01T00:00:00+00:00'), 1);
});

test('rejeita datas invalidas', () => {
  assert.equal(getAnomalyDateParts('2026-02-31T12:00:00'), null);
  assert.equal(getAnomalyDateParts('not-a-date'), null);
});

test('aceita timestamp legado MM/DD/YYYY', () => {
  assert.equal(monthOf('01/31/2026 23:59:59'), 0);
  assert.equal(monthOf('02/01/2026 00:00:00'), 1);
});

test('normaliza shape legado sem apagar campos de contexto', () => {
  const normalized = normalizeAnomaly({
    id: 'legacy-1',
    farm_id: 'farm-1',
    employee_id: 'employee-1',
    employee_name: 'Funcionário',
    createdAt: '2026-02-01T00:00:00Z',
    responsible: null,
    sector: 42,
    description: null,
    immediateSolution: undefined,
    media: null,
    synced: false
  });

  assert.deepEqual(normalized?.media, []);
  assert.equal(normalized?.responsible, 'Funcionário');
  assert.equal(normalized?.sector, '');
  assert.equal(normalized?.description, '');
  assert.equal(normalized?.farm_id, 'farm-1');
  assert.equal(normalized?.employee_id, 'employee-1');
});