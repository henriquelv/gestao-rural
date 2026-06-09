import { Farm, License } from '../types';

const isPast = (value?: string | null) => {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time < Date.now();
};

export const licenseService = {
  evaluate(farm: Farm, licenses: License[] = []) {
    if (!farm) return { ok: false, status: 'missing_farm', message: 'Fazenda nao encontrada.' };
    if (farm.status !== 'active') return { ok: false, status: farm.status, message: 'Fazenda bloqueada ou expirada.' };
    if (isPast(farm.expires_at)) return { ok: false, status: 'expired', message: 'Fazenda expirada.' };

    const activeLicense = licenses.find((l) => l.status === 'active' && !isPast(l.expires_at));
    if (!activeLicense && licenses.length > 0) {
      return { ok: false, status: 'license_invalid', message: 'Licenca bloqueada ou expirada.' };
    }

    return { ok: true, status: activeLicense?.status || 'active', message: 'Licenca ativa.' };
  },

  isWithinOfflineGrace(lastCheck?: string, graceDays = 7): boolean {
    if (!lastCheck) return false;
    const last = new Date(lastCheck).getTime();
    if (!Number.isFinite(last)) return false;
    const graceMs = Math.max(0, graceDays) * 24 * 60 * 60 * 1000;
    return Date.now() - last <= graceMs;
  }
};
