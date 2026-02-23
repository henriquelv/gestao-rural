
import React, { useState } from 'react';
import { Tractor, ArrowRight, Lock } from 'lucide-react';
import { authService } from '../services/auth.service';
import { notify } from '../services/notification.service';

interface LoginScreenProps {
  onLoginSuccess: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [pin, setPin] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (authService.login(pin)) {
      notify('Bem-vindo de volta!', 'success');
      onLoginSuccess();
    } else {
      notify('Senha incorreta. Tente 1234.', 'error');
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-blue-900 to-slate-900 flex items-center justify-center p-6">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden p-8 animate-in fade-in zoom-in duration-300">
        
        <div className="flex flex-col items-center mb-8">
          <div className="bg-blue-100 p-4 rounded-full mb-4">
            <Tractor size={48} className="text-blue-600" />
          </div>
          <h1 className="text-2xl font-black text-gray-800 uppercase tracking-wide text-center">Gestão Rural</h1>
          <p className="text-gray-400 text-sm mt-1">Acesso Restrito</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-2 ml-1">Senha de Acesso</label>
            <div className="relative">
              <input 
                type="tel" 
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Digitar PIN" 
                className="w-full bg-gray-50 border-2 border-gray-200 text-gray-800 text-center text-3xl font-bold rounded-xl py-4 focus:border-blue-500 focus:outline-none tracking-[1em]"
                autoFocus
              />
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            </div>
            <p className="text-center text-xs text-gray-400 mt-2">(Dica: 1234)</p>
          </div>

          <button 
            type="submit"
            className="w-full bg-blue-600 active:bg-blue-700 text-white font-black text-lg py-4 rounded-xl shadow-lg flex items-center justify-center gap-2 transition-transform active:scale-95"
          >
            ENTRAR <ArrowRight size={20} />
          </button>
        </form>

        <div className="mt-8 text-center">
            <p className="text-xs text-gray-400">Versão 2.2.0 - Secure Access</p>
        </div>
      </div>
    </div>
  );
};
