import type { ApiRequest, ApiResponse } from '../_lib/http.js';
import { queryValue, sendJson } from '../_lib/http.js';
import { requireAppUser } from '../_lib/admin-auth.js';
import { fetchRuminaDataset, listRuminaFarms } from '../_lib/rumina.js';
import { readRuminaCache, writeRuminaCache } from '../_lib/rumina-cache.js';
import { buildBi, getPeriod, type Datasets } from '../_lib/bi-model.js';
import { SOURCES } from '../../types/rumina-bi.js';
import { waitUntil } from '@vercel/functions';

export const config = { maxDuration: 300 };
const cache = new Map<string, { expires: number; data: unknown }>();
const builds = new Map<string, Promise<unknown>>();
const AGGREGATE_TTL = 30 * 60_000;
const FARM_TTL = 10 * 60_000;

const remember = (key: string, data: unknown, ttl: number) => {
  if (cache.size >= 50) cache.delete(cache.keys().next().value!);
  cache.set(key, { expires: Date.now() + ttl, data });
};

async function buildDashboard(farmId: string, months: number, endMonth: string) {
  const period = getPeriod(months, endMonth);
  const farms = await listRuminaFarms();
  const isAggregate = farmId === '__all__';
  const farm = isAggregate
    ? {id:'__all__',name:'Gestão Campo Legado',lastProcessedAt:farms.map(item=>item.lastProcessedAt).filter((value):value is string=>Boolean(value)).sort()[0]||null,isAggregate:true,farmCount:farms.length}
    : farms.find(f=>f.id===farmId);
  if (!farm) throw new Error('FARM_NOT_FOUND');
  const farmIds=isAggregate?farms.map(item=>item.id):farmId;
  const datasets: Datasets = {};
  // Todos os endpoints sao listagens documentadas. Nenhuma escrita e feita na origem.
  await Promise.all(SOURCES.map(async source => {
    try { datasets[source] = await fetchRuminaDataset(source, farmIds, period.api); }
    catch { /* A disponibilidade de cada fonte fica explicita no retorno. */ }
  }));
  if (!Object.keys(datasets).length) throw new Error('RUMINA_UNAVAILABLE');
  const model = buildBi(datasets,period);
  const farmComparisons = isAggregate ? farms.map(item => {
    const farmDatasets = Object.fromEntries(Object.entries(datasets).map(([source,result]) => [source, {
      ...result,
      rows: result.rows.filter(row => String(row.cdfazenda ?? '') === item.id)
    }]));
    return { farm:{id:item.id,name:item.name}, metrics:buildBi(farmDatasets,period).metrics };
  }) : undefined;
  const unavailable = SOURCES.filter(s=>model.sources[s].state==='unavailable');
  return {
    farm, period: { months, from: period.from, to: period.to }, ...model, farmComparisons,
    source: { provider:'Rúmina Insights (Ideagri)', readOnly:true as const, generatedAt:new Date().toISOString(), lastProcessedAt:farm.lastProcessedAt,
      partial:Object.values(model.sources).some(s=>s.state==='partial') || unavailable.length>0,
      unavailable, truncated:Object.values(datasets).some(s=>s.truncated) }
  };
}

function rebuild(key: string, farmId: string, months: number, endMonth: string, ttl: number) {
  const existing = builds.get(key);
  if (existing) return existing;
  const pending = buildDashboard(farmId, months, endMonth).then(async data => {
    remember(key, data, ttl);
    await writeRuminaCache(key, data, ttl);
    return data;
  }).finally(() => builds.delete(key));
  builds.set(key, pending);
  return pending;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Método não permitido.' });
  try {
    const user=await requireAppUser(req);
    const farmId = queryValue(req.query.farmId).trim();
    const months = Number(queryValue(req.query.months) || '6');
    const endMonth = queryValue(req.query.endMonth) || new Date().toISOString().slice(0,7);
    getPeriod(months, endMonth);
    if (endMonth > new Date().toISOString().slice(0,7)) throw new Error('INVALID_PERIOD');
    if (!farmId) return sendJson(res,400,{error:'Selecione uma fazenda.'});
    const isAggregate=farmId==='__all__';
    // A autorização do consolidado precisa ocorrer antes de qualquer leitura de cache.
    if(isAggregate&&!user.isAdmin) throw new Error('FORBIDDEN');
    const key = `dashboard:v1:${farmId}:${months}:${endMonth}`;
    const ttl = isAggregate ? AGGREGATE_TTL : FARM_TTL;
    const force = queryValue(req.query.refresh) === '1';
    const saved = cache.get(key);
    if (saved && saved.expires > Date.now() && !force) return sendJson(res,200,saved.data);

    const durable = await readRuminaCache<unknown>(key);
    if (durable) {
      remember(key, durable.data, durable.fresh ? ttl : 60_000);
      // Entrega o ultimo painel imediatamente e atualiza em segundo plano. Isso
      // elimina a espera de quase um minuto no consolidado sem esconder dados.
      if (!durable.fresh || force) waitUntil(rebuild(key, farmId, months, endMonth, ttl).then(()=>undefined).catch(()=>undefined));
      return sendJson(res,200,durable.data);
    }

    const body = await rebuild(key, farmId, months, endMonth, ttl);
    return sendJson(res,200,body);
  } catch (e) {
    const code = e instanceof Error ? e.message : '';
    if (code==='INVALID_PERIOD') return sendJson(res,400,{error:'Escolha um período de até 12 meses, encerrado até o mês atual.'});
    if (code==='UNAUTHORIZED' || code==='FORBIDDEN') return sendJson(res,403,{error:'Você não tem acesso a esta visão consolidada.'});
    if (code==='FARM_NOT_FOUND') return sendJson(res,404,{error:'Fazenda não encontrada nesta integração.'});
    if (code==='RUMINA_UNAVAILABLE') return sendJson(res,502,{error:'Não foi possível consultar a fazenda agora.'});
    return sendJson(res,503,{error:'Não foi possível atualizar o painel agora. Tente novamente.'});
  }
}
