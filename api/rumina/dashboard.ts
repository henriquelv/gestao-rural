import type { ApiRequest, ApiResponse } from '../_lib/http.js';
import { queryValue, sendJson } from '../_lib/http.js';
import { requireAppUser } from '../_lib/admin-auth.js';
import { fetchRuminaDataset, listRuminaFarms } from '../_lib/rumina.js';
import { buildBi, getPeriod, type Datasets } from '../_lib/bi-model.js';
import { SOURCES } from '../../types/rumina-bi.js';

export const config = { maxDuration: 60 };
const cache = new Map<string, { expires: number; data: unknown }>();

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Método não permitido.' });
  try {
    const user=await requireAppUser(req);
    const farmId = queryValue(req.query.farmId).trim();
    const months = Number(queryValue(req.query.months) || '6');
    const endMonth = queryValue(req.query.endMonth) || new Date().toISOString().slice(0,7);
    const period = getPeriod(months, endMonth);
    if (endMonth > new Date().toISOString().slice(0,7)) throw new Error('INVALID_PERIOD');
    if (!farmId) return sendJson(res,400,{error:'Selecione uma fazenda.'});
    const isAggregate=farmId==='__all__';
    // A autorização do consolidado precisa ocorrer antes de qualquer leitura de cache.
    if(isAggregate&&!user.isAdmin) throw new Error('FORBIDDEN');
    const key = `${farmId}:${months}:${endMonth}`;
    const saved = cache.get(key);
    if (saved && saved.expires > Date.now() && queryValue(req.query.refresh) !== '1') return sendJson(res,200,saved.data);
    const farms=await listRuminaFarms();
    const farm = isAggregate
      ? {id:'__all__',name:'Gestão Campo Legado',lastProcessedAt:farms.map(item=>item.lastProcessedAt).filter((value):value is string=>Boolean(value)).sort()[0]||null,isAggregate:true,farmCount:farms.length}
      : farms.find(f=>f.id===farmId);
    if (!farm) return sendJson(res,404,{error:'Fazenda não encontrada nesta integração.'});
    const farmIds=isAggregate?farms.map(item=>item.id):farmId;
    const datasets: Datasets = {};
    // All calls are fixed, documented listing endpoints. No external writes.
    await Promise.all(SOURCES.map(async source => {
      try { datasets[source] = await fetchRuminaDataset(source, farmIds, period.api); }
      catch { /* Availability is explicit for each source in the response. */ }
    }));
    if (!Object.keys(datasets).length) return sendJson(res,502,{error:'Não foi possível consultar a fazenda agora.'});
    const model = buildBi(datasets,period);
    const farmComparisons = isAggregate ? farms.map(item => {
      const farmDatasets = Object.fromEntries(Object.entries(datasets).map(([source,result]) => [source, {
        ...result,
        rows: result.rows.filter(row => String(row.cdfazenda ?? '') === item.id)
      }]));
      return { farm:{id:item.id,name:item.name}, metrics:buildBi(farmDatasets,period).metrics };
    }) : undefined;
    const unavailable = SOURCES.filter(s=>model.sources[s].state==='unavailable');
    const body = {
      farm, period: { months, from: period.from, to: period.to }, ...model, farmComparisons,
      source: { provider:'Rúmina Insights (Ideagri)', readOnly:true, generatedAt:new Date().toISOString(), lastProcessedAt:farm.lastProcessedAt,
        partial:Object.values(model.sources).some(s=>s.state==='partial') || unavailable.length>0,
        unavailable, truncated:Object.values(datasets).some(s=>s.truncated) }
    };
    // Bound the warm-function cache.
    if (cache.size >= 50) cache.delete(cache.keys().next().value!);
    cache.set(key,{expires:Date.now()+300000,data:body});
    return sendJson(res,200,body);
  } catch (e) {
    const code = e instanceof Error ? e.message : '';
    if (code==='INVALID_PERIOD') return sendJson(res,400,{error:'Escolha um período de até 12 meses, encerrado até o mês atual.'});
    if (code==='UNAUTHORIZED' || code==='FORBIDDEN') return sendJson(res,403,{error:'Você não tem acesso a esta visão consolidada.'});
    return sendJson(res,503,{error:'Não foi possível atualizar o painel agora. Tente novamente.'});
  }
}
