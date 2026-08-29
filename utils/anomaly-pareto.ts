import { Anomaly } from '../types';

export interface ParetoRow {
  label: string;
  count: number;
  percentage: number;
  cumulativePercentage: number;
}

export const buildAnomalyPareto = (anomalies: Anomaly[]): ParetoRow[] => {
  const counts = new Map<string, number>();
  for (const anomaly of anomalies) {
    const label = String(anomaly?.sector || '').trim() || 'Sem setor';
    counts.set(label, (counts.get(label) || 0) + 1);
  }

  const total = anomalies.length;
  let cumulative = 0;
  return [...counts.entries()]
    .sort(([labelA, countA], [labelB, countB]) => countB - countA || labelA.localeCompare(labelB, 'pt-BR'))
    .map(([label, count]) => {
      const percentage = total > 0 ? (count / total) * 100 : 0;
      cumulative += percentage;
      return {
        label,
        count,
        percentage,
        cumulativePercentage: Math.min(cumulative, 100)
      };
    });
};
