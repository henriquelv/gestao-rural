import { describe, expect, it } from 'vitest';
import { licenseService } from './license.service';

const farm = { id: 'farm-1', name: 'Fazenda', status: 'active' } as any;

describe('validacao de licenca', () => {
  it('nao libera fazenda sem licenca', () => {
    expect(licenseService.evaluate(farm, [])).toMatchObject({ ok: false, status: 'license_missing' });
  });

  it('rejeita licenca futura ou expirada', () => {
    expect(licenseService.evaluate(farm, [{ status: 'active', starts_at: '2999-01-01T00:00:00Z' } as any]).ok).toBe(false);
    expect(licenseService.evaluate(farm, [{ status: 'active', expires_at: '2000-01-01T00:00:00Z' } as any]).ok).toBe(false);
  });

  it('rejeita datas de licenca ou fazenda malformadas', () => {
    expect(licenseService.evaluate(farm, [{ status: 'active', starts_at: 'data-invalida' } as any]).ok).toBe(false);
    expect(licenseService.evaluate({ ...farm, expires_at: 'data-invalida' }, [{ status: 'active' } as any]).ok).toBe(false);
  });

  it('aceita somente licenca ativa no periodo atual', () => {
    expect(licenseService.evaluate(farm, [{ status: 'active', starts_at: '2020-01-01T00:00:00Z' } as any])).toMatchObject({ ok: true });
  });

  it('nao aceita grace period com relogio futuro ou data invalida', () => {
    expect(licenseService.isWithinOfflineGrace('data-invalida', 7)).toBe(false);
    expect(licenseService.isWithinOfflineGrace('2999-01-01T00:00:00Z', 7)).toBe(false);
  });
});
