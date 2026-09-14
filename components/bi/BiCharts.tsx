import React, { useId, useState } from 'react';
import type { MetricKey, RuminaDashboard } from '../../types/rumina-bi';

export const biNumber = (value: number | null | undefined, unit = '') => {
  if (value == null) return '—';
  if (unit === 'R$') return value.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits:2 })}${unit ? ` ${unit}` : ''}`;
};
export type Series = { key: MetricKey; label: string; color: string };
export function BiChart({ title, subtitle, rows, series, unit='', kind='line' }: {
  title: string; subtitle?: string; rows: RuminaDashboard['trends']; series: Series[]; unit?: string; kind?: 'line'|'bar';
}) {
  const gradient = useId().replace(/:/g,'');
  const [selected, setSelected] = useState('');
  const focus = rows.find(r=>r.monthKey===selected) || [...rows].reverse().find(r=>series.some(s=>r[s.key]!=null)) || rows[rows.length-1];
  const focusIndex=focus?rows.indexOf(focus):-1;
  const primary=series[0];
  const primaryValue=focus?.[primary.key] ?? null;
  const previousValue=focusIndex>0?rows[focusIndex-1][primary.key]:null;
  const change=primaryValue!==null&&previousValue!==null&&previousValue!==0?(primaryValue-previousValue)/Math.abs(previousValue)*100:null;
  const peak=[...rows].filter(r=>r[primary.key]!==null).sort((a,b)=>(b[primary.key] as number)-(a[primary.key] as number))[0];
  const values=rows.flatMap(r=>series.map(s=>r[s.key])).filter((v):v is number=>v!==null);
  const hi=Math.max(1,...values), lo=Math.min(0,...values);
  const left=46, right=330, top=18, bottom=168;
  const y=(value:number)=>bottom-(value-lo)/(hi-lo)*(bottom-top);
  const step=(right-left)/Math.max(rows.length,1);
  const x=(i:number)=>left+step*(i+.5);
  const points=(key:MetricKey)=> {
    const segments: Array<Array<[number,number]>>=[];
    rows.forEach((r,i)=>{
      if(r[key]===null) return;
      if(!i || rows[i-1][key]===null) segments.push([]);
      segments[segments.length-1].push([x(i),y(r[key]!)]);
    });
    return segments;
  };
  const short=(v:number)=>new Intl.NumberFormat('pt-BR',{notation:'compact',maximumFractionDigits:1}).format(v);
  return <section className="bi-panel bi-chart-panel">
    <div className="bi-section-heading"><div><span className="bi-section-kicker">Evolução mensal</span><h2>{title}</h2></div>{unit && <span className="bi-unit">Unidade · {unit}</span>}</div>
    {subtitle && <p className="bi-muted bi-chart-description">{subtitle}</p>}
    <div className="bi-chart-legend" aria-label="Legenda do gráfico">
      {series.map((s,index)=><span key={s.key}><i style={{borderColor:s.color,background:index%2?'#fff':s.color}} />{s.label}</span>)}
    </div>
    <div className="bi-chart-readout" aria-live="polite">
      <span className="bi-month-label">{focus?.label || 'Período'}</span>
      <div>{series.map(s=><span key={s.key}><span>{s.label}<strong>{biNumber(focus?.[s.key],unit)}</strong></span></span>)}</div>
    </div>
    {!!values.length&&<div className="bi-chart-context">
      <span><small>Variação mensal</small><strong>{change===null?'Sem comparação':`${change>0?'+':''}${change.toLocaleString('pt-BR',{maximumFractionDigits:1})}%`}</strong></span>
      <span><small>Maior valor</small><strong>{peak?`${biNumber(peak[primary.key],unit)} · ${peak.label.split(' de ')[0]}`:'—'}</strong></span>
    </div>}
    {!values.length ? <div className="bi-empty-chart">Sem medições disponíveis neste período.</div> : <>
      <svg className="bi-chart-svg" viewBox="0 0 342 201" role="img" aria-label={`${title}. Valores detalhados nos botões de mês e na tabela abaixo.`}>
        <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop stopColor={series[0].color} stopOpacity=".18" /><stop offset="1" stopColor={series[0].color} stopOpacity=".015" /></linearGradient></defs>
        {[0,.25,.5,.75,1].map(t=>{const value=lo+(hi-lo)*t;return <g key={t}><line x1={left} x2={right} y1={y(value)} y2={y(value)} stroke="#e7ece7" strokeDasharray={t?'3 5':undefined} /><text x={left-8} y={y(value)+3} textAnchor="end" fill="#76877d" fontSize="9.5">{short(value)}</text></g>;})}
        {focus && <line x1={x(rows.indexOf(focus))} x2={x(rows.indexOf(focus))} y1={top} y2={bottom} stroke="#bfd0c5" strokeDasharray="3 4" />}
        {series.map((s,si)=>kind==='line' ? <g key={s.key}>
          {points(s.key).map((part,i)=><g key={i}>{series.length===1 && <path d={`M ${part[0][0]} ${y(0)} L ${part.map(p=>p.join(' ')).join(' L ')} L ${part[part.length-1][0]} ${y(0)} Z`} fill={`url(#${gradient})`} />}
            <path d={`M ${part.map(p=>p.join(' ')).join(' L ')}`} fill="none" stroke={s.color} strokeWidth="3" strokeDasharray={si%2?'7 4':undefined} strokeLinejoin="round" strokeLinecap="round" />
            {part.map(([px,py])=><circle key={px} cx={px} cy={py} r={focus&&px===x(rows.indexOf(focus))?5:3.5} fill={si%2?s.color:'#fff'} stroke={s.color} strokeWidth="2" />)}</g>)}
        </g> : <g key={s.key}>{rows.map((r,i)=>r[s.key]===null?null:<rect key={r.monthKey} x={x(i)-step*.33+si*step*.66/series.length} y={Math.min(y(r[s.key]!),y(0))} width={Math.max(2,step*.66/series.length-2)} height={Math.max(r[s.key]===0?1:2,Math.abs(y(r[s.key]!)-y(0)))} rx="2.5" fill={s.color} opacity={r===focus?1:.65} />)}</g>)}
        {rows.map((r,i)=><rect key={`touch-${r.monthKey}`} className="bi-chart-touch" x={left+i*step} y={top} width={step} height={bottom-top} fill="transparent" onClick={()=>setSelected(r.monthKey)}><title>{r.label}: {series.map(s=>`${s.label} ${biNumber(r[s.key],unit)}`).join(', ')}</title></rect>)}
        {rows.map((r,i)=>(rows.length<=6 || i%2===0 || i===rows.length-1) && <text key={r.monthKey} x={x(i)} y="190" textAnchor="middle" fill="#687c70" fontSize="10" fontWeight={focus===r?'700':'500'}>{r.label.split(' de ')[0].split('/')[0].slice(0,3)}</text>)}
      </svg>
      <div className="bi-chart-hint">Toque em um mês para consultar os valores</div>
      <div className="bi-chart-months" aria-label={`Consultar mês: ${title}`}>{rows.map(r=><button type="button" key={r.monthKey} aria-pressed={focus===r} onClick={()=>setSelected(r.monthKey)} aria-label={`${r.label}, ${series.map(s=>`${s.label}: ${biNumber(r[s.key],unit)}`).join(', ')}`}>{r.label.split(' de ')[0]}</button>)}</div>
    </>}
  </section>;
}

export function BiBreakdown({title,items,money=false}:{title:string;items:{label:string;value:number}[];money?:boolean}) {
  const max=Math.max(1,...items.map(i=>Math.abs(i.value)));
  return <section className="bi-panel"><div className="bi-section-heading"><h2>{title}</h2></div>
    {!items.length && <p className="bi-empty-chart">Sem registros para detalhar.</p>}
    <div className="bi-breakdown">{items.slice(0,6).map(item=><div key={item.label}><div><span>{item.label}</span><strong>{biNumber(item.value,money?'R$':'')}</strong></div><div className="bi-track"><span style={{width:`${Math.abs(item.value)/max*100}%`}} /></div></div>)}</div>
    {items.length>6 && <p className="bi-muted">Exibindo as 6 maiores categorias de {items.length}.</p>}
  </section>;
}

export function BiMetricComparison({title,subtitle,data,metrics}:{title:string;subtitle:string;data:RuminaDashboard;metrics:Series[]}) {
  const items=metrics.map(item=>({...item,value:data.metrics[item.key]}));
  const max=Math.max(1,...items.map(item=>Math.max(0,item.value||0)));
  return <section className="bi-panel bi-comparison">
    <div className="bi-section-heading"><div><span className="bi-section-kicker">Comparação</span><h2>{title}</h2></div></div>
    <p className="bi-muted bi-chart-description">{subtitle}</p>
    <div className="bi-comparison-list">{items.map(item=><div key={item.key}>
      <div className="bi-comparison-copy"><span>{item.label}</span><strong>{biNumber(item.value)}</strong></div>
      <div className="bi-comparison-track"><span style={{width:`${Math.max(0,item.value||0)/max*100}%`,background:item.color}} /></div>
    </div>)}</div>
  </section>;
}

export function BiDonut({title,value,total,label,emptyLabel='Sem resultado'}:{title:string;value:number|null;total:number|null;label:string;emptyLabel?:string}) {
  const ratio=value!==null&&total!==null&&total>0?Math.max(0,Math.min(100,value/total*100)):null;
  const circumference=2*Math.PI*47;
  return <section className="bi-panel bi-donut-panel">
    <div><span className="bi-section-kicker">Composição</span><h2>{title}</h2><p className="bi-muted">{ratio===null?emptyLabel:`${biNumber(value)} de ${biNumber(total)} resultados registrados`}</p></div>
    <div className="bi-donut" aria-label={ratio===null?emptyLabel:`${ratio.toFixed(1)}% ${label}`}>
      <svg viewBox="0 0 112 112" role="img"><circle cx="56" cy="56" r="47" className="bi-donut-base"/><circle cx="56" cy="56" r="47" className="bi-donut-value" strokeDasharray={`${ratio===null?0:ratio/100*circumference} ${circumference}`}/></svg>
      <span><strong>{ratio===null?'—':`${ratio.toLocaleString('pt-BR',{maximumFractionDigits:1})}%`}</strong><small>{label}</small></span>
    </div>
  </section>;
}
