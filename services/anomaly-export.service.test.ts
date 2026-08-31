import { describe, expect, it } from 'vitest';
import { buildAnomalyDetailRows, buildAnomalyParetoRows } from './anomaly-export.service';

describe('relatório de anomalias para Excel e Pareto', () => {
  const anomalies = [
    {
      id: '1', createdAt: '2026-01-05T10:00:00', sector: 'Ordenha',
      description: 'Mangueira rompida', immediateSolution: 'Substituição',
      responsible: 'Ivone', media: []
    },
    {
      id: '2', createdAt: '2026-02-10T10:00:00', sector: 'Ordenha',
      description: 'Registro travado', immediateSolution: '',
      responsible: '', employee_name: 'Gidelson', resolvedAt: '2026-02-11', media: []
    },
    {
      id: '3', createdAt: '2026-03-03', sector: 'Manejo',
      description: 'Cerca danificada', immediateSolution: 'Isolamento',
      responsible: 'Sandro', media: []
    }
  ] as any[];

  it('organiza as colunas detalhadas e preserva o responsável', () => {
    expect(buildAnomalyDetailRows(anomalies)).toEqual([
      ['05/01/2026', 'Ordenha', 'Mangueira rompida', 'Substituição', 'Pendente', 'Ivone'],
      ['10/02/2026', 'Ordenha', 'Registro travado', '', 'Resolvida', 'Gidelson'],
      ['03/03/2026', 'Manejo', 'Cerca danificada', 'Isolamento', 'Pendente', 'Sandro']
    ]);
  });

  it('gera ranking, participação e acumulado para Pareto', () => {
    expect(buildAnomalyParetoRows(anomalies)).toEqual([
      [1, 'Ordenha', 2, 0.6666666667, 0.6666666667, 'A - maior impacto'],
      [2, 'Manejo', 1, 0.3333333333, 1, 'C - menor impacto']
    ]);
  });
});
