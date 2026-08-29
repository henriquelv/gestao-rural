import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  Clipboard,
  Database,
  Download,
  RefreshCw,
  RotateCcw,
  Smartphone,
  Wifi,
  XCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { Layout } from '../components/Layout';
import { activationService } from '../services/activation.service';
import { AnomalyAudit, db } from '../services/db.service';
import { farmContextService } from '../services/farm-context.service';
import { localdb } from '../services/localdb';
import { notify } from '../services/notification.service';
import { syncService } from '../services/sync.service';
import { supabaseConfig } from '../services/supabase';

type OutboxSummary = {
  total: number;
  pending: number;
  errors: number;
  lastError: any | null;
};

type DiagnosticData = {
  app: {
    name: string;
    id: string;
    version: string;
    build: string;
    platform: string;
    native: boolean;
  };
  supabaseUrl: string;
  online: boolean;
  context: any | null;
  access: { ok: boolean; offline?: boolean; message?: string } | null;
  outbox: OutboxSummary;
  syncStatus: any;
  syncInFlight: boolean;
  lastSyncAt: string | null;
  runtimeError: any | null;
  logs: any[];
  localCounts: Record<string, number>;
  anomalyAudit: AnomalyAudit | null;
  nativeDb: { available: boolean; error: string | null } | null;
};

const MAIN_TABLES = [
  'anomalies',
  'notices',
  'improvements',
  'instructions',
  'farm_docs',
  'milk_daily',
  'daily_metrics',
  'farm_monthly_stats'
];

const safeJson = (raw: string | null) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

const labelDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString('pt-BR');
};

const shortValue = (value?: string | null) => {
  if (!value) return '-';
  if (value.length <= 24) return value;
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
};

const InfoRow: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => (
  <div className="border-b border-gray-100 py-3 last:border-b-0">
    <div className="text-[10px] font-black uppercase text-gray-500">{label}</div>
    <div className="mt-1 break-words text-sm font-bold text-gray-900">{value || '-'}</div>
  </div>
);

const MetricCard: React.FC<{ label: string; value: React.ReactNode; tone?: 'gray' | 'red' | 'green' | 'blue' }> = ({
  label,
  value,
  tone = 'gray'
}) => {
  const toneClass = {
    gray: 'border-gray-200 bg-white text-gray-900',
    red: 'border-red-200 bg-red-50 text-red-700',
    green: 'border-green-200 bg-green-50 text-green-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700'
  }[tone];

  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div className="text-[10px] font-black uppercase text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-black">{value}</div>
    </div>
  );
};

export const DiagnosticScreen: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<DiagnosticData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let appInfo = {
        name: 'Gestao Rural',
        id: 'com.gestaorural.app',
        version: import.meta.env.VITE_APP_VERSION || '1.0.14-android-compat-hotfix',
        build: '13'
      };

      try {
        appInfo = { ...appInfo, ...(await CapApp.getInfo()) };
      } catch {
        // Web preview has no native app info.
      }

      const localCounts: Record<string, number> = {};
      for (const table of MAIN_TABLES) {
        try {
          localCounts[table] = await localdb.count(table);
        } catch {
          localCounts[table] = -1;
        }
      }

      let access: DiagnosticData['access'] = null;
      try {
        access = await activationService.validateCurrentAccess();
      } catch (e: any) {
        access = { ok: false, message: e?.message || String(e) };
      }

      const [outbox, syncStatus] = await Promise.all([
        localdb.getOutboxSummary(),
        db.getSyncStatus()
      ]);
      let anomalyAudit: AnomalyAudit | null = null;
      try {
        anomalyAudit = await db.auditAnomalies();
      } catch (e) {
        console.error('Erro na auditoria de anomalias:', e);
      }
      const nativeDb = await localdb.getNativeStatus();

      const rawLogs = safeJson(localStorage.getItem('sync_diagnostic_logs_v1'));

      setData({
        app: {
          ...appInfo,
          platform: Capacitor.getPlatform(),
          native: Capacitor.isNativePlatform()
        },
        supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
        online: navigator.onLine,
        context: farmContextService.getContext(),
        access,
        outbox,
        syncStatus,
        syncInFlight: syncService._isSyncing,
        lastSyncAt: localStorage.getItem('last_sync_at'),
        runtimeError: safeJson(localStorage.getItem('last_runtime_error')),
        logs: Array.isArray(rawLogs) ? rawLogs : [],
        localCounts,
        anomalyAudit,
        nativeDb
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const diagnosticText = useMemo(() => {
    if (!data) return '';
    return JSON.stringify(data, null, 2);
  }, [data]);

  const copyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(diagnosticText);
      notify('Diagnostico copiado.', 'success');
    } catch {
      notify('Nao foi possivel copiar automaticamente.', 'error');
    }
  };

  const exportDiagnostics = () => {
    if (!diagnosticText) return;
    const blob = new Blob([diagnosticText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `diagnostico-sync-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const reprocessOutbox = async () => {
    setBusy(true);
    try {
      await db.recoverOrphanedRecords();
      await syncService.forceReprocessOutbox();
      notify('Outbox marcado para nova tentativa.', 'success');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const syncNow = async () => {
    setBusy(true);
    try {
      await db.recoverOrphanedRecords();
      await syncService.forceReprocessOutbox();
      await db.syncPendingData();
      await load();
    } finally {
      setBusy(false);
    }
  };

  const accessOk = data?.access?.ok;
  const hasContext = !!data?.context?.farm_id;

  return (
    <Layout>
      <Header title="Diagnostico" targetRoute={hasContext ? '/settings' : undefined} />
      <main className="flex-1 overflow-y-auto bg-gray-100 p-4 pb-8">
        {loading && (
          <div className="rounded-lg border border-gray-200 bg-white p-5 text-center text-sm font-bold text-gray-600">
            Carregando diagnostico...
          </div>
        )}

        {!loading && data && (
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <div className={`rounded-full p-2 ${accessOk ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {accessOk ? <CheckCircle size={22} /> : <XCircle size={22} />}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-black uppercase text-gray-900">
                    {accessOk ? 'Acesso liberado' : 'Acesso precisa de atencao'}
                  </h2>
                  <p className="mt-1 text-sm font-semibold text-gray-600">
                    {data.access?.message || (accessOk ? 'Fazenda, licenca e dispositivo validados.' : 'Veja os dados abaixo antes de sincronizar.')}
                  </p>
                </div>
              </div>

              {!hasContext && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">
                  App sem fazenda ativada neste aparelho. Ative com o codigo da fazenda antes de enviar dados presos.
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <MetricCard label="Outbox" value={data.outbox.total} tone={data.outbox.total > 0 ? 'blue' : 'green'} />
              <MetricCard label="Pendentes" value={data.outbox.pending} tone={data.outbox.pending > 0 ? 'blue' : 'gray'} />
              <MetricCard label="Erros" value={data.outbox.errors} tone={data.outbox.errors > 0 ? 'red' : 'green'} />
            </div>

            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={syncNow}
                disabled={busy}
                className="flex min-h-14 items-center justify-center gap-2 rounded-lg bg-green-700 px-4 py-4 text-sm font-black uppercase text-white shadow active:scale-[0.99] disabled:opacity-60"
              >
                <RefreshCw size={18} className={busy ? 'animate-spin' : ''} />
                Sincronizar agora
              </button>
              <button
                onClick={reprocessOutbox}
                disabled={busy}
                className="flex min-h-14 items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-4 text-sm font-black uppercase text-white shadow active:scale-[0.99] disabled:opacity-60"
              >
                <RotateCcw size={18} />
                Forcar reprocessamento do outbox
              </button>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={copyDiagnostics}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-3 text-xs font-black uppercase text-gray-800"
                >
                  <Clipboard size={16} />
                  Copiar logs
                </button>
                <button
                  onClick={exportDiagnostics}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-3 text-xs font-black uppercase text-gray-800"
                >
                  <Download size={16} />
                  Exportar
                </button>
              </div>
            </div>

            <section className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="mb-2 flex items-center gap-2">
                <Smartphone size={18} className="text-gray-500" />
                <h3 className="text-sm font-black uppercase text-gray-900">App e banco</h3>
              </div>
              <InfoRow label="Versao/build" value={`${data.app.version} / ${data.app.build}`} />
              <InfoRow label="Package/applicationId" value={data.app.id} />
              <InfoRow label="Plataforma" value={`${data.app.platform}${data.app.native ? ' nativo' : ' web'}`} />
              <InfoRow label="Supabase configuração" value={supabaseConfig.configured ? 'Configurado' : `Ausente: ${supabaseConfig.missing.join(', ')}`} />
              <InfoRow label="Supabase URL" value={data.supabaseUrl || '(não configurado)'} />
              <InfoRow label="Conexao" value={data.online ? 'Online' : 'Offline'} />
              <InfoRow label="SQLite nativo" value={data.nativeDb ? (data.nativeDb.available ? 'Disponível' : `Indisponível: ${data.nativeDb.error || 'erro desconhecido'}`) : 'Não aplicável (web)'} />
              <InfoRow label="Legados ambíguos" value={localStorage.getItem('legacy_ambiguous_records_v1') || '0'} />
            </section>

            {data.anomalyAudit && (
              <section className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Database size={18} className="text-gray-500" />
                  <h3 className="text-sm font-black uppercase text-gray-900">Anomalias</h3>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <MetricCard label="Supabase" value={data.anomalyAudit.serverTotal} tone="blue" />
                  <MetricCard label="SQLite" value={data.anomalyAudit.localTotal} />
                  <MetricCard label="Visíveis" value={data.anomalyAudit.visibleTotal} tone="green" />
                  <MetricCard label="Synced=false" value={data.anomalyAudit.unsyncedLocal} tone={data.anomalyAudit.unsyncedLocal ? 'blue' : 'gray'} />
                  <MetricCard label="Data inválida" value={data.anomalyAudit.invalidCreatedAt} tone={data.anomalyAudit.invalidCreatedAt ? 'red' : 'gray'} />
                  <MetricCard label="Sem media" value={data.anomalyAudit.withoutMedia + data.anomalyAudit.nullMedia + data.anomalyAudit.invalidMedia} tone={data.anomalyAudit.withoutMedia + data.anomalyAudit.nullMedia + data.anomalyAudit.invalidMedia ? 'red' : 'gray'} />
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b text-left"><th className="p-2">Mês</th><th className="p-2">Local</th><th className="p-2">Servidor</th><th className="p-2">Visível</th></tr></thead>
                    <tbody>
                      {Array.from(new Set([...Object.keys(data.anomalyAudit.localByMonth), ...Object.keys(data.anomalyAudit.serverByMonth)]).values()).sort().map(month => (
                        <tr key={month} className="border-b border-gray-100"><td className="p-2 font-bold">{month}</td><td className="p-2">{data.anomalyAudit?.localByMonth[month] || 0}</td><td className="p-2">{data.anomalyAudit?.serverByMonth[month] || 0}</td><td className="p-2">{data.anomalyAudit?.visibleByMonth[month] || 0}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 text-xs font-semibold text-gray-600">
                  <p>Sem farm_id: {data.anomalyAudit.withoutFarmId} | Fazenda diferente: {data.anomalyAudit.differentFarmId}</p>
                  <p>Servidor ausente local: {data.anomalyAudit.serverOnlyIds} | Local ausente servidor: {data.anomalyAudit.localOnlyIds}</p>
                  <p>IDs duplicados no servidor: {data.anomalyAudit.duplicateServerIds}</p>
                </div>
              </section>
            )}

            <section className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="mb-2 flex items-center gap-2">
                <Database size={18} className="text-gray-500" />
                <h3 className="text-sm font-black uppercase text-gray-900">Fazenda e funcionario</h3>
              </div>
              <InfoRow label="farm_id" value={shortValue(data.context?.farm_id)} />
              <InfoRow label="farm_name" value={data.context?.farm_name} />
              <InfoRow label="employee_id" value={shortValue(data.context?.employee_id)} />
              <InfoRow label="employee_name" value={data.context?.employee_name} />
              <InfoRow label="device_id" value={shortValue(data.context?.device_id)} />
              <InfoRow label="Licenca" value={data.context?.license_status || (accessOk ? 'active' : '-')} />
              <InfoRow label="Dispositivo" value={data.context?.device_status || '-'} />
              <InfoRow label="Ultima validacao" value={labelDate(data.context?.last_license_check_at)} />
              <InfoRow label="Ultimo sync" value={labelDate(data.lastSyncAt)} />
              <InfoRow label="Sync em andamento" value={data.syncInFlight ? 'Sim' : 'Não'} />
              <InfoRow label="Reconciliação desta sessão" value={localStorage.getItem('full_refresh_session_reconciliation_v7') === 'true' ? 'Concluída' : 'Pendente/retry'} />
            </section>

            {data.outbox.lastError && (
              <section className="rounded-lg border border-red-200 bg-red-50 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <AlertTriangle size={18} className="text-red-700" />
                  <h3 className="text-sm font-black uppercase text-red-900">Ultimo erro de sync</h3>
                </div>
                <InfoRow label="Tabela" value={data.outbox.lastError.tableName || data.outbox.lastError.table_name} />
                <InfoRow label="Erro" value={data.outbox.lastError.errorMessage || data.outbox.lastError.error_message || 'Erro sem mensagem'} />
                <InfoRow label="Criado em" value={data.outbox.lastError.created_at} />
              </section>
            )}

            <section className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <Wifi size={18} className="text-gray-500" />
                <h3 className="text-sm font-black uppercase text-gray-900">Dados locais</h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {MAIN_TABLES.map((table) => (
                  <div key={table} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <div className="truncate text-[10px] font-black uppercase text-gray-500">{table}</div>
                    <div className="text-lg font-black text-gray-900">{data.localCounts[table]}</div>
                  </div>
                ))}
              </div>
            </section>

            {(data.logs.length > 0 || data.runtimeError) && (
              <section className="rounded-lg border border-gray-200 bg-white p-4">
                <h3 className="mb-3 text-sm font-black uppercase text-gray-900">Logs recentes</h3>
                {data.runtimeError && (
                  <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <div className="text-[10px] font-black uppercase text-amber-700">Erro runtime</div>
                    <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-[11px] font-semibold text-amber-900">
                      {JSON.stringify(data.runtimeError, null, 2)}
                    </pre>
                  </div>
                )}
                <div className="space-y-2">
                  {data.logs.slice(-8).reverse().map((log, index) => (
                    <div key={`${log?.at || 'log'}-${index}`} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                      <div className="text-[10px] font-black uppercase text-gray-500">{labelDate(log?.at)}</div>
                      <div className="mt-1 text-xs font-bold text-gray-900">{log?.message || 'Log'}</div>
                      {log?.detail && <div className="mt-1 line-clamp-3 text-[11px] font-semibold text-gray-600">{log.detail}</div>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <button
              onClick={() => navigate(hasContext ? '/settings' : '/')}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-4 text-sm font-black uppercase text-gray-800"
            >
              <ArrowLeft size={18} />
              Voltar
            </button>
          </div>
        )}
      </main>
    </Layout>
  );
};
