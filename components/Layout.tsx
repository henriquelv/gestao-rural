
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

  useEffect(() => {
    const pressed = new Set<HTMLButtonElement>();
    const press = (target: EventTarget | null) => {
      const button = target instanceof Element ? target.closest('button') as HTMLButtonElement | null : null;
      if (!button || button.disabled) return;
      button.classList.add('campo-pressed');
      pressed.add(button);
    };
    const release = () => {
      pressed.forEach((button) => window.setTimeout(() => button.classList.remove('campo-pressed'), 90));
      pressed.clear();
    };
    const pointerDown = (event: PointerEvent) => press(event.target);
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') press(event.target);
    };
    document.addEventListener('pointerdown', pointerDown, { passive: true });
    document.addEventListener('pointerup', release, { passive: true });
    document.addEventListener('pointercancel', release, { passive: true });
    document.addEventListener('keydown', keyDown);
    document.addEventListener('keyup', release);
    return () => {
      document.removeEventListener('pointerdown', pointerDown);
      document.removeEventListener('pointerup', release);
      document.removeEventListener('pointercancel', release);
      document.removeEventListener('keydown', keyDown);
      document.removeEventListener('keyup', release);
      pressed.forEach((button) => button.classList.remove('campo-pressed'));
    };
  }, []);

  return (
    <div className="fixed inset-0 flex w-full justify-center overflow-hidden bg-[#e6ebe5] md:p-4">
      <div
        className={`campo-app-shell relative flex h-full w-full max-w-md flex-col bg-white shadow-xl md:h-[calc(100dvh-2rem)] md:max-w-3xl md:overflow-hidden md:rounded-[28px] md:border md:border-[#cfd8cd] xl:max-w-6xl ${className}`}
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Banner offline - sempre visível quando sem conexão */}
        {!isOnline && (
          <div className="flex items-center justify-center gap-2 bg-[#8b3e2f] px-4 py-2 text-xs font-black uppercase tracking-wide text-white">
            <WifiOff size={16} />
            <span>SEM CONEXÃO — dados salvos localmente</span>
          </div>
        )}

        {/* Status de Sincronização */}
        {isOnline && (isSyncing || lastSync) && (
          <div className="flex items-center justify-between border-b border-[#dce5d8] bg-[#edf2e8] px-4 py-2 text-xs">
            <div className="flex items-center gap-2">
              {isSyncing && <Loader size={14} className="animate-spin text-[#47745e]" />}
              <span className="font-bold text-[#47745e]">
                {isSyncing
                  ? syncProgress ? `Sincronizando: ${syncProgress}` : 'Sincronizando…'
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
