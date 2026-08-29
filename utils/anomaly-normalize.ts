import { Anomaly } from '../types';
import { normalizeMediaItems } from './record-normalize';
import { canonicalizeSector } from '../constants/sectors';

const asText = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback;

export function normalizeAnomaly(value: unknown): Anomaly | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const id = asText(row.id);
  if (!id) return null;

  return {
    ...row,
    id,
    farm_id: typeof row.farm_id === 'string' ? row.farm_id : undefined,
    employee_id: typeof row.employee_id === 'string' ? row.employee_id : undefined,
    employee_name: typeof row.employee_name === 'string' ? row.employee_name : undefined,
    createdAt: asText(row.createdAt),
    responsible: asText(row.responsible, asText(row.employee_name)),
    sector: canonicalizeSector(row.sector),
    description: asText(row.description),
    immediateSolution: asText(row.immediateSolution),
    media: normalizeMediaItems(row.media),
    resolvedAt: typeof row.resolvedAt === 'string' ? row.resolvedAt : undefined,
    resolvedBy: typeof row.resolvedBy === 'string' ? row.resolvedBy : undefined
  } as Anomaly;
}

export function normalizeAnomalies(values: unknown): Anomaly[] {
  if (!Array.isArray(values)) return [];
  return values.map(normalizeAnomaly).filter((item): item is Anomaly => item !== null);
}
