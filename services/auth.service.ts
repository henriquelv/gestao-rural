
import { farmContextService } from './farm-context.service';

const AUTH_KEY = 'app_gestao_rural_auth';
const GLOBAL_PIN = (import.meta.env.VITE_ADMIN_PIN as string) || '1234';

export const authService = {
  login: (pin: string): boolean => {
    // PIN específico do funcionário tem prioridade; fallback para PIN global
    const ctx = farmContextService.getContext();
    const validPin = ctx?.admin_pin || GLOBAL_PIN;
    if (pin === validPin) {
      localStorage.setItem(AUTH_KEY, 'true');
      return true;
    }
    return false;
  },

  logout: () => {
    localStorage.removeItem(AUTH_KEY);
  },

  isAuthenticated: (): boolean => {
    return localStorage.getItem(AUTH_KEY) === 'true';
  }
};
