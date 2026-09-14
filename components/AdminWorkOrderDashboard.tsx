import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CalendarRange,
  CircleDollarSign,
  ClipboardList,
  HandCoins,
  MapPinned,
  ReceiptText,
  TrendingUp,
  UserRound
} from 'lucide-react';
import { db } from '../services/db.service';
import { localdb } from '../services/localdb';
import { Anomaly } from '../types';
import { workOrderKm, workOrderReceivable, workOrderTotal } from '../utils/work-orders';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const getDate = (item: Anomaly) => item.serviceDate || item.createdAt.slice(0, 10);
const getMonth = (item: Anomaly) => getDate(item).slice(0, 7);

const monthLabel = (key: string, short = false) => {
  const [year, month] = key.split('-').map(Number);
  const formatted = new Intl.DateTimeFormat('pt-BR', { month: short ? 'short' : 'long', year: short ? undefined : 'numeric' }).format(new Date(year, month - 1, 1));
  return formatted.replace('.', '').replace(/^./, (letter) => letter.toUpperCase());
};

export const AdminWorkOrderDashboard: React.FC = () => {
  const [items, setItems] = useState<Anomaly[]>([]);
  const [monthFilter, setMonthFilter] = useState('all');
  const [technicianFilter, setTechnicianFilter] = useState('all');

  useEffect(() => {
    let active = true;
    const load = async () => {
      const records = await db.getAnomalies();
      if (active) setItems(records.filter((item) => item.recordType === 'service_order'));
    };
    void load();
    const unsubscribe = localdb.subscribe('anomalies', () => { void load(); });
    return () => { active = false; unsubscribe?.(); };
  }, []);

  const months = useMemo(() => Array.from(new Set(items.map(getMonth))).sort().reverse(), [items]);
  const technicians = useMemo(() => Array.from(new Set(items.map((item) => item.responsible).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')), [items]);
  const filtered = useMemo(() => items.filter((item) => {
    if (monthFilter !== 'all' && getMonth(item) !== monthFilter) return false;
    if (technicianFilter !== 'all' && item.responsible !== technicianFilter) return false;
    return true;
  }), [items, monthFilter, technicianFilter]);

  const indicators = useMemo(() => {
    const receita = filtered.filter((item) => item.serviceOrderType === 'receita').reduce((sum, item) => sum + workOrderTotal(item), 0);
    const despesa = filtered.filter((item) => item.serviceOrderType === 'despesa').reduce((sum, item) => sum + workOrderTotal(item), 0);
    const total = filtered.reduce((sum, item) => sum + workOrderTotal(item), 0);
    const receivable = filtered.reduce((sum, item) => sum + workOrderReceivable(item), 0);
    const kmOrders = filtered.filter((item) => workOrderKm(item) > 0);
    const totalKm = kmOrders.reduce((sum, item) => sum + workOrderKm(item), 0);
    return {
      receita,
      despesa,
      receivable,
      totalKm,
      averageKm: kmOrders.length ? totalKm / kmOrders.length : 0,
      ticket: filtered.length ? total / filtered.length : 0
    };
  }, [filtered]);

  const chartData = useMemo(() => {
    const technicianItems = technicianFilter === 'all' ? items : items.filter((item) => item.responsible === technicianFilter);
    const keys = Array.from(new Set(technicianItems.map(getMonth))).sort().slice(-6);
    return keys.map((key) => ({ key, count: technicianItems.filter((item) => getMonth(item) === key).length }));
  }, [items, technicianFilter]);
  const maxMonthCount = Math.max(1, ...chartData.map((item) => item.count));

  const teamData = useMemo(() => {
    const scoped = monthFilter === 'all' ? items : items.filter((item) => getMonth(item) === monthFilter);
    const grouped = new Map<string, { count: number; total: number; km: number; receivable: number; kmOrders: number }>();
    for (const item of scoped) {
      const current = grouped.get(item.responsible) || { count: 0, total: 0, km: 0, receivable: 0, kmOrders: 0 };
      current.count += 1;
      current.total += workOrderTotal(item);
      current.receivable += workOrderReceivable(item);
      current.km += workOrderKm(item);
      if (workOrderKm(item) > 0) current.kmOrders += 1;
      grouped.set(item.responsible, current);
    }
    return Array.from(grouped.entries())
      .map(([name, data]) => ({
        name,
        ...data,
        average: data.count ? data.total / data.count : 0,
        averageKm: data.kmOrders ? data.km / data.kmOrders : 0
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'));
  }, [items, monthFilter]);
  const maxEmployeeCount = Math.max(1, ...teamData.map((item) => item.count));

  return (
    <section className="overflow-hidden rounded-[24px] border border-[#cfc6b8] bg-[#f8f4eb] shadow-[0_14px_35px_rgba(37,61,51,0.10)]">
      <div className="bg-[#173f32] px-5 pb-6 pt-5 text-white">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#caddb3]">Painel da gestão</p>
        <h2 className="campo-display mt-1 text-3xl">Resumo das OS</h2>
        <p className="mt-2 max-w-xs text-xs leading-5 text-white/65">Valores, deslocamentos e produção da equipe.</p>

        <div className="relative mt-5 grid grid-cols-2 gap-2">
          <label className="rounded-xl border border-white/10 bg-white/[0.07] p-2.5">
            <span className="mb-1 flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.1em] text-white/50"><CalendarRange size={12} /> Período</span>
            <select value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} className="w-full bg-transparent text-xs font-black text-white outline-none [&>option]:text-[#173f32]">
              <option value="all">Todos os meses</option>
              {months.map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}
            </select>
          </label>
          <label className="rounded-xl border border-white/10 bg-white/[0.07] p-2.5">
            <span className="mb-1 flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.1em] text-white/50"><UserRound size={12} /> Técnico</span>
            <select value={technicianFilter} onChange={(event) => setTechnicianFilter(event.target.value)} className="w-full bg-transparent text-xs font-black text-white outline-none [&>option]:text-[#173f32]">
              <option value="all">Toda a equipe</option>
              {technicians.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-2 gap-2">
          <article className="rounded-2xl border border-[#d8d0c2] bg-white p-3.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e4eddf] text-[#315f45]"><ClipboardList size={17} /></span>
            <p className="mt-3 text-[9px] font-black uppercase tracking-[0.1em] text-[#718078]">Total de OS</p>
            <p className="campo-display mt-1 text-3xl text-[#173f32]">{filtered.length}</p>
          </article>
          <article className="rounded-2xl border border-[#d8d0c2] bg-white p-3.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#eee7da] text-[#6b5242]"><TrendingUp size={17} /></span>
            <p className="mt-3 text-[9px] font-black uppercase tracking-[0.1em] text-[#718078]">Ticket médio</p>
            <p className="mt-2 text-lg font-black text-[#173f32]">{money.format(indicators.ticket)}</p>
          </article>
          <article className="rounded-2xl border border-[#bdd0b3] bg-[#edf4e8] p-3.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/70 text-[#315f45]"><CircleDollarSign size={17} /></span>
            <p className="mt-3 text-[9px] font-black uppercase tracking-[0.1em] text-[#557263]">Receitas</p>
            <p className="mt-2 text-lg font-black text-[#173f32]">{money.format(indicators.receita)}</p>
          </article>
          <article className="rounded-2xl border border-[#e2c5b8] bg-[#fbede6] p-3.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/70 text-[#8a4938]"><ReceiptText size={17} /></span>
            <p className="mt-3 text-[9px] font-black uppercase tracking-[0.1em] text-[#8a5947]">Despesas</p>
            <p className="mt-2 text-lg font-black text-[#6e3325]">{money.format(indicators.despesa)}</p>
          </article>
          <article className="rounded-2xl border border-[#ddcfaa] bg-[#f8f0d9] p-3.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/70 text-[#765f25]"><HandCoins size={17} /></span>
            <p className="mt-3 text-[9px] font-black uppercase tracking-[0.1em] text-[#76672f]">A receber</p>
            <p className="mt-2 text-lg font-black text-[#5f501d]">{money.format(indicators.receivable)}</p>
          </article>
          <article className="rounded-2xl border border-[#d8d0c2] bg-white p-3.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e4eddf] text-[#315f45]"><MapPinned size={17} /></span>
            <p className="mt-3 text-[9px] font-black uppercase tracking-[0.1em] text-[#718078]">Média de KM</p>
            <p className="mt-2 text-lg font-black text-[#173f32]">{indicators.averageKm.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km</p>
            <p className="mt-1 text-[10px] font-semibold text-[#718078]">{indicators.totalKm.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km no total</p>
          </article>
        </div>

        <article className="mt-3 rounded-2xl border border-[#d8d0c2] bg-white p-4">
          <div className="flex items-center justify-between"><div><p className="text-[9px] font-black uppercase tracking-[0.12em] text-[#718078]">Últimos meses</p><h3 className="campo-display mt-1 text-xl text-[#173f32]">OS por mês</h3></div><BarChart3 className="text-[#3f7457]" size={22} /></div>
          {chartData.length ? (
            <div className="mt-5 flex h-36 items-end gap-2 border-b border-[#d8d0c2] px-1">
              {chartData.map((item) => (
                <div key={item.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                  <span className="mb-1 text-[10px] font-black text-[#173f32]">{item.count}</span>
                  <div className="w-full max-w-9 rounded-t-lg bg-[#3f7457]" style={{ height: `${Math.max(8, (item.count / maxMonthCount) * 92)}px` }} />
                  <span className="mt-2 text-[9px] font-black uppercase text-[#718078]">{monthLabel(item.key, true)}</span>
                </div>
              ))}
            </div>
          ) : <p className="mt-5 rounded-xl bg-[#f4f1ea] p-4 text-center text-xs font-bold text-[#718078]">Ainda não há OS para formar o gráfico.</p>}
        </article>

        <article className="mt-3 rounded-2xl border border-[#d8d0c2] bg-white p-4">
          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[#718078]">Equipe</p>
          <h3 className="campo-display mt-1 text-xl text-[#173f32]">Produção por técnico</h3>
          <div className="mt-4 space-y-3">
            {teamData.slice(0, 8).map((item) => (
              <div key={item.name}>
                <div className="flex items-end justify-between gap-3"><p className="min-w-0 truncate text-xs font-black text-[#33483f]">{item.name}</p><p className="shrink-0 text-[10px] font-bold text-[#718078]">{item.count} OS</p></div>
                <p className="mt-1 text-[10px] font-semibold text-[#718078]">Valor médio {money.format(item.average)} • {item.km.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km • média {item.averageKm.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km</p>
                {item.receivable > 0 && <p className="mt-1 text-[10px] font-bold text-[#765f25]">A receber: {money.format(item.receivable)}</p>}
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#ece8df]"><div className="h-full rounded-full bg-[#78936c]" style={{ width: `${Math.max(6, (item.count / maxEmployeeCount) * 100)}%` }} /></div>
              </div>
            ))}
            {!teamData.length && <p className="rounded-xl bg-[#f4f1ea] p-4 text-center text-xs font-bold text-[#718078]">Nenhuma atividade no período.</p>}
          </div>
        </article>
      </div>
    </section>
  );
};
