import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarRange,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  Loader2,
  Route as RouteIcon,
  Search,
  TrendingUp,
  UsersRound,
  WalletCards
} from 'lucide-react';
import { Header } from '../components/Header';
import { Layout } from '../components/Layout';
import { db } from '../services/db.service';
import { farmContextService } from '../services/farm-context.service';
import { localdb } from '../services/localdb';
import { permissionsService } from '../services/permissions.service';
import { Anomaly, Client } from '../types';
import { workOrderKm, workOrderReceivable, workOrderTotal } from '../utils/work-orders';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const DAY = 86_400_000;

type Period = '90' | '180' | '365' | 'all';
type PortfolioFilter = 'all' | 'with_orders' | 'without_orders' | 'receivable';
type SortMode = 'attention' | 'orders' | 'receivable' | 'recent';

interface ClientMetric {
  name: string;
  orders: Anomaly[];
  allOrders: Anomaly[];
  revenue: number;
  expenses: number;
  receivable: number;
  km: number;
  lastVisitAt: number | null;
  daysSinceVisit: number | null;
  averageIntervalDays: number | null;
}

const normalize = (value?: unknown) => String(value || '').trim().toLocaleLowerCase('pt-BR');
const orderDateValue = (item: Anomaly): string => item.serviceDate || (typeof item.createdAt==='string'?item.createdAt.slice(0,10):'');
const orderTimestamp = (item: Anomaly): number => {
  const value = orderDateValue(item);
  const parsed = new Date(`${value}T12:00:00`).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};
const formatShortDate = (timestamp: number | null): string => timestamp
  ? new Date(timestamp).toLocaleDateString('pt-BR')
  : 'Sem atendimento';

const recency = (days: number | null) => {
  if (days === null) return { label: 'Sem atendimento', className: 'bg-[#eee7dc] text-[#745f4f]' };
  if (days > 90) return { label: `${days} dias sem visita`, className: 'bg-[#f4ddd4] text-[#8a3f31]' };
  if (days > 45) return { label: `${days} dias sem visita`, className: 'bg-[#f4ead0] text-[#755c21]' };
  if (days === 0) return { label: 'Atendido hoje', className: 'bg-[#dcebd7] text-[#315f45]' };
  return { label: `Última visita há ${days} dias`, className: 'bg-[#dcebd7] text-[#315f45]' };
};

export const ClientDashboardScreen: React.FC = () => {
  const navigate = useNavigate();
  const context = farmContextService.getContext();
  const isAdmin = permissionsService.isAdmin(context);
  const [orders, setOrders] = useState<Anomaly[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,setError]=useState('');
  const [period, setPeriod] = useState<Period>('90');
  const [portfolioFilter, setPortfolioFilter] = useState<PortfolioFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('attention');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState(new Date());

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setError('');
        const [orderRows, clientRows] = await Promise.all([db.getAnomalies(), db.getClients()]);
        if (!active) return;
        setOrders(orderRows);
        setClients(clientRows);
        setUpdatedAt(new Date());
      } catch(loadError) {
        console.error('Falha ao abrir painel de clientes:',loadError);
        if(active)setError('Não foi possível carregar o painel. Tente atualizar os dados.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const unsubscribeOrders = localdb.subscribe('anomalies', () => { void load(); });
    const unsubscribeClients = localdb.subscribe('clients', () => { void load(); });
    return () => {
      active = false;
      unsubscribeOrders?.();
      unsubscribeClients?.();
    };
  }, []);

  const model = useMemo(() => {
    const now = Date.now();
    const periodStart = period === 'all' ? 0 : now - Number(period) * DAY;
    const validOrders = orders.filter((item): item is Anomaly => Boolean(item && typeof item === 'object'));
    const periodOrders = validOrders.filter((item) => orderTimestamp(item) >= periodStart);
    const roster = new Map<string, string>();

    if (isAdmin) {
      clients.forEach((client) => {
        const name=typeof client?.name==='string'?client.name.trim():'';
        if (name) roster.set(normalize(name), name);
      });
    }
    validOrders.forEach((item) => {
      const name = typeof item.clientName === 'string' ? item.clientName.trim() : '';
      if (name) roster.set(normalize(name), name);
    });

    const metrics: ClientMetric[] = Array.from(roster.values()).map((name) => {
      const allClientOrders = validOrders.filter((item) => normalize(item.clientName) === normalize(name));
      const clientOrders = periodOrders.filter((item) => normalize(item.clientName) === normalize(name));
      const timestamps = allClientOrders.map(orderTimestamp).filter(Boolean).sort((a, b) => a - b);
      const lastVisitAt = timestamps.length ? timestamps[timestamps.length - 1] : null;
      const intervals = timestamps.slice(1).map((timestamp, index) => (timestamp - timestamps[index]) / DAY);

      return {
        name,
        orders: clientOrders,
        allOrders: allClientOrders,
        revenue: clientOrders.filter((item) => item.serviceOrderType === 'receita').reduce((sum, item) => sum + workOrderTotal(item), 0),
        expenses: clientOrders.filter((item) => item.serviceOrderType === 'despesa').reduce((sum, item) => sum + workOrderTotal(item), 0),
        receivable: clientOrders.reduce((sum, item) => sum + workOrderReceivable(item), 0),
        km: clientOrders.reduce((sum, item) => sum + workOrderKm(item), 0),
        lastVisitAt,
        daysSinceVisit: lastVisitAt ? Math.max(0, Math.floor((now - lastVisitAt) / DAY)) : null,
        averageIntervalDays: intervals.length ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length : null
      };
    });

    const visible = metrics
      .filter((item) => normalize(item.name).includes(normalize(search)))
      .filter((item) => {
        if (portfolioFilter === 'with_orders') return item.orders.length > 0;
        if (portfolioFilter === 'without_orders') return item.allOrders.length === 0;
        if (portfolioFilter === 'receivable') return item.receivable > 0;
        return true;
      })
      .sort((a, b) => {
        if (sortMode === 'orders') return b.orders.length - a.orders.length || a.name.localeCompare(b.name, 'pt-BR');
        if (sortMode === 'receivable') return b.receivable - a.receivable || a.name.localeCompare(b.name, 'pt-BR');
        if (sortMode === 'recent') return (b.lastVisitAt || 0) - (a.lastVisitAt || 0);
        const aAttention = a.daysSinceVisit ?? Number.MAX_SAFE_INTEGER;
        const bAttention = b.daysSinceVisit ?? Number.MAX_SAFE_INTEGER;
        return bAttention - aAttention || a.name.localeCompare(b.name, 'pt-BR');
      });

    const totals = {
      attendedClients: metrics.filter((item) => item.orders.length > 0).length,
      orders: periodOrders.length,
      receivable: periodOrders.reduce((sum, item) => sum + workOrderReceivable(item), 0),
      km: periodOrders.reduce((sum, item) => sum + workOrderKm(item), 0),
      revenue: periodOrders.filter((item) => item.serviceOrderType === 'receita').reduce((sum, item) => sum + workOrderTotal(item), 0),
      expenses: periodOrders.filter((item) => item.serviceOrderType === 'despesa').reduce((sum, item) => sum + workOrderTotal(item), 0)
    };
    const leaders = metrics.filter((item) => item.orders.length > 0).sort((a, b) => b.orders.length - a.orders.length).slice(0, 5);

    return { metrics, visible, totals, leaders };
  }, [clients, isAdmin, orders, period, portfolioFilter, search, sortMode]);

  const maxLeaderOrders = Math.max(1, ...model.leaders.map((item) => item.orders.length));
  const periodLabel = period === 'all' ? 'Todo o histórico' : `Últimos ${period} dias`;

  return (
    <Layout className="bg-[#f4f0e7]">
      <Header title="Painel de clientes" targetRoute="/anomalies" />
      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-4">
        {error&&<div role="alert" className="mb-3 rounded-xl border border-[#e0c6b6] bg-[#f8e7dc] p-3 text-xs font-bold leading-5 text-[#824333]">{error}<button type="button" onClick={()=>{setLoading(true);setError('');void db.forceRefreshTable('clients').then(()=>window.location.reload());}} className="mt-2 block min-h-9 underline">Tentar novamente</button></div>}
        <section className="overflow-hidden rounded-[22px] bg-[#173f32] text-white shadow-[0_14px_32px_rgba(23,63,50,0.18)]">
          <div className="border-b border-white/10 px-5 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#caddb3]">Carteira de clientes</p>
            <div className="mt-2 flex items-end justify-between gap-3">
              <div>
                <p className="campo-display text-3xl leading-none">{model.totals.attendedClients}</p>
                <p className="mt-1 text-xs font-semibold text-white/65">clientes atendidos no período</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2 text-right">
                <p className="text-[9px] font-bold uppercase tracking-wide text-white/50">Escopo</p>
                <p className="mt-0.5 text-xs font-black">{isAdmin ? 'Toda a equipe' : 'Somente suas OS'}</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-white/10">
            <div className="px-3 py-3"><p className="text-[9px] font-bold uppercase text-white/45">Ordens</p><p className="mt-1 text-lg font-black">{model.totals.orders}</p></div>
            <div className="px-3 py-3"><p className="text-[9px] font-bold uppercase text-white/45">A receber</p><p className="mt-1 truncate text-sm font-black">{money.format(model.totals.receivable)}</p></div>
            <div className="px-3 py-3"><p className="text-[9px] font-bold uppercase text-white/45">Rodados</p><p className="mt-1 text-lg font-black">{model.totals.km.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} <span className="text-[10px]">km</span></p></div>
          </div>
        </section>

        <section className="mt-3 grid grid-cols-2 gap-3" aria-label="Indicadores financeiros do período">
          <div className="rounded-2xl border border-[#c8d7be] bg-[#e8f0e2] p-4">
            <CircleDollarSign size={19} className="text-[#3f7457]" />
            <p className="mt-3 text-[9px] font-black uppercase tracking-[0.12em] text-[#64736b]">Receitas</p>
            <p className="mt-1 truncate text-lg font-black text-[#173f32]">{money.format(model.totals.revenue)}</p>
          </div>
          <div className="rounded-2xl border border-[#dfc9b8] bg-[#f2e4d8] p-4">
            <WalletCards size={19} className="text-[#9f5039]" />
            <p className="mt-3 text-[9px] font-black uppercase tracking-[0.12em] text-[#7b675a]">Despesas</p>
            <p className="mt-1 truncate text-lg font-black text-[#512f25]">{money.format(model.totals.expenses)}</p>
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-[#d8d0c2] bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#718078]">Movimento</p><h2 className="campo-display mt-1 text-xl text-[#173f32]">Clientes mais atendidos</h2></div>
            <TrendingUp size={22} className="text-[#3f7457]" />
          </div>
          {!model.leaders.length ? (
            <p className="mt-4 rounded-xl bg-[#f5f2eb] px-3 py-4 text-center text-xs font-bold text-[#718078]">Nenhuma OS neste período.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {model.leaders.map((item) => (
                <div key={item.name}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-[11px] font-bold text-[#40564b]"><span className="truncate">{item.name}</span><span>{item.orders.length} OS</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#e9e7df]"><div className="h-full rounded-full bg-[#3f7457]" style={{ width: `${Math.max(8, (item.orders.length / maxLeaderOrders) * 100)}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-4 rounded-2xl border border-[#d8d0c2] bg-[#fbf8f1] p-3 shadow-sm" aria-label="Filtros do painel">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#718078]" size={18} />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente" className="min-h-12 w-full rounded-xl border-2 border-[#d8d0c2] bg-white py-3 pl-10 pr-3 text-sm font-bold text-[#173f32] outline-none focus:border-[#3f7457] focus-visible:ring-2 focus-visible:ring-[#3f7457]/20" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="relative">
              <span className="sr-only">Período</span>
              <CalendarRange className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#64736b]" size={16} />
              <select value={period} onChange={(event) => setPeriod(event.target.value as Period)} className="min-h-11 w-full appearance-none rounded-xl border border-[#d8d0c2] bg-white py-2 pl-9 pr-8 text-xs font-black text-[#173f32] outline-none focus-visible:ring-2 focus-visible:ring-[#3f7457]/25">
                <option value="90">Últimos 90 dias</option><option value="180">Últimos 180 dias</option><option value="365">Últimos 12 meses</option><option value="all">Todo o histórico</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64736b]" size={16} />
            </label>
            <label className="relative">
              <span className="sr-only">Ordenação</span>
              <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} className="min-h-11 w-full appearance-none rounded-xl border border-[#d8d0c2] bg-white px-3 py-2 pr-8 text-xs font-black text-[#173f32] outline-none focus-visible:ring-2 focus-visible:ring-[#3f7457]/25">
                <option value="attention">Mais tempo sem visita</option><option value="orders">Mais OS</option><option value="receivable">Maior valor a receber</option><option value="recent">Visita mais recente</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64736b]" size={16} />
            </label>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {([
              ['all', 'Todos'], ['with_orders', 'Com OS no período'], ['without_orders', 'Sem histórico'], ['receivable', 'A receber']
            ] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setPortfolioFilter(value)} className={`min-h-9 shrink-0 rounded-full border px-3 text-[10px] font-black uppercase tracking-wide ${portfolioFilter === value ? 'border-[#173f32] bg-[#173f32] text-white' : 'border-[#d8d0c2] bg-white text-[#64736b]'}`}>{label}</button>
            ))}
          </div>
        </section>

        <div className="mt-4 flex items-center justify-between px-1">
          <div><p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#718078]">{periodLabel}</p><h2 className="campo-display mt-1 text-2xl text-[#173f32]">Clientes <span className="font-sans text-sm font-black text-[#718078]">{model.visible.length}</span></h2></div>
          <p className="text-right text-[9px] font-semibold text-[#718078]">Atualizado às<br /><strong>{updatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</strong></p>
        </div>

        {loading ? (
          <div className="flex min-h-40 items-center justify-center text-[#3f7457]"><Loader2 className="animate-spin" size={30} /></div>
        ) : !model.visible.length ? (
          <div className="mt-3 rounded-2xl border border-dashed border-[#c9c1b4] bg-white/60 px-5 py-10 text-center"><UsersRound className="mx-auto text-[#8a968f]" size={30} /><p className="mt-3 text-sm font-black text-[#40564b]">Nenhum cliente encontrado</p><p className="mt-1 text-xs font-semibold text-[#718078]">Altere a busca ou os filtros.</p></div>
        ) : (
          <div className="mt-3 space-y-3">
            {model.visible.map((item) => {
              const status = recency(item.daysSinceVisit);
              const isExpanded = expanded === item.name;
              return (
                <article key={item.name} className="overflow-hidden rounded-2xl border border-[#d8d0c2] bg-white shadow-sm">
                  <button type="button" onClick={() => setExpanded(isExpanded ? null : item.name)} className="w-full p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#3f7457]" aria-expanded={isExpanded}>
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e5ecdf] text-[#315f45]"><UsersRound size={20} /></span>
                      <div className="min-w-0 flex-1"><h3 className="text-sm font-black leading-5 text-[#173f32]">{item.name}</h3><span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${status.className}`}>{status.label}</span></div>
                      <ChevronDown size={18} className={`mt-1 shrink-0 text-[#718078] transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                    <div className="mt-3 grid grid-cols-3 divide-x divide-[#e7e2d8] rounded-xl bg-[#f8f6f0] py-2.5">
                      <div className="px-2 text-center"><p className="text-[9px] font-bold uppercase text-[#829087]">OS</p><p className="mt-0.5 text-sm font-black text-[#173f32]">{item.orders.length}</p></div>
                      <div className="px-2 text-center"><p className="text-[9px] font-bold uppercase text-[#829087]">KM</p><p className="mt-0.5 truncate text-sm font-black text-[#173f32]">{item.km.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</p></div>
                      <div className="px-2 text-center"><p className="text-[9px] font-bold uppercase text-[#829087]">A receber</p><p className="mt-0.5 truncate text-xs font-black text-[#755c21]">{money.format(item.receivable)}</p></div>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-[#e7e2d8] bg-[#fbfaf6] px-4 pb-4 pt-3">
                      <dl className="grid grid-cols-2 gap-2">
                        <div className="rounded-xl border border-[#e5dfd3] bg-white p-3"><dt className="flex items-center gap-1.5 text-[9px] font-black uppercase text-[#718078]"><Clock3 size={13} /> Última visita</dt><dd className="mt-1.5 text-sm font-black text-[#173f32]">{formatShortDate(item.lastVisitAt)}</dd></div>
                        <div className="rounded-xl border border-[#e5dfd3] bg-white p-3"><dt className="flex items-center gap-1.5 text-[9px] font-black uppercase text-[#718078]"><CalendarRange size={13} /> Intervalo médio</dt><dd className="mt-1.5 text-sm font-black text-[#173f32]">{item.averageIntervalDays === null ? 'Sem média' : `${Math.round(item.averageIntervalDays)} dias`}</dd></div>
                        <div className="rounded-xl border border-[#e5dfd3] bg-white p-3"><dt className="flex items-center gap-1.5 text-[9px] font-black uppercase text-[#718078]"><CircleDollarSign size={13} /> Receitas</dt><dd className="mt-1.5 truncate text-sm font-black text-[#315f45]">{money.format(item.revenue)}</dd></div>
                        <div className="rounded-xl border border-[#e5dfd3] bg-white p-3"><dt className="flex items-center gap-1.5 text-[9px] font-black uppercase text-[#718078]"><RouteIcon size={13} /> Despesas</dt><dd className="mt-1.5 truncate text-sm font-black text-[#8a3f31]">{money.format(item.expenses)}</dd></div>
                      </dl>
                      {item.allOrders.length > 0 && (
                        <button type="button" onClick={() => navigate(`/anomalies/list?client=${encodeURIComponent(item.name)}`)} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#173f32] px-3 text-xs font-black text-white"><ClipboardCheck size={17} /> Ver ordens deste cliente</button>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}

        <p className="mt-5 px-2 text-center text-[10px] font-semibold leading-4 text-[#718078]">Indicadores calculados pelas OS disponíveis no aplicativo. Integrações externas de clientes via API poderão ser adicionadas depois.</p>
      </main>
    </Layout>
  );
};
