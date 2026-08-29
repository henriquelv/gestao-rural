
import { Anomaly, Instruction, Notice, Improvement, FarmDoc, DailyMilk, MonthlyStats, Employee, FarmSettings, UIConfig, UIBlock, DailyMetric, Sector } from '../types';
import { supabase } from './supabase';
import { notify } from './notification.service';
import { localdb } from './localdb';
import { syncService } from './sync.service';
import { mediaService } from './media.service';
import { farmContextService } from './farm-context.service';
import { normalizeAnomalies, normalizeAnomaly } from '../utils/anomaly-normalize';
import { getAnomalyDateParts } from '../utils/anomaly-months';
import {
  normalizeDailyMetric,
  normalizeDailyMilk,
  normalizeEmployees,
  normalizeFarmDoc,
  normalizeImprovement,
  normalizeInstruction,
  normalizeMonthlyStats,
  normalizeNotice,
  normalizeUIConfig
} from '../utils/record-normalize';
import { getLocalRecordId, getProtectedLocalRecordIds } from '../utils/local-record-id';
import { getMaxRefreshCursor, getServerOrderFields, ORPHAN_RECOVERY_TABLES } from '../utils/sync-table-config';

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
  if (['anomalies', 'instructions', 'notices', 'improvements', 'farm_docs'].includes(tableName)) return 'updated_at';
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
const smartReadHydratedKeys = new Set<string>();
const refreshInFlight = new Map<string, Promise<boolean>>();
const legacyTimestampFields = new Map<string, string>();
const legacyFullRefreshAt = new Map<string, number>();
const LEGACY_FULL_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

const getLegacyTimestampField = (tableName: string): string | null => {
  if (tableName === 'farm_docs') return 'updatedAt';
  if (['anomalies', 'instructions', 'notices', 'improvements'].includes(tableName)) return 'createdAt';
  return null;
};

const localRecordId = getLocalRecordId;

const filterByCurrentFarm = <T>(tableName: string, rows: T[]): T[] => {
  const currentFarmId = farmContextService.getFarmId();
  if (!farmScopedTables.has(tableName)) return rows;
  if (!currentFarmId) return configOnlyTables.has(tableName) ? rows : [];
  if (configOnlyTables.has(tableName)) {
    const matching = rows.filter((row: any) => row?.farm_id === currentFarmId);
    const global = rows.filter((row: any) => !row?.farm_id);
    return [...matching, ...global];
  }
  return rows.filter((row: any) => row?.farm_id === currentFarmId);
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
      if (m?.remotePath) {
        const remoteUrl = getCachedPublicUrl(m.remotePath);
        return remoteUrl ? { ...row, media: { ...m, remoteUrl } } : row;
      }
      return row;
    }

    const arr = Array.isArray(row?.media) ? row.media : [];
    if (arr.length === 0) return { ...row, media: [] };
    const next = arr.map((m: any) => {
      if (m?.remotePath) {
        const remoteUrl = getCachedPublicUrl(m.remotePath);
        return remoteUrl ? { ...m, remoteUrl } : m;
      }
      return m;
    });
    return { ...row, media: next };
  } catch {
    return row;
  }
};

const normalizeTableRow = (tableName: string, row: unknown): any | null => {
  const withMediaUrl = normalizeRemoteUrls(tableName, row);
  if (tableName === 'anomalies') return normalizeAnomaly(withMediaUrl);
  if (tableName === 'instructions') return normalizeInstruction(withMediaUrl);
  if (tableName === 'notices') return normalizeNotice(withMediaUrl);
  if (tableName === 'improvements') return normalizeImprovement(withMediaUrl);
  if (tableName === 'farm_docs') return normalizeFarmDoc(withMediaUrl);
  if (tableName === 'milk_daily') return normalizeDailyMilk(withMediaUrl);
  if (tableName === 'daily_metrics') return normalizeDailyMetric(withMediaUrl);
  if (tableName === 'farm_monthly_stats') return normalizeMonthlyStats(withMediaUrl);
  return withMediaUrl && typeof withMediaUrl === 'object' ? withMediaUrl : null;
};

export interface AnomalyAudit {
  farmId: string | null;
  serverTotal: number;
  localTotal: number;
  visibleTotal: number;
  invalidCreatedAt: number;
  withoutFarmId: number;
  differentFarmId: number;
  withoutMedia: number;
  nullMedia: number;
  invalidMedia: number;
  duplicateServerIds: number;
  unsyncedLocal: number;
  serverOnlyIds: number;
  localOnlyIds: number;
  serverByMonth: Record<string, number>;
  localByMonth: Record<string, number>;
  visibleByMonth: Record<string, number>;
}

const countAnomalyRows = (rows: any[], farmId: string | null) => {
  const byMonth: Record<string, number> = {};
  let invalidCreatedAt = 0;
  let withoutFarmId = 0;
  let differentFarmId = 0;
  let withoutMedia = 0;
  let nullMedia = 0;
  let invalidMedia = 0;

  for (const row of rows) {
    if (!getAnomalyDateParts(typeof row?.createdAt === 'string' ? row.createdAt : '')) {
      invalidCreatedAt++;
    } else {
      const parts = getAnomalyDateParts(row.createdAt);
      if (parts) {
        const key = `${parts.year}-${String(parts.monthIndex + 1).padStart(2, '0')}`;
        byMonth[key] = (byMonth[key] || 0) + 1;
      }
    }
    if (!row?.farm_id) withoutFarmId++;
    else if (farmId && row.farm_id !== farmId) differentFarmId++;
    if (row?.media === undefined) withoutMedia++;
    else if (row.media === null) nullMedia++;
    else if (!Array.isArray(row.media)) invalidMedia++;
  }

  return { byMonth, invalidCreatedAt, withoutFarmId, differentFarmId, withoutMedia, nullMedia, invalidMedia };
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

async function refreshFromServer(tableName: string): Promise<boolean> {
  const refreshKey = `${getRefreshScope()}|${tableName}`;
  const running = refreshInFlight.get(refreshKey);
  if (running) return running;

  const promise = refreshFromServerImpl(tableName);
  refreshInFlight.set(refreshKey, promise);
  try {
    return await promise;
  } finally {
    if (refreshInFlight.get(refreshKey) === promise) refreshInFlight.delete(refreshKey);
  }
}

async function forceRefreshFromServer(tableName: string): Promise<boolean> {
  const refreshKey = `${getRefreshScope()}|${tableName}`;
  const running = refreshInFlight.get(refreshKey);
  if (running) {
    try { await running; } catch { /* a carga completa abaixo fará a nova tentativa */ }
  }
  clearLastRefresh(tableName);
  return refreshFromServer(tableName);
}

async function refreshFromServerImpl(tableName: string): Promise<boolean> {
  if (!isOnline()) return false;

  resetRefreshMarkersForScopeChange();

  const desiredTimestampField = getTimestampFieldForTable(tableName);
  const legacyTimestampField = legacyTimestampFields.get(tableName) || null;
  const legacyRefreshKey = `${getRefreshScope()}|${tableName}`;
  const legacyFullRefreshDue = !!legacyTimestampField
    && Date.now() - (legacyFullRefreshAt.get(legacyRefreshKey) || 0) >= LEGACY_FULL_REFRESH_INTERVAL_MS;
  const last = legacyFullRefreshDue ? '' : getLastRefresh(tableName);
  const tsField = legacyTimestampField || desiredTimestampField;
  const currentFarmId = farmContextService.getFarmId();
  if (farmScopedTables.has(tableName) && !currentFarmId && !configOnlyTables.has(tableName)) return false;
  const makeBaseQuery = (includeFarmFilter = true) => {
    let q = supabase.from(tableName).select('*');
    if (includeFarmFilter && currentFarmId && farmScopedTables.has(tableName)) {
      q = q.eq('farm_id', currentFarmId);
    }
    return q;
  };
  const orderQuery = (query: any, fields: string[]) => fields.reduce(
    (ordered, field) => ordered.order(field as any, { ascending: true }),
    query
  );

  const fetchPages = async (queryFactory: () => any): Promise<any[] | null> => {
    const pageSize = 500;
    const allRows: any[] = [];
    for (let page = 0; ; page++) {
      const from = page * pageSize;
      const { data: pageData, error } = await (queryFactory()
        .range(from, from + pageSize - 1) as any);
      if (error || !pageData) {
        const detail = {
          tableName,
          code: error?.code,
          message: error?.message || 'Resposta sem dados',
          details: error?.details,
          hint: error?.hint
        };
        console.error(`[Refresh] Falha ao baixar ${tableName}:`, detail);
        syncService.log('Falha ao baixar tabela', detail);
        const message = String(error?.message || '').toLowerCase();
        const fallbackField = getLegacyTimestampField(tableName);
        if (fallbackField && error?.code === '42703' && message.includes('updated_at')) {
          legacyTimestampFields.set(tableName, fallbackField);
          console.warn(`[Refresh] ${tableName} ainda sem updated_at; usando ${fallbackField} com carga completa periódica.`);
        }
        return null;
      }
      allRows.push(...pageData);
      if (pageData.length < pageSize) break;
    }
    return allRows;
  };

  const runQuery = async (): Promise<any[] | null> => {
    try {
      if (last && tsField) {
        return fetchPages(() => orderQuery(
          makeBaseQuery(true).gte(tsField as any, last),
          getServerOrderFields(tableName, tsField)
        ));
      }
      if (tsField) {
        return fetchPages(() => orderQuery(
          makeBaseQuery(true),
          getServerOrderFields(tableName, tsField)
        ));
      }
      return fetchPages(() => orderQuery(makeBaseQuery(true), getServerOrderFields(tableName)));
    } catch (error) {
      syncService.log('Excecao ao baixar tabela', { tableName, message: error instanceof Error ? error.message : String(error) });
      return null;
    }
  };

  let data = await runQuery();
  // Compatibilidade explícita apenas para configurações em schemas sem farm_id.
  // Dados operacionais nunca fazem fallback sem escopo, nem quando retornam zero.
  if (!data && configOnlyTables.has(tableName)) {
      try {
        const { data: allData, error: allErr } = await makeBaseQuery(false);
        if (!allErr && allData) data = allData;
      } catch {
        // ignore
      }
    }

  // APKs podem chegar antes da migration de updated_at. Nesse caso fazemos
  // fetch completo ainda escopado à fazenda, sem mascarar outros erros.
  if (!data && desiredTimestampField) {
    try {
      const legacyData = await fetchPages(() => orderQuery(makeBaseQuery(true), getServerOrderFields(tableName)));
      if (legacyData) {
        data = legacyData;
        if (legacyTimestampFields.has(tableName)) legacyFullRefreshAt.set(legacyRefreshKey, Date.now());
      }
      else return false;
    } catch {
      return false;
    }
  }

  if (!data) return false;

  if (legacyTimestampField && !last) {
    legacyFullRefreshAt.set(legacyRefreshKey, Date.now());
  }

  data = data.map((d: any) => normalizeTableRow(tableName, d)).filter(Boolean);

  const records = data
    .map((d: any) => ({
      id: localRecordId(tableName, d),
      data: d,
      updated_at: nowISO(),
      synced: true
    }))
    .filter((record) => !!record.id);

  // Detecção de conflito: se um registro local não sincronizado existe, ele
  // ganha do servidor nesta rodada. O outbox precisa preservar a alteração local.
  const recordsToPut: typeof records = [];
  let preservedLocalChanges = 0;
  try {
    const conflictTables = new Set(['daily_metrics', 'milk_daily', 'anomalies']);
    const [unsyncedRecords, pendingOutbox, errorOutbox] = await Promise.all([
      localdb.getUnsyncedRawRecords(tableName),
      localdb.getPendingOutbox(),
      localdb.getOutboxErrors(10000)
    ]);
    // Uma exclusao local remove o registro antes de enviar o outbox. Enquanto o
    // DELETE estiver pendente/errado, nao deixe a carga remota ressuscita-lo.
    const protectedLocalIds = getProtectedLocalRecordIds(
      tableName,
      unsyncedRecords,
      [...pendingOutbox, ...errorOutbox]
    );

    for (const record of records) {
      if (protectedLocalIds.has(record.id)) {
        preservedLocalChanges++;
        if (conflictTables.has(tableName) && preservedLocalChanges === 1) {
          console.warn(`Conflito detectado em ${tableName}/${record.id}: dado local não sincronizado foi preservado.`);
          notify(`Atenção: dado de "${tableName === 'daily_metrics' ? 'métricas' : tableName === 'milk_daily' ? 'leite' : 'anomalia'}" foi atualizado por outro dispositivo.`, 'info');
        }
        continue;
      }
      recordsToPut.push(record);
    }
  } catch (error) {
    // Sem conhecer pendencias e exclusoes locais, nao aplique a resposta remota.
    // A proxima rodada tenta novamente sem sobrescrever nem ressuscitar registros.
    console.warn(`[Refresh] Nao foi possivel proteger alteracoes locais de ${tableName}.`, error);
    return false;
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
  if (!tsField && data.length > 0 && tableName !== 'anomalies') {
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
      // A tentativa de updated_at pode ter descoberto um schema legado durante
      // esta mesma execução. Nesse caso o cursor correto é createdAt/updatedAt.
      const effectiveTimestampField = legacyTimestampFields.get(tableName) || tsField;
      const maxTs = getMaxRefreshCursor(data, effectiveTimestampField);
      if (maxTs) setLastRefresh(tableName, maxTs);
      // Uma página vazia preserva o cursor anterior. Avançar para Date.now()
      // faria registros com data de negócio ficarem invisíveis.
    } else {
      setLastRefresh(tableName, nowISO());
    }
  } catch {
    // Falha ao calcular cursor não pode avançar o marcador nem perder registros.
  }
  return true;
}

async function smartRead<T>(tableName: string, fallbackData: T[], orderByField?: string): Promise<T[]> {
  try {
    const currentFarmId = farmContextService.getFarmId();
    const offlineAtStart = !isOnline();
    if (farmScopedTables.has(tableName) && !currentFarmId && !configOnlyTables.has(tableName)) return [];
    const readLocal = async () => filterByCurrentFarm(tableName, await localdb.getAll<T>(tableName, orderByField));
    let localData = await readLocal();
    let serverRefreshAttempted = false;
    const hydrationKey = `${getRefreshScope()}|${tableName}`;

    // Configuração visual precisa abrir mesmo em uma instalação sem cache e com
    // rede instável. Somente tabelas de configuração recebem este padrão local;
    // dados operacionais nunca são inventados.
    if (localData.length === 0 && fallbackData.length > 0 && configOnlyTables.has(tableName)) {
      const seeds = (fallbackData as any[]).map((d: any) => ({
        id: localRecordId(tableName, d),
        data: d,
        updated_at: nowISO(),
        synced: true
      }));
      await localdb.bulkPut(tableName, seeds);
      localData = await readLocal();
    }

    // Na primeira leitura online por tabela nesta sessão, sincroniza com o servidor.
    // Se há dados locais: retorna imediatamente e atualiza em background (stale-while-revalidate).
    // Se cache está vazio: bloqueia até ter dados do servidor antes de renderizar.
    const needsServerSync =
      isOnline()
      && farmScopedTables.has(tableName)
      && !smartReadHydratedKeys.has(hydrationKey);

    if (needsServerSync) {
      clearLastRefresh(tableName);
      if (localData.length === 0) {
        // Sem cache: bloqueia e espera servidor para não renderizar vazio
        serverRefreshAttempted = true;
        const refreshed = await refreshFromServer(tableName);
        if (refreshed) smartReadHydratedKeys.add(hydrationKey);
        localData = await readLocal();
      } else {
        // Cache existe: retorna dados locais imediatamente, atualiza em background.
        // O subscriber das telas é notificado via notifyChange quando o bulkPut completar.
        void refreshFromServer(tableName)
          .then((refreshed) => {
            if (refreshed) smartReadHydratedKeys.add(hydrationKey);
          })
          .catch(e => console.error(`[smartRead] bg refresh ${tableName}:`, e));
      }
    }

    if (localData.length === 0) {
      if (isOnline()) {
        // Toda leitura remota passa pela mesma paginação e proteção de conflitos.
        // A consulta direta anterior era limitada pelo máximo padrão do Supabase
        // e poderia exibir apenas os primeiros 1.000 registros no cache vazio.
        if (!serverRefreshAttempted) {
          serverRefreshAttempted = true;
          const refreshed = await refreshFromServer(tableName);
          if (refreshed) smartReadHydratedKeys.add(hydrationKey);
        }
        localData = await readLocal();
        if (localData.length === 0 && fallbackData.length > 0 && tableName !== 'employees') {
          const seeds = (fallbackData as any[]).map((d: any) => ({
            id: localRecordId(tableName, d),
            data: d,
            updated_at: nowISO(),
            synced: true
          }));
          await localdb.bulkPut(tableName, seeds);
        }
      } else if (fallbackData.length > 0 && tableName !== 'employees') {
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

    const result = localData.length === 0 && offlineAtStart ? fallbackData : localData;
    return result.map((row) => normalizeRemoteUrls(tableName, row)) as T[];
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
  if (farmScopedTables.has(tableName) && !currentFarmId) {
    throw new Error('Contexto da fazenda ausente. Reative o aplicativo antes de salvar.');
  }
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
  const safeData = tableName === 'anomalies'
    ? (normalizeAnomaly(scopedData) || scopedData)
    : tableName === 'instructions'
      ? (normalizeInstruction(scopedData) || scopedData)
      : tableName === 'notices'
        ? (normalizeNotice(scopedData) || scopedData)
        : tableName === 'improvements'
          ? (normalizeImprovement(scopedData) || scopedData)
          : scopedData;

  const id = op === 'delete' ? (localId ?? data) : localId ?? localRecordId(tableName, safeData);
  const deletePayload = op !== 'delete' ? safeData : (() => {
    const farm_id = currentFarmId || undefined;
    const rawId = String(localId ?? data ?? '');
    if (tableName === 'milk_daily') {
      return { farm_id, date: rawId.replace(`${farm_id}_`, '') };
    }
    if (tableName === 'daily_metrics') {
      const identity = rawId.replace(`${farm_id}_`, '');
      const separator = identity.lastIndexOf('_');
      return { farm_id, date: identity.slice(0, separator), type: identity.slice(separator + 1) };
    }
    if (tableName === 'sectors') return { farm_id, id: rawId, name: String(data || rawId) };
    return { farm_id, id: rawId };
  })();

  if (!id) {
    throw new Error(`Operação ${op} sem id em ${tableName}`);
  }

  const record = { id, data: op === 'delete' ? null : safeData, updated_at: nowISO(), synced: false, mediaTotalBytes: 0 };

  const outboxItem = { tableName, op, payload: deletePayload, created_at: nowISO(), status: 'pending' };
  if (op === 'delete') await localdb.deleteWithOutbox(tableName, id, outboxItem);
  else await localdb.putWithOutbox(tableName, record, outboxItem);

  notify(isOnline() ? 'Salvando...' : 'Salvo offline.', 'info');

  if (isOnline()) {
    void syncService.syncAll().catch((error) => {
      console.error(`[smartWrite] Sync imediato de ${tableName} falhou; item mantido no outbox:`, error);
    });
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
  // Somente dados operacionais criados pelo usuário entram nesta recuperação.
  // Versões antigas também marcavam seeds de menu/setores/funcionários como
  // synced=false; reprocessá-los cria dezenas de pendências artificiais.
  try {
    const [pending, errors] = await Promise.all([
      localdb.getPendingOutbox(),
      localdb.getOutboxErrors(10000)
    ]);
    const activeOutbox = [...pending, ...errors];
    const outboxKeys = new Set(activeOutbox.map(item => {
      const p = item.op === 'delete'
        ? item.payload
        : syncService.repairPayloadContext(item.payload, item.tableName);
      if (!p) return '';
      const id = localRecordId(item.tableName, p);
      return `${item.tableName}:${id}`;
    }));

    let count = 0;
    for (const tableName of ORPHAN_RECOVERY_TABLES) {
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
async function preCacheAllMedia(): Promise<boolean> {
  if (!isOnline()) return false;
  const currentFarmId = farmContextService.getFarmId();
  if (!currentFarmId) return false;
  const tablesWithMedia = ['anomalies', 'instructions', 'notices', 'improvements', 'farm_docs'];
  let cached = 0;
  let skipped = 0;
  const startedAt = Date.now();
  const maxRuntimeMs = 45000;
  const maxCachedPerRun = 40;

  for (const tableName of tablesWithMedia) {
    try {
      const records = (await localdb.getAll<any>(tableName))
        .filter((record) => record?.farm_id === currentFarmId);
      for (const record of records) {
        const items: any[] = tableName === 'farm_docs'
          ? (record.media ? [record.media] : [])
          : (Array.isArray(record.media) ? record.media : []);

        for (const m of items) {
          if (!isOnline()) return false; // parar se caiu a internet
          if (Date.now() - startedAt > maxRuntimeMs || cached >= maxCachedPerRun) {
            if (cached > 0) {
              console.log(`[MediaCache] Pausado após ${cached} mídia(s); continuará em outra rodada.`);
            }
            return false;
          }
          if (!m || (!m.remotePath && !m.remoteUrl && !isRemoteHttpUrl(m.uri))) continue;
          // Fotos precisam estar sempre disponíveis offline. Arquivos grandes e
          // vídeos são cacheados sob demanda quando o usuário os abre.
          if (m.type !== 'photo') continue;
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
  return true;
}

// Migração one-time: re-keying de registros milk_daily e daily_metrics do formato
// antigo (só date) para o novo formato (${farm_id}_${date}) no banco local.
// Necessário para dispositivos que já têm dados no formato anterior.
async function migrateLocalIds(): Promise<void> {
  const FLAG = 'local_id_migration_farm_prefix_v1';
  const CONTEXT_FLAG = 'local_context_repair_farm_prefix_v3';

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
    let ambiguous = 0;

    for (const tableName of legacyTables) {
      const rows = await localdb.getAll<any>(tableName);
      for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const needsFarm = !row.farm_id;
        const oldId = localRecordId(tableName, row);
        const raw = await localdb.getRawById(tableName, oldId);
        // Somente dados locais ainda não enviados podem receber a fazenda atual
        // sem ambiguidade. Caches legados sincronizados ficam preservados e ocultos.
        if (needsFarm && raw?.synced !== false) {
          ambiguous++;
          continue;
        }
        const needsEmployee = metadataTables.has(tableName) && !row.employee_id && !!ctx.employee_id;
        const needsEmployeeName = metadataTables.has(tableName) && !row.employee_name && !!ctx.employee_name;
        const needsDevice = metadataTables.has(tableName) && !row.device_id && !!ctx.device_id;
        if (!needsFarm && !needsEmployee && !needsEmployeeName && !needsDevice) continue;

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
    if (ambiguous > 0) {
      console.warn(`[MigrateLocalIds] ${ambiguous} registro(s) sem farm_id permaneceram legados e ambíguos.`);
      try { localStorage.setItem('legacy_ambiguous_records_v1', String(ambiguous)); } catch { /* ignore */ }
    }
    try { localStorage.setItem(CONTEXT_FLAG, 'true'); } catch { /* ignore */ }
  } catch (e) {
    console.error('[MigrateLocalIds] Erro:', e);
  }
}

export const db = {
  getDefaultUIConfig: (): UIConfig => normalizeUIConfig(DEFAULT_UI_CONFIG, DEFAULT_UI_CONFIG),

  syncPendingData: () => syncService.syncAll(),
  migrateRaspagemToConforto,
  migrateLocalIds,
  recoverOrphanedRecords,
  preCacheAllMedia,

  getSyncStatus: async () => {
    try {
      const [summary, pending, errors] = await Promise.all([
        localdb.getOutboxSummary(),
        localdb.getPendingOutbox(),
        localdb.getOutboxErrors(25)
      ]);

      return {
        pendingCount: summary.pending,
        errorCount: summary.errors,
        pending,
        errors,
        lastError: summary.lastError
      };
    } catch (e) {
      console.error('Erro getSyncStatus:', e);
      const message = e instanceof Error ? e.message : String(e);
      return {
        pendingCount: 0,
        errorCount: 1,
        pending: [],
        errors: [{ id: 'localdb', tableName: 'banco_local', errorMessage: message, created_at: nowISO() }],
        lastError: { tableName: 'banco_local', errorMessage: message }
      };
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
    const tables = [
      'ui_config', 'sectors', 'employees',
      'anomalies', 'instructions', 'notices', 'improvements', 'farm_docs',
      'milk_daily', 'daily_metrics', 'farm_monthly_stats'
    ];
    const statuses: Record<string, boolean> = {};
    try {
      if (!isOnline()) return { ok: false, tables: statuses, error: 'offline' };
      const scope = getRefreshScope();
      const results = await Promise.all(
        tables.map(async (t) => {
          try {
            const ok = await refreshFromServer(t);
            statuses[t] = ok;
            if (ok) smartReadHydratedKeys.add(`${scope}|${t}`);
            return { status: 'fulfilled' as const, value: ok };
          } catch (reason) {
            return { status: 'rejected' as const, reason };
          }
        })
      );
      for (let index = 0; index < results.length; index++) {
        const settled = results[index];
        if (settled.status === 'rejected') {
          statuses[tables[index]] = false;
          console.error('[refreshFromServer] tabela falhou:', settled.reason);
        }
      }
      const critical = ['employees', 'anomalies', 'milk_daily', 'daily_metrics'];
      return { ok: critical.every((table) => statuses[table] === true), tables: statuses };
    } catch (e) {
      console.error('Erro ao atualizar do servidor:', e);
      return { ok: false, tables: statuses, error: e instanceof Error ? e.message : String(e) };
    }
  },

  forceRefreshTable: async (tableName: string) => {
    try {
      if (!isOnline()) return false;
      const ok = await forceRefreshFromServer(tableName);
      if (ok) smartReadHydratedKeys.add(`${getRefreshScope()}|${tableName}`);
      return ok;
    } catch (e) {
      console.error(`Erro ao forcar refresh de ${tableName}:`, e);
      return false;
    }
  },

  forceFullRefreshFromServer: async () => {
    const tables = [
      'ui_config', 'sectors', 'employees',
      'anomalies', 'instructions', 'notices', 'improvements', 'farm_docs',
      'milk_daily', 'daily_metrics', 'farm_monthly_stats'
    ];
    const criticalTables = new Set([
      'employees', 'anomalies', 'instructions', 'notices', 'improvements',
      'milk_daily', 'daily_metrics'
    ]);
    const result: { ok: boolean; tables: Record<string, { ok: boolean; count: number; error?: string }> } = {
      ok: false,
      tables: {}
    };
    try {
      if (!isOnline()) {
        for (const table of tables) result.tables[table] = { ok: false, count: 0, error: 'offline' };
        return result;
      }
      const scope = getRefreshScope();
      const results = await Promise.all(
        tables.map(async (t) => {
          try {
            const ok = await forceRefreshFromServer(t);
            if (ok) smartReadHydratedKeys.add(`${scope}|${t}`);
            result.tables[t] = { ok, count: ok ? await localdb.getAll<any>(t).then(rows => filterByCurrentFarm(t, rows).length) : 0, error: ok ? undefined : 'refresh failed' };
            return { status: 'fulfilled' as const, value: ok };
          } catch (reason) {
            return { status: 'rejected' as const, reason };
          }
        })
      );
      for (let index = 0; index < results.length; index++) {
        const settled = results[index];
        const table = tables[index];
        if (settled.status === 'rejected') {
          result.tables[table] = { ok: false, count: 0, error: String(settled.reason?.message || settled.reason) };
          console.error('[forceFullRefreshFromServer] tabela falhou:', settled.reason);
        }
      }
      result.ok = tables.every((table) => !criticalTables.has(table) || result.tables[table]?.ok === true);
      return result;
    } catch (e) {
      console.error('Erro ao forcar carga completa do servidor:', e);
      result.ok = false;
      return result;
    }
  },

  refreshDailyMetrics: async () => {
    if (!isOnline()) return false;
    return refreshFromServer('daily_metrics');
  },

  refreshMilkDaily: async () => {
    if (!isOnline()) return false;
    return refreshFromServer('milk_daily');
  },

  getSettings: async (): Promise<FarmSettings> => {
    const currentFarmId = farmContextService.getFarmId();
    // Configuração remota tem prioridade quando online para não manter stale
    // settings local indefinidamente; offline continua usando o cache local.
    if (isOnline()) {
      try {
        let q = supabase.from('farm_settings').select('*').limit(1);
        if (currentFarmId) q = q.eq('farm_id', currentFarmId);
        let { data, error } = await q;
        if ((!data || data.length === 0) && currentFarmId && !error) {
          const global = await supabase.from('farm_settings').select('*').is('farm_id', null).limit(1);
          data = global.data;
          error = global.error;
        }
        const raw = !error && data?.[0]?.data ? data[0].data : null;
        if (raw && typeof raw === 'object') return { ...MOCK_SETTINGS, ...raw };
      } catch {
        // Fallback local abaixo.
      }
    }

    const localSettingsId = currentFarmId ? `${currentFarmId}_1` : '1';
    const localSettings = await localdb.getById<FarmSettings>('settings', localSettingsId);
    if (localSettings) return localSettings;
    if (localSettingsId !== '1') {
      const legacyLocalSettings = await localdb.getById<FarmSettings>('settings', '1');
      if (legacyLocalSettings) return legacyLocalSettings;
    }
    return MOCK_SETTINGS;
  },
  saveSettings: async (s: FarmSettings) => {
    const farmId = farmContextService.getFarmId();
    return smartWrite('settings', { id: '1', ...s }, 'upsert', 'id', farmId ? `${farmId}_1` : '1');
  },

  getUIConfig: async (): Promise<UIConfig> => {
    try {
      const res = await smartRead<UIConfig>('ui_config', [DEFAULT_UI_CONFIG], '');
      const current = normalizeUIConfig(res[0], DEFAULT_UI_CONFIG);

      // Adicionar apenas botões novos (não substituir customizações do usuário)
      const currentIds = new Set(current.buttons.map(b => b.id));
      const missingButtons = DEFAULT_UI_CONFIG.buttons.filter(b => !currentIds.has(b.id));

      if (missingButtons.length > 0) {
        const merged: UIConfig = {
          ...current,
          buttons: [...current.buttons, ...missingButtons]
        };
        try {
          await db.saveUIConfig(merged);
        } catch (error) {
          console.warn('[UIConfig] Configuração reparada em memória; persistência ficará para nova tentativa.', error);
        }
        return merged;
      }

      return current;
    } catch (error) {
      console.error('[UIConfig] Falha ao carregar configuração; usando padrão seguro.', error);
      return normalizeUIConfig(DEFAULT_UI_CONFIG, DEFAULT_UI_CONFIG);
    }
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

  // Funcionários nunca usam lista fixa: o cache e o servidor são isolados pela fazenda ativa.
  getEmployees: async () => normalizeEmployees(await smartRead<Employee>('employees', [], '')),
  addEmployee: async (e: Employee) => smartWrite('employees', e, 'upsert'),
  updateEmployee: async (e: Employee) => smartWrite('employees', e, 'update'),
  removeEmployee: async (id: string) => {
    const employee = await localdb.getById<Employee>('employees', id);
    if (!employee) throw new Error('Funcionário não encontrado para desativação.');
    return smartWrite('employees', { ...employee, status: 'blocked' }, 'update');
  },

  migrateAnomalyShape: async () => {
    const FLAG = 'anomaly_shape_migration_v1';
    try {
      if (localStorage.getItem(FLAG)) return;
    } catch {
      // Continue if localStorage is unavailable; the operation is idempotent.
    }

    try {
      const rows = await localdb.getAll<any>('anomalies');
      for (const row of rows) {
        const normalized = normalizeAnomaly(row);
        if (!normalized) continue;
        const raw = await localdb.getRawById('anomalies', String(row.id));
        if (!raw) continue;
        await localdb.put('anomalies', {
          id: raw.id,
          data: normalized,
          updated_at: nowISO(),
          synced: raw.synced
        });
      }
      try { localStorage.setItem(FLAG, 'true'); } catch { /* ignore */ }
    } catch (error) {
      console.error('[AnomalyMigration] Erro ao normalizar registros locais:', error);
    }
  },
  getAnomalies: async () => {
    const rows = await smartRead<Anomaly>('anomalies', [], 'createdAt');
    return normalizeAnomalies(rows);
  },
  auditAnomalies: async (): Promise<AnomalyAudit> => {
    const farmId = farmContextService.getFarmId();
    const localRows = await localdb.getAll<any>('anomalies');
    const localScopedRows = farmId ? localRows.filter(row => row?.farm_id === farmId) : [];
    const visibleRows = normalizeAnomalies(localScopedRows);
    const unsyncedRows = await localdb.getUnsyncedRawRecords('anomalies');
    const localStats = countAnomalyRows(localScopedRows, farmId);
    const allLocalStats = countAnomalyRows(localRows, farmId);
    const visibleStats = countAnomalyRows(visibleRows, farmId);

    let serverRows: any[] = [];
    if (isOnline()) {
      for (let page = 0; ; page++) {
        const pageSize = 500;
        let query = supabase.from('anomalies').select('*').order('id', { ascending: true }).range(page * pageSize, (page + 1) * pageSize - 1);
        if (farmId) query = query.eq('farm_id', farmId);
        const { data, error } = await query;
        if (error || !data) break;
        serverRows.push(...data);
        if (data.length < pageSize) break;
      }
    }

    const serverStats = countAnomalyRows(serverRows, farmId);
    const serverIds = serverRows.map(row => String(row?.id || '')).filter(Boolean);
    const localIds = localScopedRows.map(row => String(row?.id || '')).filter(Boolean);
    const uniqueServerIds = new Set(serverIds);
    const localIdSet = new Set(localIds);
    const serverOnlyIds = serverIds.filter(id => !localIdSet.has(id)).length;
    const localOnlyIds = localIds.filter(id => !uniqueServerIds.has(id)).length;

    return {
      farmId,
      serverTotal: serverRows.length,
      localTotal: localScopedRows.length,
      visibleTotal: visibleRows.length,
      invalidCreatedAt: localStats.invalidCreatedAt,
      withoutFarmId: allLocalStats.withoutFarmId,
      differentFarmId: allLocalStats.differentFarmId,
      withoutMedia: localStats.withoutMedia,
      nullMedia: localStats.nullMedia,
      invalidMedia: localStats.invalidMedia,
      duplicateServerIds: serverIds.length - uniqueServerIds.size,
      unsyncedLocal: unsyncedRows.length,
      serverOnlyIds,
      localOnlyIds,
      serverByMonth: serverStats.byMonth,
      localByMonth: localStats.byMonth,
      visibleByMonth: visibleStats.byMonth
    };
  },
  addAnomaly: async (a: Anomaly) => smartWrite('anomalies', a, 'upsert'),
  updateAnomaly: async (a: Anomaly) => smartWrite('anomalies', a, 'update'),
  deleteAnomaly: async (id: string) => {
    return smartWrite('anomalies', id, 'delete');
  },
  getAnomalyById: async (id: string) => {
    const row = await localdb.getById<Anomaly>('anomalies', id);
    return normalizeAnomaly(normalizeRemoteUrls('anomalies', row));
  },

  getInstructions: async () => (await smartRead<Instruction>('instructions', [], 'createdAt')).map(normalizeInstruction).filter((item): item is Instruction => item !== null),
  addInstruction: async (i: Instruction) => smartWrite('instructions', i, 'upsert'),
  updateInstruction: async (i: Instruction) => smartWrite('instructions', i, 'update'),
  deleteInstruction: async (id: string) => {
    return smartWrite('instructions', id, 'delete');
  },
  getInstructionById: async (id: string) => normalizeInstruction(normalizeRemoteUrls('instructions', await localdb.getById<Instruction>('instructions', id))),

  getNotices: async () => (await smartRead<Notice>('notices', [], 'createdAt')).map(normalizeNotice).filter((item): item is Notice => item !== null),
  addNotice: async (n: Notice) => smartWrite('notices', n, 'upsert'),
  updateNotice: async (n: Notice) => smartWrite('notices', n, 'update'),
  deleteNotice: async (id: string) => {
    return smartWrite('notices', id, 'delete');
  },

  getImprovements: async () => (await smartRead<Improvement>('improvements', [], 'createdAt')).map(normalizeImprovement).filter((item): item is Improvement => item !== null),
  addImprovement: async (i: Improvement) => smartWrite('improvements', i, 'upsert'),
  updateImprovement: async (i: Improvement) => smartWrite('improvements', i, 'update'),
  deleteImprovement: async (id: string) => {
    return smartWrite('improvements', id, 'delete');
  },
  getImprovementById: async (id: string) => normalizeImprovement(normalizeRemoteUrls('improvements', await localdb.getById<Improvement>('improvements', id))),

  getFarmDocs: async () => (await smartRead<FarmDoc>('farm_docs', [], 'updatedAt')).map(normalizeFarmDoc).filter((item): item is FarmDoc => item !== null),
  getFarmDoc: async (id: string) => normalizeFarmDoc(normalizeRemoteUrls('farm_docs', await localdb.getById<FarmDoc>('farm_docs', id))),
  addFarmDoc: async (d: FarmDoc) => smartWrite('farm_docs', d, 'upsert'),
  saveFarmDoc: async (d: FarmDoc) => smartWrite('farm_docs', d, 'upsert'),
  updateFarmDoc: async (d: FarmDoc) => smartWrite('farm_docs', d, 'update'),
  deleteFarmDoc: async (id: string) => {
    return smartWrite('farm_docs', id, 'delete');
  },

  getMilkHistory: async () => (await smartRead<DailyMilk>('milk_daily', [], 'date')).map(normalizeDailyMilk).filter((item): item is DailyMilk => item !== null),
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
    await localdb.deleteWithOutbox('milk_daily', localId, {
      tableName: 'milk_daily', op: 'delete', payload: { farm_id: farmId, date }, created_at: nowISO(), status: 'pending'
    });
    notify(isOnline() ? 'Salvando...' : 'Salvo offline.', 'info');
    if (isOnline()) {
      void syncService.syncAll().catch((error) => {
        console.error('[deleteMilkEntry] Sync imediato falhou; item mantido no outbox:', error);
      });
    }
  },

  getDailyMetrics: async (type: string) => {
    const all = await smartRead<DailyMetric>('daily_metrics', [], 'date');
    return all.map(normalizeDailyMetric).filter((x): x is DailyMetric => x !== null && x.type === type);
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
    await localdb.deleteWithOutbox('daily_metrics', localId, {
      tableName: 'daily_metrics', op: 'delete', payload: { farm_id: farmId, date, type }, created_at: nowISO(), status: 'pending'
    });
    notify(isOnline() ? 'Salvando...' : 'Salvo offline.', 'info');
    if (isOnline()) {
      void syncService.syncAll().catch((error) => {
        console.error('[deleteDailyMetric] Sync imediato falhou; item mantido no outbox:', error);
      });
    }
  },

  getMonthlyStats: async () => (await smartRead<MonthlyStats>('farm_monthly_stats', [], 'monthKey')).map(normalizeMonthlyStats).filter((item): item is MonthlyStats => item !== null),
  saveMonthlyStats: async (stats: MonthlyStats) => {
    const farmId = farmContextService.getFarmId();
    const localId = farmId ? `${farmId}_${stats.monthKey}` : stats.monthKey;
    return smartWrite('farm_monthly_stats', stats, 'upsert', 'monthKey', localId);
  },

  clearPreferencesOnly: async () => {
    window.location.reload();
  }
};
