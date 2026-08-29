import { describe, expect, it } from 'vitest';
import { getLocalRecordId, getProtectedLocalRecordIds } from './local-record-id';
import {
  normalizeDailyMetric,
  normalizeDailyMilk,
  normalizeEmployees,
  normalizeInstruction,
  normalizeNotice,
  normalizeUIConfig
} from './record-normalize';
import { isRecoverableSyncError } from './sync-errors';
import { resolveAdminPin } from './admin-pin';
import { getUserFacingError } from './user-error';

describe('identidade local multi-fazenda', () => {
  it('usa a mesma chave composta para tabelas operacionais e configuracoes', () => {
    expect(getLocalRecordId('milk_daily', { farm_id: 'farm-1', date: '2026-08-23' }))
      .toBe('farm-1_2026-08-23');
    expect(getLocalRecordId('daily_metrics', { farm_id: 'farm-1', date: '2026-08-23', type: 'lactation' }))
      .toBe('farm-1_2026-08-23_lactation');
    expect(getLocalRecordId('sectors', { farm_id: 'farm-1', name: 'Ordenha' }))
      .toBe('farm-1_Ordenha');
    expect(getLocalRecordId('ui_config', { farm_id: 'farm-1', id: '1' }))
      .toBe('farm-1_1');
  });

  it('nao inventa chaves para registros sem identidade', () => {
    expect(getLocalRecordId('daily_metrics', { farm_id: 'farm-1', date: '2026-08-23' })).toBe('');
    expect(getLocalRecordId('anomalies', { description: 'sem id' })).toBe('');
  });

  it('protege alteracoes e exclusoes locais durante o refresh remoto', () => {
    const protectedIds = getProtectedLocalRecordIds(
      'milk_daily',
      [{ id: 'farm-1_2026-08-22' }],
      [
        { tableName: 'milk_daily', op: 'delete', payload: { farm_id: 'farm-1', date: '2026-08-23' } },
        { tableName: 'anomalies', op: 'delete', payload: { id: 'ignored' } }
      ]
    );

    expect([...protectedIds].sort()).toEqual([
      'farm-1_2026-08-22',
      'farm-1_2026-08-23'
    ]);
  });
});

describe('normalizacao de dados legados', () => {
  it('remove funcionarios invalidos e converte ids e nomes validos', () => {
    expect(normalizeEmployees([
      { id: 7, name: ' IVONE ', role: null },
      { id: null, name: 'Sem id' },
      null
    ])).toEqual([
      expect.objectContaining({ id: '7', name: 'IVONE', role: 'Colaborador', status: 'active' })
    ]);
  });

  it('nao cria funcionarios quando a origem esta vazia ou invalida', () => {
    expect(normalizeEmployees([])).toEqual([]);
    expect(normalizeEmployees(null)).toEqual([]);
    expect(normalizeEmployees([{ id: '', name: 'Sem identidade' }])).toEqual([]);
  });

  it('torna textos e metadados seguros para filtros das listas', () => {
    expect(normalizeNotice({ id: 1, createdAt: null, content: 42, employee_name: 99, media: null }))
      .toEqual(expect.objectContaining({ id: '1', createdAt: '', content: '42', employee_name: '99', media: [] }));
    expect(normalizeInstruction({ id: 'i1', title: 12, sector: null, employee_name: 5, media: [{ id: 1, type: 'image' }] }))
      .toEqual(expect.objectContaining({ title: '12', sector: '', employee_name: '5', media: [expect.objectContaining({ type: 'photo' })] }));
  });

  it('normaliza metricas numericas sem permitir datas ausentes', () => {
    expect(normalizeDailyMilk({ farm_id: 'f', date: '2026-08-23', liters: '123.5' }))
      .toEqual(expect.objectContaining({ liters: 123.5 }));
    expect(normalizeDailyMetric({ farm_id: 'f', date: '2026-08-23', type: 'births', value: '2' }))
      .toEqual(expect.objectContaining({ value: 2 }));
    expect(normalizeDailyMilk({ liters: 10 })).toBeNull();
  });

  it('repara blocos visuais incompletos antes da renderizacao', () => {
    const fallback = {
      buttons: [{ id: 'home', screen: 'home', type: 'button' as const, label: 'Inicio', color: 'blue' as const, iconType: 'lucide' as const, iconValue: 'alert', route: '/', order: 1, visible: true }],
      customPages: []
    };
    const result = normalizeUIConfig({ buttons: [{ id: 'home', label: null, iconValue: 5 }], customPages: 'invalid' }, fallback);
    expect(result.buttons[0]).toEqual(expect.objectContaining({ label: 'Inicio', iconValue: '5', route: '/', visible: true }));
  });
});

describe('retry do outbox', () => {
  it('repete falhas transitórias e de schema conhecidas', () => {
    expect(isRecoverableSyncError({ message: 'Failed to fetch' })).toBe(true);
    expect(isRecoverableSyncError({ status: 503 })).toBe(true);
    expect(isRecoverableSyncError({ code: '42703', message: 'column missing' })).toBe(true);
    expect(isRecoverableSyncError({ errorMessage: '[MEDIA_PENDING] retry' })).toBe(true);
  });

  it('nao repete automaticamente bloqueio de permissao', () => {
    expect(isRecoverableSyncError({ code: '42501', message: 'permission denied' })).toBe(false);
  });
});

describe('PIN administrativo da fazenda', () => {
  const employees = [
    { id: '1', name: 'IVONE', role: 'Colaborador', status: 'active' },
    { id: '2', name: 'SANDRO', role: 'Gestor', status: 'active', is_admin: true, admin_pin: '1234' }
  ];

  it('usa o PIN do administrador em aparelhos de funcionarios comuns', () => {
    expect(resolveAdminPin(employees[0], employees)).toBe('1234');
  });

  it('ignora PIN invalido e administrador bloqueado', () => {
    expect(resolveAdminPin(employees[0], [
      { ...employees[1], status: 'blocked' },
      { id: '3', name: 'INVALIDO', role: 'Gestor', status: 'active', is_admin: true, admin_pin: '12' }
    ], '9876')).toBe('9876');
  });
});

describe('mensagens de acesso', () => {
  it('traduz erros de rede e autorização para mensagens claras', () => {
    expect(getUserFacingError(new Error('Failed to fetch'), 'Falha')).toContain('Sem conexão');
    expect(getUserFacingError({ code: '42501', message: 'permission denied' }, 'Falha')).toContain('Acesso não autorizado');
  });

  it('preserva mensagens de negócio já compreensíveis', () => {
    expect(getUserFacingError(new Error('Funcionário está bloqueado.'), 'Falha')).toBe('Funcionário está bloqueado.');
  });
});
