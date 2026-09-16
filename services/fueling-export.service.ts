import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import type { Fueling } from '../types';

const fuelLabels:Record<Fueling['fuelType'],string>={
  gasolina_comum:'Gasolina comum',gasolina_aditivada:'Gasolina aditivada',etanol:'Etanol',diesel_s10:'Diesel S10',diesel_s500:'Diesel S500',outro:'Outro'
};
const cell=(value:unknown)=>`"${String(value??'').replace(/^([=+@\-\t\r])/,"'$1").replace(/"/g,'""')}"`;
const decimal=(value:number,digits=2)=>value.toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits});

export async function exportFuelingsCsv(rows:Fueling[]):Promise<string>{
  const header=['Data','Hora','Veículo','Placa','Hodômetro (km)','Combustível','Preço por litro (R$)','Valor total (R$)','Litros','Tanque completo','Posto','Motorista','Observações','Lançado por'];
  const ordered=[...rows].sort((a,b)=>`${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const lines=[header,...ordered.map(item=>[
    item.date.split('-').reverse().join('/'),item.time,item.vehicle,item.vehiclePlate||'',decimal(item.odometer,1),fuelLabels[item.fuelType]||item.fuelType,
    decimal(item.pricePerLiter,3),decimal(item.totalValue),decimal(item.liters,3),item.fullTank?'Sim':'Não',item.station||'',item.driverName,item.notes||'',item.employee_name||''
  ])].map(row=>row.map(cell).join(';'));
  const csv='\uFEFF'+lines.join('\r\n');
  const stamp=new Date().toISOString().slice(0,10);
  const fileName=`Abastecimentos-Campo-Legado-${stamp}.csv`;
  if(Capacitor.isNativePlatform()){
    const {Share}=await import('@capacitor/share');
    const file=await Filesystem.writeFile({path:fileName,directory:Directory.Cache,data:csv,encoding:Encoding.UTF8});
    await Share.share({title:'Abastecimentos',text:`${rows.length} lançamento(s) exportado(s).`,files:[file.uri]});
  }else{
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download=fileName;document.body.appendChild(link);link.click();link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),500);
  }
  return fileName;
}
