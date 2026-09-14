import { AppActivationContext } from '../types';
import { ADMIN_PROFILE } from '../constants/work-orders';
import { createId } from '../utils/id';

const CONTEXT_KEY = 'gestao_rural_farm_context_v2';
const DEVICE_KEY = 'gestao_rural_device_id_v1';
const CONTEXT_COOKIE_KEY = 'campo_legado_perfil_v1';
const CONTEXT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const normalizedRole = (value?: string) => (value || '').trim().toLocaleLowerCase('pt-BR');

const safeJsonParse = <T>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const createDeviceId = () => createId('device');

const clearPrivateIntegrationCache = (): void => {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith('campo_legado_rumina_'))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // Sem armazenamento local não há cache privado para remover.
  }
};

const readContextCookie = (): AppActivationContext | null => {
  try {
    const prefix = `${CONTEXT_COOKIE_KEY}=`;
    const raw = document.cookie
      .split(';')
      .map((item) => item.trim())
      .find((item) => item.startsWith(prefix))
      ?.slice(prefix.length);
    return raw ? safeJsonParse<AppActivationContext>(decodeURIComponent(raw)) : null;
  } catch {
    return null;
  }
};

const persistContextCookie = (context: AppActivationContext): void => {
  try {
    // O PIN nunca entra no cookie. Ele volta a ser obtido na validação online
    // quando necessário; aqui guardamos apenas a identidade do perfil.
    const { admin_pin: _adminPin, ...safeContext } = context;
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${CONTEXT_COOKIE_KEY}=${encodeURIComponent(JSON.stringify(safeContext))}; Max-Age=${CONTEXT_COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
  } catch {
    // O localStorage continua sendo a fonte principal caso cookies não estejam disponíveis.
  }
};

const clearContextCookie = (): void => {
  try {
    document.cookie = `${CONTEXT_COOKIE_KEY}=; Max-Age=0; Path=/; SameSite=Lax`;
  } catch {
    // ignore
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
      let context = safeJsonParse<AppActivationContext>(localStorage.getItem(CONTEXT_KEY));
      if (!context) {
        context = readContextCookie();
        if (context) localStorage.setItem(CONTEXT_KEY, JSON.stringify(context));
      } else if (!readContextCookie()) {
        // Cria uma cópia persistente para instalações PWA em que o iOS tenha
        // descartado apenas o localStorage ao encerrar o aplicativo.
        persistContextCookie(context);
      }
      if (!context) return null;
      const role = normalizedRole(context.employee_role);
      if (context.is_owner || role === 'administrador' || context.employee_id === ADMIN_PROFILE.id || (context.is_admin && !role)) {
        return { ...context, is_admin: true };
      }
      if (context.is_admin && role && role !== 'administrador') {
        return { ...context, is_admin: false };
      }
      return context;
    } catch {
      return null;
    }
  },

  isActivated(): boolean {
    const ctx = this.getContext();
    return !!(ctx?.farm_id && ctx?.employee_id && ctx?.device_id);
  },

  saveContext(ctx: AppActivationContext): void {
    const previous = safeJsonParse<AppActivationContext>(localStorage.getItem(CONTEXT_KEY));
    const normalized = {
      ...ctx,
      farm_id: String(ctx.farm_id),
      employee_id: String(ctx.employee_id),
      device_id: String(ctx.device_id)
    };
    const nextRole = normalizedRole(normalized.employee_role);
    const nextIsAdmin = normalized.is_owner || nextRole === 'administrador' || (normalized.is_admin && !nextRole);
    if (!nextIsAdmin || (previous && String(previous.employee_id) !== normalized.employee_id)) {
      clearPrivateIntegrationCache();
    }
    localStorage.setItem(CONTEXT_KEY, JSON.stringify(normalized));
    persistContextCookie(normalized);
  },

  updateContext(patch: Partial<AppActivationContext>): AppActivationContext | null {
    const current = this.getContext();
    if (!current) return null;
    const next = { ...current, ...patch };
    this.saveContext(next);
    return next;
  },

  clearContext(): void {
    clearPrivateIntegrationCache();
    localStorage.removeItem(CONTEXT_KEY);
    clearContextCookie();
  },

  getFarmId(): string | null {
    return this.getContext()?.farm_id || null;
  },

  getEmployeeName(): string {
    return this.getContext()?.employee_name || '';
  }
};
