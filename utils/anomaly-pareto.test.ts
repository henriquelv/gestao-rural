import { describe, expect, it } from 'vitest';
import { buildAnomalyPareto } from './anomaly-pareto';
import { normalizeAnomalies } from './anomaly-normalize';

describe('buildAnomalyPareto', () => {
  it('ordena setores e calcula percentual acumulado', () => {
    const anomalies = [
      { sector: 'ORDENHA' },
      { sector: 'ORDENHA' },
      { sector: 'SERVIÇOS EXTERNOS' },
      { sector: '' }
    ] as any[];

    const rows = buildAnomalyPareto(anomalies);
    expect(rows.map((row) => [row.label, row.count])).toEqual([
      ['ORDENHA', 2],
      ['Sem setor', 1],
      ['SERVIÇOS EXTERNOS', 1]
    ]);
    expect(rows[0].percentage).toBe(50);
    expect(rows.at(-1)?.cumulativePercentage).toBe(100);
  });

  it('une setores antigos em caixa alta com o nome atual', () => {
    const anomalies = normalizeAnomalies([
      { id: '1', createdAt: '2026-01-01', sector: 'ORDENHA' },
      { id: '2', createdAt: '2026-01-02', sector: 'Ordenha' }
    ]);
    expect(buildAnomalyPareto(anomalies)).toMatchObject([
      { label: 'Ordenha', count: 2, cumulativePercentage: 100 }
    ]);
  });
});
