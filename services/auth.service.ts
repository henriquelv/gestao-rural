
import { farmContextService } from './farm-context.service';
import { resolveAdminPin } from '../utils/admin-pin';

const AUTH_KEY = 'app_gestao_rural_auth';
const GLOBAL_PIN = ((import.meta.env.VITE_ADMIN_PIN as string) || '').trim();
const SESSION_TTL_MS = 30 * 60 * 1000;

export interface PinLoginResult {
  ok: boolean;
  message?: string;
}

export const authService = {
  loginWithResult: (pin: string): PinLoginResult => {
    // PIN específico do funcionário tem prioridade; fallback para PIN global
    const ctx = farmContextService.getContext();
    if (!ctx) {
      return { ok: false, message: 'Acesso não autorizado: aplicativo não ativado.' };
    }
    const validPin = resolveAdminPin(undefined, [], ctx?.admin_pin || GLOBAL_PIN);
    if (!validPin) {
      return {
        ok: false,
        message: navigator.onLine
          ? 'PIN administrativo indisponível. Reative o aplicativo ou procure o gestor.'
          : 'PIN administrativo indisponível offline. Conecte o aparelho e tente novamente.'
      };
    }
    if (pin === validPin) {
      const now = Date.now();
      localStorage.setItem(AUTH_KEY, JSON.stringify({ authenticatedAt: now, lastActivityAt: now }));
      return { ok: true };
    }
    return { ok: false, message: 'Acesso não autorizado: PIN incorreto.' };
  },

  login: (pin: string): boolean => {
    return authService.loginWithResult(pin).ok;
  },

  logout: () => {
    localStorage.removeItem(AUTH_KEY);
  },

  isAuthenticated: (): boolean => {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      if (!raw) return false;
      const session = JSON.parse(raw) as { authenticatedAt?: number; lastActivityAt?: number };
      const lastActivityAt = Number(session.lastActivityAt || session.authenticatedAt || 0);
      if (!lastActivityAt || Date.now() - lastActivityAt > SESSION_TTL_MS) {
        localStorage.removeItem(AUTH_KEY);
        return false;
      }
      localStorage.setItem(AUTH_KEY, JSON.stringify({ ...session, lastActivityAt: Date.now() }));
      return true;
    } catch {
      localStorage.removeItem(AUTH_KEY);
      return false;
    }
  }
};
