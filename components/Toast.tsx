
import React, { useEffect, useState } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';
import { ToastType } from '../services/notification.service';

export interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, type, onClose }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Animation entrance
    requestAnimationFrame(() => setVisible(true));
    
    // Auto close
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300); // Wait for exit animation
    }, 3000);

    return () => clearTimeout(timer);
  }, [onClose]);

  const config = {
    success: { bg: 'bg-green-500', icon: CheckCircle },
    error: { bg: 'bg-red-500', icon: AlertCircle },
    info: { bg: 'bg-blue-500', icon: Info },
  };

  const { bg, icon: Icon } = config[type];

  return (
    <div 
      className={`
        fixed top-4 left-1/2 -translate-x-1/2 z-[100]
        flex items-center gap-3 px-6 py-4 rounded-xl shadow-2xl
        text-white font-bold min-w-[300px] max-w-[90%]
        transition-all duration-300 ease-out
        ${bg}
        ${visible ? 'translate-y-0 opacity-100' : '-translate-y-10 opacity-0'}
      `}
    >
      <Icon size={24} className="shrink-0" />
      <span className="flex-1 text-sm">{message}</span>
      <button onClick={() => setVisible(false)} className="shrink-0 opacity-80 hover:opacity-100">
        <X size={18} />
      </button>
    </div>
  );
};
