
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { BigButton } from '../components/BigButton';
import { db } from '../services/db.service';
import { Cloud, CloudOff, RefreshCw, AlertCircle, Repeat2, UserRound } from 'lucide-react';
import { FarmSettings, UIConfig } from '../types';
import { farmContextService } from '../services/farm-context.service';


// Logo Vetorial MDA Fidedigna
// 'sistema' em cinza (topo), 'M' e 'A' em cinza escuro, 'D' em azul ciano.
const MDA_LOGO_SVG = `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNjAgNjAiPgogIDx0ZXh0IHg9IjIiIHk9IjE4IiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM4ODg4ODgiPnNpc3RlbWE8L3RleHQ+CiAgPHRleHQgeD0iMCIgeT0iNTgiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSI0OCIgZm9udC13ZWlnaHQ9IjkwMCIgZmlsbD0iIzMzMzMzMyI+TTwvdGV4dD4KICA8dGV4dCB4PSI0NCIgeT0iNTgiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSI0OCIgZm9udC13ZWlnaHQ9IjkwMCIgZmlsbD0iIzAwOWFkZSI+RDwvdGV4dD4KICA8dGV4dCB4PSI4NCIgeT0iNTgiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSI0OCIgZm9udC13ZWlnaHQ9IjkwMCIgZmlsbD0iIzMzMzMzMyI+QTwvdGV4dD4KPC9zdmc+`;

export const HomeScreen: React.FC = () => {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<FarmSettings | null>(null);
  // O menu precisa estar disponível antes de qualquer acesso à ponte SQLite,
  // especialmente em aparelhos antigos. O cache/servidor o substitui depois.
  const [ui, setUi] = useState<UIConfig>(() => db.getDefaultUIConfig());
  const [syncStatus, setSyncStatus] = useState<{ pending: number; errors: number; isRunning: boolean }>({ pending: 0, errors: 0, isRunning: false });
  const currentContext = farmContextService.getContext();

  useEffect(() => {
    // Carrega dados
    db.getSettings().then(setSettings).catch((error) => console.error('[Home] Falha ao carregar identidade:', error));
    db.getUIConfig().then(setUi).catch((error) => console.error('[Home] Falha ao carregar menu:', error));

    const updateStatus = async () => {
      const s = await db.getSyncStatus();
      setSyncStatus(prev => ({ ...prev, pending: s.pendingCount, errors: s.errorCount }));
    };

    updateStatus();
    const inv = setInterval(updateStatus, 5000); // Check every 5s

    const onStart = () => setSyncStatus(prev => ({ ...prev, isRunning: true }));
    const onEnd = () => {
      setSyncStatus(prev => ({ ...prev, isRunning: false }));
      updateStatus();
    };

    window.addEventListener('app-sync-start', onStart);
    window.addEventListener('app-sync-end', onEnd);

    return () => {
      clearInterval(inv);
      window.removeEventListener('app-sync-start', onStart);
      window.removeEventListener('app-sync-end', onEnd);
    };
  }, []);

  // Filter and Sort Buttons for Home Screen
  const homeButtons = ui.buttons
    .filter(b => b.screen === 'home' && b.visible)
    .sort((a, b) => a.order - b.order);

  const handleNavigate = (route: string) => {
    if (route.startsWith('/')) {
      navigate(route);
    } else {
      console.warn("Rota inválida:", route);
    }
  };

  return (
    <Layout>
      {/* Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-100 to-blue-50 z-0 pointer-events-none" />

      {/* Header Area Limpo: Apenas Logo MDA e Logo Fazenda (Opcional) */}
      <div className="pt-4 px-6 pb-2 flex items-center justify-between z-10 relative">
        {/* Logo Sistema MDA */}
        <div className="flex items-center gap-3">
          <img
            src={MDA_LOGO_SVG}
            className="h-10 w-auto object-contain drop-shadow-sm"
            alt="Sistema MDA"
          />

          {/* Sync Status Badge */}
          <div
            onClick={() => syncStatus.errors > 0 && navigate('/settings')}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold border transition-colors ${syncStatus.isRunning ? 'bg-blue-50 text-blue-600 border-blue-200' :
                syncStatus.errors > 0 ? 'bg-red-50 text-red-600 border-red-200 animate-pulse cursor-pointer' :
                  syncStatus.pending > 0 ? 'bg-amber-50 text-amber-600 border-amber-200' :
                    'bg-green-50 text-green-600 border-green-200'
              }`}
          >
            {syncStatus.isRunning ? <RefreshCw size={10} className="animate-spin" /> :
              syncStatus.errors > 0 ? <AlertCircle size={10} /> :
                syncStatus.pending > 0 ? <CloudOff size={10} /> :
                  <Cloud size={10} />}

            {syncStatus.isRunning ? 'SINCRONIZANDO' :
              syncStatus.errors > 0 ? `${syncStatus.errors} ERROS` :
                syncStatus.pending > 0 ? `${syncStatus.pending} PENDENTES` :
                  'SINCRONIZADO'}
          </div>
        </div>

        {/* Logo da Fazenda (Canto Direito - Opcional) */}
        {settings?.farmLogoUri && (
          <div className="h-14 w-14 rounded-full border-4 border-white shadow-md overflow-hidden bg-white">
            <img
              src={settings.farmLogoUri}
              className="h-full w-full object-cover"
              alt="Logo Fazenda"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        )}
      </div>

      {/* Grid Content */}
      <div className="flex-1 px-4 py-2 overflow-y-auto no-scrollbar pb-40 z-10">

        <div className="mb-3 flex min-h-14 items-center gap-3 border-b border-gray-200 bg-white px-3 py-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-700">
            <UserRound size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase text-gray-500">Usando como</p>
            <p className="truncate text-sm font-black text-gray-900">{currentContext?.employee_name || 'Funcionário não identificado'}</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/switch-employee')}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-700 active:bg-gray-100"
            title="Trocar funcionário"
            aria-label="Trocar funcionário"
          >
            <Repeat2 size={19} />
          </button>
        </div>

        {/* Grid de Botões */}
        <div className="grid grid-cols-2 gap-3 content-start">
          {homeButtons.map(btn => (
            <div key={btn.id} className={btn.id === 'h7' || btn.route === '/settings' ? 'col-span-2' : ''}>
              <BigButton
                icon={btn.iconValue}
                iconType={btn.iconType}
                label={btn.label}
                color={btn.color}
                onClick={() => handleNavigate(btn.route)}
                fullWidth={btn.id === 'h7' || btn.route === '/settings'}
              />
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
};

export default HomeScreen;
