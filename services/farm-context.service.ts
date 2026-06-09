import { AppActivationContext } from '../types';

const CONTEXT_KEY = 'gestao_rural_farm_context_v2';
const DEVICE_KEY = 'gestao_rural_device_id_v1';

const safeJsonParse = <T>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const createDeviceId = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return `device_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
};

export const farmContextService = {
  getDeviceId(): string {
    let existing = '';
    try {
      existing = localStorage.getItem(DEVICE_KEY) || '';
      if (!existing) {
        existing = createDeviceId();
        localStorage.setItem(DEVICE_KEY, existing);
      }
    } catch {
      existing = createDeviceId();
    }
    return existing;
  },

  getContext(): AppActivationContext | null {
    try {
      return safeJsonParse<AppActivationContext>(localStorage.getItem(CONTEXT_KEY));
    } catch {
      return null;
    }
  },

  isActivated(): boolean {
    const ctx = this.getContext();
    return !!(ctx?.farm_id && ctx?.employee_id && ctx?.device_id);
  },

  saveContext(ctx: AppActivationContext): void {
    const normalized = {
      ...ctx,
      farm_id: String(ctx.farm_id),
      employee_id: String(ctx.employee_id),
      device_id: String(ctx.device_id)
    };
    localStorage.setItem(CONTEXT_KEY, JSON.stringify(normalized));
  },

  updateContext(patch: Partial<AppActivationContext>): AppActivationContext | null {
    const current = this.getContext();
    if (!current) return null;
    const next = { ...current, ...patch };
    this.saveContext(next);
    return next;
  },

  clearContext(): void {
    localStorage.removeItem(CONTEXT_KEY);
  },

  getFarmId(): string | null {
    return this.getContext()?.farm_id || null;
  },

  getEmployeeName(): string {
    return this.getContext()?.employee_name || '';
  }
};
