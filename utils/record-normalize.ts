import {
  DailyMetric,
  DailyMilk,
  Employee,
  FarmDoc,
  Improvement,
  Instruction,
  MediaItem,
  MonthlyStats,
  Notice,
  UIBlock,
  UIConfig
} from '../types';
import { canonicalizeSector } from '../constants/sectors';
import { createId } from './id';

const MEDIA_TYPES = new Set<MediaItem['type']>(['photo', 'video', 'audio', 'pdf', 'doc', 'ppt']);

const optionalText = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text || undefined;
};

const metadata = (row: Record<string, unknown>) => ({
  farm_id: optionalText(row.farm_id),
  employee_id: optionalText(row.employee_id),
  employee_name: optionalText(row.employee_name),
  device_id: optionalText(row.device_id)
});

const stableLegacyMediaId = (row: Record<string, unknown>): string => {
  const source = optionalText(row.remotePath ?? row.remoteUrl ?? row.localPath ?? row.uri ?? row.name);
  if (!source) return createId();
  let hash = 2166136261;
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `legacy-${(hash >>> 0).toString(16)}`;
};

const inferMediaType = (row: Record<string, unknown>): MediaItem['type'] | null => {
  const rawType = optionalText(row.type)?.toLowerCase();
  const normalizedType = rawType === 'image' ? 'photo' : rawType;
  if (normalizedType && MEDIA_TYPES.has(normalizedType as MediaItem['type'])) {
    return normalizedType as MediaItem['type'];
  }

  const mime = optionalText(row.mimeType)?.toLowerCase() || '';
  const name = optionalText(row.name ?? row.remotePath ?? row.uri)?.toLowerCase() || '';
  if (mime.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic)$/i.test(name)) return 'photo';
  if (mime.startsWith('video/') || /\.(mp4|mov|webm|m4v)$/i.test(name)) return 'video';
  if (mime.startsWith('audio/') || /\.(mp3|wav|m4a|ogg)$/i.test(name)) return 'audio';
  if (mime.includes('pdf') || /\.pdf$/i.test(name)) return 'pdf';
  if (mime.includes('presentation') || /\.pptx?$/i.test(name)) return 'ppt';
  if (mime.includes('word') || /\.docx?$/i.test(name)) return 'doc';
  return null;
};

export function normalizeMediaItem(value: unknown): MediaItem | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const type = inferMediaType(row);
  if (!type) return null;
  return {
    ...row,
    id: optionalText(row.id) || stableLegacyMediaId(row),
    type,
    localPath: optionalText(row.localPath),
    remotePath: optionalText(row.remotePath),
    remoteUrl: optionalText(row.remoteUrl),
    uri: optionalText(row.uri),
    name: optionalText(row.name),
    mimeType: optionalText(row.mimeType),
    pendingUpload: row.pendingUpload === true
  } as MediaItem;
}

export function normalizeEmployee(value: unknown): Employee | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const id = String(row.id || '').trim();
  const name = String(row.name || row.employee_name || '').trim();
  if (!id || !name) return null;
  return {
    ...row,
    id,
    farm_id: optionalText(row.farm_id),
    name,
    role: String(row.role || row.cargo || 'Colaborador'),
    status: typeof row.status === 'string' ? row.status : 'active'
  } as Employee;
}

export function normalizeEmployees(value: unknown): Employee[] {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, Employee>();
  for (const item of value) {
    const employee = normalizeEmployee(item);
    if (employee) unique.set(employee.id, employee);
  }
  return Array.from(unique.values());
}

export function normalizeMediaItems(value: unknown): MediaItem[] {
  const values = Array.isArray(value) ? value : (value && typeof value === 'object' ? [value] : []);
  return values.map(normalizeMediaItem).filter((item): item is MediaItem => item !== null);
}

export function normalizeInstruction(value: unknown): Instruction | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const id = String(row.id || '');
  if (!id) return null;
  return {
    ...row,
    ...metadata(row),
    id,
    createdAt: optionalText(row.createdAt ?? row.created_at) || '',
    title: String(row.title || ''),
    sector: canonicalizeSector(row.sector),
    description: String(row.description || ''),
    media: normalizeMediaItems(row.media)
  } as Instruction;
}

export function normalizeNotice(value: unknown): Notice | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const id = String(row.id || '');
  if (!id) return null;
  return {
    ...row,
    ...metadata(row),
    id,
    createdAt: optionalText(row.createdAt ?? row.created_at) || '',
    responsible: String(row.responsible || row.employee_name || ''),
    content: String(row.content || ''),
    media: normalizeMediaItems(row.media)
  } as Notice;
}

export function normalizeImprovement(value: unknown): Improvement | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const id = String(row.id || '');
  if (!id) return null;
  return {
    ...row,
    ...metadata(row),
    id,
    createdAt: optionalText(row.createdAt ?? row.created_at) || '',
    employee: String(row.employee || row.employee_name || ''),
    sector: canonicalizeSector(row.sector),
    description: String(row.description || ''),
    media: normalizeMediaItems(row.media)
  } as Improvement;
}

export function normalizeFarmDoc(value: unknown): FarmDoc | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const id = optionalText(row.id);
  if (!id) return null;
  return {
    ...row,
    ...metadata(row),
    id,
    updatedAt: optionalText(row.updatedAt ?? row.updated_at) || '',
    title: String(row.title || ''),
    sector: canonicalizeSector(row.sector),
    responsible: String(row.responsible || row.employee_name || ''),
    media: normalizeMediaItem(Array.isArray(row.media) ? row.media[0] : row.media)
  } as FarmDoc;
}

export function normalizeDailyMilk(value: unknown): DailyMilk | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const date = optionalText(row.date);
  if (!date) return null;
  const liters = Number(row.liters);
  return {
    ...row,
    farm_id: optionalText(row.farm_id),
    date,
    liters: Number.isFinite(liters) ? liters : 0
  } as DailyMilk;
}

export function normalizeDailyMetric(value: unknown): DailyMetric | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const date = optionalText(row.date);
  const type = optionalText(row.type);
  if (!date || !type || !['lactation', 'discard', 'births'].includes(type)) return null;
  const metricValue = Number(row.value);
  return {
    ...row,
    farm_id: optionalText(row.farm_id),
    date,
    type,
    value: Number.isFinite(metricValue) ? metricValue : 0
  } as DailyMetric;
}

export function normalizeMonthlyStats(value: unknown): MonthlyStats | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const monthKey = optionalText(row.monthKey);
  if (!monthKey) return null;
  const numberOrZero = (input: unknown) => {
    const number = Number(input);
    return Number.isFinite(number) ? number : 0;
  };
  return {
    ...row,
    farm_id: optionalText(row.farm_id),
    monthKey,
    lactatingCows: numberOrZero(row.lactatingCows),
    discardedCows: numberOrZero(row.discardedCows),
    births: numberOrZero(row.births)
  } as MonthlyStats;
}

const normalizeUIBlock = (value: unknown, fallback?: UIBlock): UIBlock | null => {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const id = optionalText(row.id);
  if (!id) return null;
  const order = Number(row.order);
  const type = optionalText(row.type);
  const iconType = optionalText(row.iconType);
  return {
    ...(fallback || {}),
    ...row,
    id,
    screen: optionalText(row.screen) || fallback?.screen || 'home',
    type: (['button', 'header', 'text', 'card'].includes(type || '') ? type : fallback?.type || 'button') as UIBlock['type'],
    label: optionalText(row.label) || fallback?.label || 'Sem titulo',
    content: optionalText(row.content) || fallback?.content,
    color: (optionalText(row.color) || fallback?.color || 'blue') as UIBlock['color'],
    iconType: (iconType === 'custom' ? 'custom' : 'lucide'),
    iconValue: optionalText(row.iconValue) || fallback?.iconValue || 'alert',
    route: optionalText(row.route) || fallback?.route || '/',
    order: Number.isFinite(order) ? order : fallback?.order || 0,
    visible: typeof row.visible === 'boolean' ? row.visible : fallback?.visible !== false
  } as UIBlock;
};

export function normalizeUIConfig(value: unknown, fallback: UIConfig): UIConfig {
  if (!value || typeof value !== 'object') return fallback;
  const row = value as Record<string, unknown>;
  const fallbackById = new Map(fallback.buttons.map((button) => [button.id, button]));
  const buttons = Array.isArray(row.buttons)
    ? row.buttons
        .map((button) => {
          const id = button && typeof button === 'object' ? optionalText((button as Record<string, unknown>).id) : undefined;
          return normalizeUIBlock(button, id ? fallbackById.get(id) : undefined);
        })
        .filter((button): button is UIBlock => button !== null)
    : [];
  const customPages = Array.isArray(row.customPages)
    ? row.customPages
        .map((page) => {
          if (!page || typeof page !== 'object') return null;
          const item = page as Record<string, unknown>;
          const id = optionalText(item.id);
          if (!id) return null;
          return { ...item, id, title: optionalText(item.title) || 'Pagina' };
        })
        .filter((page): page is UIConfig['customPages'][number] => page !== null)
    : [];
  return {
    ...fallback,
    ...row,
    buttons,
    customPages
  } as UIConfig;
}
