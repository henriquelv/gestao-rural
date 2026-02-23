 
import { Anomaly, Instruction, Notice, Improvement, FarmDoc, DailyMilk, MonthlyStats, Employee, FarmSettings, UIConfig, UIBlock, DailyMetric, Sector } from '../types';
import { supabase } from './supabase';
import { notify } from './notification.service';
import { localdb } from './localdb';
import { syncService } from './sync.service';

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
  }
};

const getTimestampFieldForTable = (tableName: string): string | null => {
  if (tableName === 'anomalies') return 'createdAt';
  if (tableName === 'instructions') return 'createdAt';
  if (tableName === 'notices') return 'createdAt';
  if (tableName === 'improvements') return 'createdAt';
  if (tableName === 'farm_docs') return 'updatedAt';
  if (tableName === 'milk_daily') return 'date';
  if (tableName === 'daily_metrics') return 'date';
  if (tableName === 'farm_monthly_stats') return 'monthKey';
  return null;
};

const MEDIA_BUCKET = 'media';
const tablesWithMedia = new Set(['anomalies', 'instructions', 'notices', 'improvements', 'farm_docs']);

const normalizeRemoteUrls = (tableName: string, row: any) => {
  try {
    if (!tablesWithMedia.has(tableName)) return row;

    // farm_docs has single media object
    if (tableName === 'farm_docs') {
      const m = row?.media;
      if (m && !m.remoteUrl && m.remotePath) {
        const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(m.remotePath);
        return { ...row, media: { ...m, remoteUrl: data?.publicUrl || m.remoteUrl } };
      }
      return row;
    }

    const arr = Array.isArray(row?.media) ? row.media : [];
    if (arr.length === 0) return row;
    const next = arr.map((m: any) => {
      if (m && !m.remoteUrl && m.remotePath) {
        const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(m.remotePath);
        return { ...m, remoteUrl: data?.publicUrl || m.remoteUrl };
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
  { id: 'i1', screen: 'instructions_menu', type: 'button', label: 'ADICIONAR INSTRUÇÃO', color: 'green', iconType: 'lucide', iconValue: 'plus', route: '/instructions/add', order: 1, visible: true },
  { id: 'i2', screen: 'instructions_menu', type: 'button', label: 'LISTA INSTRUÇÕES', color: 'blue', iconType: 'lucide', iconValue: 'list', route: '/instructions/list', order: 2, visible: true },
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
  { id: 'nm3', screen: 'norms_menu', type: 'button', label: 'LISTA DE NORMAS', color: 'blue', iconType: 'lucide', iconValue: 'list', route: '/norms/list', order: 3, visible: true }
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

  await localdb.bulkPut(tableName, records);

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

export const db = {
  syncPendingData: () => syncService.syncAll(),
  migrateRaspagemToConforto,

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
  addAnomaly: async (a: Anomaly) => smartWrite('anomalies', a, 'insert'),
  updateAnomaly: async (a: Anomaly) => smartWrite('anomalies', a, 'update'),
  deleteAnomaly: async (id: string) => smartWrite('anomalies', id, 'delete'),
  getAnomalyById: async (id: string) => await localdb.getById<Anomaly>('anomalies', id),

  getInstructions: async () => smartRead<Instruction>('instructions', [], 'createdAt'),
  addInstruction: async (i: Instruction) => smartWrite('instructions', i, 'insert'),
  updateInstruction: async (i: Instruction) => smartWrite('instructions', i, 'update'),
  deleteInstruction: async (id: string) => smartWrite('instructions', id, 'delete'),

  getNotices: async () => smartRead<Notice>('notices', [], 'createdAt'),
  addNotice: async (n: Notice) => smartWrite('notices', n, 'insert'),
  updateNotice: async (n: Notice) => smartWrite('notices', n, 'update'),
  deleteNotice: async (id: string) => smartWrite('notices', id, 'delete'),

  getImprovements: async () => smartRead<Improvement>('improvements', [], 'createdAt'),
  addImprovement: async (i: Improvement) => smartWrite('improvements', i, 'insert'),
  updateImprovement: async (i: Improvement) => smartWrite('improvements', i, 'update'),
  deleteImprovement: async (id: string) => smartWrite('improvements', id, 'delete'),

  getFarmDocs: async () => smartRead<FarmDoc>('farm_docs', [], 'updatedAt'),
  getFarmDoc: async (id: string) => await localdb.getById<FarmDoc>('farm_docs', id),
  addFarmDoc: async (d: FarmDoc) => smartWrite('farm_docs', d, 'upsert'),
  saveFarmDoc: async (d: FarmDoc) => smartWrite('farm_docs', d, 'upsert'),
  updateFarmDoc: async (d: FarmDoc) => smartWrite('farm_docs', d, 'update'),
  deleteFarmDoc: async (id: string) => smartWrite('farm_docs', id, 'delete'),

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
