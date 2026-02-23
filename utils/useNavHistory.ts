import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

interface NavHistoryEntry {
  path: string;
  timestamp: number;
}

/**
 * Hook que rastreia e gerencia o histórico de navegação para evitar loops
 * Útil para menus com submenus (ex: Home → Instruções → SubMenu → volta para Home, não fica em loop)
 */
export const useNavHistory = () => {
  const navigate = useNavigate();
  const historyStackRef = useRef<NavHistoryEntry[]>([]);

  // Registra uma navegação
  const pushNav = (path: string) => {
    const now = Date.now();
    // Remove duplicatas consecutivas (mesma rota clicada 2x)
    if (historyStackRef.current.length > 0) {
      const last = historyStackRef.current[historyStackRef.current.length - 1];
      if (last.path === path && now - last.timestamp < 500) {
        return; // Ignora clique duplicado muito rápido
      }
    }
    historyStackRef.current.push({ path, timestamp: now });
    // Limitar histórico a 20 itens
    if (historyStackRef.current.length > 20) {
      historyStackRef.current.shift();
    }
  };

  // Volta para a rota anterior corretamente
  const goBack = (fallbackPath = '/') => {
    if (historyStackRef.current.length > 1) {
      // Remove a rota atual
      historyStackRef.current.pop();
      // Pega a anterior
      const previous = historyStackRef.current.pop();
      if (previous) {
        navigate(previous.path);
        return;
      }
    }
    // Se não tem histórico, volta para home
    navigate(fallbackPath);
  };

  // Reseta o histórico (útil ao voltar para home)
  const reset = () => {
    historyStackRef.current = [{ path: '/', timestamp: Date.now() }];
  };

  return { pushNav, goBack, reset, getHistory: () => historyStackRef.current };
};
