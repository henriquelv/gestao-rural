import { describe, expect, it } from 'vitest';
import { getAnomalyDateParts, getBusinessDateKey, getBusinessMonthKey, groupAnomaliesByMonth } from './anomaly-months';
import { SECTORS_LIST } from '../constants/sectors';
import { normalizeImprovement, normalizeInstruction, normalizeNotice, normalizeUIConfig } from './record-normalize';
import { normalizeAnomaly } from './anomaly-normalize';

const monthOf = (value: string) => getAnomalyDateParts(value)?.monthIndex;

describe('anomaly dates', () => {
  it('mantem limites de janeiro, fevereiro e marco', () => {
    expect(monthOf('2026-01-01T00:00:00')).toBe(0);
    expect(monthOf('2026-01-31T23:59:59')).toBe(0);
    expect(monthOf('2026-02-01T00:00:00')).toBe(1);
    expect(monthOf('2026-02-28T23:59:59')).toBe(1);
    expect(monthOf('2026-03-01T00:00:00')).toBe(2);
  });

  it('preserva a data de negocio em ISO com timezone', () => {
    expect(monthOf('2026-02-01T01:30:00Z')).toBe(0);
    expect(monthOf('2026-02-01T03:01:00Z')).toBe(1);
    expect(monthOf('2026-02-01T00:00:00-03:00')).toBe(1);
    expect(monthOf('2026-02-01T00:00:00+00:00')).toBe(0);
  });

  it('converte limites locais de Sao Paulo para o mes de negocio', () => {
    expect(monthOf('2026-02-01T01:30:00.000Z')).toBe(0);
    expect(monthOf('2026-02-01T02:59:00.000Z')).toBe(0);
    expect(monthOf('2026-02-01T03:01:00.000Z')).toBe(1);
    expect(monthOf('2026-03-01T02:59:00.000Z')).toBe(1);
    expect(monthOf('2026-03-01T03:01:00.000Z')).toBe(2);
    expect(getBusinessDateKey('2026-02-01T02:59:00.000Z')).toBe('2026-01-31');
    expect(getBusinessMonthKey('2026-02-01T02:59:00.000Z')).toBe('2026-01');
  });

  it('rejeita datas invalidas', () => {
    expect(getAnomalyDateParts('2026-02-31T12:00:00')).toBeNull();
    expect(getAnomalyDateParts('not-a-date')).toBeNull();
  });

  it('aceita timestamp legado MM/DD/YYYY', () => {
    expect(monthOf('01/31/2026 23:59:59')).toBe(0);
    expect(monthOf('02/01/2026 00:00:00')).toBe(1);
  });

  it('normaliza shape legado sem apagar campos de contexto', async () => {
    const { normalizeAnomaly } = await import('./anomaly-normalize');
    const normalized = normalizeAnomaly({
      id: 'legacy-1', farm_id: 'farm-1', employee_id: 'employee-1', employee_name: 'Funcionário',
      createdAt: '2026-02-01T00:00:00Z', responsible: null, sector: 42, description: null,
      immediateSolution: undefined, media: null, synced: false
    });
    expect(normalized?.media).toEqual([]);
    expect(normalized?.responsible).toBe('Funcionário');
    expect(normalized?.sector).toBe('');
    expect(normalized?.description).toBe('');
    expect(normalized?.farm_id).toBe('farm-1');
    expect(normalized?.employee_id).toBe('employee-1');
  });

  it('normaliza registros de mídia e configuração legados', () => {
    expect(normalizeInstruction({ id: 'i', media: null, title: null })!.media).toEqual([]);
    expect(normalizeNotice({ id: 'n', media: {}, responsible: null })!.media).toEqual([]);
    expect(normalizeImprovement({ id: 'm', media: undefined, description: null })!.media).toEqual([]);
    const legacyPhoto = normalizeNotice({ id: 'photo', media: { remotePath: 'notices/old.jpg' } })!.media;
    expect(legacyPhoto).toEqual([expect.objectContaining({ type: 'photo', remotePath: 'notices/old.jpg' })]);
    expect(legacyPhoto[0].id).toMatch(/^legacy-/);
    const config = normalizeUIConfig({ buttons: null, customPages: null }, {
      buttons: [{ id: 'default' } as any], customPages: []
    });
    expect(config.buttons).toHaveLength(0);
    expect(config.customPages).toEqual([]);
  });

  it('agrupa 883 anomalias sem limite e mantem os 12 meses', () => {
    const anomalies = Array.from({ length: 883 }, (_, index) => ({
      id: `a-${index}`,
      createdAt: `2026-${String((index % 11) + 1).padStart(2, '0')}-15T12:00:00-03:00`,
      sector: SECTORS_LIST[0]
    })) as any[];

    const months = groupAnomaliesByMonth(anomalies, 2026);
    const total = months.reduce((sum, month) => (
      sum + Object.values(month.bySetor).reduce((subtotal, count) => subtotal + count, 0) + month.unknownCount
    ), 0);

    expect(months).toHaveLength(12);
    expect(months[0].label).toBe('jan 26');
    expect(months[11].label).toBe('dez 26');
    expect(months[11].bySetor[SECTORS_LIST[0]]).toBe(0);
    expect(total).toBe(883);
  });
});
