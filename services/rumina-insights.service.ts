import { farmContextService } from './farm-context.service';
import type { RuminaDashboard, RuminaFarm } from '../types/rumina-bi';
export type { RuminaDashboard, RuminaFarm } from '../types/rumina-bi';
type FarmsResponse = { farms: RuminaFarm[]; source: { provider: string; readOnly: true; fetchedAt: string } };
class ApiError extends Error { constructor(message: string, readonly status: number) { super(message); } }
const identity = () => {
  const ctx = farmContextService.getContext();
  if (!ctx) throw new ApiError('Entre novamente para consultar os indicadores.',403);
  return ctx;
};
const storageKey = (ctx: ReturnType<typeof identity>, key: string) =>
  `campo_legado_rumina_v6_${ctx.farm_id}_${ctx.employee_id}_${key}`;

const cachedValue = <T extends object>(key: string): T | null => {
  const ctx=identity();
  try { return JSON.parse(localStorage.getItem(storageKey(ctx,key))||'null') as T | null; }
  catch { return null; }
};

const fetchWithTimeout = async (path: string, ctx: ReturnType<typeof identity>): Promise<Response> => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 58_000);
  try {
    return await fetch(path, { cache: 'no-store', signal: controller.signal, headers: {
      'x-campo-farm-id': ctx.farm_id,
      'x-campo-employee-id': ctx.employee_id,
      'x-campo-device-id': ctx.device_id,
      'x-campo-admin-pin': ctx.admin_pin || ''
    } });
  } finally {
    window.clearTimeout(timeout);
  }
};

const wait = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

const fetchJson = async <T extends object>(path: string, ctx: ReturnType<typeof identity>): Promise<T> => {
  const response=await fetchWithTimeout(path,ctx);
  const raw=await response.text();
  let data: any={};
  try { data=raw?JSON.parse(raw):{}; } catch { throw new Error('A consulta retornou uma resposta inválida. Tente novamente.'); }
  if (!response.ok) throw new ApiError(data.error || 'Não foi possível atualizar.',response.status);
  return data as T;
};

async function read<T extends object>(path: string, key: string, transientRetries=0): Promise<T> {
  const ctx=identity();
  const cacheKey=storageKey(ctx,key);
  try {
    if (!navigator.onLine) throw new Error('Abra este período online uma vez para consultá-lo offline.');
    let data: T;
    try {
      data=await fetchJson<T>(path,ctx);
    } catch(firstError) {
      const transient=!(firstError instanceof ApiError)||firstError.status>=500;
      if(!transientRetries||!transient)throw firstError;
      await wait(650);
      data=await fetchJson<T>(path,ctx);
    }
    const value={...data,cache:{offline:false,savedAt:new Date().toISOString()}};
    // A request that finishes after logout must not restore the previous user's cache.
    const current=identity();
    if (current.employee_id!==ctx.employee_id || current.farm_id!==ctx.farm_id) throw new ApiError('O perfil de acesso mudou.',403);
    try { localStorage.setItem(cacheKey,JSON.stringify(value)); } catch { /* optional offline storage */ }
    return value;
  } catch(e) {
    if(e instanceof ApiError && e.status<500) throw e;
    const current=identity();
    if(current.employee_id!==ctx.employee_id || current.farm_id!==ctx.farm_id) throw new ApiError('O perfil de acesso mudou.',403);
    let cached: (T & {cache?:{savedAt:string}}) | null=null;
    try { cached=JSON.parse(localStorage.getItem(cacheKey)||'null'); } catch { /* corrupted cache */ }
    if(cached) return {...cached,cache:{offline:!navigator.onLine,fallback:true,savedAt:cached.cache?.savedAt||''}};
    throw e;
  }
}
export const ruminaInsightsService={
  getCachedFarms:()=>cachedValue<FarmsResponse>('farms'),
  getCachedDashboard(farmId:string,months:number,endMonth=new Date().toISOString().slice(0,7)) {
    return cachedValue<RuminaDashboard>(`${farmId}_${months}_${endMonth}`);
  },
  listFarms:()=>read<FarmsResponse>('/api/rumina/farms','farms',1),
  getDashboard(farmId:string,months:number,endMonth=new Date().toISOString().slice(0,7),refresh=false) {
    const params=new URLSearchParams({farmId,months:String(months),endMonth,refresh:refresh?'1':'0'});
    return read<RuminaDashboard>(`/api/rumina/dashboard?${params}`,`${farmId}_${months}_${endMonth}`);
  }
};
