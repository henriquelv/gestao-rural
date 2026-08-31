import { Anomaly } from '../types';
import { getAnomalyDate } from '../utils/anomaly-months';
import { buildAnomalyPareto } from '../utils/anomaly-pareto';
import { farmContextService } from './farm-context.service';
import { ExportResult, SpreadsheetSheet, exportCsv, exportXlsx } from './export.service';

export type AnomalyExportFormat = 'xlsx' | 'csv';

const formatDate = (value: string): string => (
  getAnomalyDate(value)?.toLocaleDateString('pt-BR') || String(value || '')
);

const statusLabel = (anomaly: Anomaly): string => anomaly.resolvedAt ? 'Resolvida' : 'Pendente';

const responsibleLabel = (anomaly: Anomaly): string => (
  String(anomaly.responsible || anomaly.employee_name || '').trim() || 'Não informado'
);

export const buildAnomalyDetailRows = (anomalies: Anomaly[]): unknown[][] => anomalies.map((item) => [
  formatDate(item.createdAt),
  item.sector || 'Sem setor',
  item.description || '',
  item.immediateSolution || '',
  statusLabel(item),
  responsibleLabel(item)
]);

export const buildAnomalyParetoRows = (anomalies: Anomaly[]): unknown[][] => (
  buildAnomalyPareto(anomalies).map((row, index) => [
    index + 1,
    row.label,
    row.count,
    Number((row.percentage / 100).toFixed(10)),
    Number((row.cumulativePercentage / 100).toFixed(10)),
    row.cumulativePercentage <= 80 ? 'A - maior impacto' : row.cumulativePercentage <= 95 ? 'B - impacto intermediário' : 'C - menor impacto'
  ])
);

export const buildAnomalyWorkbook = (anomalies: Anomaly[], scopeLabel: string): SpreadsheetSheet[] => {
  const farmName = farmContextService.getContext()?.farm_name || 'Gestão Rural';
  const generatedAt = new Date().toLocaleString('pt-BR');
  const subtitle = `${farmName} | ${scopeLabel} | ${anomalies.length} registros | Gerado em ${generatedAt}`;

  return [
    {
      name: 'Anomalias',
      title: 'Relatório de Anomalias',
      subtitle,
      columns: [
        { header: 'Data', width: 13 },
        { header: 'Setor', width: 22 },
        { header: 'O que aconteceu', width: 52 },
        { header: 'Solução imediata', width: 42 },
        { header: 'Status', width: 14 },
        { header: 'Responsável', width: 22 }
      ],
      rows: buildAnomalyDetailRows(anomalies)
    },
    {
      name: 'Pareto por setor',
      title: 'Análise de Pareto por Setor',
      subtitle: `${farmName} | ${scopeLabel} | Ordenado do maior impacto para o menor`,
      columns: [
        { header: 'Posição', width: 10, type: 'number' },
        { header: 'Setor', width: 28 },
        { header: 'Quantidade', width: 14, type: 'number' },
        { header: 'Participação', width: 16, type: 'percent' },
        { header: 'Percentual acumulado', width: 22, type: 'percent' },
        { header: 'Faixa Pareto', width: 28 }
      ],
      rows: buildAnomalyParetoRows(anomalies)
    }
  ];
};

export const exportAnomalyReport = async (
  anomalies: Anomaly[],
  requestedName: string,
  format: AnomalyExportFormat,
  scopeLabel: string
): Promise<ExportResult> => {
  if (format === 'csv') {
    return exportCsv([
      ['Data', 'Setor', 'O que aconteceu', 'Solução imediata', 'Status', 'Responsável'],
      ...buildAnomalyDetailRows(anomalies)
    ], requestedName);
  }
  return exportXlsx(buildAnomalyWorkbook(anomalies, scopeLabel), requestedName);
};
