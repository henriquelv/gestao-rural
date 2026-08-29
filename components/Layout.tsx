
import React, { useEffect, useState } from 'react';
import { Toast } from './Toast';
import { ToastType } from '../services/notification.service';
import { AlertTriangle, Loader, RefreshCw, WifiOff } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  className?: string;
}

export const Layout: React.FC<LayoutProps> = ({ children, className = '' }) => {
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const readLastSync = () => {
    try {
      const raw = localStorage.getItem('last_sync_at');
      if (!raw) return null;
      const value = new Date(raw);
      if (Number.isNaN(value.getTime())) return null;
      return `${value.getHours().toString().padStart(2, '0')}:${value.getMinutes().toString().padStart(2, '0')}`;
    } catch {
      return null;
    }
  };
  const [lastSync, setLastSync] = useState<string | null>(() => readLastSync());
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [syncProgress, setSyncProgress] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<string | null>(() => {
    try { return localStorage.getItem('last_access_error_v1'); } catch { return null; }
  });

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
      // O ciclo também termina quando falha. Exibir somente o timestamp que o
      // syncService gravou após sucesso evita informar uma sincronização falsa.
      setLastSync(readLastSync());
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleAccessStatus = (event: Event) => {
      setAccessError((event as CustomEvent).detail?.message || null);
    };

    window.addEventListener('app-toast', handleToast);
    window.addEventListener('app-sync-start', handleSyncStart);
    window.addEventListener('app-sync-end', handleSyncEnd);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('app-access-status', handleAccessStatus);

    return () => {
      window.removeEventListener('app-toast', handleToast);
      window.removeEventListener('app-sync-start', handleSyncStart);
      window.removeEventListener('app-sync-end', handleSyncEnd);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('app-access-status', handleAccessStatus);
    };
  }, []);

  return (
    <div className="fixed inset-0 w-full bg-gray-100 flex justify-center overflow-hidden">
      <div
        className={`w-full max-w-md bg-white shadow-xl h-full flex flex-col relative ${className}`}
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Banner offline - sempre visível quando sem conexão */}
        {!isOnline && (
          <div className="bg-red-600 px-4 py-2 flex items-center justify-center gap-2 text-white text-sm font-bold">
            <WifiOff size={16} />
            <span>SEM CONEXÃO — dados salvos localmente</span>
          </div>
        )}

        {isOnline && accessError && (
          <div className="border-b border-red-300 bg-red-50 px-3 py-2 text-red-900">
            <div className="flex items-start gap-2 text-xs font-bold">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span className="min-w-0 flex-1">{accessError}</span>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('app-reactivation-request'))}
                className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md bg-red-700 px-2 text-white"
              >
                <RefreshCw size={14} /> Reativar
              </button>
            </div>
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
