import { describe, expect, it } from 'vitest';
import { buildMilkSummary } from './milk-stats';

describe('buildMilkSummary', () => {
  it('mantem os 12 meses e calcula media por dia registrado', () => {
    const summary = buildMilkSummary([
      { date: '2026-01-01', liters: 100 },
      { date: '2026-01-02', liters: 200 },
      { date: '2026-02-01', liters: 300 },
      { date: '2025-12-31', liters: 400 }
    ], 2026);

    expect(summary.months).toHaveLength(12);
    expect(summary.months[0]).toMatchObject({ label: 'Jan', total: 300, average: 150, days: 2 });
    expect(summary.months[1]).toMatchObject({ label: 'Fev', total: 300, average: 300, days: 1 });
    expect(summary.months[2]).toMatchObject({ label: 'Mar', total: 0, average: 0, days: 0 });
    expect(summary.yearStats).toEqual({ total: 600, average: 200, days: 3 });
    expect(summary.allTimeStats).toEqual({ total: 1000, average: 250, days: 4 });
  });

  it('ignora datas e valores invalidos sem deslocar meses por timezone', () => {
    const summary = buildMilkSummary([
      { date: '2026-01-01T00:00:00.000Z', liters: 50 },
      { date: 'invalida', liters: 10 },
      { date: '2026-02-01', liters: Number.NaN },
      { date: '2026-03-01', liters: -1 }
    ], 2026);

    expect(summary.months[0].total).toBe(50);
    expect(summary.yearStats.days).toBe(1);
  });
});
