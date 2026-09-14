import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, BarChart3, Beef, CalendarDays, Check, ChevronDown, Download, Droplets, HeartPulse, LayoutDashboard, Lightbulb, RefreshCw, SlidersHorizontal, Wallet } from 'lucide-react';
import { Header } from '../components/Header';
import { Layout } from '../components/Layout';
import { SearchableSelect } from '../components/SearchableSelect';
import { BiChart, BiBreakdown, BiDonut, BiMetricComparison, biNumber, type Series } from '../components/bi/BiCharts';
import { ruminaInsightsService } from '../services/rumina-insights.service';
import { exportBiCsv } from '../services/bi-export.service';
import { BI_METRICS } from '../utils/bi-presentation';
import type { MetricKey, RuminaDashboard, RuminaFarm } from '../types/rumina-bi';
import './rumina-bi.css';

type Tab = 'overview' | 'all' | 'milk' | 'reproduction' | 'health' | 'finance';
const TABS = [
  { id:'overview', label:'Visão geral', icon:LayoutDashboard },
  { id:'all', label:'Todos', icon:BarChart3 },
  { id:'milk', label:'Leite', icon:Droplets },
  { id:'reproduction', label:'Reprodução', icon:HeartPulse },
  { id:'health', label:'Saúde e manejo', icon:Activity },
  { id:'finance', label:'Financeiro', icon:Wallet }
] as const;
const KPI_KEYS: Record<Tab,MetricKey[]> = {
  overview:['activeAnimals','averageMilk','pregnancyRate','births'],
  all:[],
  milk:['averageMilk','milkMeasurements','averageTankCbt','averageTankCcs','averageTankFat','averageTankProtein'],
  reproduction:['inseminations','pregnancyRate','attempts','diagnoses','births','abortions'],
  health:['mastitisCases','diseases','applications','averageWeight','averageGmd','exits'],
  finance:['revenue','expense','balance']
};
const TAB_COPY:Record<Tab,string>={
  overview:'Os principais sinais da operação em uma única leitura.',
  all:'Todos os indicadores autorizados e calculados nesta integração.',
  milk:'Produção por controle e qualidade das análises de leite.',
  reproduction:'Atividade reprodutiva, nascimentos e resultados registrados.',
  health:'Ocorrências, manejos e evolução das pesagens do rebanho.',
  finance:'Receitas, despesas e saldo informados pela fazenda.'
};
const METRIC_GROUPS:Array<{title:string;description:string;keys:MetricKey[]}>= [
  {title:'Rebanho',description:'Posição atual e histórico cadastral',keys:['activeAnimals','totalAnimals']},
  {title:'Leite e tanque',description:'Controles, qualidade, produção e destinos',keys:['averageMilk','milkMeasurements','averageCcs','averageFat','averageProtein','tankAnalyses','averageTankCbt','averageTankCcs','averageTankFat','averageTankProtein','averageTankUrea','averageTankSolids','averageTankNonfatSolids','milkProductionEntries','averageLactatingCows','milkToClient','milkToEmployees','milkToRearing','milkOther']},
  {title:'Reprodução',description:'Serviços, diagnósticos e nascimentos',keys:['inseminations','attempts','coverages','diagnoses','embryoTransfers','pregnanciesConfirmed','pregnanciesEvaluated','pregnancyRate','births','birthRecords','calves','averageCalvesPerBirth','abortions','heats']},
  {title:'Saúde e manejo',description:'Ocorrências, pesagens, medidas e lactações',keys:['mastitisCases','diseases','applications','measurements','averageWeight','averageGmd','averageGpd','weighings','weanings','exits','dryings','averageDryingDel','averageLactationProduction','averageAdjusted305']},
  {title:'Financeiro',description:'Movimentações apropriadas da fazenda',keys:['revenue','revenueEntries','averageRevenue','expense','expenseEntries','averageExpense','balance']}
];
const GREEN='#275f43', SAGE='#b18424', CLAY='#a65e48';
const series=(key:MetricKey,color=GREEN):Series=>({key,color,label:BI_METRICS[key].label});
const currentMonth=()=>new Date().toISOString().slice(0,7);
const periodStart=(end:string,months:number)=>{const [y,m]=end.split('-').map(Number);return new Date(Date.UTC(y,m-months,1)).toISOString().slice(0,7);};
const monthLabel=(v:string)=>new Date(`${v.slice(0,7)}-15T12:00:00Z`).toLocaleDateString('pt-BR',{month:'short',year:'numeric',timeZone:'UTC'}).replace('.','');
const dateLabel=(v?:string|null)=>!v?'Não informada':new Date(v.length===10?`${v}T12:00:00`:v).toLocaleDateString('pt-BR');
const remember=(id?:string)=>{try{if(id)localStorage.setItem('campo_legado_rumina_selected_farm_v1',id);return localStorage.getItem('campo_legado_rumina_selected_farm_v1')||'';}catch{return '';}};

function Kpi({metric,data}:{metric:MetricKey;data:RuminaDashboard}) {
  const meta=BI_METRICS[metric];
  const statuses=meta.sources.map(s=>data.sources[s]?.state);
  const note=statuses.includes('unavailable')?'Consulta indisponível':statuses.includes('partial')?'Dados parciais':statuses.every(s=>s==='empty')?'Sem registros no período':meta.note || 'No período selecionado';
  const milkMetric=['averageMilk','averageCcs','averageFat','averageProtein','milkMeasurements'].includes(metric);
  const Icon=meta.unit==='R$'?Wallet:milkMetric?Droplets:metric==='activeAnimals'?Beef:Activity;
  const observed=data.trends.map(r=>r[metric]).filter((v):v is number=>v!==null);
  const prior=observed[observed.length-2],latest=observed[observed.length-1];
  const delta=prior!==undefined&&latest!==undefined&&prior!==0?(latest-prior)/Math.abs(prior)*100:null;
  return <article className={`bi-kpi bi-kpi-${metric} ${meta.unit==='R$'?'bi-kpi-finance':''}`}>
    <div className="bi-kpi-top"><span>{meta.label}</span><Icon size={15} strokeWidth={1.7} /></div>
    <strong>{biNumber(data.metrics[metric],meta.unit)}</strong><div className="bi-kpi-foot"><small>{note}</small>{delta!==null&&<em>{delta>0?'↑':delta<0?'↓':'•'} {Math.abs(delta).toLocaleString('pt-BR',{maximumFractionDigits:1})}%</em>}</div>
  </article>;
}

function AreaCard({title,description,values,onClick,icon:Icon}:{title:string;description:string;values:Array<{label:string;value:string}>;onClick:()=>void;icon:React.ElementType}){
  return <button type="button" className="bi-area-card" onClick={onClick}>
    <span className="bi-area-card-head"><i><Icon size={17}/></i><span><strong>{title}</strong><small>{description}</small></span></span>
    <span className="bi-area-values">{values.map(item=><span key={item.label}><small>{item.label}</small><strong>{item.value}</strong></span>)}</span>
    <span className="bi-area-link">Ver análise completa <b>→</b></span>
  </button>;
}

function Insights({data}:{data:RuminaDashboard}){
  const messages:string[]=[];
  if(data.metrics.averageMilk!==null)messages.push(`A média foi de ${biNumber(data.metrics.averageMilk,'L')} em ${biNumber(data.metrics.milkMeasurements)} controles de leite.`);
  if(data.metrics.pregnancyRate!==null)messages.push(`${biNumber(data.metrics.pregnanciesConfirmed)} de ${biNumber(data.metrics.pregnanciesEvaluated)} resultados de inseminação foram positivos (${biNumber(data.metrics.pregnancyRate,'%')}).`);
  if(data.metrics.applications!==null)messages.push(`${biNumber(data.metrics.applications)} aplicações de produtos e ${biNumber(data.metrics.diseases)} ocorrências de doenças foram registradas.`);
  if(data.metrics.balance!==null)messages.push(`O saldo dos lançamentos apropriados no período foi ${biNumber(data.metrics.balance,'R$')}.`);
  if(!messages.length)return null;
  return <section className="bi-insights"><div className="bi-insights-title"><Lightbulb size={17}/><div><span>Leitura rápida</span><small>Resumo automático dos dados selecionados</small></div></div><ol>{messages.slice(0,4).map((message,index)=><li key={message}><span>{String(index+1).padStart(2,'0')}</span><p>{message}</p></li>)}</ol></section>;
}

function MetricCatalog({data,groups=METRIC_GROUPS}:{data:RuminaDashboard;groups?:typeof METRIC_GROUPS}){
  return <div className="bi-catalog">{groups.map(group=><section className="bi-catalog-group" key={group.title}>
    <div className="bi-catalog-title"><div><span>{group.title}</span><small>{group.description}</small></div><strong>{group.keys.length}</strong></div>
    <div className="bi-catalog-grid">{group.keys.map(key=>{const meta=BI_METRICS[key];const states=meta.sources.map(source=>data.sources[source]?.state);return <article key={key}><span>{meta.label}</span><strong>{biNumber(data.metrics[key],meta.unit)}</strong><small>{states.includes('unavailable')?'Fonte não autorizada':states.every(state=>state==='empty')?'Sem registros':meta.note||'No período'}</small></article>;})}</div>
  </section>)}</div>;
}

function FarmComparison({data}:{data:RuminaDashboard}){
  const [metric,setMetric]=useState<MetricKey>('activeAnimals');
  const meta=BI_METRICS[metric];
  const values=(data.farmComparisons||[]).map(item=>({id:item.farm.id,name:item.farm.name,value:item.metrics[metric]})).filter((item):item is {id:string;name:string;value:number}=>item.value!==null).sort((a,b)=>b.value-a.value);
  const maximum=Math.max(1,...values.map(item=>Math.abs(item.value)));
  const mean=values.length?values.reduce((total,item)=>total+item.value,0)/values.length:null;
  const options=METRIC_GROUPS.flatMap(group=>group.keys.map(key=>({value:key,label:BI_METRICS[key].label,description:group.title})));
  return <section className="bi-panel bi-farm-comparison">
    <div className="bi-section-heading"><div><span className="bi-section-kicker">Gestão Campo Legado</span><h2>Comparativo entre fazendas</h2></div><span className="bi-unit">{values.length} com dados</span></div>
    <p className="bi-muted bi-chart-description">Escolha qualquer indicador para identificar diferenças e oportunidades entre as fazendas.</p>
    <div className="bi-comparison-select"><label>Indicador analisado</label><SearchableSelect value={metric} options={options} onChange={value=>setMetric(value as MetricKey)} placeholder="Escolher indicador" searchPlaceholder="Buscar indicador" /></div>
    <div className="bi-comparison-summary"><span><small>Média entre fazendas</small><strong>{biNumber(mean,meta.unit)}</strong></span><span><small>Maior resultado</small><strong>{values[0]?.name||'—'}</strong></span></div>
    {!values.length?<div className="bi-empty-chart">Nenhuma fazenda retornou este indicador no período.</div>:<div className="bi-farm-ranking">{values.map((item,index)=><div key={item.id}>
      <div className="bi-farm-ranking-copy"><span><b>{String(index+1).padStart(2,'0')}</b>{item.name}</span><strong>{biNumber(item.value,meta.unit)}</strong></div>
      <div className="bi-comparison-track"><span className={item.value<0?'negative':''} style={{width:`${Math.abs(item.value)/maximum*100}%`}} /></div>
    </div>)}</div>}
  </section>;
}

export const RuminaInsightsScreen:React.FC<{mode?:'farm'|'management'}>=({mode='farm'})=>{
  const [farms,setFarms]=useState<RuminaFarm[]>([]);
  const [farmId,setFarmId]=useState('');
  const [months,setMonths]=useState(3);
  const [endMonth,setEndMonth]=useState(currentMonth);
  const [draftEnd,setDraftEnd]=useState(currentMonth);
  const [draftStart,setDraftStart]=useState(()=>periodStart(currentMonth(),3));
  const [filtersOpen,setFiltersOpen]=useState(false);
  const [filterError,setFilterError]=useState('');
  const [tab,setTab]=useState<Tab>('overview');
  const [data,setData]=useState<RuminaDashboard|null>(null);
  const [loading,setLoading]=useState(false);
  const [loadingFarms,setLoadingFarms]=useState(true);
  const [error,setError]=useState('');
  const [exporting,setExporting]=useState(false);
  const [exportMessage,setExportMessage]=useState('');
  const requestId=useRef(0);
  const lastRefresh=useRef(0);
  const dashboardRequestInFlight=useRef('');
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;requestId.current++;};},[]);

  const loadFarms=useCallback(async()=>{
    const applyFarms=(result:{farms:RuminaFarm[]})=>{
      // Para administradores, a API devolve também a empresa consolidada.
      // Ela fica no mesmo seletor das fazendas; técnicos recebem apenas fazendas.
      const availableFarms=mode==='management'?result.farms.filter(f=>f.isAggregate):result.farms;
      setFarms(availableFarms);
      const latest=[...availableFarms].filter(f=>!f.isAggregate).sort((a,b)=>(b.lastProcessedAt||'').localeCompare(a.lastProcessedAt||''))[0];
      const consolidated=result.farms.find(f=>f.isAggregate);
      setFarmId(mode==='management'?(consolidated?.id||''):availableFarms.find(f=>f.id===remember())?.id || latest?.id || '');
    };
    const cached=ruminaInsightsService.getCachedFarms();
    if(cached)applyFarms(cached);
    setLoadingFarms(!cached);setError('');
    try{
      const result=await ruminaInsightsService.listFarms();
      if(!mounted.current)return;
      applyFarms(result);
    }catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Não foi possível consultar as fazendas.');}
    finally{if(mounted.current)setLoadingFarms(false);}
  },[mode]);
  useEffect(()=>{void loadFarms();},[loadFarms]);

  const load=useCallback(async(id:string,count:number,end:string,refresh=false)=>{
    if(!id)return;
    const requestKey=`${id}:${count}:${end}`;
    if(dashboardRequestInFlight.current===requestKey)return;
    const cached=ruminaInsightsService.getCachedDashboard(id,count,end);
    if(cached)setData(cached);
    const savedAt=cached?.cache?.savedAt?new Date(cached.cache.savedAt).getTime():0;
    const freshFor=id==='__all__'?30*60_000:10*60_000;
    if(!refresh&&savedAt&&Date.now()-savedAt<freshFor){lastRefresh.current=savedAt;setLoading(false);setError('');return;}
    const request=++requestId.current;dashboardRequestInFlight.current=requestKey;setLoading(true);setError('');
    try{
      const response=await ruminaInsightsService.getDashboard(id,count,end,refresh);
      if(!mounted.current||request!==requestId.current)return;
      setData(response);lastRefresh.current=Date.now();remember(id);
    }catch(e){if(mounted.current&&request===requestId.current){if(!cached)setData(null);setError(e instanceof Error?e.message:'Não foi possível atualizar.');}}
    finally{if(dashboardRequestInFlight.current===requestKey)dashboardRequestInFlight.current='';if(mounted.current&&request===requestId.current)setLoading(false);}
  },[mode]);
  useEffect(()=>{setExportMessage('');void load(farmId,months,endMonth);return()=>{requestId.current++;};},[farmId,months,endMonth,load]);
  useEffect(()=>{
    if(!farmId)return;
    const refreshIfDue=(force=false)=>{
      if(document.visibilityState==='hidden'||!navigator.onLine)return;
      const refreshInterval=farmId==='__all__'?30*60_000:10*60_000;
      if(force||Date.now()-lastRefresh.current>=refreshInterval)void load(farmId,months,endMonth,force);
    };
    const onVisibility=()=>refreshIfDue(false);
    const onOnline=()=>refreshIfDue(true);
    const timer=window.setInterval(()=>refreshIfDue(false),60000);
    document.addEventListener('visibilitychange',onVisibility);
    window.addEventListener('focus',onVisibility);
    window.addEventListener('online',onOnline);
    return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('focus',onVisibility);window.removeEventListener('online',onOnline);};
  },[farmId,months,endMonth,load,mode]);
  const current=data?.farm.id===farmId&&data.period.months===months&&data.period.to.startsWith(endMonth)?data:null;
  const selectedFarm=farms.find(f=>f.id===farmId);
  const keys=KPI_KEYS[tab];
  const retry=()=>farmId?void load(farmId,months,endMonth,true):void loadFarms();
  const applyDates=(e:React.FormEvent)=>{
    e.preventDefault();
    const [sy,sm]=draftStart.split('-').map(Number),[ey,em]=draftEnd.split('-').map(Number);
    const count=(ey-sy)*12+em-sm+1;
    if(!Number.isInteger(count)||count<1||count>12||draftEnd>currentMonth()||sy<2000){setFilterError('Escolha de 1 a 12 meses, até o mês atual.');return;}
    setMonths(count);setEndMonth(draftEnd);setFilterError('');setFiltersOpen(false);
  };
  const exportCsv=async()=>{
    if(!current)return;setExporting(true);setExportMessage('');
    try{await exportBiCsv(current);setExportMessage('Arquivo preparado para salvar ou compartilhar.');}
    catch(e){setExportMessage(e instanceof Error?e.message:'Não foi possível exportar.');}
    finally{setExporting(false);}
  };

  return <Layout className="bg-[#f3f5f0]">
    <Header title={mode==='management'?'Gestão Campo Legado':'Indicadores da Fazenda'} targetRoute="/" />
    <main className="bi-screen">
      <div className="bi-intro"><div><p className="bi-eyebrow">Campo Legado Consultoria</p><h1>{mode==='management'?'Gestão Campo Legado':'Indicadores da Fazenda'}</h1><p className="bi-intro-copy">{mode==='management'?'Comparativo consolidado de todas as fazendas atendidas.':'Rebanho, produção, reprodução, saúde e financeiro por fazenda.'}</p></div><button type="button" className="bi-icon-button" aria-label="Atualizar indicadores" onClick={retry} disabled={loading||loadingFarms}><RefreshCw size={18} className={loading||loadingFarms?'animate-spin':''} /></button></div>
      <section className="bi-filter" aria-label="Filtros do painel">
        <label>{mode==='management'?'Visão':'Fazenda'}</label>
        {mode==='management'?<div className="bi-locked-view"><strong>Gestão Campo Legado</strong><span>{selectedFarm?.farmCount||0} fazendas consolidadas</span></div>:<SearchableSelect value={farmId} options={farms.map(f=>({value:f.id,label:f.name,description:f.isAggregate?`${f.farmCount||0} fazendas consolidadas · visão administrativa`:`Atualizada em ${dateLabel(f.lastProcessedAt)}`}))} onChange={setFarmId} placeholder={loadingFarms?'Carregando fazendas…':'Buscar fazenda ou empresa'} searchPlaceholder="Digite o nome da fazenda ou empresa" disabled={loadingFarms} />}
        <div className="bi-filter-actions"><div className="bi-periods" aria-label="Período rápido">{[3,6,12].map(count=><button type="button" key={count} aria-pressed={months===count&&endMonth===currentMonth()} onClick={()=>{setMonths(count);setEndMonth(currentMonth());setDraftStart(periodStart(currentMonth(),count));setDraftEnd(currentMonth());}}>{count} meses</button>)}</div><button type="button" className="bi-filter-toggle" aria-label="Escolher período personalizado" aria-expanded={filtersOpen} onClick={()=>{setDraftStart(periodStart(endMonth,months));setDraftEnd(endMonth);setFiltersOpen(!filtersOpen);}}><SlidersHorizontal size={17} /></button></div>
        {filtersOpen&&<form className="bi-custom-period" onSubmit={applyDates}><div className="bi-date-grid"><label>De<input type="month" value={draftStart} min="2000-01" max={draftEnd} required onChange={e=>setDraftStart(e.target.value)} /></label><label>Até<input type="month" value={draftEnd} min={draftStart} max={currentMonth()} required onChange={e=>setDraftEnd(e.target.value)} /></label></div>{filterError&&<p role="alert" className="bi-muted">{filterError}</p>}<button className="bi-primary" type="submit">Aplicar período</button></form>}
      </section>
      <div className="bi-farm-caption"><span><CalendarDays size={13} />{monthLabel(periodStart(endMonth,months))} — {monthLabel(endMonth)}</span><span className="bi-farm-count">{selectedFarm?.isAggregate?`${selectedFarm.farmCount||0} fazendas consolidadas`:`${farms.filter(f=>!f.isAggregate).length} fazendas disponíveis`}</span></div>
      <nav className="bi-tabs" aria-label="Áreas do painel">{TABS.map(({id,label,icon:Icon})=><button type="button" key={id} aria-pressed={tab===id} onClick={()=>setTab(id)}><Icon size={16} /><span>{label}</span></button>)}</nav>
      {error&&<div role="alert" className="bi-notice">{error}<button type="button" onClick={retry}>Tentar novamente</button></div>}
      {!loadingFarms&&!farms.length&&!error&&<p className="bi-notice">Nenhuma fazenda disponível nesta conta.</p>}
      {loading&&!current&&<div className="bi-panel bi-loading" role="status"><RefreshCw size={25} className="animate-spin" /><p>Consultando {selectedFarm?.name || 'a fazenda'}…</p><p className="bi-muted">Reunindo os registros do período.</p></div>}
      {current&&<>
        {current.cache?.fallback&&<p role="status" className="bi-notice">{current.cache.offline?'Sem internet.':'A atualização não foi concluída.'} Exibindo a consulta salva em {dateLabel(current.cache.savedAt)}.</p>}
        <section className="bi-farm-hero">
          <div><span className="bi-farm-hero-label">{current.farm.isAggregate?'Consolidado administrativo':'Fazenda analisada'}</span><h2>{current.farm.name}</h2></div>
          <div className="bi-coverage"><span><strong>{Object.keys(current.metrics).length}</strong><small>indicadores</small></span><span><strong>5</strong><small>áreas de análise</small></span><span><strong>{Object.values(current.sources).filter(source=>source.state!=='unavailable').length}</strong><small>fontes consultadas</small></span></div>
          <div className="bi-farm-hero-meta"><span><CalendarDays size={13}/>{monthLabel(periodStart(endMonth,months))} — {monthLabel(endMonth)}</span><span className="bi-live-dot">{loading?'Atualizando em segundo plano':'Dados atualizados'}</span></div>
        </section>
        <div className="bi-subheading"><div><h2>{TABS.find(t=>t.id===tab)?.label}</h2><p>{TAB_COPY[tab]}</p></div><span>{endMonth===currentMonth()?'Mês em andamento':'Período fechado'}</span></div>
        {tab==='finance'&&<p className="bi-scope-note">Movimentações da fazenda no Ideagri. Valores apropriados por centro de custo; não são os valores das OS da consultoria.</p>}
        <div className="bi-kpis">{keys.map(key=><Kpi key={key} metric={key} data={current} />)}</div>
        {tab==='all'&&<MetricCatalog data={current}/>} 
        {tab==='overview'&&<>
          <Insights data={current}/>
          {current.farm.isAggregate&&<FarmComparison data={current}/>} 
          <div className="bi-area-grid">
            <AreaCard title="Leite" description="Produção e qualidade" icon={Droplets} onClick={()=>setTab('milk')} values={[{label:'Média',value:biNumber(current.metrics.averageMilk,'L')},{label:'Controles',value:biNumber(current.metrics.milkMeasurements)}]}/>
            <AreaCard title="Reprodução" description="Atividade do período" icon={HeartPulse} onClick={()=>setTab('reproduction')} values={[{label:'Inseminações',value:biNumber(current.metrics.inseminations)},{label:'Partos',value:biNumber(current.metrics.births)}]}/>
            <AreaCard title="Saúde e manejo" description="Ocorrências e ações" icon={Activity} onClick={()=>setTab('health')} values={[{label:'Doenças',value:biNumber(current.metrics.diseases)},{label:'Aplicações',value:biNumber(current.metrics.applications)}]}/>
            <AreaCard title="Financeiro" description="Movimentação da fazenda" icon={Wallet} onClick={()=>setTab('finance')} values={[{label:'Receitas',value:biNumber(current.metrics.revenue,'R$')},{label:'Despesas',value:biNumber(current.metrics.expense,'R$')}]}/>
          </div>
          <BiMetricComparison title="Movimentos do rebanho" subtitle="Volumes registrados no período; as barras permitem comparar a atividade entre eventos." data={current} metrics={[series('inseminations'),series('births','#b18424'),series('weanings','#66816b'),series('exits','#a65e48')]}/>
          <BiChart title="Produção de leite" subtitle="Média por controle, mês a mês" rows={current.trends} series={[series('averageMilk')]} unit="L" />
          <BiChart title="Atividade reprodutiva" subtitle="Inseminações e partos registrados no período" rows={current.trends} series={[series('inseminations'),series('births',SAGE)]} kind="bar" />
        </>}
        {tab==='milk'&&<>
          <BiChart title="Leite por controle" subtitle={`${biNumber(current.metrics.milkMeasurements)} medições no período`} rows={current.trends} series={[series('averageMilk')]} unit="L" />
          <BiChart title="Qualidade do leite" subtitle="Gordura e proteína médias nas análises" rows={current.trends} series={[series('averageFat'),series('averageProtein',CLAY)]} unit="%" />
          <BiChart title="Contagem de células somáticas" subtitle="CCS média, na unidade retornada pela origem" rows={current.trends} series={[series('averageCcs')]} />
          <div className="bi-kpis"><Kpi metric="milkMeasurements" data={current} /><Kpi metric="dryings" data={current} /></div>
          <MetricCatalog data={current} groups={[METRIC_GROUPS[1]]}/>
        </>}
        {tab==='reproduction'&&<>
          <BiDonut title="Resultado das inseminações" value={current.metrics.pregnanciesConfirmed} total={current.metrics.pregnanciesEvaluated} label="positivos"/>
          <BiMetricComparison title="Atividade reprodutiva" subtitle="Comparação dos eventos registrados no período; não representa uma mesma coorte de animais." data={current} metrics={[series('inseminations'),series('pregnanciesConfirmed','#b18424'),series('births','#66816b'),series('abortions','#a65e48')]}/>
          <BiChart title="Inseminações e partos" rows={current.trends} series={[series('inseminations'),series('births',SAGE)]} kind="bar" />
          <BiChart title="Prenhez nas inseminações" subtitle="Percentual positivo entre resultados reconhecidos" rows={current.trends} series={[series('pregnancyRate')]} unit="%" />
          <p className="bi-scope-note">{biNumber(current.metrics.pregnanciesConfirmed)} resultados positivos de {biNumber(current.metrics.pregnanciesEvaluated)} reconhecidos. Esse percentual não equivale à taxa de prenhez de todo o rebanho.</p>
          <MetricCatalog data={current} groups={[METRIC_GROUPS[2]]}/>
        </>}
        {tab==='health'&&<>
          <BiChart title="Ocorrências de saúde" rows={current.trends} series={[series('mastitisCases'),series('diseases',CLAY)]} kind="bar" />
          <BiChart title="Evolução das pesagens" subtitle="Média das pesagens disponíveis em cada mês" rows={current.trends} series={[series('averageWeight')]} unit="kg" />
          <BiBreakdown title="Doenças registradas" items={current.breakdowns.diseases.map(i=>({label:i.label,value:i.count}))} />
          <BiBreakdown title="Produtos mais aplicados" items={current.breakdowns.applications.map(i=>({label:i.label,value:i.count}))} />
          <BiBreakdown title="Motivos de baixa" items={current.breakdowns.exits.map(i=>({label:i.label,value:i.count}))} />
          <div className="bi-kpis"><Kpi metric="weighings" data={current} /><Kpi metric="dryings" data={current} /></div>
          <MetricCatalog data={current} groups={[METRIC_GROUPS[3]]}/>
        </>}
        {tab==='finance'&&<>
          {current.sources.receitas.state==='empty'&&current.sources.despesas.state==='empty'&&<p className="bi-notice">Esta fazenda não retornou lançamentos financeiros para o período escolhido. Experimente ampliar ou alterar as datas.</p>}
          <BiChart title="Receitas e despesas" subtitle="Valores apropriados por mês" rows={current.trends} series={[series('revenue'),series('expense',CLAY)]} unit="R$" kind="bar" />
          <BiChart title="Saldo mensal" subtitle="Receitas menos despesas registradas" rows={current.trends} series={[series('balance')]} unit="R$" />
          <BiBreakdown title="Despesas por conta gerencial" items={current.breakdowns.expenses} money />
          <BiBreakdown title="Receitas por conta gerencial" items={current.breakdowns.revenues} money />
          <MetricCatalog data={current} groups={[METRIC_GROUPS[4]]}/>
        </>}
        <details className="bi-panel bi-monthly"><summary><span>Detalhamento mensal</span><ChevronDown size={16} /></summary><div className="bi-table-wrap"><table><caption className="sr-only">Indicadores mensais da fazenda selecionada</caption><thead><tr><th>Mês</th>{keys.filter(k=>k!=='activeAnimals').map(k=><th key={k}>{BI_METRICS[k].label}{BI_METRICS[k].unit?` (${BI_METRICS[k].unit})`:''}</th>)}</tr></thead><tbody>{current.trends.map(row=><tr key={row.monthKey}><td>{row.label}</td>{keys.filter(k=>k!=='activeAnimals').map(k=><td key={k}>{biNumber(row[k],BI_METRICS[k].unit)}</td>)}</tr>)}</tbody></table></div></details>
        <details className="bi-panel bi-definitions"><summary><span>Origem e critérios</span><ChevronDown size={16} /></summary>
          <p>Fonte: Rúmina Insights (Ideagri), somente leitura. Processamento da fazenda: {dateLabel(current.source.lastProcessedAt)}. Consulta realizada: {dateLabel(current.source.generatedAt)}.</p>
          <p>O rebanho ativo mostra a posição atual. Os demais números consideram os eventos entre {dateLabel(current.period.from)} e {dateLabel(current.period.to)}, usando a data de referência fornecida pela API.</p>
          <p>Leite, CCS, gordura, proteína e peso são médias simples dos registros disponíveis, não médias das médias mensais. Leite por controle não representa a produção total. Zero indica ausência de eventos; “—” indica falta de valor ou consulta indisponível.</p>
          <p>Receitas e despesas somam os valores apropriados retornados pela origem. O saldo é a diferença, não o saldo bancário ou lucro contábil.</p>
          <div className="bi-table-wrap"><table><thead><tr><th>Fonte</th><th>Registros</th><th>Situação</th></tr></thead><tbody>{Object.entries(current.sources).map(([name,source])=><tr key={name}><td>{name}</td><td>{source.records}</td><td>{{ok:'Disponível',empty:'Sem registros',partial:'Parcial',unavailable:'Indisponível'}[source.state]}</td></tr>)}</tbody></table></div>
        </details>
        <button className="bi-export" type="button" onClick={()=>void exportCsv()} disabled={exporting}><Download size={16} />{exporting?'Preparando arquivo…':'Exportar indicadores · CSV'}</button>
        {exportMessage&&<p className="bi-muted" role="status">{exportMessage}</p>}
        <p className="bi-source-line"><Check size={12} className="inline" /> Consulta em {dateLabel(current.source.generatedAt)} · Campo Legado Consultoria</p>
      </>}
    </main>
  </Layout>;
};
export default RuminaInsightsScreen;
