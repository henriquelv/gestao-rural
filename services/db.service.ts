
import { Anomaly, Instruction, Notice, Improvement, FarmDoc, DailyMilk, MonthlyStats, Employee, FarmSettings, UIConfig, UIBlock, DailyMetric, Sector } from '../types';
import { supabase } from './supabase';
import { notify } from './notification.service';
import { localdb } from './localdb';
import { syncService } from './sync.service';
import { mediaService } from './media.service';
import { farmContextService } from './farm-context.service';

const isOnline = () => navigator.onLine;
const nowISO = () => new Date().toISOString();

const lastRefreshKey = (tableName: string) => `last_refresh_${tableName}`;
const REFRESH_SCOPE_KEY = 'last_refresh_scope_v2';

const getRefreshScope = () => {
  const projectUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || '';
  const farmId = farmContextService.getFarmId() || 'no_farm';
  return `${projectUrl}|${farmId}`;
};

const resetRefreshMarkersForScopeChange = () => {
  try {
    const scope = getRefreshScope();
    const previous = localStorage.getItem(REFRESH_SCOPE_KEY);
    if (previous === scope) return;

    Object.keys(localStorage)
      .filter((key) => key.startsWith('last_refresh_'))
      .forEach((key) => localStorage.removeItem(key));

    localStorage.setItem(REFRESH_SCOPE_KEY, scope);
    console.info('[Sync] Projeto/fazenda mudou; marcadores de refresh foram resetados para carga completa segura.');
  } catch {
    // Se localStorage falhar, o app segue com o comportamento anterior.
  }
};

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
const clearLastRefresh = (tableName: string) => {
  try {
    localStorage.removeItem(lastRefreshKey(tableName));
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
const farmScopedTables = new Set([
  'ui_config',
  'farm_settings',
  'settings',
  'sectors',
  'employees',
  'anomalies',
  'instructions',
  'notices',
  'improvements',
  'farm_docs',
  'milk_daily',
  'daily_metrics',
  'farm_monthly_stats'
]);

// Tabelas de configuração: aceitam registros globais (farm_id = null) como fallback.
// Tabelas de dados operacionais devem filtrar estritamente por farm_id.
const configOnlyTables = new Set(['ui_config', 'farm_settings', 'settings', 'sectors']);
const metadataTables = new Set([
  'anomalies',
  'instructions',
  'notices',
  'improvements',
  'farm_docs',
  'milk_daily',
  'daily_metrics',
  'farm_monthly_stats'
]);
const alwaysFreshTables = new Set(['employees']);
const smartReadHydratedKeys = new Set<string>();

const localRecordId = (tableName: string, row: any) => {
  const asString = (value: any) => value === undefined || value === null ? '' : String(value);
  if (tableName === 'ui_config' || tableName === 'farm_settings' || tableName === 'settings') {
    const id = row.id ?? '1';
    return row.farm_id ? `${row.farm_id}_${id}` : asString(id);
  }
  if (tableName === 'sectors') {
    const name = row.name ?? row.id;
    return row.farm_id ? `${row.farm_id}_${name}` : asString(name);
  }
  if (tableName === 'daily_metrics') {
    const fid = row.farm_id ? `${row.farm_id}_` : '';
    return asString(`${fid}${row.date}_${row.type}`);
  }
  if (tableName === 'milk_daily') {
    return row.farm_id ? `${row.farm_id}_${row.date}` : asString(row.id ?? row.date);
  }
  if (tableName === 'farm_monthly_stats') {
    return row.farm_id ? `${row.farm_id}_${row.monthKey}` : asString(row.id ?? row.monthKey);
  }
  return asString(row.id ?? row.date ?? row.name);
};

const filterByCurrentFarm = <T>(tableName: string, rows: T[]): T[] => {
  const currentFarmId = farmContextService.getFarmId();
  if (!currentFarmId || !farmScopedTables.has(tableName)) return rows;
  // Aceita registros sem farm_id (legado anterior à coluna) E da fazenda atual
  return rows.filter((row: any) => !row?.farm_id || row.farm_id === currentFarmId);
};

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

async function refreshFromServer(tableName: string): Promise<boolean> {
  if (!isOnline()) return false;

  resetRefreshMarkersForScopeChange();

  const last = getLastRefresh(tableName);
  const tsField = getTimestampFieldForTable(tableName);
  const currentFarmId = farmContextService.getFarmId();
  const makeBaseQuery = (includeFarmFilter = true) => {
    let q = supabase.from(tableName).select('*');
    if (includeFarmFilter && currentFarmId && farmScopedTables.has(tableName)) {
      q = q.eq('farm_id', currentFarmId);
    }
    return q;
  };

  const runQuery = async (): Promise<any[] | null> => {
    try {
      const baseQuery = makeBaseQuery(true);
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
  // Se falhou (ex: coluna farm_id nao existe no schema legado), tenta sem o filtro
  if (!data) {
    try {
      const { data: allData, error: allErr } = await makeBaseQuery(false);
      if (!allErr && allData) data = allData;
    } catch {
      // ignore
    }
  }

  if (!data) return false;

  data = data.map((d: any) => normalizeRemoteUrls(tableName, d));

  const records = data.map((d: any) => ({
    id: localRecordId(tableName, d),
    data: d,
    updated_at: nowISO(),
    synced: true
  }));

  // Detecção de conflito: se um registro local não sincronizado existe, ele
  // ganha do servidor nesta rodada. O outbox precisa preservar a alteração local.
  const recordsToPut: typeof records = [];
  let preservedLocalChanges = 0;
  try {
    const conflictTables = new Set(['daily_metrics', 'milk_daily', 'anomalies']);
    for (const record of records) {
      const raw = await localdb.getRawById(tableName, record.id);
      if (raw && raw.synced === false) {
        preservedLocalChanges++;
        if (conflictTables.has(tableName) && preservedLocalChanges === 1) {
          console.warn(`Conflito detectado em ${tableName}/${record.id}: dado local não sincronizado foi preservado.`);
          notify(`Atenção: dado de "${tableName === 'daily_metrics' ? 'métricas' : tableName === 'milk_daily' ? 'leite' : 'anomalia'}" foi atualizado por outro dispositivo.`, 'info');
        }
        continue;
      }
      recordsToPut.push(record);
    }
  } catch {
    // Não bloquear sync por erro na detecção de conflito.
    recordsToPut.push(...records);
  }

  if (recordsToPut.length > 0) {
    await localdb.bulkPut(tableName, recordsToPut);
  }

  // Ghost cleanup: para tabelas de full-fetch (sem tsField), remove localmente registros
  // já sincronizados que o servidor não retornou — indica deleção remota.
  // Só roda se o servidor retornou dados (evita wipe por falha silenciosa de query).
  // Nunca deleta registros synced=false (protege alterações locais pendentes).
  // ATENÇÃO: normaliza IDs removendo prefixo farm_id_ para evitar deleção indevida
  // quando servidor e local usam formatos de ID diferentes (legado vs migrado).
  if (!tsField && data.length > 0) {
    try {
      const businessKey = (id: string) => {
        const idx = id.indexOf('_');
        return idx > 0 ? id.substring(idx + 1) : id;
      };
      const serverKeys = new Set(records.map(r => businessKey(r.id)));
      const allLocal = filterByCurrentFarm(tableName, await localdb.getAll<any>(tableName));
      for (const row of allLocal) {
        const localId = localRecordId(tableName, row);
        if (!serverKeys.has(businessKey(localId))) {
          const raw = await localdb.getRawById(tableName, localId);
          if (raw?.synced === true) {
            await localdb.delete(tableName, localId);
            console.log(`[GhostCleanup] ${tableName}/${localId} removido (não existe no servidor)`);
          }
        }
      }
    } catch (e) {
      console.warn('[GhostCleanup] Erro ao limpar registros obsoletos:', e);
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
  return true;
}

async function smartRead<T>(tableName: string, fallbackData: T[], orderByField?: string): Promise<T[]> {
  try {
    const currentFarmId = farmContextService.getFarmId();
    const readLocal = async () => filterByCurrentFarm(tableName, await localdb.getAll<T>(tableName, orderByField));
    let localData = await readLocal();
    const hydrationKey = `${getRefreshScope()}|${tableName}`;

    // Na primeira leitura online por tabela nesta sessão, sincroniza com o servidor.
    // Se há dados locais: retorna imediatamente e atualiza em background (stale-while-revalidate).
    // Se cache está vazio: bloqueia até ter dados do servidor antes de renderizar.
    const needsServerSync =
      isOnline()
      && farmScopedTables.has(tableName)
      && !smartReadHydratedKeys.has(hydrationKey);

    if (needsServerSync) {
      smartReadHydratedKeys.add(hydrationKey); // marca antes do async para evitar dupla chamada
      clearLastRefresh(tableName);
      if (localData.length === 0 || alwaysFreshTables.has(tableName)) {
        // Sem cache, ou tabela pequena/crítica como funcionários: espera servidor
        // para não renderizar lista antiga quando outro aparelho cadastrou alguém.
        await refreshFromServer(tableName);
        localData = await readLocal();
      } else {
        // Cache existe: retorna dados locais imediatamente, atualiza em background.
        // O subscriber das telas é notificado via notifyChange quando o bulkPut completar.
        void refreshFromServer(tableName).catch(e => console.error(`[smartRead] bg refresh ${tableName}:`, e));
      }
    }

    if (localData.length === 0) {
      if (isOnline()) {
        let q = supabase.from(tableName).select('*');
        if (currentFarmId && farmScopedTables.has(tableName)) {
          q = q.eq('farm_id', currentFarmId);
        }
        let { data, error } = await q;
        // Fallback: se coluna farm_id nao existe no schema, tenta sem filtro
        if ((error || !data || data.length === 0) && currentFarmId && farmScopedTables.has(tableName)) {
          const fb = await supabase.from(tableName).select('*');
          if (!fb.error && fb.data) { data = fb.data; error = null; }
        }
        if (!error && data && data.length > 0) {
          const records = data.map((d: any) => ({
            id: localRecordId(tableName, d),
            data: d,
            updated_at: nowISO(),
            synced: true
          }));
          await localdb.bulkPut(tableName, records);
        } else if (fallbackData.length > 0) {
          const seeds = (fallbackData as any[]).map((d: any) => ({
            id: localRecordId(tableName, d),
            data: d,
            updated_at: nowISO(),
            synced: true
          }));
          await localdb.bulkPut(tableName, seeds);
        }
      } else if (fallbackData.length > 0) {
        const seeds = (fallbackData as any[]).map((d: any) => ({
          id: localRecordId(tableName, d),
          data: d,
          updated_at: nowISO(),
          synced: false
        }));
        await localdb.bulkPut(tableName, seeds);
      }
      localData = await readLocal();
    }

    return localData;
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
  const currentFarmId = farmContextService.getFarmId();
  const currentContext = farmContextService.getContext();
  const scopedData = op === 'delete' || !data || !farmScopedTables.has(tableName)
    ? data
    : {
        ...data,
        farm_id: data.farm_id || currentFarmId || undefined,
        ...(metadataTables.has(tableName)
          ? {
              employee_id: data.employee_id
                ? String(data.employee_id)
                : (currentContext?.employee_id ? String(currentContext.employee_id) : undefined),
              employee_name: data.employee_name || currentContext?.employee_name || undefined,
              device_id: data.device_id || currentContext?.device_id || undefined
            }
          : {})
      };

  const id = op === 'delete' ? (localId ?? data) : localId ?? localRecordId(tableName, scopedData);

  if (!id) {
    throw new Error(`Operação ${op} sem id em ${tableName}`);
  }

  const record = { id, data: op === 'delete' ? null : scopedData, updated_at: nowISO(), synced: false, mediaTotalBytes: 0 };

  if (op === 'delete') await localdb.delete(tableName, id);
  else await localdb.put(tableName, record);

  await localdb.addToOutbox({ tableName, op, payload: scopedData, created_at: nowISO(), status: 'pending' });

  notify(isOnline() ? 'Salvando...' : 'Salvo offline.', 'info');

  if (isOnline()) {
    syncService.syncAll();
  }
}

// Migração: Converter "Raspagem" para "Conforto" (idempotente — roda apenas uma vez)
async function migrateRaspagemToConforto() {
  const FLAG = 'migration_raspagem_to_conforto_v1';
  try { if (localStorage.getItem(FLAG)) return; } catch { /* ignore */ }

  try {
    const anomalies = await localdb.getAll<any>('anomalies');
    const toMigrate = anomalies.filter(a => a.sector === 'Raspagem');

    if (toMigrate.length > 0) {
      console.log(`Migrando ${toMigrate.length} anomalias: Raspagem → Conforto`);
      const now = nowISO();
      const wrapped = toMigrate.map(a => ({
        id: a.id,
        data: { ...a, sector: 'Conforto' },
        updated_at: now,
        synced: false
      }));

      await localdb.bulkPut('anomalies', wrapped);
      for (const rec of wrapped) {
        await localdb.addToOutbox({ tableName: 'anomalies', op: 'upsert', payload: rec.data, created_at: now, status: 'pending' });
      }
      console.log(`✅ ${toMigrate.length} anomalias migradas`);
      notify('Anomalias atualizadas (Raspagem → Conforto)', 'success');
    }
    try { localStorage.setItem(FLAG, 'true'); } catch { /* ignore */ }
  } catch (e) {
    console.error('Erro na migração:', e);
  }
}

// Recupera registros órfãos: synced=false sem entrada correspondente no outbox.
// Ocorre quando o app trava entre a escrita local e a escrita no outbox.
// Os registros ficam visíveis localmente mas nunca sobem pro servidor.
async function recoverOrphanedRecords(): Promise<void> {
  const tables = ['anomalies', 'instructions', 'notices', 'improvements', 'farm_docs',
    'daily_metrics', 'milk_daily', 'employees'];
  try {
    const pending = await localdb.getPendingOutbox();
    const outboxKeys = new Set(pending.map(item => {
      const p = item.payload;
      if (!p) return '';
      const fid = (typeof p === 'object' && p.farm_id) ? `${p.farm_id}_` : '';
      let id: string;
      if (item.tableName === 'daily_metrics' && p.date && p.type) id = `${fid}${p.date}_${p.type}`;
      else if (item.tableName === 'milk_daily' && p.date) id = `${fid}${p.date}`;
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

const isRemoteHttpUrl = (value?: string): boolean => {
  const v = value || '';
  return v.startsWith('http://') || v.startsWith('https://');
};

// Pre-cache de mídia remota: baixa em background todas as mídias que vieram
// de outros dispositivos para que fiquem disponíveis offline.
async function preCacheAllMedia(): Promise<void> {
  if (!isOnline()) return;
  const tablesWithMedia = ['anomalies', 'instructions', 'notices', 'improvements', 'farm_docs'];
  let cached = 0;
  let skipped = 0;
  const startedAt = Date.now();
  const maxRuntimeMs = 45000;
  const maxCachedPerRun = 40;

  for (const tableName of tablesWithMedia) {
    try {
      const records = await localdb.getAll<any>(tableName);
      for (const record of records) {
        const items: any[] = tableName === 'farm_docs'
          ? (record.media ? [record.media] : [])
          : (Array.isArray(record.media) ? record.media : []);

        for (const m of items) {
          if (!isOnline()) return; // parar se caiu a internet
          if (Date.now() - startedAt > maxRuntimeMs || cached >= maxCachedPerRun) {
            if (cached > 0) {
              console.log(`[MediaCache] Pausado após ${cached} mídia(s); continuará em outra rodada.`);
            }
            return;
          }
          if (!m || (!m.remotePath && !m.remoteUrl && !isRemoteHttpUrl(m.uri))) continue;
          if (mediaService.isOfflineCached(m)) { skipped++; continue; }

          const ok = await mediaService.cacheRemoteItem(m);
          if (ok) cached++;
        }
      }
    } catch (e) {
      console.error(`[MediaCache] Erro ao cachear ${tableName}:`, e);
    }
  }

  if (cached > 0) {
    console.log(`[MediaCache] ${cached} mídias cacheadas, ${skipped} já existiam`);
    notify(`${cached} mídia(s) salva(s) para uso offline.`, 'info');
  }
}

// Migração one-time: re-keying de registros milk_daily e daily_metrics do formato
// antigo (só date) para o novo formato (${farm_id}_${date}) no banco local.
// Necessário para dispositivos que já têm dados no formato anterior.
async function migrateLocalIds(): Promise<void> {
  const FLAG = 'local_id_migration_farm_prefix_v1';
  const CONTEXT_FLAG = 'local_context_repair_farm_prefix_v2';

  try {
    const ctx = farmContextService.getContext();
    const farmId = ctx?.farm_id;
    if (!farmId || ctx?.is_owner) return;

    const now = nowISO();
    let milkMigrated = 0;
    let metricsMigrated = 0;

    try {
      if (!localStorage.getItem(FLAG)) {
        const milkData = await localdb.getAll<any>('milk_daily');
        for (const row of milkData) {
          if (!row.farm_id || !row.date) continue;
          const oldId = row.date;
          const newId = `${row.farm_id}_${row.date}`;
          if (oldId === newId) continue;
          const existing = await localdb.getRawById('milk_daily', oldId);
          if (!existing) continue;
          await localdb.put('milk_daily', { id: newId, data: row, updated_at: now, synced: existing.synced });
          await localdb.delete('milk_daily', oldId);
          milkMigrated++;
        }

        const metricsData = await localdb.getAll<any>('daily_metrics');
        for (const row of metricsData) {
          if (!row.farm_id || !row.date || !row.type) continue;
          const oldId = `${row.date}_${row.type}`;
          const newId = `${row.farm_id}_${row.date}_${row.type}`;
          if (oldId === newId) continue;
          const existing = await localdb.getRawById('daily_metrics', oldId);
          if (!existing) continue;
          await localdb.put('daily_metrics', { id: newId, data: row, updated_at: now, synced: existing.synced });
          await localdb.delete('daily_metrics', oldId);
          metricsMigrated++;
        }

        if (milkMigrated > 0 || metricsMigrated > 0) {
          console.log(`[MigrateLocalIds] ${milkMigrated} milk_daily + ${metricsMigrated} daily_metrics re-keyed.`);
        }
        localStorage.setItem(FLAG, 'true');
      }
    } catch {
      // localStorage pode falhar; a migração segue melhor-esforço.
    }

    try {
      if (localStorage.getItem(CONTEXT_FLAG)) return;
    } catch {
      // ignore
    }

    const legacyTables = [
      'employees',
      'anomalies',
      'instructions',
      'notices',
      'improvements',
      'farm_docs',
      'milk_daily',
      'daily_metrics',
      'farm_monthly_stats'
    ];
    let repaired = 0;

    for (const tableName of legacyTables) {
      const rows = await localdb.getAll<any>(tableName);
      for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const needsFarm = !row.farm_id;
        const needsEmployee = metadataTables.has(tableName) && !row.employee_id && !!ctx.employee_id;
        const needsEmployeeName = metadataTables.has(tableName) && !row.employee_name && !!ctx.employee_name;
        const needsDevice = metadataTables.has(tableName) && !row.device_id && !!ctx.device_id;
        if (!needsFarm && !needsEmployee && !needsEmployeeName && !needsDevice) continue;

        const oldId = localRecordId(tableName, row);
        const raw = await localdb.getRawById(tableName, oldId);
        const next = {
          ...row,
          farm_id: row.farm_id || farmId,
          ...(metadataTables.has(tableName)
            ? {
                employee_id: row.employee_id || (ctx.employee_id ? String(ctx.employee_id) : undefined),
                employee_name: row.employee_name || ctx.employee_name || undefined,
                device_id: row.device_id || ctx.device_id || undefined
              }
            : {})
        };
        const newId = localRecordId(tableName, next);
        await localdb.put(tableName, {
          id: newId,
          data: next,
          updated_at: now,
          synced: raw?.synced ?? false
        });
        if (oldId && oldId !== newId) {
          await localdb.delete(tableName, oldId);
        }
        repaired++;
      }
    }

    if (repaired > 0) {
      console.log(`[MigrateLocalIds] ${repaired} registro(s) locais antigos receberam contexto da fazenda.`);
      notify(`${repaired} registro(s) locais antigos preparados para sincronizar.`, 'info');
    }
    try { localStorage.setItem(CONTEXT_FLAG, 'true'); } catch { /* ignore */ }
  } catch (e) {
    console.error('[MigrateLocalIds] Erro:', e);
  }
}

export const db = {
  syncPendingData: () => syncService.syncAll(),
  migrateRaspagemToConforto,
  migrateLocalIds,
  recoverOrphanedRecords,
  preCacheAllMedia,

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
      await localdb.retryAllOutboxErrors();
      notify('Erros marcados para nova tentativa.', 'info');
    } catch (e) {
      console.error('Erro ao reativar erros do outbox:', e);
    }
  },

  refreshFromServer: async () => {
    try {
      if (!isOnline()) return;
      const tables = [
        'ui_config', 'sectors', 'employees',
        'anomalies', 'instructions', 'notices', 'improvements', 'farm_docs',
        'milk_daily', 'daily_metrics', 'farm_monthly_stats'
      ];
      const scope = getRefreshScope();
      const results = await Promise.allSettled(
        tables.map(async (t) => {
          const ok = await refreshFromServer(t);
          if (ok) smartReadHydratedKeys.add(`${scope}|${t}`);
        })
      );
      for (const r of results) {
        if (r.status === 'rejected') console.error('[refreshFromServer] tabela falhou:', r.reason);
      }
    } catch (e) {
      console.error('Erro ao atualizar do servidor:', e);
    }
  },

  forceRefreshTable: async (tableName: string) => {
    try {
      if (!isOnline()) return;
      clearLastRefresh(tableName);
      const ok = await refreshFromServer(tableName);
      if (ok) smartReadHydratedKeys.add(`${getRefreshScope()}|${tableName}`);
    } catch (e) {
      console.error(`Erro ao forcar refresh de ${tableName}:`, e);
    }
  },

  forceFullRefreshFromServer: async () => {
    try {
      if (!isOnline()) return;
      const tables = [
        'ui_config', 'sectors', 'employees',
        'anomalies', 'instructions', 'notices', 'improvements', 'farm_docs',
        'milk_daily', 'daily_metrics', 'farm_monthly_stats'
      ];
      tables.forEach(clearLastRefresh);
      const scope = getRefreshScope();
      const results = await Promise.allSettled(
        tables.map(async (t) => {
          const ok = await refreshFromServer(t);
          if (ok) smartReadHydratedKeys.add(`${scope}|${t}`);
        })
      );
      for (const r of results) {
        if (r.status === 'rejected') console.error('[forceFullRefreshFromServer] tabela falhou:', r.reason);
      }
    } catch (e) {
      console.error('Erro ao forcar carga completa do servidor:', e);
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
    const currentFarmId = farmContextService.getFarmId();
    const localSettingsId = currentFarmId ? `${currentFarmId}_1` : '1';
    const localSettings = await localdb.getById<FarmSettings>('settings', localSettingsId);
    if (localSettings) return localSettings;
    if (localSettingsId !== '1') {
      const legacyLocalSettings = await localdb.getById<FarmSettings>('settings', '1');
      if (legacyLocalSettings) return legacyLocalSettings;
    }
    // Compatibilidade: o SQL historico cria farm_settings, enquanto versoes do app
    // usam settings. Nao renomeamos tabelas; tentamos ler farm_settings.data se existir.
    if (isOnline()) {
      try {
        let q = supabase.from('farm_settings').select('*').limit(1);
        if (currentFarmId) q = q.or(`farm_id.eq.${currentFarmId},farm_id.is.null`);
        const { data, error } = await q;
        const raw = !error && data?.[0]?.data ? data[0].data : null;
        if (raw && typeof raw === 'object') return { ...MOCK_SETTINGS, ...raw };
      } catch {
        // ignore
      }
    }
    return MOCK_SETTINGS;
  },
  saveSettings: async (s: FarmSettings) => {
    const farmId = farmContextService.getFarmId();
    return smartWrite('settings', { id: '1', ...s }, 'upsert', 'id', farmId ? `${farmId}_1` : '1');
  },

  getUIConfig: async (): Promise<UIConfig> => {
    const res = await smartRead<UIConfig>('ui_config', [DEFAULT_UI_CONFIG], '');
    const current = res[0] || DEFAULT_UI_CONFIG;

    // Adicionar apenas botões novos (não substituir customizações do usuário)
    const currentIds = new Set(current.buttons.map(b => b.id));
    const missingButtons = DEFAULT_UI_CONFIG.buttons.filter(b => !currentIds.has(b.id));

    if (missingButtons.length > 0) {
      const merged: UIConfig = {
        ...current,
        buttons: [...current.buttons, ...missingButtons]
      };
      await db.saveUIConfig(merged);
      return merged;
    }

    return current;
  },
  saveUIConfig: async (c: UIConfig) => {
    const farmId = farmContextService.getFarmId();
    return smartWrite('ui_config', { id: '1', ...c }, 'upsert', 'id', farmId ? `${farmId}_1` : '1');
  },

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
  removeSector: async (name: string) => {
    const farmId = farmContextService.getFarmId();
    const localId = farmId ? `${farmId}_${name}` : name;
    return smartWrite('sectors', name, 'delete', 'id', localId);
  },
  renameSector: async (oldName: string, newName: string) => {
    try {
      // Atualizar o setor
      await smartWrite('sectors', { id: newName, name: newName }, 'upsert');
      // Remover o setor antigo se for diferente
      if (oldName !== newName) {
        const farmId = farmContextService.getFarmId();
        await smartWrite('sectors', oldName, 'delete', 'id', farmId ? `${farmId}_${oldName}` : oldName);
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
  addAnomaly: async (a: Anomaly) => smartWrite('anomalies', a, 'upsert'),
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
  addMilkEntry: async (entry: DailyMilk) => {
    const farmId = farmContextService.getFarmId();
    const localId = farmId ? `${farmId}_${entry.date}` : entry.date;
    return smartWrite('milk_daily', entry, 'upsert', 'date', localId);
  },
  updateMilkEntry: async (entry: DailyMilk) => {
    const farmId = farmContextService.getFarmId();
    const localId = farmId ? `${farmId}_${entry.date}` : entry.date;
    return smartWrite('milk_daily', entry, 'upsert', 'date', localId);
  },
  deleteMilkEntry: async (date: string) => {
    const farmId = farmContextService.getFarmId();
    const localId = farmId ? `${farmId}_${date}` : date;
    await localdb.delete('milk_daily', localId);
    await localdb.addToOutbox({ tableName: 'milk_daily', op: 'delete', payload: date, created_at: nowISO(), status: 'pending' });
    notify(isOnline() ? 'Salvando...' : 'Salvo offline.', 'info');
    if (isOnline()) syncService.syncAll();
  },

  getDailyMetrics: async (type: string) => {
    const all = await smartRead<DailyMetric>('daily_metrics', [], 'date');
    return all.filter((x: any) => x.type === type);
  },
  addDailyMetric: async (entry: DailyMetric) => {
    const farmId = farmContextService.getFarmId();
    const localId = farmId ? `${farmId}_${entry.date}_${entry.type}` : `${entry.date}_${entry.type}`;
    return smartWrite('daily_metrics', entry, 'upsert', 'date', localId);
  },
  updateDailyMetric: async (entry: DailyMetric) => {
    const farmId = farmContextService.getFarmId();
    const localId = farmId ? `${farmId}_${entry.date}_${entry.type}` : `${entry.date}_${entry.type}`;
    return smartWrite('daily_metrics', entry, 'upsert', 'date', localId);
  },
  deleteDailyMetric: async (date: string, type: string) => {
    const farmId = farmContextService.getFarmId();
    const localId = farmId ? `${farmId}_${date}_${type}` : `${date}_${type}`;
    await localdb.delete('daily_metrics', localId);
    await localdb.addToOutbox({ tableName: 'daily_metrics', op: 'delete', payload: `${date}_${type}`, created_at: nowISO(), status: 'pending' });
    notify(isOnline() ? 'Salvando...' : 'Salvo offline.', 'info');
    if (isOnline()) syncService.syncAll();
  },

  getMonthlyStats: async () => smartRead<MonthlyStats>('farm_monthly_stats', [], 'monthKey'),
  saveMonthlyStats: async (stats: MonthlyStats) => {
    const farmId = farmContextService.getFarmId();
    const localId = farmId ? `${farmId}_${stats.monthKey}` : stats.monthKey;
    return smartWrite('farm_monthly_stats', stats, 'upsert', 'monthKey', localId);
  },

  clearAllData: async () => {
    localStorage.clear();
    window.location.reload();
  }
};
