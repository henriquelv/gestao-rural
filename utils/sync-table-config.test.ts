import { describe, expect, it } from 'vitest';
import { getMaxRefreshCursor, getServerOrderFields, ORPHAN_RECOVERY_TABLES } from './sync-table-config';

describe('configuracao de leitura do servidor', () => {
  it('nao presume coluna id nas tabelas de leite e metricas', () => {
    expect(getServerOrderFields('milk_daily')).toEqual(['date']);
    expect(getServerOrderFields('daily_metrics')).toEqual(['date', 'type']);
    expect(getServerOrderFields('farm_monthly_stats')).toEqual(['monthKey']);
  });

  it('mantem ordenacao estavel quando existe cursor incremental', () => {
    expect(getServerOrderFields('anomalies', 'updated_at')).toEqual(['updated_at', 'id']);
    expect(getServerOrderFields('anomalies', 'id')).toEqual(['id']);
  });

  it('usa o maior cursor realmente recebido sem avancar em pagina vazia', () => {
    expect(getMaxRefreshCursor([
      { createdAt: '2026-08-20T10:00:00Z' },
      { createdAt: '2026-08-27T09:00:00Z' },
      { createdAt: null }
    ], 'createdAt')).toBe('2026-08-27T09:00:00Z');
    expect(getMaxRefreshCursor([], 'createdAt')).toBeNull();
    expect(getMaxRefreshCursor([{ updated_at: null }], 'updated_at')).toBeNull();
  });

  it('recupera somente dados operacionais e nao transforma seeds em pendencias', () => {
    expect(ORPHAN_RECOVERY_TABLES).toContain('anomalies');
    expect(ORPHAN_RECOVERY_TABLES).toContain('milk_daily');
    expect(ORPHAN_RECOVERY_TABLES).not.toContain('ui_config' as any);
    expect(ORPHAN_RECOVERY_TABLES).not.toContain('settings' as any);
    expect(ORPHAN_RECOVERY_TABLES).not.toContain('sectors' as any);
    expect(ORPHAN_RECOVERY_TABLES).not.toContain('employees' as any);
  });
});
