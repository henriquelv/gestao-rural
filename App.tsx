import React, { Suspense, useEffect, useState } from 'react';
import { HashRouter, Navigate, Routes, Route } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { HomeScreen } from './screens/HomeScreen';
import { PinGuard } from './components/PinGuard';
import { AdminGuard } from './components/AdminGuard';
import { db } from './services/db.service';
import { notify } from './services/notification.service';
import { syncService } from './services/sync.service';
import { seedImageData } from './services/seed.service';
import { farmContextService } from './services/farm-context.service';
import { ActivationScreen } from './screens/ActivationScreen';
import { isSupabaseConfigured } from './services/supabase';
import { authService } from './services/auth.service';
import { localdb } from './services/localdb';
import { AppErrorBoundary } from './components/AppErrorBoundary';

import { DiagnosticScreen } from './screens/DiagnosticScreen';

// As telas de rota são carregadas sob demanda. O service worker ainda inclui todos
// os chunks no cache, mantendo a navegação offline depois da primeira abertura.
const AnomaliesMenuScreen = React.lazy(() => import('./screens/AnomaliesMenuScreen').then((module) => ({ default: module.AnomaliesMenuScreen })));
const AddAnomalyScreen = React.lazy(() => import('./screens/AddAnomalyScreen').then((module) => ({ default: module.AddAnomalyScreen })));
const ListAnomaliesScreen = React.lazy(() => import('./screens/ListAnomaliesScreen').then((module) => ({ default: module.ListAnomaliesScreen })));
const AnomalyDetailScreen = React.lazy(() => import('./screens/AnomalyDetailScreen').then((module) => ({ default: module.AnomalyDetailScreen })));
const AnomalyQuantityScreen = React.lazy(() => import('./screens/AnomalyQuantityScreen').then((module) => ({ default: module.AnomalyQuantityScreen })));
const ClientDashboardScreen = React.lazy(() => import('./screens/ClientDashboardScreen').then((module) => ({ default: module.ClientDashboardScreen })));
const RuminaInsightsScreen = React.lazy(() => import('./screens/RuminaInsightsScreen').then((module) => ({ default: module.RuminaInsightsScreen })));
const AgendaScreen = React.lazy(() => import('./screens/AgendaScreen').then((module) => ({ default: module.AgendaScreen })));
const FuelingMenuScreen = React.lazy(() => import('./screens/FuelingMenuScreen').then((module) => ({ default: module.FuelingMenuScreen })));
const FuelingScreen = React.lazy(() => import('./screens/FuelingScreen').then((module) => ({ default: module.FuelingScreen })));
const InstructionsMenuScreen = React.lazy(() => import('./screens/instructions/InstructionsMenuScreen').then((module) => ({ default: module.InstructionsMenuScreen })));
const InstructionsSectorMenuScreen = React.lazy(() => import('./screens/instructions/InstructionsSectorMenuScreen').then((module) => ({ default: module.InstructionsSectorMenuScreen })));
const AddInstructionScreen = React.lazy(() => import('./screens/instructions/AddInstructionScreen').then((module) => ({ default: module.AddInstructionScreen })));
const ListInstructionsScreen = React.lazy(() => import('./screens/instructions/ListInstructionsScreen').then((module) => ({ default: module.ListInstructionsScreen })));
const InstructionDetailScreen = React.lazy(() => import('./screens/instructions/InstructionDetailScreen').then((module) => ({ default: module.InstructionDetailScreen })));
const FarmNormsMenuScreen = React.lazy(() => import('./screens/instructions/FarmNormsMenuScreen').then((module) => ({ default: module.FarmNormsMenuScreen })));
const NormCategoryMenuScreen = React.lazy(() => import('./screens/instructions/NormCategoryMenuScreen').then((module) => ({ default: module.NormCategoryMenuScreen })));
const AddNormSimpleScreen = React.lazy(() => import('./screens/instructions/AddNormSimpleScreen').then((module) => ({ default: module.AddNormSimpleScreen })));
const NormsCategoryListScreen = React.lazy(() => import('./screens/instructions/NormsCategoryListScreen').then((module) => ({ default: module.NormsCategoryListScreen })));
const FarmNormsListScreen = React.lazy(() => import('./screens/instructions/FarmNormsListScreen').then((module) => ({ default: module.FarmNormsListScreen })));
const StandardDocScreen = React.lazy(() => import('./screens/StandardDocScreen').then((module) => ({ default: module.StandardDocScreen })));
const FarmNormsScreen = React.lazy(() => import('./screens/FarmNormsScreen').then((module) => ({ default: module.FarmNormsScreen })));
const UpdateNormsScreen = React.lazy(() => import('./screens/UpdateNormsScreen').then((module) => ({ default: module.UpdateNormsScreen })));
const NoticesMenuScreen = React.lazy(() => import('./screens/notices/NoticesMenuScreen').then((module) => ({ default: module.NoticesMenuScreen })));
const AddNoticeScreen = React.lazy(() => import('./screens/notices/AddNoticeScreen').then((module) => ({ default: module.AddNoticeScreen })));
const ListNoticesScreen = React.lazy(() => import('./screens/notices/ListNoticesScreen').then((module) => ({ default: module.ListNoticesScreen })));
const NoticeDetailScreen = React.lazy(() => import('./screens/notices/NoticeDetailScreen').then((module) => ({ default: module.NoticeDetailScreen })));
const ImprovementsMenuScreen = React.lazy(() => import('./screens/improvements/ImprovementsMenuScreen').then((module) => ({ default: module.ImprovementsMenuScreen })));
const AddImprovementScreen = React.lazy(() => import('./screens/improvements/AddImprovementScreen').then((module) => ({ default: module.AddImprovementScreen })));
const ListImprovementsScreen = React.lazy(() => import('./screens/improvements/ListImprovementsScreen').then((module) => ({ default: module.ListImprovementsScreen })));
const FarmDataMenuScreen = React.lazy(() => import('./screens/farmdata/FarmDataMenuScreen').then((module) => ({ default: module.FarmDataMenuScreen })));
const DataMetricScreen = React.lazy(() => import('./screens/farmdata/DataMetricScreen').then((module) => ({ default: module.DataMetricScreen })));
const SettingsScreen = React.lazy(() => import('./screens/SettingsScreen').then((module) => ({ default: module.SettingsScreen })));
const OwnerDashboardScreen = React.lazy(() => import('./screens/OwnerDashboardScreen').then((module) => ({ default: module.OwnerDashboardScreen })));
const ProfileScreen = React.lazy(() => import('./screens/ProfileScreen').then((module) => ({ default: module.ProfileScreen })));
const GenericMenuScreen = React.lazy(() => import('./screens/GenericMenuScreen').then((module) => ({ default: module.GenericMenuScreen })));
const PDFTestScreen = React.lazy(() => import('./screens/PDFTestScreen').then((module) => ({ default: module.PDFTestScreen })));

const RouteFallback = () => (
  <div className="flex min-h-[100dvh] items-center justify-center bg-[#f4f0e7]" role="status" aria-label="Carregando tela">
    <span className="h-9 w-9 animate-spin rounded-full border-4 border-[#c8d1c3] border-t-[#173f32]" />
  </div>
);

const App: React.FC = () => {
  const [activated, setActivated] = useState(() => {
    const context = farmContextService.getContext();
    if (isSupabaseConfigured && context?.farm_id === 'campo-legado-local-teste') {
      authService.logout();
      farmContextService.clearContext();
      return false;
    }
    return farmContextService.isActivated();
  });

  useEffect(() => {
    if (!activated || isSupabaseConfigured) return;
    // Limpeza restrita ao armazenamento deste aparelho. Nenhum backend é acessado.
    void db.purgeLegacyLocalData();
  }, [activated]);

  useEffect(() => {
    if (!activated) return;
    // Ambiente local deliberadamente desconectado: não inicia qualquer tráfego externo.
    if (!isSupabaseConfigured) return;
    // O dono não sincroniza dados de fazenda
    if (farmContextService.getContext()?.is_owner) return;

    let removeBackButtonListener: (() => void) | undefined;
    let syncInterval: any;
    let mediaCacheTimer: number | undefined;
    let running = false;
    let maintenanceDone = false;

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
          const currentHash = hash;
          window.history.back();

          // Se após 500ms ainda estiver na mesma rota, força home (evita loop)
          setTimeout(() => {
            if (window.location.hash === currentHash) {
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
    const runSyncCycle = async (runMaintenance = false) => {
      if (running) return;
      running = true;
      window.dispatchEvent(new CustomEvent('app-sync-start'));
      try {
        if (runMaintenance && !maintenanceDone) {
          // Migrações e reparos antigos são necessários apenas uma vez por sessão.
          // Executá-los a cada atualização varria todo o IndexedDB sem necessidade.
          const TEST_PERIOD_RESET_FLAG = 'campo_legado_test_period_reset_2026_08_03_v1';
          if (!localStorage.getItem(TEST_PERIOD_RESET_FLAG)) {
            await Promise.all([
              localdb.clearTable('anomalies'),
              localdb.clearTable('notices')
            ]);
            await localdb.clearOutboxForTables(['anomalies', 'notices']);
            localStorage.removeItem('last_refresh_anomalies');
            localStorage.removeItem('last_refresh_notices');
            localStorage.setItem(TEST_PERIOD_RESET_FLAG, 'true');
          }

          const ERROR_CLEANUP_FLAG = 'error_cleanup_v1';
          if (!localStorage.getItem(ERROR_CLEANUP_FLAG)) {
            console.log('[App] Reativando erros antigos de sincronização para nova tentativa...');
            await db.clearSyncErrors();
            localStorage.setItem(ERROR_CLEANUP_FLAG, 'true');
          }

          const OS_ADDITIONAL_EXPENSE_RETRY_FLAG = 'os_additional_expense_schema_retry_2026_08_04_v1';
          if (!localStorage.getItem(OS_ADDITIONAL_EXPENSE_RETRY_FLAG)) {
            console.log('[App] Reativando OS retidas pela atualização do esquema...');
            await db.retrySyncErrors();
            localStorage.setItem(OS_ADDITIONAL_EXPENSE_RETRY_FLAG, 'true');
          }

          const METRICS_SYNC_RESET_FLAG = 'metrics_sync_reset_v1';
          if (!localStorage.getItem(METRICS_SYNC_RESET_FLAG)) {
            console.log('[App] Resetando timestamps de sync de métricas para forçar fetch completo...');
            localStorage.removeItem('last_refresh_daily_metrics');
            localStorage.removeItem('last_refresh_milk_daily');
            localStorage.removeItem('last_refresh_farm_monthly_stats');
            localStorage.setItem(METRICS_SYNC_RESET_FLAG, 'true');
          }

          await db.migrateLocalIds();
          await db.recoverOrphanedRecords();
        }

        // Offline-first: enviar pendências locais antes de baixar o servidor.
        // Isso evita que uma carga completa mostre dados antigos enquanto o outbox
        // ainda tem alterações do aparelho.
        window.dispatchEvent(new CustomEvent('app-sync-start', { detail: { label: 'enviando pendentes' } }));
        await db.syncPendingData();

        let fullRefreshCompleted = false;
        const FULL_REFRESH_HOTFIX_FLAG = 'full_refresh_after_supabase_switch_v6';
        if (runMaintenance && !maintenanceDone && !localStorage.getItem(FULL_REFRESH_HOTFIX_FLAG)) {
          console.log('[App] Forçando carga completa segura após envio de pendentes...');
          window.dispatchEvent(new CustomEvent('app-sync-start', { detail: { label: 'carga completa' } }));
          await db.forceFullRefreshFromServer();
          localStorage.setItem(FULL_REFRESH_HOTFIX_FLAG, 'true');
          fullRefreshCompleted = true;
        }

        // A carga completa já contempla todas as tabelas. Não repete as mesmas
        // consultas logo em seguida na primeira abertura.
        if (!fullRefreshCompleted) {
          window.dispatchEvent(new CustomEvent('app-sync-start', { detail: { label: 'atualizando dados' } }));
          await db.refreshFromServer();
        }

        if (runMaintenance && !maintenanceDone) {
          await db.migrateRaspagemToConforto();
          await seedImageData();
          maintenanceDone = true;
        }
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
        await db.preCacheAllMedia();
      } catch (e) {
        console.error('Erro no cache de mídia:', e);
        mediaCacheDone = false; // permitir retry na próxima vez
      }
    };

    const scheduleMediaCache = () => {
      if (mediaCacheDone || mediaCacheTimer || !navigator.onLine) return;
      // Dá prioridade à navegação e aos indicadores. As mídias continuam sendo
      // preparadas para uso offline, mas só depois que o ciclo principal terminou.
      mediaCacheTimer = window.setTimeout(() => {
        mediaCacheTimer = undefined;
        if (running) {
          scheduleMediaCache();
          return;
        }
        void runMediaCacheIfNeeded();
      }, 5000);
    };

    // Sync em background: não bloqueia a UI.
    // O banner de sync no Layout mostra o progresso visualmente.
    runSyncCycle(true).then(scheduleMediaCache).catch(console.error);

    // Listener para quando a internet volta
    const handleOnline = () => {
      notify("Conexão restabelecida! Iniciando sincronização...", "info");
      mediaCacheDone = false; // permitir novo cache quando internet volta
      runSyncCycle(true).then(scheduleMediaCache).catch(console.error);
    };

    window.addEventListener('online', handleOnline);

    // Um único ciclo periódico evita a antiga duplicidade de timers. Cinco
    // minutos mantém os aparelhos atualizados sem pressionar rede, CPU e bateria.
    syncInterval = setInterval(() => {
      if (navigator.onLine) void runSyncCycle(false);
    }, 5 * 60 * 1000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      if (removeBackButtonListener) removeBackButtonListener();
      if (syncInterval) clearInterval(syncInterval);
      if (mediaCacheTimer) clearTimeout(mediaCacheTimer);
    };
  }, [activated]);

  if (!activated) {
    return (
      <AppErrorBoundary>
        <HashRouter>
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
        </HashRouter>
      </AppErrorBoundary>
    );
  }

  return (
    <AppErrorBoundary>
      <HashRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
        {/* --- ROTAS LIVRES (Free Access) --- */}
        <Route path="/" element={<HomeScreen />} />
        <Route path="/profile" element={<ProfileScreen />} />
        <Route path="/agenda" element={<AgendaScreen />} />
        <Route path="/fuelings" element={<FuelingMenuScreen />} />
        <Route path="/fuelings/new" element={<FuelingScreen />} />
        <Route path="/fuelings/history" element={<FuelingScreen />} />

        {/* Anomalias: ADICIONAR LIVRE */}
        <Route path="/anomalies" element={<AnomaliesMenuScreen />} />
        <Route path="/anomalies/add" element={<AddAnomalyScreen />} />
        <Route path="/anomalies/clone/:cloneId" element={<AddAnomalyScreen />} />
        <Route path="/anomalies/edit/:id" element={<AdminGuard><AddAnomalyScreen /></AdminGuard>} />
        <Route path="/anomalies/list" element={<ListAnomaliesScreen />} />
        <Route path="/anomalies/detail/:id" element={<AnomalyDetailScreen />} />
        <Route path="/anomalies/quantity" element={<AnomalyQuantityScreen />} />
        <Route path="/anomalies/clients" element={<ClientDashboardScreen />} />
        <Route path="/anomalies/insights" element={<RuminaInsightsScreen mode="farm" />} />
        <Route path="/farm-indicators" element={<RuminaInsightsScreen mode="farm" />} />
        <Route path="/rural-management" element={<Navigate to="/farm-indicators" replace />} />

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

        {/* Configurações - disponível apenas para o perfil administrador */}
        <Route path="/settings" element={<AdminGuard><SettingsScreen /></AdminGuard>} />
        <Route path="/diagnostics" element={<DiagnosticScreen />} />
        <Route path="/owner" element={<OwnerDashboardScreen />} />

          </Routes>
        </Suspense>
      </HashRouter>
    </AppErrorBoundary>
  );
};

export default App;
