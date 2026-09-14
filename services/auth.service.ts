
import { farmContextService } from './farm-context.service';

const AUTH_KEY = 'app_gestao_rural_auth';
const GLOBAL_PIN = (import.meta.env.VITE_ADMIN_PIN as string) || '1234';
const isAdminContext = () => {
  const context = farmContextService.getContext();
  const role = (context?.employee_role || '').trim().toLocaleLowerCase('pt-BR');
  return context?.is_owner === true || role === 'administrador' || (context?.is_admin === true && !role);
};

export const authService = {
  login: (pin: string): boolean => {
    // PINs administrativos nunca devem liberar ações protegidas para um técnico,
    // mesmo que ele acesse manualmente uma rota antiga ou exista sessão residual.
    if (!isAdminContext()) {
      localStorage.removeItem(AUTH_KEY);
      return false;
    }
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
    const authenticated = localStorage.getItem(AUTH_KEY) === 'true';
    if (authenticated && !isAdminContext()) {
      localStorage.removeItem(AUTH_KEY);
      return false;
    }
    return authenticated;
  }
};
