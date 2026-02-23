
import React, { useEffect, useState } from 'react';
import { Toast } from './Toast';
import { ToastType } from '../services/notification.service';
import { Loader } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  className?: string;
}

export const Layout: React.FC<LayoutProps> = ({ children, className = '' }) => {
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    const handleToast = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setToast({ message: detail.message, type: detail.type });
    };

    const handleSyncStart = () => setIsSyncing(true);
    const handleSyncEnd = () => {
      setIsSyncing(false);
      const now = new Date();
      setLastSync(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`);
    };

    window.addEventListener('app-toast', handleToast);
    window.addEventListener('app-sync-start', handleSyncStart);
    window.addEventListener('app-sync-end', handleSyncEnd);
    
    return () => {
      window.removeEventListener('app-toast', handleToast);
      window.removeEventListener('app-sync-start', handleSyncStart);
      window.removeEventListener('app-sync-end', handleSyncEnd);
    };
  }, []);

  return (
    <div className="fixed inset-0 w-full bg-gray-100 flex justify-center overflow-hidden">
      <div className={`w-full max-w-md bg-white shadow-xl h-full flex flex-col relative ${className}`}>
        {/* Status de Sincronização */}
        {(isSyncing || lastSync) && (
          <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              {isSyncing && <Loader size={14} className="animate-spin text-blue-600" />}
              <span className="text-blue-700 font-semibold">
                {isSyncing ? 'Sincronizando...' : `Última sincronização: ${lastSync}`}
              </span>
            </div>
          </div>
        )}
        
        {children}
      </div>
      
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}
    </div>
  );
};
