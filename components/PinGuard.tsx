
import React, { useState } from 'react';
import { Layout } from './Layout';
import { Header } from './Header';
import { Lock, ArrowRight } from 'lucide-react';
import { authService } from '../services/auth.service';
import { notify } from '../services/notification.service';

interface PinGuardProps {
  children: React.ReactNode;
  title?: string; // Título opcional para o cabeçalho da tela de bloqueio
}

export const PinGuard: React.FC<PinGuardProps> = ({ children, title = "Acesso Restrito" }) => {
  // Verifica estado inicial
  const [isUnlocked, setIsUnlocked] = useState(authService.isAuthenticated());
  const [pin, setPin] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (authService.login(pin)) {
      setIsUnlocked(true);
      notify("Acesso liberado", "success");
    } else {
      notify("PIN Incorreto", "error");
      setPin('');
    }
  };

  // Se estiver desbloqueado, renderiza o conteúdo real da rota
  if (isUnlocked) {
    return <>{children}</>;
  }

  // Se bloqueado, renderiza a UI de Bloqueio (Estilo idêntico ao Settings anterior)
  return (
    <Layout>
      <Header title={title} targetRoute="/" />
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gray-50">
          <div className="bg-white w-full max-w-sm p-8 rounded-2xl shadow-xl border border-gray-100">
              <div className="flex justify-center mb-6">
                  <div className="bg-blue-100 p-4 rounded-full shadow-inner">
                      <Lock size={32} className="text-blue-600" />
                  </div>
              </div>
              <h2 className="text-xl font-bold text-center text-gray-800 mb-6">Digite a senha para acessar</h2>
              <form onSubmit={handleLogin}>
                  <input 
                    type="tel" 
                    maxLength={4} 
                    value={pin}
                    onChange={e => setPin(e.target.value)}
                    className="w-full text-center text-4xl font-black tracking-[0.5em] p-4 bg-gray-50 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:bg-white transition-all outline-none mb-6"
                    placeholder="••••"
                    autoFocus
                  />
                  <button type="submit" className="w-full bg-blue-600 active:bg-blue-700 text-white font-black text-xl py-4 rounded-xl shadow-lg flex items-center justify-center gap-2">
                      DESBLOQUEAR <ArrowRight />
                  </button>
              </form>
              <p className="text-center text-gray-400 text-xs mt-4">Dica: 1234</p>
          </div>
      </div>
    </Layout>
  );
};
