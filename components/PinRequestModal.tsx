
import React, { useState } from 'react';
import { Lock, ArrowRight, X } from 'lucide-react';
import { authService } from '../services/auth.service';
import { notify } from '../services/notification.service';

interface PinRequestModalProps {
  onSuccess: () => void;
  onClose: () => void;
  title?: string;
  description?: string;
}

export const PinRequestModal: React.FC<PinRequestModalProps> = ({ onSuccess, onClose, title = "Autorização Necessária", description = "Digite o PIN para realizar esta alteração." }) => {
  const [pin, setPin] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (authService.login(pin)) {
      notify("Acesso autorizado", "success");
      onSuccess();
    } else {
      notify("PIN Incorreto", "error");
      setPin('');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4 animate-in fade-in backdrop-blur-sm">
      <div className="bg-white w-full max-w-sm p-6 rounded-2xl shadow-2xl relative animate-in zoom-in-95 duration-200">
        <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200"
        >
            <X size={20} />
        </button>

        <div className="flex flex-col items-center">
            <div className="bg-blue-100 p-3 rounded-full mb-4">
                <Lock size={28} className="text-blue-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-800 text-center mb-1">{title}</h2>
            <p className="text-gray-400 text-xs text-center mb-6">{description}</p>
            
            <form onSubmit={handleLogin} className="w-full">
                <input
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    value={pin}
                    onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                    className="w-full text-center text-4xl font-black tracking-[0.5em] p-3 bg-gray-50 rounded-xl border-2 border-gray-200 focus:border-blue-500 outline-none mb-6"
                    placeholder="••••"
                    autoFocus
                />
                <button type="submit" className="w-full bg-blue-600 active:bg-blue-700 text-white font-black text-lg py-3 rounded-xl shadow-lg flex items-center justify-center gap-2">
                    CONFIRMAR <ArrowRight size={20} />
                </button>
            </form>
        </div>
      </div>
    </div>
  );
};
