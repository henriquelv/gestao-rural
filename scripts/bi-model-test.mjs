import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result=await build({entryPoints:['api/_lib/bi-model.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {buildBi,getPeriod,numeric}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const data=(rows,truncated=false)=>({rows,truncated});
const period=getPeriod(3,'2026-01');
assert.deepEqual(period.keys,['2025-11','2025-12','2026-01']);
assert.equal(period.to,'2026-01-31');
assert.throws(()=>getPeriod(13,'2026-01'));
assert.throws(()=>getPeriod(6,'2026-13'));
assert.equal(numeric('1.234,56'),1234.56);
assert.equal(numeric(null),null);
assert.equal(numeric(''),null);
const model=buildBi({
  animaisativos:data([{cdfazenda:10,cdanimal:1},{cdfazenda:10,cdanimal:1},{cdfazenda:10,cdanimal:2},{cdfazenda:20,cdanimal:1}]),
  animaistotais:data([{cdfazenda:10,cdanimal:1},{cdfazenda:10,cdanimal:2},{cdfazenda:20,cdanimal:1}]),
  controleleiteiro:data([{datafilter:'2025-11-01',prodleite:'10'},{datafilter:'2026-01-20',prodleite:20},{datafilter:'2026-01-22',prodleite:30},{datafilter:'2024-01-01',prodleite:900}]),
  receitas:data([{datafilter:'2025-11-01',valor_apropriado:'100,50'},{datafilter:'2026-01-01',valor_apropriado:200}]),
  despesas:data([{datafilter:'2026-01-01',valor_apropriado:400,nome_conta_gerencial:'Ração'}]),
  partos:data([{datafilter:'2026-01-01',numcria:null}]),
  inseminacoes:data([{datafilter:'2025-11-01',prenhez:'Sim'},{datafilter:'2025-11-01',prenhez:'Não'},{datafilter:'2026-01-01',prenhez:''}]),
  mastite:data([]),
  aplicacaoproduto:data([{datafilter:'2026-01-02',produto:'Vacina A'},{datafilter:'2026-01-03',produto:'Vacina A'}]),
  baixas:data([{datafilter:'2026-01-04',motivobaixa:'Venda'}]),
  doencas:data([{datafilter:'2026-01-05',doenca:'Tristeza'}])
  ,analisetanque:data([{datafilter:'2026-01-05',cbt:10,ccs:200,gordura:4,proteina:3.4,ureia:12,extratototal:12.5,extratodesengordurado:8.5}])
  ,producaoleite:data([{datafilter:'2026-01-05',numerovacas:40,totalcliente:100,totalfuncionario:5,totalrecria:10,totaloutros:2}])
  ,tentativas:data([{datafilter:'2026-01-05'}]),coberturas:data([{datafilter:'2026-01-06'}]),diagnosticos:data([{datafilter:'2026-01-07'}]),transferenciaembriao:data([{datafilter:'2026-01-08'}])
},period);
assert.equal(model.metrics.activeAnimals,3); // mesma identificação em fazendas diferentes não colide
assert.equal(model.metrics.totalAnimals,3);
assert.equal(model.metrics.averageMilk,20); // weighted by measurements, not monthly averages
assert.equal(model.sources.controleleiteiro.excluded,1);
assert.equal(model.sources.controleleiteiro.state,'ok');
assert.equal(model.metrics.revenue,300.5);
assert.equal(model.metrics.balance,-99.5);
assert.equal(model.trends.reduce((sum,row)=>sum+row.revenue,0),model.metrics.revenue);
assert.equal(model.metrics.calves,null); // never invent a calf for a missing value
assert.equal(model.metrics.pregnancyRate,50);
assert.equal(model.metrics.mastitisCases,0);
assert.equal(model.metrics.diseases,1);
assert.equal(model.metrics.averageTankCcs,200);
assert.equal(model.metrics.averageLactatingCows,40);
assert.equal(model.metrics.milkToClient,100);
assert.equal(model.metrics.attempts,1);
assert.equal(model.metrics.coverages,1);
assert.equal(model.trends[1].averageMilk,null);
assert.equal(model.trends[1].mastitisCases,0);
assert.equal(model.breakdowns.expenses[0].value,400);
assert.equal(model.breakdowns.applications[0].count,2);
assert.equal(model.breakdowns.exits[0].label,'Venda');
assert.equal(model.breakdowns.diseases[0].label,'Tristeza');
const missing=buildBi({receitas:data([{datafilter:'2026-01-01',valor_apropriado:null}]),despesas:data([])},period);
assert.equal(missing.metrics.revenue,null);
assert.equal(missing.metrics.balance,null);
console.log('BI model: dates, weighted means, financial reconciliation, missing values, unavailable sources, cohorts and breakdowns passed.');
