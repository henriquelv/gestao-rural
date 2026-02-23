import React, { useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { HomeScreen } from './screens/HomeScreen';
import { PinGuard } from './components/PinGuard';
import { db } from './services/db.service';
import { notify } from './services/notification.service';
import { syncService } from './services/sync.service';

// Anomalias
import { AnomaliesMenuScreen } from './screens/AnomaliesMenuScreen';
import { AddAnomalyScreen } from './screens/AddAnomalyScreen';
import { ListAnomaliesScreen } from './screens/ListAnomaliesScreen';
import { AnomalyDetailScreen } from './screens/AnomalyDetailScreen';
import { AnomalyQuantityScreen } from './screens/AnomalyQuantityScreen';

// Instruções
import { InstructionsMenuScreen } from './screens/instructions/InstructionsMenuScreen';
import { InstructionsSectorMenuScreen } from './screens/instructions/InstructionsSectorMenuScreen';
import { AddInstructionScreen } from './screens/instructions/AddInstructionScreen';
import { ListInstructionsScreen } from './screens/instructions/ListInstructionsScreen';

// Normas
import { FarmNormsMenuScreen } from './screens/instructions/FarmNormsMenuScreen';
import { NormCategoryMenuScreen } from './screens/instructions/NormCategoryMenuScreen';
import { AddNormSimpleScreen } from './screens/instructions/AddNormSimpleScreen';
import { NormsCategoryListScreen } from './screens/instructions/NormsCategoryListScreen';
import { FarmNormsListScreen } from './screens/instructions/FarmNormsListScreen';
import { StandardDocScreen } from './screens/StandardDocScreen';
import { FarmNormsScreen } from './screens/FarmNormsScreen';
import { UpdateNormsScreen } from './screens/UpdateNormsScreen';

// Comunicados
import { NoticesMenuScreen } from './screens/notices/NoticesMenuScreen';
import { AddNoticeScreen } from './screens/notices/AddNoticeScreen';
import { ListNoticesScreen } from './screens/notices/ListNoticesScreen';

// Melhorias
import { ImprovementsMenuScreen } from './screens/improvements/ImprovementsMenuScreen';
import { AddImprovementScreen } from './screens/improvements/AddImprovementScreen';
import { ListImprovementsScreen } from './screens/improvements/ListImprovementsScreen';

// Dados
import { FarmDataMenuScreen } from './screens/farmdata/FarmDataMenuScreen';
import { DataMetricScreen } from './screens/farmdata/DataMetricScreen';

// Config
import { SettingsScreen } from './screens/SettingsScreen';

// Dynamic
import { GenericMenuScreen } from './screens/GenericMenuScreen';

// PDF Test
import { PDFTestScreen } from './screens/PDFTestScreen';

const App: React.FC = () => {

  useEffect(() => {
    let removeBackButtonListener: (() => void) | undefined;
    let syncInterval: any;
    let running = false;

    const persistLastError = (payload: any) => {
      try {
        const entry = {
          at: new Date().toISOString(),
          payload: typeof payload === 'string' ? payload : JSON.stringify(payload, Object.getOwnPropertyNames(payload || {}))
        };
        localStorage.setItem('last_runtime_error', JSON.stringify(entry));
      } catch {
      }
    };

    const onError = (event: ErrorEvent) => {
      persistLastError({
        type: 'error',
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: (event.error as any)?.stack
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason: any = (event as any).reason;
      persistLastError({
        type: 'unhandledrejection',
        message: reason?.message || String(reason),
        stack: reason?.stack
      });
    };

    const setupNativeBackButton = async () => {
      if (!Capacitor.isNativePlatform()) return;
      const handler = () => {
        const hash = window.location.hash || '#/';
        const isHome = hash === '#/' || hash === '#';
        
        if (!isHome) {
          // Padrão: voltar apenas 1 nível
          window.history.back();
          
          // Se após 500ms ainda estiver na mesma rota, força home (evita loop)
          const currentHash = window.location.hash;
          setTimeout(() => {
            if (window.location.hash === currentHash && hash !== currentHash) {
              window.location.hash = '#/';
            }
          }, 500);
          return;
        }
        
        // Na home, sai do app
        CapApp.exitApp();
      };

      const listener = await CapApp.addListener('backButton', handler);
      removeBackButtonListener = () => listener.remove();
    };

    void setupNativeBackButton();

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    // Inicia background sync (a cada 15 minutos mesmo com app em background)
    syncService.startBackgroundRunner(15);

    // Tenta sincronizar ao abrir o app se houver internet
    const runSyncCycle = async () => {
      if (running) return;
      running = true;
      window.dispatchEvent(new CustomEvent('app-sync-start'));
      try {
        await db.refreshFromServer();
        await db.migrateRaspagemToConforto();
        await db.syncPendingData();
      } catch (error) {
        console.error('Erro durante sync cycle:', error);
      } finally {
        running = false;
        window.dispatchEvent(new CustomEvent('app-sync-end'));
      }
    };

    void runSyncCycle();

    // Listener para quando a internet volta
    const handleOnline = () => {
      notify("Conexão restabelecida! Iniciando sincronização...", "info");
      void runSyncCycle();
    };

    window.addEventListener('online', handleOnline);

    // Sincroniza a cada 1 minuto se online (em vez de 2 minutos)
    syncInterval = setInterval(() => {
      if (navigator.onLine) void runSyncCycle();
    }, 60 * 1000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      if (removeBackButtonListener) removeBackButtonListener();
      if (syncInterval) clearInterval(syncInterval);
      syncService.stopBackgroundRunner();
    };
  }, []);

  return (
    <HashRouter>
      <Routes>
        {/* --- ROTAS LIVRES (Free Access) --- */}
        <Route path="/" element={<HomeScreen />} />
        
        {/* Anomalias: ADICIONAR LIVRE */}
        <Route path="/anomalies" element={<AnomaliesMenuScreen />} />
        <Route path="/anomalies/add" element={<AddAnomalyScreen />} />
        <Route path="/anomalies/list" element={<ListAnomaliesScreen />} />
        <Route path="/anomalies/detail/:id" element={<AnomalyDetailScreen />} />
        <Route path="/anomalies/quantity" element={<AnomalyQuantityScreen />} />

        {/* Comunicados: ADICIONAR LIVRE */}
        <Route path="/notices" element={<NoticesMenuScreen />} />
        <Route path="/notices/add" element={<AddNoticeScreen />} />
        <Route path="/notices/list" element={<ListNoticesScreen />} />

        {/* Melhorias: ADICIONAR LIVRE */}
        <Route path="/improvements" element={<ImprovementsMenuScreen />} />
        <Route path="/improvements/add" element={<AddImprovementScreen />} />
        <Route path="/improvements/list" element={<ListImprovementsScreen />} />

        {/* Instruções: ADICIONAR PROTEGIDO (PinGuard) */}
        <Route path="/instructions" element={<InstructionsMenuScreen />} />
        <Route path="/instructions/:sector" element={<InstructionsSectorMenuScreen />} />
        <Route path="/instructions/list" element={<ListInstructionsScreen />} />
        <Route path="/instructions/add" element={<PinGuard title="Adicionar Instrução"><AddInstructionScreen /></PinGuard>} />

        {/* --- NORMAS E ORGANIZAÇÃO --- */}
        {/* 1. Menu Principal (LIVRE) */}
        <Route path="/norms" element={<FarmNormsMenuScreen />} />

        {/* Rotas legadas (compatibilidade com UIConfig/Settings) */}
        <Route path="/norms/list" element={<FarmNormsListScreen />} />
        <Route path="/norms/create" element={<PinGuard title="Adicionar Norma"><FarmNormsScreen /></PinGuard>} />
        <Route path="/norms/update" element={<PinGuard title="Atualizar Normas"><UpdateNormsScreen /></PinGuard>} />
        
        {/* 2. Submenu de Opções (LIVRE) */}
        <Route path="/norms/:categoryId/options" element={<NormCategoryMenuScreen />} />
        
        {/* 3. Lista de Documentos (LIVRE) */}
        <Route path="/norms/:categoryId/list" element={<NormsCategoryListScreen />} />
        
        {/* 4. Adicionar Documento na Categoria - PROTEGIDO (PinGuard) */}
        <Route path="/norms/:categoryId/add" element={<PinGuard title="Adicionar Norma"><AddNormSimpleScreen /></PinGuard>} />
        
        {/* Visualizador de Documento Individual - LIVRE (Delete/Edit protegido internamente) */}
        <Route path="/norms/view/:docId" element={<StandardDocScreen />} />

        {/* Dados da Fazenda (LIVRE - Proteção interna no botão Salvar) */}
        <Route path="/data" element={<FarmDataMenuScreen />} />
        <Route path="/data/milk" element={<DataMetricScreen type="milk" />} />
        <Route path="/data/lactation" element={<DataMetricScreen type="lactation" />} />
        <Route path="/data/discard" element={<DataMetricScreen type="discard" />} />
        <Route path="/data/births" element={<DataMetricScreen type="births" />} />

        {/* Custom Pages (Menus criados) - LIVRE para visualização */}
        <Route path="/custom/:pageId" element={<GenericMenuScreen />} />

        {/* PDF Test - PARA TESTES */}
        <Route path="/pdf-test" element={<PDFTestScreen />} />

        {/* Configurações - proteger acesso com PIN */}
        <Route path="/settings" element={<PinGuard title="Configurações"><SettingsScreen /></PinGuard>} />
        
      </Routes>
    </HashRouter>
  );
};

export default App;