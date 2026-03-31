
import { Anomaly, Instruction, Notice, Improvement, FarmDoc, DailyMilk, MonthlyStats, Employee, FarmSettings, UIConfig, UIBlock, DailyMetric, Sector } from '../types';
import { supabase } from './supabase';
import { notify } from './notification.service';
import { localdb } from './localdb';
import { syncService } from './sync.service';
import { mediaService } from './media.service';

const isOnline = () => navigator.onLine;
const nowISO = () => new Date().toISOString();

const lastRefreshKey = (tableName: string) => `last_refresh_${tableName}`;
const getLastRefresh = (tableName: string) => {
  try {
    return localStorage.getItem(lastRefreshKey(tableName)) || '';
  } catch {
    return '';
  }
};
const setLastRefresh = (tableName: string, iso: string) => {
  try {
    localStorage.setItem(lastRefreshKey(tableName), iso);
  } catch {
    // ignore
  }
};

const getTimestampFieldForTable = (tableName: string): string | null => {
  if (tableName === 'anomalies') return 'createdAt';
  if (tableName === 'instructions') return 'createdAt';
  if (tableName === 'notices') return 'createdAt';
  if (tableName === 'improvements') return 'createdAt';
  if (tableName === 'farm_docs') return 'updatedAt';
  // daily_metrics, milk_daily e farm_monthly_stats usam 'date'/'monthKey' como chave
  // de negócio, não como timestamp de modificação. Delta sync por esse campo faz com que
  // edições em datas retroativas nunca cheguem em outros dispositivos. Fazemos fetch
  // completo para essas tabelas (são pequenas) garantindo consistência entre celulares.
  if (tableName === 'milk_daily') return null;
  if (tableName === 'daily_metrics') return null;
  if (tableName === 'farm_monthly_stats') return null;
  return null;
};

const MEDIA_BUCKET = 'media';
const tablesWithMedia = new Set(['anomalies', 'instructions', 'notices', 'improvements', 'farm_docs']);

// Cache de URLs públicas de mídia: evita recalcular a URL a cada sync/leitura
const _mediaUrlCache = new Map<string, string>();
const getCachedPublicUrl = (remotePath: string): string => {
  if (_mediaUrlCache.has(remotePath)) return _mediaUrlCache.get(remotePath)!;
  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(remotePath);
  const url = data?.publicUrl || '';
  if (url) _mediaUrlCache.set(remotePath, url);
  return url;
};

const normalizeRemoteUrls = (tableName: string, row: any) => {
  try {
    if (!tablesWithMedia.has(tableName)) return row;

    // farm_docs has single media object
    if (tableName === 'farm_docs') {
      const m = row?.media;
      if (m && !m.remoteUrl && m.remotePath) {
        return { ...row, media: { ...m, remoteUrl: getCachedPublicUrl(m.remotePath) } };
      }
      return row;
    }

    const arr = Array.isArray(row?.media) ? row.media : [];
    if (arr.length === 0) return row;
    const next = arr.map((m: any) => {
      if (m && !m.remoteUrl && m.remotePath) {
        return { ...m, remoteUrl: getCachedPublicUrl(m.remotePath) };
      }
      return m;
    });
    return { ...row, media: next };
  } catch {
    return row;
  }
};

const MOCK_SETTINGS: FarmSettings = {
  farmName: 'FAZENDA SANTA LUZIA',
  ownerName: 'Gestão Rural',
  headerTextColor: '#1f2937',
  farmLogoUri: ''
};

const DEFAULT_UI_BUTTONS: UIBlock[] = [
  { id: 'h1', screen: 'home', type: 'button', label: 'ANOMALIAS', color: 'red', iconType: 'lucide', iconValue: 'alert', route: '/anomalies', order: 1, visible: true },
  { id: 'h2', screen: 'home', type: 'button', label: 'INSTRUÇÕES DE TRABALHO', color: 'purple', iconType: 'lucide', iconValue: 'file', route: '/instructions', order: 2, visible: true },
  { id: 'h3', screen: 'home', type: 'button', label: 'COMUNICADOS', color: 'blue', iconType: 'lucide', iconValue: 'megaphone', route: '/notices', order: 3, visible: true },
  { id: 'h4', screen: 'home', type: 'button', label: 'DADOS FAZENDA', color: 'yellow', iconType: 'lucide', iconValue: 'chart', route: '/data', order: 4, visible: true },
  { id: 'h5', screen: 'home', type: 'button', label: 'MELHORIAS', color: 'green', iconType: 'lucide', iconValue: 'trending', route: '/improvements', order: 5, visible: true },
  { id: 'h6', screen: 'home', type: 'button', label: 'NORMAS & ORG.', color: 'pink', iconType: 'lucide', iconValue: 'clipboard', route: '/norms', order: 6, visible: true },
  { id: 'h7', screen: 'home', type: 'button', label: 'CONFIGURAÇÕES', color: 'gray', iconType: 'lucide', iconValue: 'settings', route: '/settings', order: 7, visible: true },

  { id: 'a1', screen: 'anomalies_menu', type: 'button', label: 'ADICIONAR ANOMALIA', color: 'green', iconType: 'lucide', iconValue: 'plus', route: '/anomalies/add', order: 1, visible: true },
  { id: 'a2', screen: 'anomalies_menu', type: 'button', label: 'LISTA DE ANOMALIAS', color: 'blue', iconType: 'lucide', iconValue: 'list', route: '/anomalies/list', order: 2, visible: true },
  { id: 'a3', screen: 'anomalies_menu', type: 'button', label: 'QUANTIDADE DE ANOMALIAS', color: 'purple', iconType: 'lucide', iconValue: 'bar-chart', route: '/anomalies/quantity', order: 3, visible: true },
  { id: 'i1', screen: 'instructions_menu', type: 'button', label: 'ALIMENTAÇÃO', color: 'yellow', iconType: 'lucide', iconValue: 'box', route: '/instructions/Alimentação', order: 1, visible: true },
  { id: 'i2', screen: 'instructions_menu', type: 'button', label: 'MANEJO', color: 'green', iconType: 'lucide', iconValue: 'activity', route: '/instructions/Manejo', order: 2, visible: true },
  { id: 'i3', screen: 'instructions_menu', type: 'button', label: 'CRIAÇÃO', color: 'orange', iconType: 'lucide', iconValue: 'baby', route: '/instructions/Criação', order: 3, visible: true },
  { id: 'i4', screen: 'instructions_menu', type: 'button', label: 'MATERNIDADE', color: 'purple', iconType: 'lucide', iconValue: 'heart', route: '/instructions/Maternidade', order: 4, visible: true },
  { id: 'i5', screen: 'instructions_menu', type: 'button', label: 'CONFORTO', color: 'blue', iconType: 'lucide', iconValue: 'thermometer', route: '/instructions/Conforto', order: 5, visible: true },
  { id: 'i6', screen: 'instructions_menu', type: 'button', label: 'ORDENHA', color: 'red', iconType: 'lucide', iconValue: 'droplet', route: '/instructions/Ordenha', order: 6, visible: true },
  { id: 'i7', screen: 'instructions_menu', type: 'button', label: 'SERVIÇOS EXTERNOS', color: 'pink', iconType: 'lucide', iconValue: 'tractor', route: '/instructions/Serviços Externos', order: 7, visible: true },
  { id: 'i8', screen: 'instructions_menu', type: 'button', label: 'ADMINISTRAÇÃO', color: 'gray', iconType: 'lucide', iconValue: 'clipboard', route: '/instructions/Administração', order: 8, visible: true },
  { id: 'n1', screen: 'notices_menu', type: 'button', label: 'NOVO COMUNICADO', color: 'green', iconType: 'lucide', iconValue: 'plus', route: '/notices/add', order: 1, visible: true },
  { id: 'n2', screen: 'notices_menu', type: 'button', label: 'LISTA COMUNICADOS', color: 'blue', iconType: 'lucide', iconValue: 'list', route: '/notices/list', order: 2, visible: true },
  { id: 'm1', screen: 'improvements_menu', type: 'button', label: 'REGISTRAR MELHORIA', color: 'green', iconType: 'lucide', iconValue: 'plus', route: '/improvements/add', order: 1, visible: true },
  { id: 'm2', screen: 'improvements_menu', type: 'button', label: 'LISTA MELHORIAS', color: 'blue', iconType: 'lucide', iconValue: 'list', route: '/improvements/list', order: 2, visible: true },
  { id: 'd1', screen: 'farm_data_menu', type: 'button', label: 'LEITE (DIÁRIO)', color: 'blue', iconType: 'lucide', iconValue: 'droplet', route: '/data/milk', order: 1, visible: true },
  { id: 'd2', screen: 'farm_data_menu', type: 'button', label: 'VACAS EM LACTAÇÃO', color: 'green', iconType: 'lucide', iconValue: 'activity', route: '/data/lactation', order: 2, visible: true },
  { id: 'd3', screen: 'farm_data_menu', type: 'button', label: 'DESCARTES', color: 'red', iconType: 'lucide', iconValue: 'ban', route: '/data/discard', order: 3, visible: true },
  { id: 'd4', screen: 'farm_data_menu', type: 'button', label: 'NASCIMENTOS', color: 'purple', iconType: 'lucide', iconValue: 'baby', route: '/data/births', order: 4, visible: true },
  { id: 'nm1', screen: 'norms_menu', type: 'button', label: 'ADICIONAR NORMA', color: 'green', iconType: 'lucide', iconValue: 'plus', route: '/norms/create', order: 1, visible: true },
  { id: 'nm2', screen: 'norms_menu', type: 'button', label: 'ATUALIZAR NORMA', color: 'orange', iconType: 'lucide', iconValue: 'refresh-cw', route: '/norms/update', order: 2, visible: true },
  { id: 'nm3', screen: 'norms_menu', type: 'button', label: 'LISTA DE NORMAS', color: 'blue', iconType: 'lucide', iconValue: 'list', route: '/norms/list', order: 3, visible: true },
  { id: 'force_update_v3', screen: 'none', type: 'button', label: 'DUMMY', color: 'gray', iconType: 'lucide', iconValue: 'alert', route: '', order: 99, visible: false }
];

const DEFAULT_UI_CONFIG: UIConfig = { buttons: DEFAULT_UI_BUTTONS, customPages: [] };
const DEFAULT_SECTORS_LIST = Object.values(Sector);

const DEFAULT_EMPLOYEES_LIST: Employee[] = [
  { id: '1', name: 'ADILSON', role: 'Colaborador' },
  { id: '2', name: 'ADOIR', role: 'Colaborador' },
  { id: '3', name: 'ADRIANA', role: 'Colaborador' },
  { id: '4', name: 'ALINE', role: 'Colaborador' },
  { id: '5', name: 'ANTONIO', role: 'Colaborador' },
  { id: '6', name: 'APARECIDO', role: 'Colaborador' },
  { id: '7', name: 'ARIADNE', role: 'Colaborador' },
  { id: '8', name: 'BETO', role: 'Colaborador' },
  { id: '9', name: 'BIGU', role: 'Colaborador' },
  { id: '10', name: 'CLAUBER', role: 'Colaborador' },
  { id: '11', name: 'CLENILDO', role: 'Colaborador' },
  { id: '12', name: 'EDUARDO', role: 'Colaborador' },
  { id: '13', name: 'EDUARDO 2', role: 'Colaborador' },
  { id: '14', name: 'ELIAS', role: 'Colaborador' },
  { id: '15', name: 'ELIAS S', role: 'Colaborador' },
  { id: '16', name: 'EVA', role: 'Colaborador' },
  { id: '17', name: 'GIDELSON', role: 'Colaborador' },
  { id: '18', name: 'ISABELLI', role: 'Colaborador' },
  { id: '19', name: 'JANETE', role: 'Colaborador' },
  { id: '20', name: 'JOÃO', role: 'Colaborador' },
  { id: '21', name: 'JORGE', role: 'Colaborador' },
  { id: '22', name: 'JOSI', role: 'Colaborador' },
  { id: '23', name: 'JUAREZ', role: 'Colaborador' },
  { id: '24', name: 'LENICE', role: 'Colaborador' },
  { id: '25', name: 'LUIZ', role: 'Colaborador' },
  { id: '26', name: 'MARIA', role: 'Colaborador' },
  { id: '27', name: 'MARIO', role: 'Colaborador' },
  { id: '28', name: 'RAIMUNDA', role: 'Colaborador' },
  { id: '29', name: 'ROSE', role: 'Colaborador' },
  { id: '30', name: 'ROY', role: 'Colaborador' },
  { id: '31', name: 'SANDRO', role: 'Colaborador' },
  { id: '32', name: 'SARA', role: 'Colaborador' },
  { id: '33', name: 'SOLANGE', role: 'Colaborador' },
  { id: '34', name: 'TAINÁ', role: 'Colaborador' },
  { id: '35', name: 'THALIA', role: 'Colaborador' },
  { id: '36', name: 'VANDERLEI', role: 'Colaborador' },
  { id: '37', name: 'VANDERSON', role: 'Colaborador' },
  { id: '38', name: 'VANESSA', role: 'Colaborador' },
  { id: '39', name: 'WALLACE', role: 'Colaborador' }
];

async function refreshFromServer(tableName: string): Promise<void> {
  if (!isOnline()) return;

  const last = getLastRefresh(tableName);
  const tsField = getTimestampFieldForTable(tableName);
  const baseQuery = supabase.from(tableName).select('*');

  const runQuery = async (): Promise<any[] | null> => {
    try {
      if (last && tsField) {
        const { data, error } = await (baseQuery
          .gte(tsField as any, last)
          .order(tsField as any, { ascending: true }) as any);
        if (error || !data) return null;
        return data;
      }

      const { data, error } = await baseQuery;
      if (error || !data) return null;
      return data;
    } catch {
      return null;
    }
  };

  let data = await runQuery();
  if (!data && last && tsField) {
    try {
      const { data: allData, error: allErr } = await baseQuery;
      if (!allErr && allData) data = allData;
    } catch {
      // ignore
    }
  }

  if (!data) return;

  data = data.map((d: any) => normalizeRemoteUrls(tableName, d));

  const records = data.map((d: any) => ({
    id:
      tableName === 'daily_metrics'
        ? `${d.date}_${d.type}`
        : d.id ?? d.date ?? d.name,
    data: d,
    updated_at: nowISO(),
    synced: true
  }));

  // Detecção de conflito: se um registro local não sincronizado (edição offline)
  // for sobrescrito por dados do servidor, avisa o usuário.
  try {
    const conflictTables = new Set(['daily_metrics', 'milk_daily', 'anomalies']);
    if (conflictTables.has(tableName)) {
      for (const record of records) {
        const local = await localdb.getById<any>(tableName, record.id);
        if (local && (local as any).synced === false) {
          console.warn(`Conflito detectado em ${tableName}/${record.id}: dado local não sincronizado será sobrescrito pelo servidor.`);
          notify(`Atenção: dado de "${tableName === 'daily_metrics' ? 'métricas' : tableName === 'milk_daily' ? 'leite' : 'anomalia'}" foi atualizado por outro dispositivo.`, 'info');
          break; // Uma notificação por tabela é suficiente
        }
      }
    }
  } catch {
    // Não bloquear sync por erro na detecção de conflito
  }

  await localdb.bulkPut(tableName, records);

  // Ghost Record Cleanup: roda em carga completa (sem last refresh) OU quando
  // a tabela sempre faz fetch completo (tsField === null), garantindo que registros
  // deletados no servidor sejam removidos localmente em todos os dispositivos.
  if (!last || !tsField) {
    try {
      const serverIds = new Set(records.map(r => r.id));
      const localItems = await localdb.getAll<any>(tableName);
      for (const localItem of localItems) {
        if (localItem.synced && !serverIds.has(localItem.id)) {
          console.log(`Limpando registro fantasma em ${tableName}: ${localItem.id}`);
          await localdb.delete(tableName, localItem.id);
        }
      }
    } catch (cleanupErr) {
      console.error(`Erro no Ghost Cleanup de ${tableName}:`, cleanupErr);
    }
  }

  try {
    if (tsField) {
      const maxTs = data
        .map((d: any) => (d ? d[tsField] : ''))
        .filter((v: any) => typeof v === 'string' && v.length > 0)
        .sort()
        .slice(-1)[0];
      if (maxTs) setLastRefresh(tableName, maxTs);
      else setLastRefresh(tableName, nowISO());
    } else {
      setLastRefresh(tableName, nowISO());
    }
  } catch {
    setLastRefresh(tableName, nowISO());
  }
}

async function smartRead<T>(tableName: string, fallbackData: T[], orderByField?: string): Promise<T[]> {
  try {
    const localCount = await localdb.count(tableName);

    if (localCount === 0) {
      if (isOnline()) {
        const { data, error } = await supabase.from(tableName).select('*');
        if (!error && data && data.length > 0) {
          const records = data.map((d: any) => ({
            id:
              tableName === 'daily_metrics'
                ? `${d.date}_${d.type}`
                : d.id ?? d.date ?? d.name,
            data: d,
            updated_at: nowISO(),
            synced: true
          }));
          await localdb.bulkPut(tableName, records);
        } else if (fallbackData.length > 0) {
          const seeds = (fallbackData as any[]).map((d: any) => ({
            id:
              tableName === 'daily_metrics'
                ? `${d.date}_${d.type}`
                : d.id ?? d.date ?? d.name,
            data: d,
            updated_at: nowISO(),
            synced: true
          }));
          await localdb.bulkPut(tableName, seeds);
        }
      } else if (fallbackData.length > 0) {
        const seeds = (fallbackData as any[]).map((d: any) => ({
          id:
            tableName === 'daily_metrics'
              ? `${d.date}_${d.type}`
              : d.id ?? d.date ?? d.name,
          data: d,
          updated_at: nowISO(),
          synced: false
        }));
        await localdb.bulkPut(tableName, seeds);
      }
    }

    return await localdb.getAll<T>(tableName, orderByField);
  } catch (e) {
    console.error(`Erro smartRead ${tableName}:`, e);
    return fallbackData;
  }
}

async function smartWrite(
  tableName: string,
  data: any,
  op: 'insert' | 'update' | 'upsert' | 'delete',
  idField: string = 'id',
  localId?: string
) {
  const id = op === 'delete' ? data : localId ?? data[idField];

  if (!id) {
    throw new Error(`Operação ${op} sem id em ${tableName}`);
  }

  const record = { id, data: op === 'delete' ? null : data, updated_at: nowISO(), synced: false, mediaTotalBytes: 0 };

  if (op === 'delete') await localdb.delete(tableName, id);
  else await localdb.put(tableName, record);

  await localdb.addToOutbox({ tableName, op, payload: data, created_at: nowISO(), status: 'pending' });

  notify(isOnline() ? 'Salvando...' : 'Salvo offline.', 'info');

  if (isOnline()) {
    syncService.syncAll();
  }
}

// Migração: Converter "Raspagem" para "Conforto"
async function migrateRaspagemToConforto() {
  try {
    const anomalies = await localdb.getAll<any>('anomalies');
    const hasRaspagem = anomalies.some(a => a.data?.sector === 'Raspagem');

    if (hasRaspagem) {
      console.log('Migrando anomalias: Raspagem → Conforto');
      const updated = anomalies.map(a => {
        if (a.data?.sector === 'Raspagem') {
          return {
            ...a,
            data: { ...a.data, sector: 'Conforto' },
            updated_at: nowISO(),
            synced: false
          };
        }
        return a;
      });

      await localdb.bulkPut('anomalies', updated);
      console.log(`✅ ${updated.filter(a => a.data?.sector === 'Conforto').length} anomalias migradas`);
      notify('Anomalias atualizadas (Raspagem → Conforto)', 'success');
    }
  } catch (e) {
    console.error('Erro na migração:', e);
  }
}

// Recupera registros órfãos: synced=false sem entrada correspondente no outbox.
// Ocorre quando o app trava entre a escrita local e a escrita no outbox.
// Os registros ficam visíveis localmente mas nunca sobem pro servidor.
async function recoverOrphanedRecords(): Promise<void> {
  const tables = ['anomalies', 'instructions', 'notices', 'improvements', 'farm_docs',
    'daily_metrics', 'milk_daily'];
  try {
    const pending = await localdb.getPendingOutbox();
    const outboxKeys = new Set(pending.map(item => {
      const p = item.payload;
      if (!p) return '';
      let id: string;
      if (item.tableName === 'daily_metrics' && p.date && p.type) id = `${p.date}_${p.type}`;
      else id = p.id ?? p.date ?? '';
      return `${item.tableName}:${id}`;
    }));

    let count = 0;
    for (const tableName of tables) {
      const unsynced = await localdb.getUnsyncedRawRecords(tableName);
      for (const record of unsynced) {
        if (!record.data) continue;
        const key = `${tableName}:${record.id}`;
        if (!outboxKeys.has(key)) {
          await localdb.addToOutbox({ tableName, op: 'upsert', payload: record.data, created_at: nowISO(), status: 'pending' });
          count++;
          console.log(`[Recovery] Registro órfão re-enfileirado: ${tableName}/${record.id}`);
        }
      }
    }
    if (count > 0) {
      console.log(`[Recovery] ${count} registro(s) órfão(s) recuperado(s) para sincronização.`);
      notify(`${count} registro(s) recuperado(s) para sincronização.`, 'info');
    }
  } catch (e) {
    console.error('[Recovery] Erro na recuperação de registros órfãos:', e);
  }
}

export const db = {
  syncPendingData: () => syncService.syncAll(),
  migrateRaspagemToConforto,
  recoverOrphanedRecords,

  getSyncStatus: async () => {
    try {
      const [pending, errors] = await Promise.all([
        localdb.getPendingOutbox(),
        localdb.getOutboxErrors(25)
      ]);

      return {
        pendingCount: pending.length,
        errorCount: errors.length,
        pending,
        errors
      };
    } catch (e) {
      console.error('Erro getSyncStatus:', e);
      return { pendingCount: 0, errorCount: 0, pending: [], errors: [] };
    }
  },

  retrySyncErrors: async () => {
    await localdb.retryAllOutboxErrors();
  },

  retrySyncErrorItem: async (id: number) => {
    await localdb.retryOutboxItem(id);
  },

  clearSyncErrors: async () => {
    try {
      const errs = await localdb.getOutboxErrors(100);
      for (const e of errs) {
        if (e.id) await localdb.deleteOutboxItem(e.id);
      }
      notify('Erros de sincronização limpos.', 'info');
    } catch (e) {
      console.error('Erro ao limpar outbox:', e);
    }
  },

  refreshFromServer: async () => {
    try {
      if (!isOnline()) return;
      await Promise.all([
        refreshFromServer('settings'),
        refreshFromServer('ui_config'),
        refreshFromServer('sectors'),
        refreshFromServer('employees'),
        refreshFromServer('anomalies'),
        refreshFromServer('instructions'),
        refreshFromServer('notices'),
        refreshFromServer('improvements'),
        refreshFromServer('farm_docs'),
        refreshFromServer('milk_daily'),
        refreshFromServer('daily_metrics'),
        refreshFromServer('farm_monthly_stats')
      ]);
    } catch (e) {
      console.error('Erro ao atualizar do servidor:', e);
    }
  },

  refreshDailyMetrics: async () => {
    if (!isOnline()) return;
    await refreshFromServer('daily_metrics');
  },

  refreshMilkDaily: async () => {
    if (!isOnline()) return;
    await refreshFromServer('milk_daily');
  },

  getSettings: async (): Promise<FarmSettings> => {
    const res = await smartRead<FarmSettings>('settings', [MOCK_SETTINGS], '');
    return res[0] || MOCK_SETTINGS;
  },
  saveSettings: async (s: FarmSettings) => smartWrite('settings', { id: '1', ...s }, 'upsert'),

  getUIConfig: async (): Promise<UIConfig> => {
    const res = await smartRead<UIConfig>('ui_config', [DEFAULT_UI_CONFIG], '');
    const current = res[0] || DEFAULT_UI_CONFIG;

    // Verificar se faltam botões (atualização de versão)
    const currentIds = new Set(current.buttons.map(b => b.id));
    const defaultIds = new Set(DEFAULT_UI_CONFIG.buttons.map(b => b.id));

    // Se faltam IDs, atualizar para a versão padrão
    if (defaultIds.size > currentIds.size) {
      await db.saveUIConfig(DEFAULT_UI_CONFIG);
      return DEFAULT_UI_CONFIG;
    }

    return current;
  },
  saveUIConfig: async (c: UIConfig) => smartWrite('ui_config', { id: '1', ...c }, 'upsert'),

  getSectors: async (): Promise<string[]> => {
    const fallback = DEFAULT_SECTORS_LIST.map((name) => ({ id: name, name }));
    const res = await smartRead<any>('sectors', fallback, '');
    const names = res
      .map((r: any) => (r?.name ?? '').toString().trim())
      .filter((n: string) => n.length > 0);
    const unique = Array.from(new Set(names));
    return unique.length > 0 ? unique : DEFAULT_SECTORS_LIST;
  },
  addSector: async (name: string) => smartWrite('sectors', { id: name, name }, 'insert'),
  removeSector: async (name: string) => smartWrite('sectors', name, 'delete'),
  renameSector: async (oldName: string, newName: string) => {
    try {
      // Atualizar o setor
      await smartWrite('sectors', { id: newName, name: newName }, 'upsert');
      // Remover o setor antigo se for diferente
      if (oldName !== newName) {
        await smartWrite('sectors', oldName, 'delete');
      }
    } catch (err) {
      console.error('Erro ao renomear setor:', err);
    }
  },

  getEmployees: async () => smartRead<Employee>('employees', DEFAULT_EMPLOYEES_LIST, ''),
  addEmployee: async (e: Employee) => smartWrite('employees', e, 'upsert'),
  updateEmployee: async (e: Employee) => smartWrite('employees', e, 'update'),
  removeEmployee: async (id: string) => smartWrite('employees', id, 'delete'),

  getAnomalies: async () => smartRead<Anomaly>('anomalies', [], 'createdAt'),
  addAnomaly: async (a: Anomaly) => {
    try {
      const all = await db.getAnomalies();
      if (all.length >= 100) {
        const oldest = all.sort((x, y) => new Date(x.createdAt).getTime() - new Date(y.createdAt).getTime())[0];
        if (oldest) await db.deleteAnomaly(oldest.id);
      }
    } catch (e) {
      console.error('Erro ao limpar limite de anomalias:', e);
    }
    return smartWrite('anomalies', a, 'upsert');
  },
  updateAnomaly: async (a: Anomaly) => smartWrite('anomalies', a, 'update'),
  deleteAnomaly: async (id: string) => {
    const item = await localdb.getById<Anomaly>('anomalies', id);
    if (item && item.media) {
      for (const m of item.media) {
        await mediaService.deleteMedia(m);
      }
    }
    return smartWrite('anomalies', id, 'delete');
  },
  getAnomalyById: async (id: string) => await localdb.getById<Anomaly>('anomalies', id),

  getInstructions: async () => smartRead<Instruction>('instructions', [], 'createdAt'),
  addInstruction: async (i: Instruction) => smartWrite('instructions', i, 'upsert'),
  updateInstruction: async (i: Instruction) => smartWrite('instructions', i, 'update'),
  deleteInstruction: async (id: string) => {
    const item = await localdb.getById<Instruction>('instructions', id);
    if (item && item.media) {
      for (const m of item.media) {
        await mediaService.deleteMedia(m);
      }
    }
    return smartWrite('instructions', id, 'delete');
  },
  getInstructionById: async (id: string) => await localdb.getById<Instruction>('instructions', id),

  getNotices: async () => smartRead<Notice>('notices', [], 'createdAt'),
  addNotice: async (n: Notice) => smartWrite('notices', n, 'upsert'),
  updateNotice: async (n: Notice) => smartWrite('notices', n, 'update'),
  deleteNotice: async (id: string) => {
    const item = await localdb.getById<Notice>('notices', id);
    if (item && item.media) {
      for (const m of item.media) {
        await mediaService.deleteMedia(m);
      }
    }
    return smartWrite('notices', id, 'delete');
  },

  getImprovements: async () => smartRead<Improvement>('improvements', [], 'createdAt'),
  addImprovement: async (i: Improvement) => smartWrite('improvements', i, 'upsert'),
  updateImprovement: async (i: Improvement) => smartWrite('improvements', i, 'update'),
  deleteImprovement: async (id: string) => {
    const item = await localdb.getById<Improvement>('improvements', id);
    if (item && item.media) {
      for (const m of item.media) {
        await mediaService.deleteMedia(m);
      }
    }
    return smartWrite('improvements', id, 'delete');
  },
  getImprovementById: async (id: string) => await localdb.getById<Improvement>('improvements', id),

  getFarmDocs: async () => smartRead<FarmDoc>('farm_docs', [], 'updatedAt'),
  getFarmDoc: async (id: string) => await localdb.getById<FarmDoc>('farm_docs', id),
  addFarmDoc: async (d: FarmDoc) => smartWrite('farm_docs', d, 'upsert'),
  saveFarmDoc: async (d: FarmDoc) => smartWrite('farm_docs', d, 'upsert'),
  updateFarmDoc: async (d: FarmDoc) => smartWrite('farm_docs', d, 'update'),
  deleteFarmDoc: async (id: string) => {
    const item = await localdb.getById<FarmDoc>('farm_docs', id);
    if (item && item.media) {
      await mediaService.deleteMedia(item.media);
    }
    return smartWrite('farm_docs', id, 'delete');
  },

  getMilkHistory: async () => smartRead<DailyMilk>('milk_daily', [], 'date'),
  addMilkEntry: async (entry: DailyMilk) => smartWrite('milk_daily', entry, 'upsert', 'date'),
  updateMilkEntry: async (entry: DailyMilk) => smartWrite('milk_daily', entry, 'upsert', 'date'),
  deleteMilkEntry: async (date: string) => smartWrite('milk_daily', date, 'delete'),

  getDailyMetrics: async (type: string) => {
    const all = await smartRead<DailyMetric>('daily_metrics', [], 'date');
    return all.filter((x: any) => x.type === type);
  },
  addDailyMetric: async (entry: DailyMetric) =>
    smartWrite('daily_metrics', entry, 'upsert', 'date', `${entry.date}_${entry.type}`),
  updateDailyMetric: async (entry: DailyMetric) =>
    smartWrite('daily_metrics', entry, 'upsert', 'date', `${entry.date}_${entry.type}`),
  deleteDailyMetric: async (date: string, type: string) => smartWrite('daily_metrics', `${date}_${type}`, 'delete'),

  getMonthlyStats: async () => smartRead<MonthlyStats>('farm_monthly_stats', [], 'monthKey'),
  saveMonthlyStats: async (stats: MonthlyStats) => smartWrite('farm_monthly_stats', stats, 'upsert'),

  clearAllData: async () => {
    localStorage.clear();
    window.location.reload();
  }
};
