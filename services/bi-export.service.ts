import { Capacitor } from '@capacitor/core';
import type { RuminaDashboard } from '../types/rumina-bi';
import { BI_METRICS } from '../utils/bi-presentation';
export const csvCell=(value:unknown)=>typeof value==='number'?String(value).replace('.',','):`"${String(value ?? '').replace(/^([=+@\-\t\r])/,"'$1").replace(/"/g,'""')}"`;
export async function exportBiCsv(data:RuminaDashboard) {
  const definitions=Object.entries(BI_METRICS);
  const headers=['Fazenda','Periodo','Indicador','Unidade','Valor','Situacao da fonte','Consultado em'];
  const lines=[headers.map(csvCell).join(';')];
  for(const [key,meta] of definitions) {
    for(const row of [{...data.metrics,monthKey:`${data.period.from} a ${data.period.to}`},...data.trends]) {
      if(key==='activeAnimals' && row.monthKey.length===7) continue;
      const value=row[key as keyof typeof data.metrics];
      lines.push([data.farm.name,row.monthKey,meta.label,meta.unit,value,meta.sources.map(s=>`${s}: ${data.sources[s].state}`).join(' / '),data.source.generatedAt].map(csvCell).join(';'));
    }
  }
  const breakdowns:[string,{label:string;count?:number;value?:number}[],string][]=[
    ['Doenças registradas',data.breakdowns.diseases,'ocorrências'],
    ['Produtos aplicados',data.breakdowns.applications,'aplicações'],
    ['Motivos de baixa',data.breakdowns.exits,'animais'],
    ['Tipos de animais ativos',data.breakdowns.animalTypes,'animais'],
    ['Despesas por conta',data.breakdowns.expenses,'R$'],
    ['Receitas por conta',data.breakdowns.revenues,'R$']
  ];
  for(const [group,items,unit] of breakdowns)for(const item of items){
    lines.push([data.farm.name,`${data.period.from} a ${data.period.to}`,`${group} · ${item.label}`,unit,item.count??item.value??null,'Detalhamento',data.source.generatedAt].map(csvCell).join(';'));
  }
  const csv='\uFEFF'+lines.join('\r\n');
  const name=`BI-${data.farm.name.replace(/[^\p{L}\p{N}-]/gu,'_')}-${data.period.from}-${data.period.to}.csv`;
  if(Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding }=await import('@capacitor/filesystem');
    const { Share }=await import('@capacitor/share');
    const file=await Filesystem.writeFile({path:name,directory:Directory.Cache,data:csv,encoding:Encoding.UTF8});
    await Share.share({title:'Indicadores da fazenda',files:[file.uri]});
  } else {
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a'); link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
}
