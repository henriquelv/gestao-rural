import React, { lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter, Navigate, Routes, Route } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { HomeScreen } from './screens/HomeScreen';
import { PinGuard } from './components/PinGuard';
import { db } from './services/db.service';
import { notify } from './services/notification.service';
import { seedImageData } from './services/seed.service';
import { farmContextService } from './services/farm-context.service';
// As telas continuam empacotadas no APK, mas são analisadas pelo WebView apenas
// quando abertas. Isso reduz o custo do primeiro carregamento em aparelhos lentos.
const ActivationScreen = lazy(() => import('./screens/ActivationScreen').then((module) => ({ default: module.ActivationScreen })));
const AnomaliesMenuScreen = lazy(() => import('./screens/AnomaliesMenuScreen').then((module) => ({ default: module.AnomaliesMenuScreen })));
const AddAnomalyScreen = lazy(() => import('./screens/AddAnomalyScreen').then((module) => ({ default: module.AddAnomalyScreen })));
const ListAnomaliesScreen = lazy(() => import('./screens/ListAnomaliesScreen').then((module) => ({ default: module.ListAnomaliesScreen })));
const AnomalyDetailScreen = lazy(() => import('./screens/AnomalyDetailScreen').then((module) => ({ default: module.AnomalyDetailScreen })));
const AnomalyQuantityScreen = lazy(() => import('./screens/AnomalyQuantityScreen').then((module) => ({ default: module.AnomalyQuantityScreen })));
const InstructionsMenuScreen = lazy(() => import('./screens/instructions/InstructionsMenuScreen').then((module) => ({ default: module.InstructionsMenuScreen })));
const InstructionsSectorMenuScreen = lazy(() => import('./screens/instructions/InstructionsSectorMenuScreen').then((module) => ({ default: module.InstructionsSectorMenuScreen })));
const AddInstructionScreen = lazy(() => import('./screens/instructions/AddInstructionScreen').then((module) => ({ default: module.AddInstructionScreen })));
const ListInstructionsScreen = lazy(() => import('./screens/instructions/ListInstructionsScreen').then((module) => ({ default: module.ListInstructionsScreen })));
const InstructionDetailScreen = lazy(() => import('./screens/instructions/InstructionDetailScreen').then((module) => ({ default: module.InstructionDetailScreen })));
const FarmNormsMenuScreen = lazy(() => import('./screens/instructions/FarmNormsMenuScreen').then((module) => ({ default: module.FarmNormsMenuScreen })));
const NormCategoryMenuScreen = lazy(() => import('./screens/instructions/NormCategoryMenuScreen').then((module) => ({ default: module.NormCategoryMenuScreen })));
const AddNormSimpleScreen = lazy(() => import('./screens/instructions/AddNormSimpleScreen').then((module) => ({ default: module.AddNormSimpleScreen })));
const NormsCategoryListScreen = lazy(() => import('./screens/instructions/NormsCategoryListScreen').then((module) => ({ default: module.NormsCategoryListScreen })));
const FarmNormsListScreen = lazy(() => import('./screens/instructions/FarmNormsListScreen').then((module) => ({ default: module.FarmNormsListScreen })));
const StandardDocScreen = lazy(() => import('./screens/StandardDocScreen').then((module) => ({ default: module.StandardDocScreen })));
const FarmNormsScreen = lazy(() => import('./screens/FarmNormsScreen').then((module) => ({ default: module.FarmNormsScreen })));
const UpdateNormsScreen = lazy(() => import('./screens/UpdateNormsScreen').then((module) => ({ default: module.UpdateNormsScreen })));
const NoticesMenuScreen = lazy(() => import('./screens/notices/NoticesMenuScreen').then((module) => ({ default: module.NoticesMenuScreen })));
const AddNoticeScreen = lazy(() => import('./screens/notices/AddNoticeScreen').then((module) => ({ default: module.AddNoticeScreen })));
const ListNoticesScreen = lazy(() => import('./screens/notices/ListNoticesScreen').then((module) => ({ default: module.ListNoticesScreen })));
const NoticeDetailScreen = lazy(() => import('./screens/notices/NoticeDetailScreen').then((module) => ({ default: module.NoticeDetailScreen })));
const ImprovementsMenuScreen = lazy(() => import('./screens/improvements/ImprovementsMenuScreen').then((module) => ({ default: module.ImprovementsMenuScreen })));
const AddImprovementScreen = lazy(() => import('./screens/improvements/AddImprovementScreen').then((module) => ({ default: module.AddImprovementScreen })));
const ListImprovementsScreen = lazy(() => import('./screens/improvements/ListImprovementsScreen').then((module) => ({ default: module.ListImprovementsScreen })));
const FarmDataMenuScreen = lazy(() => import('./screens/farmdata/FarmDataMenuScreen').then((module) => ({ default: module.FarmDataMenuScreen })));
const DataMetricScreen = lazy(() => import('./screens/farmdata/DataMetricScreen').then((module) => ({ default: module.DataMetricScreen })));
const SettingsScreen = lazy(() => import('./screens/SettingsScreen').then((module) => ({ default: module.SettingsScreen })));
const DiagnosticScreen = lazy(() => import('./screens/DiagnosticScreen').then((module) => ({ default: module.DiagnosticScreen })));
const OwnerDashboardScreen = lazy(() => import('./screens/OwnerDashboardScreen').then((module) => ({ default: module.OwnerDashboardScreen })));
const SwitchEmployeeScreen = lazy(() => import('./screens/SwitchEmployeeScreen').then((module) => ({ default: module.SwitchEmployeeScreen })));
const GenericMenuScreen = lazy(() => import('./screens/GenericMenuScreen').then((module) => ({ default: module.GenericMenuScreen })));
const PDFTestScreen = lazy(() => import('./screens/PDFTestScreen').then((module) => ({ default: module.PDFTestScreen })));

const App: React.FC = () => {
  const [activated, setActivated] = useState(() => farmContextService.isActivated());

  useEffect(() => {
    const requestReactivation = () => setActivated(false);
    window.addEventListener('app-reactivation-request', requestReactivation);
    return () => window.removeEventListener('app-reactivation-request', requestReactivation);
  }, []);

  useEffect(() => {
    if (!activated) return;
    // O dono não sincroniza dados de fazenda
    if (farmContextService.getContext()?.is_owner) return;

    let removeBackButtonListener: (() => void) | undefined;
    let removeAppStateListener: (() => void) | undefined;
    let syncInterval: any;
    let running = false;
    let initialReconciliationDone = false;

    const persistLastError = (payload: any) => {
      try {
        const entry = {
          at: new Date().toISOString(),
          payload: typeof payload === 'string' ? payload : JSON.stringify(payload, Object.getOwnPropertyNames(payload || {}))
        };
        localStorage.setItem('last_runtime_error', JSON.stringify(entry));
      } catch {
        // ignore
      }
    };

    const isExpectedAbort = (reason: any) => {
      const message = String(reason?.message || reason || '');
      return reason?.name === 'AbortError' || /signal is aborted|request was aborted/i.test(message);
    };

    try {
      const previousRuntimeError = localStorage.getItem('last_runtime_error');
      if (previousRuntimeError && isExpectedAbort(previousRuntimeError)) {
        localStorage.removeItem('last_runtime_error');
      }
    } catch {
      // O diagnóstico antigo não deve impedir a inicialização.
    }

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
      const message = String(reason?.message || reason || '');
      if (isExpectedAbort(reason)) {
        event.preventDefault?.();
        return;
      }
      persistLastError({
        type: 'unhandledrejection',
        message,
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
          const beforeHash = window.location.hash;
          window.history.back();

          // Se após 500ms ainda estiver na mesma rota, força home (evita loop)
          setTimeout(() => {
            if (window.location.hash === beforeHash) {
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

    // Tenta sincronizar ao abrir o app se houver internet
    const runSyncCycle = async () => {
      if (running) return;
      running = true;
      window.dispatchEvent(new CustomEvent('app-sync-start'));
      try {
        // One-time retry of blocking sync errors (duplicate keys/schema fixes)
        const ERROR_CLEANUP_FLAG = 'error_cleanup_v1';
        if (!localStorage.getItem(ERROR_CLEANUP_FLAG)) {
          console.log('[App] Reativando erros antigos de sincronização para nova tentativa...');
          await db.clearSyncErrors();
          localStorage.setItem(ERROR_CLEANUP_FLAG, 'true');
        }

        // One-time reset: remove timestamps de delta-sync de tabelas de métricas.
        // Essas tabelas usavam 'date' como campo de filtro (incorreto — é chave de
        // negócio, não timestamp de modificação), causando dados divergentes entre
        // dispositivos. Agora sempre fazem fetch completo; o reset garante que o
        // ghost-cleanup rode uma vez para remover registros obsoletos.
        const METRICS_SYNC_RESET_FLAG = 'metrics_sync_reset_v1';
        if (!localStorage.getItem(METRICS_SYNC_RESET_FLAG)) {
          console.log('[App] Resetando timestamps de sync de métricas para forçar fetch completo...');
          localStorage.removeItem('last_refresh_daily_metrics');
          localStorage.removeItem('last_refresh_milk_daily');
          localStorage.removeItem('last_refresh_farm_monthly_stats');
          localStorage.setItem(METRICS_SYNC_RESET_FLAG, 'true');
        }

        // Migração one-time: re-keying de IDs locais com farm_id prefix e
        // reparo de registros antigos sem contexto de fazenda.
        await db.migrateAnomalyShape();
        await db.migrateLocalIds();

        // Recuperar registros que ficaram órfãos (synced=false sem entrada no outbox)
        await db.recoverOrphanedRecords();

        // Offline-first: enviar pendências locais antes de baixar o servidor.
        // Isso evita que uma carga completa mostre dados antigos enquanto o outbox
        // ainda tem alterações do aparelho.
        window.dispatchEvent(new CustomEvent('app-sync-start', { detail: { label: 'enviando pendentes' } }));
        await db.syncPendingData();

        const FULL_REFRESH_HOTFIX_FLAG = 'full_refresh_session_reconciliation_v7';
        let fullRefreshSucceeded = false;
        // Cada abertura reconcilia o cache uma vez. Isso corrige aparelhos que
        // ficaram com cursores antigos ou receberam registros retroativos.
        if (!initialReconciliationDone) {
          console.log('[App] Reconciliando cache local com o servidor...');
          window.dispatchEvent(new CustomEvent('app-sync-start', { detail: { label: 'carga completa' } }));
          const fullRefresh = await db.forceFullRefreshFromServer();
          if (fullRefresh.ok) {
            initialReconciliationDone = true;
            fullRefreshSucceeded = true;
            localStorage.setItem(FULL_REFRESH_HOTFIX_FLAG, 'true');
          } else {
            localStorage.removeItem(FULL_REFRESH_HOTFIX_FLAG);
            console.warn('[App] Reconciliação incompleta; uma nova tentativa será feita.', fullRefresh);
          }
        }

        if (!fullRefreshSucceeded) {
          window.dispatchEvent(new CustomEvent('app-sync-start', { detail: { label: 'atualizando dados' } }));
          await db.refreshFromServer();
        }

        await db.migrateRaspagemToConforto();
        await seedImageData();
      } catch (error) {
        console.error('Erro durante sync cycle:', error);
      } finally {
        running = false;
        window.dispatchEvent(new CustomEvent('app-sync-end'));
      }
    };

    // Cache de mídia roda SEPARADO do sync — não bloqueia dados.
    // Roda apenas uma vez por sessão (startup + quando internet volta).
    let mediaCacheDone = false;
    const runMediaCacheIfNeeded = async () => {
      if (mediaCacheDone || !navigator.onLine) return;
      mediaCacheDone = true;
      try {
        mediaCacheDone = await db.preCacheAllMedia();
      } catch (e) {
        console.error('Erro no cache de mídia:', e);
        mediaCacheDone = false; // permitir retry na próxima vez
      }
    };

    // Sync em background: não bloqueia a UI.
    // O banner de sync no Layout mostra o progresso visualmente.
    runSyncCycle().then(runMediaCacheIfNeeded).catch(console.error);

    // Listener para quando a internet volta
    const handleOnline = () => {
      notify("Conexão restabelecida! Iniciando sincronização...", "info");
      mediaCacheDone = false; // permitir novo cache quando internet volta
      runSyncCycle().then(runMediaCacheIfNeeded).catch(console.error);
    };

    window.addEventListener('online', handleOnline);

    const setupNativeResumeSync = async () => {
      if (!Capacitor.isNativePlatform()) return;
      const listener = await CapApp.addListener('appStateChange', ({ isActive }) => {
        if (!isActive || !navigator.onLine) return;
        void runSyncCycle().then(runMediaCacheIfNeeded).catch(console.error);
      });
      removeAppStateListener = () => listener.remove();
    };
    void setupNativeResumeSync();

    // Sincroniza a cada 1 minuto se online (em vez de 2 minutos)
    syncInterval = setInterval(() => {
      if (navigator.onLine) void runSyncCycle().then(runMediaCacheIfNeeded).catch(console.error);
    }, 60 * 1000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      if (removeBackButtonListener) removeBackButtonListener();
      if (removeAppStateListener) removeAppStateListener();
      if (syncInterval) clearInterval(syncInterval);
    };
  }, [activated]);

  if (!activated) {
    return (
      <HashRouter>
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-gray-100 font-bold text-gray-600">Carregando...</div>}>
          <Routes>
            <Route path="/diagnostics" element={<DiagnosticScreen />} />
            <Route path="*" element={
              <ActivationScreen onActivated={() => {
                const ctx = farmContextService.getContext();
                if (ctx?.is_owner) {
                  window.location.hash = '#/owner';
                }
                setActivated(true);
              }} />
            } />
          </Routes>
        </Suspense>
      </HashRouter>
    );
  }

  const currentContext = farmContextService.getContext();
  if (currentContext?.is_owner) {
    return (
      <HashRouter>
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-gray-100 font-bold text-gray-600">Carregando...</div>}>
          <Routes>
            <Route path="/owner" element={<OwnerDashboardScreen />} />
            <Route path="/diagnostics" element={<DiagnosticScreen />} />
            <Route path="*" element={<Navigate to="/owner" replace />} />
          </Routes>
        </Suspense>
      </HashRouter>
    );
  }

  return (
    <HashRouter>
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-gray-100 font-bold text-gray-600">Carregando...</div>}>
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
        <Route path="/notices/detail/:id" element={<NoticeDetailScreen />} />

        {/* Melhorias: ADICIONAR LIVRE */}
        <Route path="/improvements" element={<ImprovementsMenuScreen />} />
        <Route path="/improvements/add" element={<AddImprovementScreen />} />
        <Route path="/improvements/list" element={<ListImprovementsScreen />} />

        {/* Instruções: ADICIONAR PROTEGIDO (PinGuard) */}
        <Route path="/instructions" element={<InstructionsMenuScreen />} />
        <Route path="/instructions/:sector" element={<InstructionsSectorMenuScreen />} />
        <Route path="/instructions/list" element={<ListInstructionsScreen />} />
        <Route path="/instructions/detail/:id" element={<InstructionDetailScreen />} />
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
        <Route path="/diagnostics" element={<DiagnosticScreen />} />
        <Route path="/switch-employee" element={<SwitchEmployeeScreen />} />
        <Route path="/owner" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />

        </Routes>
      </Suspense>
    </HashRouter>
  );
};

export default App;
