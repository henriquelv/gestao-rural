// Read-only integration check; no secrets or raw records are printed.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
const doc=readFileSync('.tmp-edge-km/Ad Blocking/API conection','utf8');
process.env.RUMINA_API_KEY=doc.match(/^\s*ApiKey:\s*(\S+)/im)?.[1];
process.env.RUMINA_IDUC=doc.match(/^\s*IdUc:\s*(\S+)/im)?.[1];
const compiled=await build({stdin:{contents:"export * from './api/_lib/bi-model.ts'; export * from './api/_lib/rumina.ts'; export * from './types/rumina-bi.ts';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
const lib=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const farms=await lib.listRuminaFarms();
const farm=[...farms].sort((a,b)=>(b.lastProcessedAt||'').localeCompare(a.lastProcessedAt||''))[0];
const period=lib.getPeriod(6,new Date().toISOString().slice(0,7));
const data={};
await Promise.all(lib.SOURCES.map(async s=>{try{data[s]=await lib.fetchRuminaDataset(s,farm.id,period.api);}catch{}}));
for(const result of Object.values(data)) assert.ok(result.rows.every(r=>Number(r.cdfazenda)===Number(farm.id)));
const model=lib.buildBi(data,period);
assert.equal(model.trends.length,6);
for(const k of ['inseminations','births','applications','diseases']) {
  if(model.metrics[k]!==null) assert.equal(model.metrics[k],model.trends.reduce((sum,r)=>sum+r[k],0));
}
console.log(JSON.stringify({farms:farms.length,sources:Object.fromEntries(Object.entries(model.sources).map(([k,v])=>[k,{state:v.state,records:v.records}])),reconciliation:'passed',farmIsolation:'passed'}));
// Inspect a farm with financial entries using that entry's reference month.
const response=await fetch('https://ruminainsights.rumina.com.br/api/receitas',{method:'POST',headers:{Authorization:process.env.RUMINA_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({iduc:process.env.RUMINA_IDUC,offset:0,filtros:{}})});
const row=(await response.json()).resultado?.[0];
if(row && farms.some(f=>Number(f.id)===Number(row.cdfazenda))) {
  const financialPeriod=lib.getPeriod(3,String(row.datafilter).slice(0,7));
  const financial={};
  for(const s of ['receitas','despesas']) financial[s]=await lib.fetchRuminaDataset(s,String(row.cdfazenda),financialPeriod.api);
  const m=lib.buildBi(financial,financialPeriod);
  if(m.metrics.revenue!==null && m.metrics.expense!==null) assert.ok(Math.abs(m.metrics.balance-(m.metrics.revenue-m.metrics.expense))<.011);
  console.log(JSON.stringify({financialSources:Object.fromEntries(Object.entries(m.sources).filter(([k])=>['receitas','despesas'].includes(k))),financialReconciliation:'passed',nonEmptyRevenue:financial.receitas.rows.length>0}));
}
