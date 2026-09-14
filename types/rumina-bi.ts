export const SOURCES = ['animaisativos','animaistotais','analiseleite','analisetanque','controleleiteiro','producaoleite','inseminacoes','tentativas','coberturas','diagnosticos','transferenciaembriao','partos','nascimentos','abortos','mastite','doencas','aplicacaoproduto','pesagemcorporal','medidas','desmamas','baixas','ciosnaoinseminados','secagens','receitas','despesas'] as const;
export type Source = typeof SOURCES[number];
export type SourceState = 'ok' | 'empty' | 'unavailable' | 'partial';
export type MetricKey =
  | 'activeAnimals' | 'totalAnimals'
  | 'averageMilk' | 'milkMeasurements' | 'averageCcs' | 'averageFat' | 'averageProtein'
  | 'tankAnalyses' | 'averageTankCbt' | 'averageTankCcs' | 'averageTankFat' | 'averageTankProtein' | 'averageTankUrea' | 'averageTankSolids' | 'averageTankNonfatSolids'
  | 'milkProductionEntries' | 'averageLactatingCows' | 'milkToClient' | 'milkToEmployees' | 'milkToRearing' | 'milkOther'
  | 'inseminations' | 'attempts' | 'coverages' | 'diagnoses' | 'embryoTransfers' | 'pregnanciesConfirmed' | 'pregnanciesEvaluated' | 'pregnancyRate'
  | 'births' | 'birthRecords' | 'calves' | 'averageCalvesPerBirth' | 'abortions'
  | 'mastitisCases' | 'diseases' | 'applications' | 'measurements'
  | 'averageWeight' | 'averageGmd' | 'averageGpd' | 'weighings' | 'weanings' | 'exits' | 'heats' | 'dryings'
  | 'averageDryingDel' | 'averageLactationProduction' | 'averageAdjusted305'
  | 'revenue' | 'revenueEntries' | 'averageRevenue' | 'expense' | 'expenseEntries' | 'averageExpense' | 'balance';
export type Metrics = Record<MetricKey, number | null>;
export interface RuminaFarm { id: string; name: string; lastProcessedAt: string | null; isAggregate?: boolean; farmCount?: number }
export interface RuminaDashboard {
  farm: RuminaFarm;
  period: { months: number; from: string; to: string };
  metrics: Metrics;
  trends: Array<Metrics & { monthKey: string; label: string }>;
  sources: Record<Source, { state: SourceState; records: number; excluded: number }>;
  breakdowns: {
    diseases: { label: string; count: number }[];
    applications: { label: string; count: number }[];
    exits: { label: string; count: number }[];
    animalTypes: { label: string; count: number }[];
    expenses: { label: string; value: number }[];
    revenues: { label: string; value: number }[];
  };
  source: { provider: string; readOnly: true; generatedAt: string; lastProcessedAt: string | null; partial: boolean; unavailable: string[]; truncated: boolean };
  farmComparisons?: Array<{ farm: Pick<RuminaFarm, 'id' | 'name'>; metrics: Metrics }>;
  cache?: { offline: boolean; savedAt: string; fallback?: boolean };
}
