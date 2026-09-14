import { SOURCES, type Source, type Metrics, type RuminaDashboard } from '../../types/rumina-bi.js';
export type Row = Record<string, unknown>;
export type Dataset = { rows: Row[]; truncated: boolean };
export type Datasets = Partial<Record<Source, Dataset>>;
export function numeric(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const parsed = Number(typeof value === 'string' && value.includes(',') ? value.replace(/\./g, '').replace(',', '.') : value);
  return Number.isFinite(parsed) ? parsed : null;
}
export function getPeriod(months: number, endMonth: string) {
  if (!Number.isInteger(months) || months < 1 || months > 12 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(endMonth)) throw new Error('INVALID_PERIOD');
  const [year, month] = endMonth.split('-').map(Number);
  if (year < 2000 || year > 2100) throw new Error('INVALID_PERIOD');
  const keys = Array.from({ length: months }, (_, i) => {
    const date = new Date(Date.UTC(year, month - months + i, 1));
    return date.toISOString().slice(0, 7);
  });
  const [yearFrom, monthFrom] = keys[0].split('-').map(Number);
  return { keys, api: { monthFrom, yearFrom, monthTo: month, yearTo: year }, from: `${keys[0]}-01`, to: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10) };
}
function aggregate(data: Partial<Record<Source, Row[]>>): Metrics {
  const count = (s: Source) => data[s] ? data[s]!.length : null;
  const values = (s: Source, field: string) => (data[s] || []).map(r => numeric(r[field])).filter((v): v is number => v !== null);
  const average = (s: Source, field: string) => { const v = values(s, field).filter(v => v >= 0); return v.length ? v.reduce((a,b)=>a+b,0)/v.length : null; };
  const sum = (s: Source, field: string) => {
    if (!data[s]) return null;
    const v = values(s, field);
    // A missing value cannot be silently counted as zero in a financial total.
    return v.length === data[s]!.length ? v.reduce((a,b)=>a+b,0) : null;
  };
  const results = (data.inseminacoes || []).map(row => String(row.prenhez ?? '').trim().toLowerCase());
  const positive = results.filter(v => ['1','sim','s','positivo','positiva','prenha','true'].includes(v)).length;
  const negative = results.filter(v => ['0','não','nao','n','negativo','negativa','vazia','false'].includes(v)).length;
  const revenue = sum('receitas', 'valor_apropriado'), expense = sum('despesas', 'valor_apropriado');
  const birthCount=count('partos'), calfCount=sum('partos','numcria');
  const revenueEntries=count('receitas'), expenseEntries=count('despesas');
  const raw: Metrics = {
    activeAnimals: data.animaisativos ? new Set(data.animaisativos.map(r => `${r.cdfazenda}:${r.cdanimal}`)).size : null,
    totalAnimals: data.animaistotais ? new Set(data.animaistotais.map(r => `${r.cdfazenda}:${r.cdanimal}`)).size : null,
    averageMilk: average('controleleiteiro','prodleite'), milkMeasurements: data.controleleiteiro ? values('controleleiteiro','prodleite').filter(v=>v>=0).length : null,
    averageCcs: average('analiseleite','ccs'), averageFat: average('analiseleite','gordura'), averageProtein: average('analiseleite','proteina'),
    tankAnalyses:count('analisetanque'), averageTankCbt:average('analisetanque','cbt'), averageTankCcs:average('analisetanque','ccs'),
    averageTankFat:average('analisetanque','gordura'), averageTankProtein:average('analisetanque','proteina'), averageTankUrea:average('analisetanque','ureia'),
    averageTankSolids:average('analisetanque','extratototal'), averageTankNonfatSolids:average('analisetanque','extratodesengordurado'),
    milkProductionEntries:count('producaoleite'), averageLactatingCows:average('producaoleite','numerovacas'), milkToClient:sum('producaoleite','totalcliente'),
    milkToEmployees:sum('producaoleite','totalfuncionario'), milkToRearing:sum('producaoleite','totalrecria'), milkOther:sum('producaoleite','totaloutros'),
    inseminations: count('inseminacoes'), pregnanciesConfirmed: data.inseminacoes ? positive : null, pregnanciesEvaluated: data.inseminacoes ? positive+negative : null,
    attempts:count('tentativas'), coverages:count('coberturas'), diagnoses:count('diagnosticos'), embryoTransfers:count('transferenciaembriao'),
    pregnancyRate: positive+negative > 0 ? positive/(positive+negative)*100 : null,
    births: birthCount, birthRecords:count('nascimentos'), calves: calfCount, averageCalvesPerBirth:birthCount&&calfCount!==null?calfCount/birthCount:null, abortions: count('abortos'), mastitisCases: count('mastite'),
    diseases: count('doencas'), applications: count('aplicacaoproduto'), averageWeight: average('pesagemcorporal','pesagemcorporal'), weighings: count('pesagemcorporal'),
    averageGmd:average('pesagemcorporal','gmd'), averageGpd:average('pesagemcorporal','gpd'), measurements:count('medidas'),
    weanings: count('desmamas'), exits: count('baixas'), heats: count('ciosnaoinseminados'), dryings: count('secagens'),
    averageDryingDel:average('secagens','del_secagem'), averageLactationProduction:average('secagens','prodtotallac'), averageAdjusted305:average('secagens','prodajust305'),
    revenue, revenueEntries, averageRevenue:revenue!==null&&revenueEntries?revenue/revenueEntries:null,
    expense, expenseEntries, averageExpense:expense!==null&&expenseEntries?expense/expenseEntries:null,
    balance: revenue !== null && expense !== null ? revenue-expense : null
  };
  return Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,v===null?null:Math.round((v+Number.EPSILON)*100)/100])) as Metrics;
}
export function buildBi(data: Datasets, period: ReturnType<typeof getPeriod>) {
  const selected: Partial<Record<Source, Row[]>> = {};
  const sources = {} as RuminaDashboard['sources'];
  for (const source of SOURCES) {
    const result = data[source];
    if (!result) { sources[source] = { state: 'unavailable', records: 0, excluded: 0 }; continue; }
    const rows = result.rows.filter(r => source === 'animaisativos' || source === 'animaistotais' || period.keys.includes(String(r.datafilter || '').slice(0,7)));
    selected[source] = rows;
    const excluded = result.rows.length - rows.length;
    // Registros fora do período são descartados de propósito e não significam
    // consulta incompleta. "Parcial" fica reservado para paginação truncada.
    sources[source] = { state: result.truncated ? 'partial' : rows.length ? 'ok' : 'empty', records: rows.length, excluded };
  }
  const trends = period.keys.map(key => {
    const monthly = Object.fromEntries(Object.entries(selected).map(([s,rows]) => [s, s === 'animaisativos'||s==='animaistotais' ? [] : rows.filter(r=>String(r.datafilter).startsWith(key))]));
    return { ...aggregate(monthly), activeAnimals: null, totalAnimals:null, monthKey: key, label: new Date(`${key}-15T12:00:00Z`).toLocaleDateString('pt-BR', { month:'short', year:'2-digit', timeZone:'UTC' }).replace('.','') };
  });
  const countBy = (source:Source,field:string,fallback='Não informado') => {
    const result=new Map<string,number>();
    for(const row of selected[source]||[]){const label=String(row[field]||fallback).trim()||fallback;result.set(label,(result.get(label)||0)+1);}
    return [...result].map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count);
  };
  const moneyBy = (source:Source,field:string) => {
    const result=new Map<string,number>();
    for(const row of selected[source]||[]){const value=numeric(row.valor_apropriado);if(value===null)continue;const label=String(row[field]||'Sem classificação').trim()||'Sem classificação';result.set(label,(result.get(label)||0)+value);}
    return [...result].map(([label,value])=>({label,value:Math.round(value*100)/100})).sort((a,b)=>b.value-a.value);
  };
  return { metrics: aggregate(selected), trends, sources, breakdowns: {
    diseases:countBy('doencas','doenca'), applications:countBy('aplicacaoproduto','produto'), exits:countBy('baixas','motivobaixa'),
    animalTypes:countBy('animaisativos','tipo'), expenses:moneyBy('despesas','nome_conta_gerencial'), revenues:moneyBy('receitas','nome_conta_gerencial')
  } };
}
