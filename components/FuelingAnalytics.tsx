import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Check, Gauge, LineChart, UsersRound } from 'lucide-react';
import type { Employee, Fueling } from '../types';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const number = (value: number, digits = 1) => value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const employeeKey = (item: Fueling) => String(item.driverId || item.employee_id || item.driverName);
const vehicleKey = (item: Fueling) => item.vehicleId || `${item.employee_id || ''}:${item.vehicle.trim().toLocaleLowerCase('pt-BR')}`;

type Mileage = { km: number; efficiencyKm: number; efficiencyLiters: number };
type Metric = 'km' | 'liters' | 'total' | 'price' | 'efficiency';

const metricConfig: Record<Metric, { label: string; shortLabel: string; color: string; format: (value: number) => string }> = {
  km: { label: 'Km rodados', shortLabel: 'KM', color: '#315f45', format: value => `${number(value)} km` },
  liters: { label: 'Litros abastecidos', shortLabel: 'Litros', color: '#9a6800', format: value => `${number(value, 2)} L` },
  total: { label: 'Valor abastecido', shortLabel: 'Valor', color: '#9f3f2d', format: value => money.format(value) },
  price: { label: 'Preço médio por litro', shortLabel: 'Preço/L', color: '#59775e', format: value => money.format(value) },
  efficiency: { label: 'Média de consumo', shortLabel: 'Km/L', color: '#19708a', format: value => `${number(value, 2)} km/L` }
};

const buildMileage = (rows: Fueling[]) => {
  const byVehicle = new Map<string, Fueling[]>();
  rows.forEach(item => {
    const key = vehicleKey(item);
    byVehicle.set(key, [...(byVehicle.get(key) || []), item]);
  });
  const result = new Map<string, Mileage>();
  byVehicle.forEach(items => {
    const ordered = [...items].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    ordered.forEach((item, index) => {
      const previous = ordered[index - 1];
      const km = previous ? Number(item.odometer) - Number(previous.odometer) : 0;
      const validKm = Number.isFinite(km) && km > 0 ? km : 0;
      const validEfficiency = validKm > 0 && Boolean(item.fullTank && previous?.fullTank) && Number(item.liters) > 0;
      result.set(item.id, { km: validKm, efficiencyKm: validEfficiency ? validKm : 0, efficiencyLiters: validEfficiency ? Number(item.liters) : 0 });
    });
  });
  return result;
};

export const summarizeFuelings = (allRows: Fueling[], rows: Fueling[]) => {
  const mileage = buildMileage(allRows);
  const total = rows.reduce((sum, item) => sum + Number(item.totalValue || 0), 0);
  const liters = rows.reduce((sum, item) => sum + Number(item.liters || 0), 0);
  const km = rows.reduce((sum, item) => sum + (mileage.get(item.id)?.km || 0), 0);
  const efficiencyKm = rows.reduce((sum, item) => sum + (mileage.get(item.id)?.efficiencyKm || 0), 0);
  const efficiencyLiters = rows.reduce((sum, item) => sum + (mileage.get(item.id)?.efficiencyLiters || 0), 0);
  return {
    total,
    liters,
    km,
    price: liters > 0 ? total / liters : 0,
    efficiency: efficiencyLiters > 0 ? efficiencyKm / efficiencyLiters : 0,
    ticket: rows.length > 0 ? total / rows.length : 0,
    count: rows.length,
    validEfficiencyCount: rows.filter(item => (mileage.get(item.id)?.efficiencyLiters || 0) > 0).length
  };
};

type Props = {
  allRows: Fueling[];
  rows: Fueling[];
  employees: Employee[];
  isAdmin: boolean;
  currentEmployeeId?: string;
};

export const FuelingAnalytics: React.FC<Props> = ({ allRows, rows, employees, isAdmin, currentEmployeeId }) => {
  const [comparisonMetric, setComparisonMetric] = useState<Metric>('km');
  const [trendMetric, setTrendMetric] = useState<Metric>('price');
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const initialized = useRef(false);
  const mileage = useMemo(() => buildMileage(allRows), [allRows]);
  const employeeOptions = useMemo(() => {
    const names = new Map(employees.map(item => [String(item.id), item.name]));
    allRows.forEach(item => names.set(employeeKey(item), item.driverName || item.employee_name || names.get(employeeKey(item)) || 'Funcionário'));
    const used = new Set(allRows.map(employeeKey));
    return [...names.entries()].filter(([id]) => used.has(id)).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [allRows, employees]);

  useEffect(() => {
    if (initialized.current || !employeeOptions.length) return;
    const initial = isAdmin ? employeeOptions.map(item => item.id) : employeeOptions.filter(item => item.id === String(currentEmployeeId)).map(item => item.id);
    setSelectedEmployees(initial.length ? initial : [employeeOptions[0].id]);
    initialized.current = true;
  }, [currentEmployeeId, employeeOptions, isAdmin]);

  const toggleEmployee = (id: string) => setSelectedEmployees(current => current.includes(id)
    ? (current.length > 1 ? current.filter(item => item !== id) : current)
    : [...current, id]);
  const selectedRows = useMemo(() => rows.filter(item => selectedEmployees.includes(employeeKey(item))), [rows, selectedEmployees]);
  const selectedSummary = useMemo(() => summarizeFuelings(allRows, selectedRows), [allRows, selectedRows]);
  const comparison = useMemo(() => employeeOptions.filter(option => selectedEmployees.includes(option.id)).map(option => {
    const employeeRows = rows.filter(item => employeeKey(item) === option.id);
    const summary = summarizeFuelings(allRows, employeeRows);
    return { ...option, ...summary };
  }), [allRows, employeeOptions, rows, selectedEmployees]);
  const comparisonMax = Math.max(0, ...comparison.map(item => item[comparisonMetric]));

  const monthly = useMemo(() => {
    const groups = new Map<string, Fueling[]>();
    selectedRows.forEach(item => {
      const key = item.date.slice(0, 7);
      groups.set(key, [...(groups.get(key) || []), item]);
    });
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-8).map(([month, items]) => ({ month, ...summarizeFuelings(allRows, items) }));
  }, [allRows, selectedRows]);
  const trendValues = monthly.map(item => item[trendMetric]);
  const trendMax = Math.max(0, ...trendValues);
  const points = monthly.map((item, index) => {
    const x = monthly.length === 1 ? 300 : 38 + index * (524 / (monthly.length - 1));
    const y = trendMax > 0 ? 138 - (item[trendMetric] / trendMax) * 100 : 138;
    return { x, y, item };
  });
  const colors = ['#315f45', '#9a6800', '#9f3f2d', '#19708a', '#6c5b3f', '#5d7046', '#875d49', '#47728a'];

  if (!allRows.length) return null;
  return <section aria-label="Análise de abastecimentos" className="mt-5 space-y-4">
    <div className="flex items-end justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#718078]">Leitura operacional</p><h2 className="campo-display text-2xl text-[#173f32]">Consumo e desempenho</h2></div><span className="rounded-full bg-[#173f32] px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-white">{selectedEmployees.length} selecionado{selectedEmployees.length === 1 ? '' : 's'}</span></div>

    {isAdmin && <div className="rounded-[20px] border border-[#d8d0c2] bg-white p-4 shadow-[0_8px_24px_rgba(42,62,51,0.07)]">
      <div className="mb-3 flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e5ecdf] text-[#315f45]"><UsersRound size={18}/></span><div><h3 className="text-sm font-black text-[#173f32]">Comparar funcionários</h3><p className="text-[10px] font-semibold text-[#718078]">Marque dois ou mais para comparar lado a lado</p></div></div>
      <div className="flex flex-wrap gap-2">{employeeOptions.map(option => {
        const selected = selectedEmployees.includes(option.id);
        return <button key={option.id} type="button" aria-pressed={selected} onClick={() => toggleEmployee(option.id)} className={`flex min-h-10 items-center gap-2 rounded-full border px-3 text-[10px] font-black ${selected ? 'border-[#315f45] bg-[#e5ecdf] text-[#173f32]' : 'border-[#d8d0c2] bg-[#faf8f3] text-[#718078]'}`}><span className={`flex h-5 w-5 items-center justify-center rounded-full ${selected ? 'bg-[#315f45] text-white' : 'border border-[#b8c0ba]'}`}>{selected && <Check size={12}/>}</span>{option.name}</button>;
      })}</div>
    </div>}

    <div className="grid grid-cols-3 overflow-hidden rounded-[18px] border border-[#d8d0c2] bg-white shadow-sm"><div className="border-r border-[#ece7dd] p-3"><span className="block text-[8px] font-black uppercase tracking-wide text-[#829087]">Ticket médio</span><strong className="mt-1 block truncate text-sm text-[#173f32]">{money.format(selectedSummary.ticket)}</strong></div><div className="border-r border-[#ece7dd] p-3"><span className="block text-[8px] font-black uppercase tracking-wide text-[#829087]">Custo estimado/km</span><strong className="mt-1 block truncate text-sm text-[#173f32]">{money.format(selectedSummary.km > 0 ? selectedSummary.total / selectedSummary.km : 0)}</strong></div><div className="p-3"><span className="block text-[8px] font-black uppercase tracking-wide text-[#829087]">Pares válidos</span><strong className="mt-1 block text-sm text-[#173f32]">{selectedSummary.validEfficiencyCount}</strong></div></div>

    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <article className="overflow-hidden rounded-[22px] border border-[#d8d0c2] bg-white shadow-[0_10px_28px_rgba(42,62,51,0.08)]">
        <div className="border-b border-[#ece7dd] p-4"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2.5"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e5ecdf] text-[#315f45]"><BarChart3 size={20}/></span><div><h3 className="campo-display text-lg text-[#173f32]">Comparativo da equipe</h3><p className="text-[10px] font-semibold text-[#718078]">{metricConfig[comparisonMetric].label}</p></div></div></div>
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">{(['km','liters','total','price','efficiency'] as Metric[]).map(metric => <button key={metric} type="button" aria-pressed={comparisonMetric === metric} onClick={() => setComparisonMetric(metric)} className={`min-h-9 shrink-0 rounded-full px-3 text-[9px] font-black uppercase tracking-wide ${comparisonMetric === metric ? 'bg-[#173f32] text-white' : 'bg-[#f2f1eb] text-[#64736b]'}`}>{metricConfig[metric].shortLabel}</button>)}</div>
        </div>
        <div className="space-y-4 p-4">{comparison.map((item, index) => {
          const value = item[comparisonMetric];
          const width = comparisonMax > 0 ? Math.max(value > 0 ? 3 : 0, (value / comparisonMax) * 100) : 0;
          return <div key={item.id}><div className="mb-1.5 flex items-center justify-between gap-3"><span className="truncate text-[11px] font-black text-[#344b41]">{item.name}</span><strong className="shrink-0 text-xs text-[#173f32]">{metricConfig[comparisonMetric].format(value)}</strong></div><div className="h-3 overflow-hidden rounded-full bg-[#edf0e9]"><div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${width}%`, backgroundColor: colors[index % colors.length] }}/></div></div>;
        })}</div>
        {comparisonMetric === 'efficiency' && <p className="border-t border-[#ece7dd] bg-[#faf8f3] px-4 py-3 text-[9px] font-semibold leading-4 text-[#718078]">Km/L considera somente intervalos válidos entre dois registros consecutivos com tanque cheio.</p>}
      </article>

      <article className="overflow-hidden rounded-[22px] border border-[#d8d0c2] bg-white shadow-[0_10px_28px_rgba(42,62,51,0.08)]">
        <div className="border-b border-[#ece7dd] p-4"><div className="flex items-center gap-2.5"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fbf1d2] text-[#805e00]"><LineChart size={20}/></span><div><h3 className="campo-display text-lg text-[#173f32]">Evolução mensal</h3><p className="text-[10px] font-semibold text-[#718078]">Até os últimos oito meses do filtro</p></div></div>
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">{(['price','total','liters','km','efficiency'] as Metric[]).map(metric => <button key={metric} type="button" aria-pressed={trendMetric === metric} onClick={() => setTrendMetric(metric)} className={`min-h-9 shrink-0 rounded-full px-3 text-[9px] font-black uppercase tracking-wide ${trendMetric === metric ? 'bg-[#805e00] text-white' : 'bg-[#f5f0df] text-[#756225]'}`}>{metricConfig[metric].shortLabel}</button>)}</div>
        </div>
        {monthly.length ? <div className="p-3"><div className="mb-1 flex items-center justify-between px-1"><span className="text-[9px] font-black uppercase tracking-wide text-[#718078]">{metricConfig[trendMetric].label}</span><strong className="text-xs text-[#173f32]">{metricConfig[trendMetric].format(trendValues[trendValues.length - 1] || 0)}</strong></div><svg viewBox="0 0 600 178" role="img" aria-label={`Gráfico de ${metricConfig[trendMetric].label}`} className="h-44 w-full overflow-visible">
          {[38, 88, 138].map(y => <line key={y} x1="32" x2="568" y1={y} y2={y} stroke="#e8e4da" strokeWidth="1" strokeDasharray="4 5"/>)}
          {points.length > 1 && <polyline points={points.map(point => `${point.x},${point.y}`).join(' ')} fill="none" stroke={metricConfig[trendMetric].color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>}
          {points.map(({ x, y, item }) => <g key={item.month}><circle cx={x} cy={y} r="6" fill="#fff" stroke={metricConfig[trendMetric].color} strokeWidth="4"><title>{`${item.month}: ${metricConfig[trendMetric].format(item[trendMetric])}`}</title></circle><text x={x} y="164" textAnchor="middle" fontSize="12" fontWeight="700" fill="#718078">{item.month.slice(5)}/{item.month.slice(2,4)}</text></g>)}
        </svg></div> : <div className="flex min-h-52 flex-col items-center justify-center px-6 text-center"><Gauge size={30} className="text-[#9aa39e]"/><p className="mt-2 text-xs font-bold text-[#718078]">Sem dados no período selecionado.</p></div>}
      </article>
    </div>
  </section>;
};
