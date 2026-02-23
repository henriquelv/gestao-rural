/**
 * Lista padronizada de setores da fazenda
 * Esta é a fonte única de verdade para todos os setores no app
 * Ordem: Ordenha, Manejo, Alimentação, Conforto, Serviços Externos, Administração, Maternidade, Criação
 */
export const SECTORS_LIST = [
  'Ordenha',
  'Manejo',
  'Alimentação',
  'Conforto',
  'Serviços Externos',
  'Administração',
  'Maternidade',
  'Criação'
] as const;

export type SectorType = typeof SECTORS_LIST[number];

export type SectorColor = { bg: string; fg: string; border: string };

const clamp = (n: number) => Math.max(0, Math.min(255, n));
const hexToRgb = (hex: string) => {
  const h = hex.replace('#', '').trim();
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((x) => Number.isNaN(x))) return null;
  return { r, g, b };
};

const rgbToHex = (r: number, g: number, b: number) => {
  const to2 = (x: number) => clamp(Math.round(x)).toString(16).padStart(2, '0');
  return `#${to2(r)}${to2(g)}${to2(b)}`.toUpperCase();
};

const mix = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }, t: number) => {
  const k = Math.max(0, Math.min(1, t));
  return {
    r: a.r + (b.r - a.r) * k,
    g: a.g + (b.g - a.g) * k,
    b: a.b + (b.b - a.b) * k
  };
};

export const makeSectorColor = (baseHex: string): SectorColor => {
  const base = hexToRgb(baseHex) || { r: 59, g: 130, b: 246 };
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 0, g: 0, b: 0 };
  const bgRgb = mix(base, white, 0.55);
  const fgRgb = mix(base, black, 0.35);
  return {
    border: rgbToHex(base.r, base.g, base.b),
    bg: rgbToHex(bgRgb.r, bgRgb.g, bgRgb.b),
    fg: rgbToHex(fgRgb.r, fgRgb.g, fgRgb.b)
  };
};

export const DEFAULT_SECTOR_BASE_COLOR: Record<SectorType, string> = {
  Ordenha: '#EF4444',
  Manejo: '#22C55E',
  'Alimentação': '#EAB308',
  Conforto: '#3B82F6',
  'Serviços Externos': '#EC4899',
  Administração: '#6B7280',
  Maternidade: '#A855F7',
  'Criação': '#FB923C'
};

export const SECTOR_COLOR: Record<SectorType, SectorColor> = Object.fromEntries(
  (SECTORS_LIST as readonly SectorType[]).map((s) => [s, makeSectorColor(DEFAULT_SECTOR_BASE_COLOR[s])])
) as any;

const overridesKey = 'sector_color_overrides_v1';
export const getSectorColorOverrides = (): Partial<Record<SectorType, string>> => {
  try {
    const raw = localStorage.getItem(overridesKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export const setSectorColorOverrides = (next: Partial<Record<SectorType, string>>) => {
  try {
    localStorage.setItem(overridesKey, JSON.stringify(next));
  } catch {
  }
};

export const getSectorColors = (sector?: string) => {
  const fallback = makeSectorColor('#3B82F6');
  if (!sector) return fallback;
  const s = sector as SectorType;
  const base = getSectorColorOverrides();
  const hex = (base as any)[s] as string | undefined;
  if (hex && typeof hex === 'string' && hex.startsWith('#') && hex.length === 7) {
    return makeSectorColor(hex);
  }
  return (SECTOR_COLOR as any)[s] || fallback;
};

/**
 * Retorna a lista de setores como array de strings (para compatibilidade)
 */
export const getSectors = (): string[] => [...SECTORS_LIST];

/**
 * Verifica se um setor é válido
 */
export const isValidSector = (sector: string): sector is SectorType => {
  return SECTORS_LIST.includes(sector as SectorType);
};
