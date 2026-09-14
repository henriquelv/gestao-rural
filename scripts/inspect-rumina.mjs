// Read-only inspection. Never print credential values or raw records.
import { readFileSync } from 'node:fs';
const text = readFileSync('.tmp-edge-km/Ad Blocking/API conection', 'utf8');
const key = text.match(/^\s*ApiKey:\s*(\S+)/im)?.[1];
const iduc = text.match(/^\s*IdUc:\s*(\S+)/im)?.[1];
if (!key || !iduc) throw new Error('Credentials missing');
const query = async (endpoint, filtros = {}) => {
  const response = await fetch(`https://ruminainsights.rumina.com.br/api/${endpoint}`, {
    method: 'POST', headers: { Authorization: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ iduc, offset: 0, filtros }), signal: AbortSignal.timeout(25000)
  });
  if (!response.ok) return { status: response.status };
  return { status: response.status, ...(await response.json()) };
};
const farms = await query('fazendasprocessadas');
const latest = [...farms.resultado].sort((a,b) => String(b.ultimo_processamento).localeCompare(String(a.ultimo_processamento)))[0];
const endpoints = ['receitas', 'despesas', 'producaoleite', 'doencas', 'aplicacaoproduto', 'pesagemcorporal', 'desmamas', 'baixas', 'ciosnaoinseminados', 'secagens', 'animaistotais', 'analisetanque', 'coberturas', 'diagnosticos', 'medidas', 'nascimentos', 'tentativas', 'transferenciaembriao'];
for (let i = 0; i < endpoints.length; i += 3) {
  await Promise.all(endpoints.slice(i, i+3).map(async endpoint => {
    const result = await query(endpoint, { fazendas: [Number(latest.cdfazenda)], periodo: { mesDe: 1, anoDe: 2025, mesAte: 9, anoAte: 2026 } });
    const rows = result.resultado || [];
    console.log(JSON.stringify({ endpoint, status: result.status, count: rows.length, fields: Object.keys(rows[0] || {}), numericFields: Object.entries(rows[0] || {}).filter(([k,v]) => !k.startsWith('cd') && typeof v === 'number').map(([k])=>k) }));
  }));
}
for (const endpoint of ['receitas','despesas','producaoleite','doencas','ciosnaoinseminados','animaistotais','analisetanque','coberturas','diagnosticos','medidas','nascimentos','tentativas','transferenciaembriao']) {
  const result = await query(endpoint);
  console.log(JSON.stringify({ endpoint, globalSchema: true, status: result.status, fields: Object.keys(result.resultado?.[0] || {}) }));
}
