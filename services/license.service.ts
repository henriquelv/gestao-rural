import { Farm, License } from '../types';

const isPast = (value?: string | null) => {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time < Date.now();
};

const isFuture = (value?: string | null) => {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time > Date.now();
};

const isInvalidDate = (value?: string | null) => {
  if (!value) return false;
  return !Number.isFinite(new Date(value).getTime());
};

export const licenseService = {
  evaluate(farm: Farm, licenses: License[] = []) {
    if (!farm) return { ok: false, status: 'missing_farm', message: 'Fazenda nao encontrada.' };
    if (farm.status !== 'active') return { ok: false, status: farm.status, message: 'Fazenda bloqueada ou expirada.' };
    if (isInvalidDate(farm.expires_at)) return { ok: false, status: 'invalid_farm_expiry', message: 'Validade da fazenda invalida.' };
    if (isPast(farm.expires_at)) return { ok: false, status: 'expired', message: 'Fazenda expirada.' };

    if (licenses.length === 0) {
      return { ok: false, status: 'license_missing', message: 'Licenca nao cadastrada para esta fazenda.' };
    }

    const activeLicense = licenses.find((license) => (
      license.status === 'active'
      && !isInvalidDate(license.starts_at)
      && !isInvalidDate(license.expires_at)
      && !isFuture(license.starts_at)
      && !isPast(license.expires_at)
    ));
    if (!activeLicense) {
      return { ok: false, status: 'license_invalid', message: 'Licenca bloqueada ou expirada.' };
    }

    return { ok: true, status: activeLicense.status, message: 'Licenca ativa.' };
  },

  isWithinOfflineGrace(lastCheck?: string, graceDays = 7): boolean {
    if (!lastCheck) return false;
    const last = new Date(lastCheck).getTime();
    if (!Number.isFinite(last)) return false;
    if (last > Date.now() + 5 * 60 * 1000) return false;
    const graceMs = Math.max(0, graceDays) * 24 * 60 * 60 * 1000;
    return Date.now() - last <= graceMs;
  }
};
