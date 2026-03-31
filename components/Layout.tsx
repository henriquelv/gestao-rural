
import React, { useEffect, useState } from 'react';
import { Toast } from './Toast';
import { ToastType } from '../services/notification.service';
import { Loader, WifiOff } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  className?: string;
}

export const Layout: React.FC<LayoutProps> = ({ children, className = '' }) => {
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [syncProgress, setSyncProgress] = useState<string | null>(null);

  useEffect(() => {
    const handleToast = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setToast({ message: detail.message, type: detail.type });
    };

    const handleSyncStart = (e: Event) => {
      setIsSyncing(true);
      const detail = (e as CustomEvent).detail;
      if (detail?.label) setSyncProgress(detail.label);
      else setSyncProgress(null);
    };
    const handleSyncEnd = () => {
      setIsSyncing(false);
      setSyncProgress(null);
      const now = new Date();
      setLastSync(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`);
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('app-toast', handleToast);
    window.addEventListener('app-sync-start', handleSyncStart);
    window.addEventListener('app-sync-end', handleSyncEnd);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('app-toast', handleToast);
      window.removeEventListener('app-sync-start', handleSyncStart);
      window.removeEventListener('app-sync-end', handleSyncEnd);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className="fixed inset-0 w-full bg-gray-100 flex justify-center overflow-hidden">
      <div className={`w-full max-w-md bg-white shadow-xl h-full flex flex-col relative ${className}`}>
        {/* Banner offline - sempre visível quando sem conexão */}
        {!isOnline && (
          <div className="bg-red-600 px-4 py-2 flex items-center justify-center gap-2 text-white text-sm font-bold">
            <WifiOff size={16} />
            <span>SEM CONEXÃO — dados salvos localmente</span>
          </div>
        )}

        {/* Status de Sincronização */}
        {isOnline && (isSyncing || lastSync) && (
          <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              {isSyncing && <Loader size={14} className="animate-spin text-blue-600" />}
              <span className="text-blue-700 font-semibold">
                {isSyncing
                  ? syncProgress ? `Sincronizando: ${syncProgress}` : 'Sincronizando...'
                  : `Última sincronização: ${lastSync}`}
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
