const BUSINESS_ORDER_FIELDS: Record<string, string[]> = {
  milk_daily: ['date'],
  daily_metrics: ['date', 'type'],
  farm_monthly_stats: ['monthKey']
};

/** Tabelas com dados do usuário que podem precisar de recuperação após uma interrupção. */
export const ORPHAN_RECOVERY_TABLES = [
  'anomalies',
  'instructions',
  'notices',
  'improvements',
  'farm_docs',
  'daily_metrics',
  'milk_daily',
  'farm_monthly_stats'
] as const;

/** Campos estáveis usados para paginar cada tabela sem presumir que existe uma coluna id. */
export function getServerOrderFields(tableName: string, primaryField?: string | null): string[] {
  const fields = [
    ...(primaryField ? [primaryField] : []),
    ...(BUSINESS_ORDER_FIELDS[tableName] || ['id'])
  ];
  return Array.from(new Set(fields));
}

/** Retorna somente cursores reais recebidos do servidor; nunca inventa um horário local. */
export function getMaxRefreshCursor(rows: unknown[], field: string): string | null {
  let max: string | null = null;
  for (const value of rows) {
    if (!value || typeof value !== 'object') continue;
    const candidate = (value as Record<string, unknown>)[field];
    if (typeof candidate !== 'string' || candidate.length === 0) continue;
    if (max === null || candidate > max) max = candidate;
  }
  return max;
}
