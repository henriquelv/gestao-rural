
const AUTH_KEY = 'app_gestao_rural_auth';
const ACCESS_PIN = '1234'; // Senha simples para o exemplo

export const authService = {
  login: (pin: string): boolean => {
    if (pin === ACCESS_PIN) {
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
