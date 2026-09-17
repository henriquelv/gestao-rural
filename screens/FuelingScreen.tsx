import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CarFront, Check, ChevronDown, Droplets, Edit3, FileSpreadsheet, FilterX, Fuel, Gauge, ListFilter, Loader2, MapPin, Plus, Search, SlidersHorizontal, Trash2, UserRound } from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { Layout } from '../components/Layout';
import { SearchableSelect } from '../components/SearchableSelect';
import { FuelCatalogDialog } from '../components/FuelCatalogDialog';
import { FuelingAnalytics, summarizeFuelings } from '../components/FuelingAnalytics';
import { db } from '../services/db.service';
import { exportFuelingsCsv } from '../services/fueling-export.service';
import { farmContextService } from '../services/farm-context.service';
import { localdb } from '../services/localdb';
import { notify } from '../services/notification.service';
import { permissionsService } from '../services/permissions.service';
import type { Employee, Fueling, FuelVehicle, FuelStation } from '../types';
import { formatAutomaticCents, parseCurrency } from '../utils/work-orders';
import { createId } from '../utils/id';

const fuelOptions:Array<{value:Fueling['fuelType'];label:string}>=[
  {value:'gasolina_comum',label:'Gasolina comum'},{value:'gasolina_aditivada',label:'Gasolina aditivada'},{value:'etanol',label:'Etanol'},
  {value:'diesel_s10',label:'Diesel S10'},{value:'diesel_s500',label:'Diesel S500'},{value:'outro',label:'Outro'}
];
const fuelLabel=(value:Fueling['fuelType'])=>fuelOptions.find(item=>item.value===value)?.label||value;
const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const decimal=(value:number,digits=1)=>value.toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits,useGrouping:false});
const localDate=()=>{const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;};
const localTime=()=>new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
const numberValue=(value:string)=>{const parsed=Number(value.replace(',','.'));return Number.isFinite(parsed)?parsed:0;};
type FormState={vehicle:string;vehicleId:string;vehiclePlate:string;date:string;time:string;odometer:string;fuelType:Fueling['fuelType'];price:string;total:string;liters:string;fullTank:boolean;station:string;stationId:string;driverId:string;notes:string};
const freshForm=(driverId=''):FormState=>({vehicle:'',vehicleId:'',vehiclePlate:'',date:localDate(),time:localTime(),odometer:'',fuelType:'gasolina_comum',price:'',total:'',liters:'',fullTank:true,station:'',stationId:'',driverId,notes:''});

export const FuelingScreen:React.FC=()=>{
  const location=useLocation();
  const navigate=useNavigate();
  const [searchParams]=useSearchParams();
  const historyView=location.pathname.endsWith('/history');
  const context=farmContextService.getContext();
  const isAdmin=permissionsService.isAdmin(context);
  const [rows,setRows]=useState<Fueling[]>([]);
  const [employees,setEmployees]=useState<Employee[]>(()=>context?[{id:context.employee_id,name:context.employee_name||'Usuário',role:context.employee_role||'Técnico',is_admin:context.is_admin,status:'active',farm_id:context.farm_id}]:[]);
  const [vehicles,setVehicles]=useState<FuelVehicle[]>([]);
  const [stations,setStations]=useState<FuelStation[]>([]);
  const [catalogDialog,setCatalogDialog]=useState<'vehicle'|'station'|null>(null);
  const [form,setForm]=useState<FormState>(()=>freshForm(context?.employee_id||''));
  const [editingId,setEditingId]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [exporting,setExporting]=useState(false);
  const [search,setSearch]=useState('');
  const [month,setMonth]=useState('');
  const [employeeFilter,setEmployeeFilter]=useState('');
  const [vehicleFilter,setVehicleFilter]=useState('');
  const [stationFilter,setStationFilter]=useState('');
  const [fuelFilter,setFuelFilter]=useState('');
  const [todayOnly,setTodayOnly]=useState(false);
  const [filtersOpen,setFiltersOpen]=useState(()=>typeof window!=='undefined'&&window.matchMedia('(min-width: 768px)').matches);
  const [moreOpen,setMoreOpen]=useState(false);

  const load=async()=>{
    const staffPromise=db.getEmployees().then(staff=>setEmployees(staff.filter(item=>!item.status||item.status==='active'))).catch(error=>console.warn('Lista de funcionários indisponível:',error));
    try{const [fuelings,cars,posts]=await Promise.all([db.getFuelings(),db.getFuelVehicles(),db.getFuelStations()]);setRows(fuelings);setVehicles(cars.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')));setStations(posts.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')));void staffPromise;}
    catch(error){console.error(error);notify('Não foi possível carregar os abastecimentos.','error');}
    finally{setLoading(false);}
  };
  useEffect(()=>{
    void load();
    let scheduled:number|undefined;
    const refresh=()=>{window.clearTimeout(scheduled);scheduled=window.setTimeout(()=>void load(),80);};
    const unsubscribe=['fuelings','fuel_vehicles','fuel_stations'].map(table=>localdb.subscribe(table,refresh));
    return()=>{window.clearTimeout(scheduled);unsubscribe.forEach(stop=>stop());};
  },[]);

  const vehicleOptions=vehicles.map(vehicle=>({value:vehicle.id,label:vehicle.name,description:vehicle.plate||'Sem placa informada'}));
  const vehicleValue=form.vehicleId|| (editingId&&form.vehicle?`legacy:${editingId}`:'');
  if(editingId&&form.vehicle&&!vehicleOptions.some(item=>item.value===vehicleValue))vehicleOptions.unshift({value:vehicleValue,label:form.vehicle,description:form.vehiclePlate||'Veículo registrado neste abastecimento'});
  const stationOptions=[{value:'',label:'Sem posto informado',description:''},...stations.map(station=>({value:station.id,label:station.name,description:station.address||''}))];
  const stationValue=form.stationId||(editingId&&form.station?`legacy:${editingId}`:'');
  if(editingId&&form.station&&!stationOptions.some(item=>item.value===stationValue))stationOptions.push({value:stationValue,label:form.station,description:'Posto registrado neste abastecimento'});
  const chooseVehicle=(id:string)=>{const vehicle=vehicles.find(item=>item.id===id);if(vehicle)setForm(current=>({...current,vehicleId:id,vehicle:vehicle.name,vehiclePlate:vehicle.plate,odometer:current.vehicleId===id?current.odometer:''}));};
  const chooseStation=(id:string)=>{const station=stations.find(item=>item.id===id);if(!id||station)setForm(current=>({...current,stationId:id,station:station?.name||''}));};
  const addCatalog=async(name:string,detail:string)=>{
    const ctx=farmContextService.getContext();
    if(!ctx||ctx.employee_id!==context?.employee_id||ctx.farm_id!==context.farm_id)throw new Error('O perfil de acesso mudou. Entre novamente.');
    const metadata={farm_id:ctx.farm_id,employee_id:ctx.employee_id,employee_name:ctx.employee_name,device_id:ctx.device_id,createdAt:new Date().toISOString()};
    if(catalogDialog==='vehicle'){
      const vehicle:FuelVehicle={...metadata,id:createId('vehicle'),name,plate:detail};await db.addFuelVehicle(vehicle);
      setVehicles(current=>[...current.filter(item=>item.id!==vehicle.id),vehicle]);setForm(current=>({...current,vehicleId:vehicle.id,vehicle:name,vehiclePlate:detail,odometer:''}));notify('Veículo adicionado à sua lista.','success');
    }else{
      const station:FuelStation={...metadata,id:createId('station'),name,address:detail};await db.addFuelStation(station);
      setStations(current=>[...current.filter(item=>item.id!==station.id),station]);setForm(current=>({...current,stationId:station.id,station:name}));notify('Posto adicionado à sua lista.','success');
    }
    await load();
  };
  const lastOdometer=useMemo(()=>{const owner=rows.find(item=>item.id===editingId)?.employee_id||context?.employee_id;return Math.max(0,...rows.filter(item=>item.id!==editingId&&(form.vehicleId?item.vehicleId===form.vehicleId:!item.vehicleId&&item.employee_id===owner&&item.vehicle.trim().toLocaleLowerCase('pt-BR')===form.vehicle.trim().toLocaleLowerCase('pt-BR'))).map(item=>Number(item.odometer)||0));},[editingId,form.vehicle,form.vehicleId,rows,context?.employee_id]);
  const vehicleKey=(item:Fueling)=>item.vehicleId?`id:${item.vehicleId}`:`name:${item.vehicle.trim().toLocaleLowerCase('pt-BR')}`;
  const stationKey=(item:Fueling)=>item.stationId?`id:${item.stationId}`:`name:${(item.station||'').trim().toLocaleLowerCase('pt-BR')}`;
  const historyVehicleOptions=useMemo(()=>{
    const seen=new Set<string>();
    return [{value:'',label:'Todos os veículos',description:''},...rows.filter(item=>{const key=vehicleKey(item);if(seen.has(key))return false;seen.add(key);return true;}).map(item=>({value:vehicleKey(item),label:item.vehicle,description:item.vehiclePlate||''})).sort((a,b)=>a.label.localeCompare(b.label,'pt-BR'))];
  },[rows]);
  const historyStationOptions=useMemo(()=>{
    const seen=new Set<string>();
    return [{value:'',label:'Todos os postos',description:''},...rows.filter(item=>Boolean(item.station?.trim())).filter(item=>{const key=stationKey(item);if(seen.has(key))return false;seen.add(key);return true;}).map(item=>({value:stationKey(item),label:item.station||'',description:''})).sort((a,b)=>a.label.localeCompare(b.label,'pt-BR'))];
  },[rows]);
  const employeeFilterOptions=[{value:'',label:'Todos os técnicos',description:''},...employees.map(item=>({value:String(item.id),label:item.name,description:item.role||'Técnico'}))];
  const fuelFilterOptions=[{value:'',label:'Todos os combustíveis'},...fuelOptions];
  const filtered=useMemo(()=>rows
    .filter(item=>!todayOnly||item.date===localDate())
    .filter(item=>!month||item.date.startsWith(month))
    .filter(item=>!employeeFilter||String(item.driverId||item.employee_id)===employeeFilter)
    .filter(item=>!vehicleFilter||vehicleKey(item)===vehicleFilter)
    .filter(item=>!stationFilter||stationKey(item)===stationFilter)
    .filter(item=>!fuelFilter||item.fuelType===fuelFilter)
    .filter(item=>`${item.vehicle} ${item.vehiclePlate||''} ${item.driverName} ${item.station||''} ${fuelLabel(item.fuelType)}`.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR')))
    .sort((a,b)=>`${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)),[employeeFilter,fuelFilter,month,rows,search,stationFilter,todayOnly,vehicleFilter]);
  const analyticsRows=useMemo(()=>rows
    .filter(item=>!todayOnly||item.date===localDate())
    .filter(item=>!month||item.date.startsWith(month))
    .filter(item=>!vehicleFilter||vehicleKey(item)===vehicleFilter)
    .filter(item=>!stationFilter||stationKey(item)===stationFilter)
    .filter(item=>!fuelFilter||item.fuelType===fuelFilter)
    .filter(item=>`${item.vehicle} ${item.vehiclePlate||''} ${item.driverName} ${item.station||''} ${fuelLabel(item.fuelType)}`.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR'))),[fuelFilter,month,rows,search,stationFilter,todayOnly,vehicleFilter]);
  const summary=useMemo(()=>summarizeFuelings(rows,filtered),[filtered,rows]);
  const currentMonth=localDate().slice(0,7);
  const activeFilterCount=[search,month,employeeFilter,vehicleFilter,stationFilter,fuelFilter,todayOnly].filter(Boolean).length;
  const hasFilters=activeFilterCount>0;
  const clearFilters=()=>{setSearch('');setMonth('');setEmployeeFilter('');setVehicleFilter('');setStationFilter('');setFuelFilter('');setTodayOnly(false);};
  const selectAllPeriods=()=>{setTodayOnly(false);setMonth('');};
  const selectToday=()=>{setTodayOnly(true);setMonth('');};
  const selectCurrentMonth=()=>{setTodayOnly(false);setMonth(currentMonth);};

  const setPrice=(value:string)=>{const price=formatAutomaticCents(value);const numericPrice=parseCurrency(price);const currentTotal=parseCurrency(form.total);setForm(current=>({...current,price,liters:numericPrice>0&&currentTotal>0?decimal(currentTotal/numericPrice,3):current.liters}));};
  const setTotal=(value:string)=>{const total=formatAutomaticCents(value);const numericTotal=parseCurrency(total);const price=parseCurrency(form.price);setForm(current=>({...current,total,liters:price>0&&numericTotal>0?decimal(numericTotal/price,3):current.liters}));};
  const setLiters=(value:string)=>{const cleaned=value.replace(/[^0-9,.]/g,'').replace('.',',');const liters=numberValue(cleaned);const price=parseCurrency(form.price);setForm(current=>({...current,liters:cleaned,total:price>0&&liters>0?formatAutomaticCents(String(Math.round(price*liters*100))):current.total}));};
  const reset=()=>{setForm(freshForm(context?.employee_id||''));setEditingId(null);setMoreOpen(false);};
  const save=async(event:React.FormEvent)=>{
    event.preventDefault();
    const driver=employees.find(item=>String(item.id)===form.driverId)||employees.find(item=>item.name===context?.employee_name);
    const odometer=numberValue(form.odometer),pricePerLiter=parseCurrency(form.price),totalValue=parseCurrency(form.total),liters=numberValue(form.liters);
    if(!form.vehicle.trim()||!form.date||!form.time||!driver||odometer<=0||pricePerLiter<=0||totalValue<=0||liters<=0){notify('Preencha veículo, data, hodômetro, combustível, valores e motorista.','error');return;}
    if(lastOdometer>0&&odometer<lastOdometer&&!window.confirm(`O hodômetro informado é menor que o último registro (${decimal(lastOdometer)} km). Deseja salvar mesmo assim?`))return;
    const existing=editingId?rows.find(item=>item.id===editingId):undefined;
    const item:Fueling={id:editingId||createId('fuel'),farm_id:context?.farm_id,employee_id:String(driver.id),employee_name:driver.name,device_id:context?.device_id,vehicle:form.vehicle.trim(),vehicleId:form.vehicleId||undefined,vehiclePlate:form.vehiclePlate,stationId:form.stationId||undefined,date:form.date,time:form.time,odometer,fuelType:form.fuelType,pricePerLiter,totalValue,liters,fullTank:form.fullTank,station:form.station.trim(),driverId:String(driver.id),driverName:driver.name,notes:form.notes.trim(),createdAt:existing?.createdAt||new Date().toISOString(),updated_at:new Date().toISOString()};
    setSaving(true);
    try{if(editingId)await db.updateFueling(item);else await db.addFueling(item);notify(editingId?'Abastecimento atualizado.':'Abastecimento salvo.','success');reset();await load();navigate('/fuelings/history');}
    catch(error){console.error(error);notify(error instanceof Error?error.message:'Não foi possível salvar.','error');}
    finally{setSaving(false);}
  };
  const edit=(item:Fueling)=>navigate(`/fuelings/new?edit=${encodeURIComponent(item.id)}`);
  const remove=async(item:Fueling)=>{if(!window.confirm(`Excluir o abastecimento de ${item.vehicle} em ${item.date.split('-').reverse().join('/')}?`))return;try{await db.deleteFueling(item.id);notify('Abastecimento excluído.','success');await load();}catch(error){notify(error instanceof Error?error.message:'Não foi possível excluir.','error');}};
  const exportAll=async()=>{if(!filtered.length){notify('Não há abastecimentos para exportar.','info');return;}setExporting(true);try{await exportFuelingsCsv(filtered);notify('CSV preparado com os lançamentos filtrados.','success');}catch(error){console.error(error);notify('Não foi possível exportar o CSV.','error');}finally{setExporting(false);}};
  const staffOptions=(isAdmin?employees:employees.filter(item=>String(item.id)===String(context?.employee_id))).map(item=>({value:String(item.id),label:item.name,description:item.role||'Técnico'}));

  useEffect(()=>{
    const requestedId=searchParams.get('edit');
    if(!requestedId||loading||editingId===requestedId)return;
    const item=rows.find(row=>row.id===requestedId);
    if(!item){notify('Abastecimento não encontrado ou sem permissão de acesso.','error');navigate('/fuelings/history',{replace:true});return;}
    setEditingId(item.id);
    setForm({vehicle:item.vehicle,vehicleId:item.vehicleId||'',vehiclePlate:item.vehiclePlate||'',stationId:item.stationId||'',date:item.date,time:item.time,odometer:String(item.odometer).replace('.',','),fuelType:item.fuelType,price:formatAutomaticCents(String(Math.round(item.pricePerLiter*100))),total:formatAutomaticCents(String(Math.round(item.totalValue*100))),liters:decimal(item.liters,3),fullTank:item.fullTank,station:item.station||'',driverId:item.driverId||item.employee_id||'',notes:item.notes||''});
    setMoreOpen(Boolean(item.notes));
  },[editingId,loading,navigate,rows,searchParams]);

  return <Layout className="bg-[#f4f0e7]"><Header title={historyView?'Histórico de abastecimentos':editingId?'Editar abastecimento':'Novo abastecimento'} targetRoute="/fuelings" />
    <main className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain pb-[calc(2rem+env(safe-area-inset-bottom))] [-webkit-overflow-scrolling:touch]">
      <section className="relative overflow-hidden bg-[#173f32] px-5 pb-5 pt-4 text-white md:px-7 md:py-6"><div className="absolute -right-8 -top-10 h-36 w-36 rounded-full border border-white/10 shadow-[0_0_0_24px_rgba(255,255,255,0.025)]" />
        <div className="relative flex items-center justify-between"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#d9b74c]">Controle de combustível</p><h1 className="campo-display mt-1 text-[27px]">{historyView?'Histórico':'Novo lançamento'}</h1></div><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#d9b74c] text-[#173f32]"><Fuel size={25}/></span></div>
        {historyView?<div className="relative mt-4 grid grid-cols-2 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] md:grid-cols-3 xl:grid-cols-6"><div className="border-b border-r border-white/10 px-3 py-3 xl:border-b-0"><span className="text-[8px] font-bold uppercase tracking-wider text-white/45">Valor total</span><strong className="mt-1 block truncate text-base">{money.format(summary.total)}</strong></div><div className="border-b border-white/10 px-3 py-3 md:border-r xl:border-b-0"><span className="text-[8px] font-bold uppercase tracking-wider text-white/45">Km rodados</span><strong className="mt-1 block text-base">{decimal(summary.km)} km</strong></div><div className="border-b border-r border-white/10 px-3 py-3 md:border-r-0 xl:border-b-0 xl:border-r"><span className="text-[8px] font-bold uppercase tracking-wider text-white/45">Litros</span><strong className="mt-1 block text-base">{decimal(summary.liters,2)} L</strong></div><div className="border-b border-white/10 px-3 py-3 md:border-r xl:border-b-0"><span className="text-[8px] font-bold uppercase tracking-wider text-white/45">Média km/L</span><strong className="mt-1 block text-base">{decimal(summary.efficiency,2)} km/L</strong></div><div className="border-r border-white/10 px-3 py-3"><span className="text-[8px] font-bold uppercase tracking-wider text-white/45">Preço médio/L</span><strong className="mt-1 block truncate text-base">{money.format(summary.price)}</strong></div><div className="px-3 py-3"><span className="text-[8px] font-bold uppercase tracking-wider text-white/45">Lançamentos</span><strong className="mt-1 block text-base">{summary.count}</strong></div></div>:<p className="relative mt-3 max-w-xs text-xs font-semibold leading-5 text-white/65">Preencha os dados do abastecimento. O lançamento fica salvo no aparelho mesmo sem internet.</p>}
      </section>
      {!historyView?<form onSubmit={save} className="space-y-4 px-4 pt-4 md:grid md:grid-cols-2 md:items-start md:gap-4 md:space-y-0 md:px-6 md:pt-6 xl:grid-cols-3">
        <section className="rounded-[22px] border border-[#d8d0c2] bg-white p-4 shadow-sm"><div className="mb-4 flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e5ecdf] text-[#315f45]"><CarFront size={21}/></span><div><p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#718078]">Veículo e percurso</p><h2 className="campo-display text-xl text-[#173f32]">Dados do veículo</h2></div></div>
          <div className="mb-2 flex items-center justify-between gap-2"><label className="text-[10px] font-black uppercase tracking-wide text-[#65736b]">Meu veículo</label><button type="button" onClick={()=>setCatalogDialog('vehicle')} className="flex min-h-11 items-center gap-1 text-xs font-bold text-[#315f45]"><Plus size={16}/>Adicionar veículo</button></div>
          <SearchableSelect value={vehicleValue} options={vehicleOptions} onChange={chooseVehicle} placeholder="Selecione seu veículo" searchPlaceholder="Buscar por veículo ou placa" emptyMessage="Você ainda não cadastrou este veículo. Use Adicionar veículo." disabled={loading}/>
          <p className="mt-2 text-[11px] text-[#718078]">Somente os veículos que você cadastrou aparecem na sua lista.</p>
          <label className="mt-3 block text-[10px] font-black uppercase tracking-wide text-[#65736b]">Placa<input aria-label="Placa do veículo" readOnly value={form.vehiclePlate} placeholder="Sem placa informada" className="mt-1.5 min-h-12 w-full rounded-xl border border-[#d8d0c2] bg-[#f3f5ef] px-3 text-base font-bold tracking-wider text-[#173f32]"/></label>
          <div className="mt-4 grid grid-cols-2 gap-3"><label className="text-[10px] font-black uppercase tracking-wide text-[#65736b]">Data<input required type="date" value={form.date} onChange={event=>setForm(current=>({...current,date:event.target.value}))} className="mt-1.5 min-h-12 w-full rounded-xl border-2 border-[#d8d0c2] px-3 text-sm font-bold text-[#173f32]"/></label><label className="text-[10px] font-black uppercase tracking-wide text-[#65736b]">Hora<input required type="time" value={form.time} onChange={event=>setForm(current=>({...current,time:event.target.value}))} className="mt-1.5 min-h-12 w-full rounded-xl border-2 border-[#d8d0c2] px-3 text-sm font-bold text-[#173f32]"/></label></div>
          <label className="mt-4 block text-[10px] font-black uppercase tracking-wide text-[#65736b]">Hodômetro<input required inputMode="decimal" value={form.odometer} onChange={event=>setForm(current=>({...current,odometer:event.target.value.replace(/[^0-9,.]/g,'')}))} placeholder="0,0 km" className="mt-1.5 min-h-12 w-full rounded-xl border-2 border-[#d8d0c2] px-3 text-sm font-bold text-[#173f32] outline-none focus:border-[#3f7457]"/></label>{lastOdometer>0&&<p className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-[#718078]"><Gauge size={14}/>Último hodômetro deste veículo: {decimal(lastOdometer)} km</p>}
        </section>
        <section className="rounded-[22px] border border-[#d8d0c2] bg-white p-4 shadow-sm"><div className="mb-4 flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f4e7bd] text-[#805e00]"><Droplets size={21}/></span><div><p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#718078]">Consumo</p><h2 className="campo-display text-xl text-[#173f32]">Combustível e valores</h2></div></div>
          <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-[#65736b]">Combustível</label><SearchableSelect value={form.fuelType} options={fuelOptions} onChange={value=>setForm(current=>({...current,fuelType:value as Fueling['fuelType']}))} placeholder="Escolha o combustível" searchPlaceholder="Buscar combustível"/>
          <div className="mt-4 grid grid-cols-2 gap-3"><label className="text-[10px] font-black uppercase tracking-wide text-[#65736b]">Preço por litro<input required inputMode="numeric" value={form.price} onChange={event=>setPrice(event.target.value)} placeholder="0,00" className="mt-1.5 min-h-12 w-full rounded-xl border-2 border-[#d8d0c2] px-3 text-base font-black text-[#173f32]"/></label><label className="text-[10px] font-black uppercase tracking-wide text-[#65736b]">Valor total<input required inputMode="numeric" value={form.total} onChange={event=>setTotal(event.target.value)} placeholder="0,00" className="mt-1.5 min-h-12 w-full rounded-xl border-2 border-[#d8d0c2] px-3 text-base font-black text-[#173f32]"/></label></div>
          <label className="mt-4 block text-[10px] font-black uppercase tracking-wide text-[#65736b]">Litros<input required inputMode="decimal" value={form.liters} onChange={event=>setLiters(event.target.value)} placeholder="0,000" className="mt-1.5 min-h-12 w-full rounded-xl border-2 border-[#d8d0c2] px-3 text-base font-black text-[#173f32]"/></label>
          <button type="button" role="switch" aria-checked={form.fullTank} onClick={()=>setForm(current=>({...current,fullTank:!current.fullTank}))} className="mt-4 flex min-h-14 w-full items-center justify-between rounded-xl bg-[#f3f5ef] px-4 text-left"><span><strong className="block text-sm text-[#173f32]">Completou o tanque?</strong><small className="text-[10px] font-semibold text-[#718078]">Ajuda no acompanhamento do consumo</small></span><span className={`relative h-7 w-12 rounded-full transition ${form.fullTank?'bg-[#3f7457]':'bg-[#c5cbc4]'}`}><i className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${form.fullTank?'left-6':'left-1'}`}/></span></button>
        </section>
        <section className="rounded-[22px] border border-[#d8d0c2] bg-white p-4 shadow-sm md:col-span-2 xl:col-span-1"><div className="mb-4 flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eadfd4] text-[#80503b]"><UserRound size={21}/></span><div><p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#718078]">Responsável</p><h2 className="campo-display text-xl text-[#173f32]">Posto e motorista</h2></div></div>
          <div className="mb-2 flex items-center justify-between gap-2"><label className="text-[10px] font-black uppercase tracking-wide text-[#65736b]">Posto de combustível</label><button type="button" onClick={()=>setCatalogDialog('station')} className="flex min-h-11 items-center gap-1 text-xs font-bold text-[#315f45]"><Plus size={16}/>Adicionar posto</button></div>
          <SearchableSelect value={stationValue} options={stationOptions} onChange={chooseStation} placeholder="Selecione seu posto" searchPlaceholder="Buscar posto ou endereço" disabled={loading}/>
          <label className="mb-1.5 mt-4 block text-[10px] font-black uppercase tracking-wide text-[#65736b]">Motorista</label><SearchableSelect value={form.driverId} options={staffOptions} onChange={value=>setForm(current=>({...current,driverId:value}))} placeholder="Escolha o motorista" searchPlaceholder="Buscar funcionário" disabled={!isAdmin}/>
          <button type="button" onClick={()=>setMoreOpen(!moreOpen)} className="mt-4 flex min-h-11 w-full items-center justify-between border-t border-[#ece7dd] pt-3 text-left text-xs font-black text-[#627168]"><span><Plus className="mr-2 inline" size={16}/>Mais opções</span><ChevronDown className={`transition ${moreOpen?'rotate-180':''}`} size={17}/></button>{moreOpen&&<label className="mt-2 block text-[10px] font-black uppercase tracking-wide text-[#65736b]">Observações<textarea value={form.notes} onChange={event=>setForm(current=>({...current,notes:event.target.value}))} rows={3} placeholder="Informações adicionais" className="mt-1.5 w-full resize-none rounded-xl border-2 border-[#d8d0c2] p-3 text-sm font-semibold text-[#173f32]"/></label>}
        </section>
        <div className="sticky bottom-0 z-10 -mx-4 border-t border-[#d8d0c2] bg-[#f4f0e7]/95 px-4 pb-[calc(.5rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur md:static md:col-span-2 md:mx-0 md:rounded-2xl md:border xl:col-span-3"><button disabled={saving} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#173f32] text-sm font-black uppercase tracking-[0.08em] text-white shadow-lg disabled:opacity-60">{saving?<Loader2 className="animate-spin" size={20}/>:<Check size={20}/>} {editingId?'Salvar alterações':'Salvar abastecimento'}</button>{editingId&&<button type="button" onClick={()=>navigate('/fuelings/history')} className="mt-2 min-h-10 w-full text-xs font-black text-[#718078]">Cancelar edição</button>}</div>
      </form>:<section className="px-4 pt-4 md:px-6 md:pt-6">
        <div className="grid grid-cols-2 gap-2.5 md:ml-auto md:max-w-xl">
          <button type="button" onClick={()=>navigate('/fuelings/new')} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#d9b74c] px-3 text-xs font-black uppercase tracking-[0.06em] text-[#173f32] shadow-[0_6px_16px_rgba(128,94,0,0.18)]"><Plus size={18}/>Novo</button>
          <button type="button" onClick={()=>void exportAll()} disabled={exporting||!filtered.length} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#315f45] bg-white px-3 text-xs font-black uppercase tracking-[0.04em] text-[#315f45] shadow-sm disabled:opacity-50">{exporting?<Loader2 className="animate-spin" size={18}/>:<FileSpreadsheet size={18}/>} Exportar CSV</button>
        </div>

        <section aria-label="Filtros do histórico" className="mt-4 overflow-hidden rounded-[22px] border border-[#d8d0c2] bg-white shadow-[0_10px_28px_rgba(42,62,51,0.07)]">
          <div className="border-b border-[#ece7dd] p-3.5 md:p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#e5ecdf] text-[#315f45]"><ListFilter size={18}/></span><div><h2 className="text-sm font-black text-[#173f32]">Encontrar lançamentos</h2><p className="text-[10px] font-semibold text-[#718078]">Use busca rápida ou refine os resultados</p></div></div>
              {hasFilters&&<button type="button" onClick={clearFilters} className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-[10px] font-black uppercase tracking-wide text-[#8a3f31]"><FilterX size={15}/>Limpar</button>}
            </div>
            <div className="relative mt-3"><Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#718078]" size={18}/><input aria-label="Buscar abastecimentos" type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar veículo, placa, posto ou motorista" className="min-h-12 w-full rounded-xl border-2 border-[#d8d0c2] bg-[#fbfaf7] pl-11 pr-3 text-sm font-bold text-[#173f32] outline-none focus:border-[#3f7457]"/></div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 no-scrollbar" aria-label="Período rápido">
              <button type="button" aria-pressed={!todayOnly&&!month} onClick={selectAllPeriods} className={`min-h-10 shrink-0 rounded-full border px-4 text-[11px] font-black ${!todayOnly&&!month?'border-[#173f32] bg-[#173f32] text-white':'border-[#d8d0c2] bg-[#f8f6f0] text-[#52645b]'}`}>Todos</button>
              <button type="button" aria-pressed={todayOnly} onClick={selectToday} className={`min-h-10 shrink-0 rounded-full border px-4 text-[11px] font-black ${todayOnly?'border-[#173f32] bg-[#173f32] text-white':'border-[#d8d0c2] bg-[#f8f6f0] text-[#52645b]'}`}>Hoje</button>
              <button type="button" aria-pressed={!todayOnly&&month===currentMonth} onClick={selectCurrentMonth} className={`min-h-10 shrink-0 rounded-full border px-4 text-[11px] font-black ${!todayOnly&&month===currentMonth?'border-[#173f32] bg-[#173f32] text-white':'border-[#d8d0c2] bg-[#f8f6f0] text-[#52645b]'}`}>Este mês</button>
              <button type="button" aria-expanded={filtersOpen} onClick={()=>setFiltersOpen(current=>!current)} className={`flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-[11px] font-black ${filtersOpen||activeFilterCount>0?'border-[#c79e2d] bg-[#fbf1d2] text-[#6b5000]':'border-[#d8d0c2] bg-white text-[#52645b]'}`}><SlidersHorizontal size={15}/>Mais filtros{activeFilterCount>0&&<span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#173f32] px-1 text-[9px] text-white">{activeFilterCount}</span>}</button>
            </div>
          </div>

          {filtersOpen&&<div className="grid grid-cols-1 gap-3 bg-[#faf8f3] p-3.5 md:grid-cols-2 md:p-4 xl:grid-cols-4">
            <label className="block"><span className="mb-1.5 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wide text-[#718078]"><CalendarDays size={13}/>Mês específico</span><input aria-label="Filtrar por mês" type="month" value={month} onChange={event=>{setTodayOnly(false);setMonth(event.target.value);}} className="min-h-12 w-full rounded-xl border-2 border-[#d8d0c2] bg-white px-3 text-sm font-bold text-[#173f32] outline-none focus:border-[#3f7457]"/></label>
            {isAdmin&&<div><label className="mb-1.5 block text-[9px] font-black uppercase tracking-wide text-[#718078]">Técnico na lista</label><SearchableSelect value={employeeFilter} options={employeeFilterOptions} onChange={setEmployeeFilter} placeholder="Todos os técnicos" searchPlaceholder="Buscar técnico"/></div>}
            <div><label className="mb-1.5 block text-[9px] font-black uppercase tracking-wide text-[#718078]">Veículo</label><SearchableSelect value={vehicleFilter} options={historyVehicleOptions} onChange={setVehicleFilter} placeholder="Todos os veículos" searchPlaceholder="Buscar veículo ou placa"/></div>
            <div><label className="mb-1.5 block text-[9px] font-black uppercase tracking-wide text-[#718078]">Posto</label><SearchableSelect value={stationFilter} options={historyStationOptions} onChange={setStationFilter} placeholder="Todos os postos" searchPlaceholder="Buscar posto"/></div>
            <div><label className="mb-1.5 block text-[9px] font-black uppercase tracking-wide text-[#718078]">Combustível</label><SearchableSelect value={fuelFilter} options={fuelFilterOptions} onChange={setFuelFilter} placeholder="Todos os combustíveis" searchPlaceholder="Buscar combustível"/></div>
          </div>}
        </section>

        {!loading&&<FuelingAnalytics allRows={rows} rows={analyticsRows} employees={employees} isAdmin={isAdmin} currentEmployeeId={context?.employee_id}/>}

        <div className="mb-3 mt-5 flex items-end justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#718078]">Resultado dos filtros</p><h2 className="campo-display text-2xl text-[#173f32]">Abastecimentos</h2></div><span className="shrink-0 rounded-full border border-[#c5d4bd] bg-[#e4ecdf] px-3 py-1.5 text-[10px] font-black text-[#315f45]">{filtered.length} de {rows.length}</span></div>
        <p className="mb-3 text-[10px] font-semibold text-[#718078]">{isAdmin?'Você pode consultar os lançamentos de toda a equipe.':'Somente os seus lançamentos ficam disponíveis.'}</p>
        {loading?<div className="flex min-h-40 items-center justify-center"><Loader2 className="animate-spin text-[#3f7457]" size={28}/></div>:!filtered.length?<div className="rounded-[22px] border border-dashed border-[#c9c1b4] bg-white/70 px-6 py-12 text-center"><Search className="mx-auto text-[#839087]" size={32}/><h3 className="campo-display mt-3 text-xl text-[#173f32]">Nenhum resultado</h3><p className="mt-1 text-xs font-semibold text-[#718078]">Altere os filtros ou registre um novo abastecimento.</p>{hasFilters&&<button type="button" onClick={clearFilters} className="mx-auto mt-4 flex min-h-11 items-center gap-2 rounded-xl bg-[#e5ecdf] px-4 text-xs font-black text-[#315f45]"><FilterX size={16}/>Limpar filtros</button>}</div>:<div className="grid grid-cols-1 gap-3 md:grid-cols-2">{filtered.map(item=><article key={item.id} className="group overflow-hidden rounded-[20px] border border-[#d8d0c2] bg-white shadow-[0_7px_20px_rgba(42,62,51,0.07)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(42,62,51,0.11)]">
          <div className="flex items-start gap-3 p-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f4e7bd] text-[#805e00]"><Fuel size={21}/></span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h3 className="truncate text-sm font-black text-[#173f32]">{item.vehicle}</h3>{item.fullTank&&<span className="shrink-0 rounded-full bg-[#e5ecdf] px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-[#315f45]">Tanque cheio</span>}</div><p className="mt-1 text-[10px] font-bold text-[#718078]">{item.vehiclePlate&&<span className="mr-2 rounded bg-[#edf2e9] px-1.5 py-0.5 font-black tracking-wide text-[#315f45]">{item.vehiclePlate}</span>}{item.date.split('-').reverse().join('/')} · {item.time}</p><p className="mt-1 text-[9px] font-black uppercase tracking-wide text-[#967000]">{fuelLabel(item.fuelType)}</p></div><strong className="shrink-0 text-base text-[#173f32]">{money.format(item.totalValue)}</strong></div>
          <div className="grid grid-cols-3 divide-x divide-[#e7e2d8] border-y border-[#e7e2d8] bg-[#f8f6f0] py-2.5"><div className="px-2 text-center"><small className="block text-[8px] font-black uppercase text-[#829087]">Litros</small><b className="mt-1 block text-xs text-[#173f32]">{decimal(item.liters,2)} L</b></div><div className="px-2 text-center"><small className="block text-[8px] font-black uppercase text-[#829087]">Preço/L</small><b className="mt-1 block text-xs text-[#173f32]">{money.format(item.pricePerLiter)}</b></div><div className="px-2 text-center"><small className="block text-[8px] font-black uppercase text-[#829087]">Hodômetro</small><b className="mt-1 block text-xs text-[#173f32]">{decimal(item.odometer)} km</b></div></div>
          <div className="space-y-2 px-4 py-3 text-[10px] font-bold text-[#627168]"><p className="flex min-w-0 items-center gap-1.5"><UserRound className="shrink-0" size={14}/><span className="truncate">{item.driverName}</span></p>{item.station&&<p className="flex min-w-0 items-center gap-1.5"><MapPin className="shrink-0" size={14}/><span className="truncate">{item.station}</span></p>}{item.notes&&<p className="rounded-lg bg-[#f5f2eb] p-2 font-semibold leading-4">{item.notes}</p>}</div>
          <div className="flex items-center justify-between border-t border-[#ece7dd] px-4 py-3"><span className="text-[9px] font-bold uppercase tracking-wide text-[#9aa39e]">Lançamento registrado</span><div className="flex gap-2"><button type="button" onClick={()=>edit(item)} className="flex min-h-10 items-center gap-1.5 rounded-lg bg-[#e5ecdf] px-3 text-xs font-black text-[#315f45]" aria-label={`Editar abastecimento de ${item.vehicle}`}><Edit3 size={16}/>Editar</button><button type="button" onClick={()=>void remove(item)} className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f4e1d9] text-[#8a3f31]" aria-label={`Excluir abastecimento de ${item.vehicle}`}><Trash2 size={16}/></button></div></div>
        </article>)}</div>}
      </section>}
    </main>
    {catalogDialog&&<FuelCatalogDialog kind={catalogDialog} onClose={()=>setCatalogDialog(null)} onSave={addCatalog}/>}
  </Layout>;
};
export default FuelingScreen;
