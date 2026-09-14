import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  FileDown,
  FileSpreadsheet,
  FileText,
  Files,
  Images,
  Loader2,
  MapPin,
  Paperclip,
  Plus,
  RotateCcw,
  Search,
  Share2,
  SlidersHorizontal,
  Table2,
  UserRound,
  X
} from 'lucide-react';
import { Header } from '../components/Header';
import { Layout } from '../components/Layout';
import { db } from '../services/db.service';
import { farmContextService } from '../services/farm-context.service';
import { localdb } from '../services/localdb';
import { monthlyReportPdfService } from '../services/monthly-report-pdf.service';
import { notify } from '../services/notification.service';
import { permissionsService } from '../services/permissions.service';
import { workOrderExportService } from '../services/work-order-export.service';
import { Anomaly } from '../types';
import { monthLabel, summarizeMonthlyWorkOrders } from '../utils/monthly-report';
import { regularWorkOrderMedia, workOrderKmUnitValue, workOrderTotal } from '../utils/work-orders';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const serviceDate = (item: Anomaly) => item.serviceDate || item.createdAt.slice(0, 10);
const monthKey = (item: Anomaly) => serviceDate(item).slice(0, 7);

const formatDate = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
};

const formatMonth = (value: string) => {
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
    .format(new Date(year, month - 1, 1))
    .replace(/^./, (letter) => letter.toUpperCase());
};

export const ListAnomaliesScreen: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const context = farmContextService.getContext();
  const isAdmin = permissionsService.isAdmin(context);
  const [allItems, setAllItems] = useState<Anomaly[]>([]);
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'all' | 'receita' | 'despesa'>('all');
  const [monthFilter, setMonthFilter] = useState('all');
  const [technicianFilter, setTechnicianFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState(() => searchParams.get('client') || 'all');
  const [showExport, setShowExport] = useState(false);
  const [exportAction, setExportAction] = useState<'excel' | 'word' | 'pdf' | 'csv' | null>(null);
  const [showMonthlyReport, setShowMonthlyReport] = useState(false);
  const [reportMonth, setReportMonth] = useState('');
  const [reportAction, setReportAction] = useState<'share' | 'download' | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const records = await db.getAnomalies();
      if (active) setAllItems(records.filter((item) => item.recordType === 'service_order' || Boolean(item.clientName)));
    };
    const hydrate = async () => {
      // O administrador sempre abre a lista com uma consulta completa da
      // empresa. Assim o cache do próprio aparelho não limita a tela às OS que
      // ele criou antes de os demais celulares sincronizarem.
      if (isAdmin && navigator.onLine) await db.forceRefreshTable('anomalies');
      await load();
    };
    void hydrate();
    const unsubscribe = localdb.subscribe('anomalies', () => { void load(); });
    return () => { active = false; unsubscribe?.(); };
  }, [isAdmin]);

  const workOrders = useMemo(() => allItems
    .filter((item) => permissionsService.canAccessWorkOrder(item, context))
    .sort((a, b) => {
    const dateComparison = serviceDate(b).localeCompare(serviceDate(a));
    return dateComparison || b.createdAt.localeCompare(a.createdAt);
  }), [allItems, context]);

  const months = useMemo(() => Array.from(new Set(workOrders.map(monthKey))).sort().reverse(), [workOrders]);
  const technicians = useMemo(() => Array.from(new Set(workOrders.map((item) => item.responsible).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')), [workOrders]);
  const clients = useMemo(() => Array.from(new Set(workOrders.map((item) => item.clientName).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b, 'pt-BR')), [workOrders]);

  useEffect(() => {
    if (!reportMonth && months.length) setReportMonth(months[0]);
  }, [months, reportMonth]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return workOrders.filter((item) => {
      if (typeFilter !== 'all' && item.serviceOrderType !== typeFilter) return false;
      if (monthFilter !== 'all' && monthKey(item) !== monthFilter) return false;
      if (isAdmin && technicianFilter !== 'all' && item.responsible !== technicianFilter) return false;
      if (clientFilter !== 'all' && item.clientName !== clientFilter) return false;
      if (!term) return true;
      return [item.clientName, item.responsible, item.description, item.createdByEmployeeName]
        .some((value) => value?.toLocaleLowerCase('pt-BR').includes(term));
    });
  }, [clientFilter, isAdmin, monthFilter, search, technicianFilter, typeFilter, workOrders]);

  const activeFilters = Number(typeFilter !== 'all')
    + Number(monthFilter !== 'all')
    + Number(isAdmin && technicianFilter !== 'all')
    + Number(clientFilter !== 'all');
  const clearFilters = () => {
    setTypeFilter('all');
    setMonthFilter('all');
    setTechnicianFilter('all');
    setClientFilter('all');
  };

  const monthlySummary = useMemo(
    () => summarizeMonthlyWorkOrders(workOrders, reportMonth || months[0] || ''),
    [months, reportMonth, workOrders]
  );
  const reportScope = isAdmin
    ? 'Toda a equipe'
    : `Técnico: ${context?.employee_name || 'perfil ativo'}`;

  useEffect(() => {
    if (!showExport && !showFilters && !showMonthlyReport) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [showExport, showFilters, showMonthlyReport]);

  const exportFilteredOrders = async (format: 'excel' | 'word' | 'pdf' | 'csv') => {
    if (!filteredItems.length) {
      notify('Não há Ordens de Serviço para exportar.', 'info');
      return;
    }
    setExportAction(format);
    try {
      await workOrderExportService.export(filteredItems, format);
      const labels = { excel: 'Excel', word: 'Word', pdf: 'PDF', csv: 'CSV' } as const;
      notify(`${filteredItems.length} OS exportada${filteredItems.length === 1 ? '' : 's'} em ${labels[format]}.`, 'success');
      setShowExport(false);
    } catch (error) {
      console.error(`Erro ao exportar OS em ${format}:`, error);
      notify('Não foi possível gerar o arquivo. Verifique o espaço disponível e tente novamente.', 'error');
    } finally {
      setExportAction(null);
    }
  };

  const openMonthlyReport = () => {
    const localNow = new Date();
    const currentMonth = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}`;
    setReportMonth(monthFilter !== 'all' ? monthFilter : months[0] || currentMonth);
    setShowMonthlyReport(true);
  };

  const shareMonthlyReport = async () => {
    if (!monthlySummary.orders.length) return notify('Não há OS neste mês para gerar o relatório.', 'info');
    setReportAction('share');
    try {
      const result = await monthlyReportPdfService.share(workOrders, { monthKey: reportMonth, scopeLabel: reportScope });
      notify(result === 'shared' ? 'Relatório pronto para compartilhar.' : 'Relatório PDF salvo no aparelho.', 'success');
    } catch (error) {
      if ((error as { name?: string })?.name !== 'AbortError') {
        console.error('Erro ao compartilhar relatório mensal:', error);
        notify('Não foi possível compartilhar o relatório.', 'error');
      }
    } finally {
      setReportAction(null);
    }
  };

  const downloadMonthlyReport = async () => {
    if (!monthlySummary.orders.length) return notify('Não há OS neste mês para gerar o relatório.', 'info');
    setReportAction('download');
    try {
      await monthlyReportPdfService.download(workOrders, { monthKey: reportMonth, scopeLabel: reportScope });
      notify('Relatório mensal salvo em PDF.', 'success');
    } catch (error) {
      console.error('Erro ao salvar relatório mensal:', error);
      notify('Não foi possível gerar o relatório mensal.', 'error');
    } finally {
      setReportAction(null);
    }
  };

  return (
    <Layout className="bg-[#f4f0e7]">
      <Header title="Visitas e OS" targetRoute="/anomalies" />

      <div className="border-b border-[#d8d0c2] bg-white px-4 py-3">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => navigate('/anomalies/add')} className="col-span-2 flex items-center justify-center gap-2 rounded-xl bg-[#173f32] px-3 py-3 text-xs font-black uppercase tracking-[0.06em] text-white">
            <Plus size={18} /> Nova OS
          </button>
          <button type="button" onClick={openMonthlyReport} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-[#173f32] bg-[#edf4e8] px-3 py-3 text-[11px] font-black uppercase tracking-[0.05em] text-[#173f32]">
            <BarChart3 size={18} /> Relatório mensal
          </button>
          <button type="button" onClick={() => setShowExport(true)} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-[#b77a61] bg-[#f7e9df] px-3 py-3 text-[11px] font-black uppercase tracking-[0.05em] text-[#6f382a]">
            <Files size={18} /> Exportar OS
          </button>
        </div>

        <div className="mt-3 flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6c7a72]" size={18} />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cliente, técnico ou observação" className="w-full rounded-xl border-2 border-[#d8d0c2] bg-[#faf8f3] py-3 pl-10 pr-3 text-sm font-semibold text-[#173f32] outline-none focus:border-[#3f7457] focus-visible:ring-2 focus-visible:ring-[#3f7457]/20" />
          </div>
          <button type="button" onClick={() => setShowFilters(true)} className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 ${activeFilters ? 'border-[#173f32] bg-[#173f32] text-white' : 'border-[#d8d0c2] bg-white text-[#476356]'}`} aria-label="Abrir filtros">
            <SlidersHorizontal size={20} />
            {activeFilters > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#b84b36] px-1 text-[10px] font-black text-white">{activeFilters}</span>}
          </button>
        </div>

        {activeFilters > 0 && (
          <div className="mt-3 flex items-center gap-2 overflow-x-auto text-[10px] font-black uppercase tracking-[0.06em] text-[#476356]">
            {monthFilter !== 'all' && <span className="shrink-0 rounded-full bg-[#edf4e8] px-3 py-1.5">{formatMonth(monthFilter)}</span>}
            {isAdmin && technicianFilter !== 'all' && <span className="max-w-40 shrink-0 truncate rounded-full bg-[#edf4e8] px-3 py-1.5">{technicianFilter}</span>}
            {clientFilter !== 'all' && <span className="max-w-40 shrink-0 truncate rounded-full bg-[#edf4e8] px-3 py-1.5">{clientFilter}</span>}
            {typeFilter !== 'all' && <span className="shrink-0 rounded-full bg-[#edf4e8] px-3 py-1.5">{typeFilter}</span>}
          </div>
        )}
      </div>

      <main className="flex-1 overflow-y-auto px-4 pb-8 pt-4">
        <div className="mb-3 flex items-center justify-between text-xs font-bold text-[#66756d]">
          <span>{filteredItems.length} de {workOrders.length} OS</span>
          {!isAdmin && <span>Somente suas OS</span>}
        </div>

        {filteredItems.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-[#cfc7ba] bg-white px-6 py-12 text-center">
            <FileSpreadsheet className="mx-auto text-[#8da083]" size={42} />
            <h2 className="campo-display mt-3 text-xl text-[#173f32]">Nenhuma OS encontrada</h2>
            <p className="mt-1 text-sm text-[#68746d]">Ajuste os filtros ou crie uma nova Ordem de Serviço.</p>
          </div>
        ) : (
          <div className="relative space-y-3 before:absolute before:bottom-4 before:left-[11px] before:top-4 before:w-px before:bg-[#c8d1c3]">
            {filteredItems.map((item) => (
                <div key={item.id} className="relative pl-6">
                  <span className={`absolute left-[6px] top-7 z-10 h-[11px] w-[11px] rounded-full border-2 border-[#f4f0e7] ${item.serviceOrderType === 'despesa' ? 'bg-[#b84b36]' : 'bg-[#3f7457]'}`} />
                  <button type="button" onClick={() => navigate(`/anomalies/detail/${item.id}`)} className="w-full overflow-hidden rounded-2xl border border-[#d8d0c2] bg-white text-left shadow-sm transition active:scale-[0.99]">
                    <div className="flex items-center justify-between border-b border-[#ebe5da] bg-[#faf8f3] px-4 py-2.5">
                      <span className="flex items-center gap-1.5 text-xs font-black text-[#476356]"><CalendarDays size={15} /> {formatDate(serviceDate(item))}</span>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${item.serviceOrderType === 'despesa' ? 'bg-[#f7ddd2] text-[#7a3527]' : 'bg-[#dcebd5] text-[#23513a]'}`}>{item.serviceOrderType === 'despesa' ? 'Despesa' : 'Receita'}</span>
                    </div>
                    <div className="flex items-center gap-3 p-4">
                      <div className="min-w-0 flex-1">
                        <h2 className="truncate text-base font-black text-[#173f32]">{item.clientName || 'Cliente não informado'}</h2>
                        <p className="mt-1 flex items-center gap-1.5 truncate text-xs font-semibold text-[#68746d]"><UserRound size={14} className="shrink-0" /> {item.responsible}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-black">
                          <span className="rounded-md bg-[#edf4e8] px-2 py-1 text-[#315f45]">Total {money.format(workOrderTotal(item))}</span>
                          {item.serviceOrderType === 'receita' && <span className={`rounded-md px-2 py-1 ${item.paymentStatus === 'recebido' ? 'bg-[#e3eee0] text-[#315f45]' : 'bg-[#f5ecd2] text-[#735d24]'}`}>{item.paymentStatus === 'recebido' ? 'Recebido' : 'A receber'}</span>}
                          {item.serviceOrderType === 'despesa' && (item.kmQuantity || 0) > 0 && (
                            <>
                              <span className="rounded-md bg-[#f1ede4] px-2 py-1 text-[#6b655b]">{String(item.kmQuantity).replace('.', ',')} KM rodados</span>
                              <span className="rounded-md bg-[#edf4e8] px-2 py-1 text-[#315f45]">{money.format(item.kmValue || 0)} total KM</span>
                              <span className="rounded-md bg-[#f1ede4] px-2 py-1 text-[#6b655b]">{money.format(workOrderKmUnitValue(item))}/km</span>
                            </>
                          )}
                          {item.serviceOrderType === 'despesa' && (item.additionalExpenseValue || 0) > 0 && (
                            <span className="rounded-md bg-[#f7f1e5] px-2 py-1 text-[#6f5b38]">+ {money.format(item.additionalExpenseValue || 0)} outros</span>
                          )}
                          {item.location && <MapPin size={15} className="text-[#3f7457]" />}
                          {regularWorkOrderMedia(item).length > 0 && <span className="flex items-center gap-1 text-[#53665c]"><Paperclip size={14} /> {regularWorkOrderMedia(item).length}</span>}
                        </div>
                      </div>
                      <ChevronRight className="shrink-0 text-[#829087]" size={22} />
                    </div>
                  </button>
                </div>
            ))}
          </div>
        )}
      </main>

      {showFilters && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[#10231d]/65 p-0 sm:items-center sm:p-4" onClick={() => setShowFilters(false)}>
          <div className="w-full max-w-md rounded-t-[26px] bg-[#f8f4eb] p-5 shadow-2xl sm:rounded-[26px]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#6f7c74]">Refinar histórico</p><h2 className="campo-display mt-1 text-2xl text-[#173f32]">Filtros de OS</h2></div>
              <button type="button" onClick={() => setShowFilters(false)} className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d8d0c2] bg-white text-[#173f32]"><X size={20} /></button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.1em] text-[#64736b]">Mês</span><select value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} className="w-full rounded-xl border-2 border-[#d8d0c2] bg-white px-3 py-3 font-bold text-[#173f32]"><option value="all">Todos os meses</option>{months.map((month) => <option key={month} value={month}>{formatMonth(month)}</option>)}</select></label>
              {isAdmin && (
                <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.1em] text-[#64736b]">Técnico</span><select value={technicianFilter} onChange={(event) => setTechnicianFilter(event.target.value)} className="w-full rounded-xl border-2 border-[#d8d0c2] bg-white px-3 py-3 font-bold text-[#173f32]"><option value="all">Todos os técnicos</option>{technicians.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
              )}
              <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.1em] text-[#64736b]">Cliente</span><select value={clientFilter} onChange={(event) => setClientFilter(event.target.value)} className="w-full rounded-xl border-2 border-[#d8d0c2] bg-white px-3 py-3 font-bold text-[#173f32]"><option value="all">Todos os clientes</option>{clients.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
              <div><span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.1em] text-[#64736b]">Tipo</span><div className="grid grid-cols-3 gap-2">{(['all', 'receita', 'despesa'] as const).map((value) => <button key={value} type="button" onClick={() => setTypeFilter(value)} className={`rounded-xl border-2 px-2 py-3 text-xs font-black uppercase ${typeFilter === value ? 'border-[#173f32] bg-[#173f32] text-white' : 'border-[#d8d0c2] bg-white text-[#52655b]'}`}>{value === 'all' ? 'Todas' : value}</button>)}</div></div>
            </div>

            <div className="mt-6 grid grid-cols-[auto_1fr] gap-2">
              <button type="button" onClick={clearFilters} className="flex items-center justify-center gap-2 rounded-xl border-2 border-[#d8d0c2] bg-white px-4 py-3 text-xs font-black uppercase text-[#52655b]"><RotateCcw size={16} /> Limpar</button>
              <button type="button" onClick={() => setShowFilters(false)} className="rounded-xl bg-[#173f32] px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-white">Ver {filteredItems.length} OS</button>
            </div>
          </div>
        </div>
      )}

      {showExport && (
        <div className="fixed inset-0 z-[75] flex items-end justify-center bg-[#10231d]/70 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={() => exportAction === null && setShowExport(false)}>
          <section className="flex max-h-[94dvh] w-full max-w-md flex-col overflow-hidden overscroll-contain rounded-t-[28px] border border-[#d8d0c2] bg-[#f8f4eb] shadow-2xl sm:rounded-[28px]" role="dialog" aria-modal="true" aria-labelledby="export-orders-title" onClick={(event) => event.stopPropagation()}>
            <div className="border-b border-[#d8d0c2] bg-white px-5 pb-4 pt-3">
              <span className="mx-auto mb-3 block h-1 w-12 rounded-full bg-[#c7c1b6] sm:hidden" aria-hidden="true" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#8a7441]">Arquivos profissionais</p>
                  <h2 id="export-orders-title" className="campo-display mt-1 text-2xl text-[#173f32]">Exportar Ordens de Serviço</h2>
                  <p className="mt-1 text-xs font-semibold text-[#68746d]">{filteredItems.length} OS selecionada{filteredItems.length === 1 ? '' : 's'} pelos filtros atuais</p>
                </div>
                <button type="button" onClick={() => setShowExport(false)} disabled={exportAction !== null} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#d8d0c2] bg-[#fbf8f1] text-[#173f32] disabled:opacity-50" aria-label="Fechar opções de exportação"><X size={21} /></button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
              <div className="flex items-start gap-3 rounded-2xl border border-[#c8d7be] bg-[#e8f0e2] p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#173f32] text-white"><Images size={19} /></span>
                <div>
                  <p className="text-sm font-black text-[#173f32]">Fotos e assinaturas incluídas</p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-[#5e7066]">Excel, Word e PDF começam com um resumo gerencial e levam as imagens junto da respectiva OS. Outros documentos são relacionados pelo nome.</p>
                </div>
              </div>

              <div className="grid gap-2.5">
                <button type="button" onClick={() => void exportFilteredOrders('excel')} disabled={exportAction !== null || !filteredItems.length} className="flex min-h-[76px] items-center gap-3 rounded-2xl border-2 border-[#3f7457] bg-white p-3 text-left transition active:scale-[0.99] disabled:opacity-55">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#dfeadb] text-[#26523a]">{exportAction === 'excel' ? <Loader2 className="animate-spin" size={23} /> : <FileSpreadsheet size={23} />}</span>
                  <span className="min-w-0 flex-1"><strong className="block text-sm font-black text-[#173f32]">Excel completo</strong><small className="mt-1 block text-xs font-semibold leading-4 text-[#68746d]">Resumo com indicadores, tabelas por técnico/cliente, dados e imagens.</small></span>
                  <ChevronRight className="shrink-0 text-[#829087]" size={20} />
                </button>
                <button type="button" onClick={() => void exportFilteredOrders('pdf')} disabled={exportAction !== null || !filteredItems.length} className="flex min-h-[76px] items-center gap-3 rounded-2xl border border-[#d8d0c2] bg-white p-3 text-left transition active:scale-[0.99] disabled:opacity-55">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#f3e2db] text-[#8b432f]">{exportAction === 'pdf' ? <Loader2 className="animate-spin" size={23} /> : <FileDown size={23} />}</span>
                  <span className="min-w-0 flex-1"><strong className="block text-sm font-black text-[#173f32]">PDF detalhado</strong><small className="mt-1 block text-xs font-semibold leading-4 text-[#68746d]">Resumo gerencial e fichas prontas para enviar, com evidências e assinatura.</small></span>
                  <ChevronRight className="shrink-0 text-[#829087]" size={20} />
                </button>
                <button type="button" onClick={() => void exportFilteredOrders('word')} disabled={exportAction !== null || !filteredItems.length} className="flex min-h-[76px] items-center gap-3 rounded-2xl border border-[#d8d0c2] bg-white p-3 text-left transition active:scale-[0.99] disabled:opacity-55">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#e5ecec] text-[#31596a]">{exportAction === 'word' ? <Loader2 className="animate-spin" size={23} /> : <FileText size={23} />}</span>
                  <span className="min-w-0 flex-1"><strong className="block text-sm font-black text-[#173f32]">Word editável</strong><small className="mt-1 block text-xs font-semibold leading-4 text-[#68746d]">Resumo profissional e uma ficha completa por OS.</small></span>
                  <ChevronRight className="shrink-0 text-[#829087]" size={20} />
                </button>
                <button type="button" onClick={() => void exportFilteredOrders('csv')} disabled={exportAction !== null || !filteredItems.length} className="flex min-h-[64px] items-center gap-3 rounded-2xl border border-[#d8d0c2] bg-[#f3efe7] p-3 text-left transition active:scale-[0.99] disabled:opacity-55">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#66756d]">{exportAction === 'csv' ? <Loader2 className="animate-spin" size={20} /> : <Table2 size={20} />}</span>
                  <span className="min-w-0 flex-1"><strong className="block text-xs font-black uppercase tracking-[0.05em] text-[#40564b]">CSV leve</strong><small className="mt-0.5 block text-[11px] font-semibold text-[#718078]">Tabela compatível, sem incorporar imagens.</small></span>
                </button>
              </div>

              <p className="px-1 text-[11px] font-semibold leading-5 text-[#718078]">Se uma imagem existir apenas no servidor, faça a exportação conectado à internet. Imagens já salvas neste aparelho também funcionam offline.</p>
            </div>
          </section>
        </div>
      )}

      {showMonthlyReport && (
        <div className="fixed inset-0 z-[75] flex items-end justify-center bg-[#10231d]/70 p-0 sm:items-center sm:p-4" onClick={() => reportAction === null && setShowMonthlyReport(false)}>
          <section className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[26px] bg-[#f8f4eb] shadow-2xl sm:rounded-[26px]" role="dialog" aria-modal="true" aria-labelledby="monthly-report-title" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#d8d0c2] bg-[#f8f4eb]/95 px-5 py-4 backdrop-blur">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#718078]">Fechamento do período</p>
                <h2 id="monthly-report-title" className="campo-display mt-1 text-2xl text-[#173f32]">Relatório mensal</h2>
              </div>
              <button type="button" onClick={() => setShowMonthlyReport(false)} disabled={reportAction !== null} className="flex h-11 w-11 items-center justify-center rounded-full border border-[#d8d0c2] bg-white text-[#173f32] disabled:opacity-50" aria-label="Fechar relatório mensal"><X size={21} /></button>
            </div>

            <div className="space-y-4 p-5">
              <label className="block">
                <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.12em] text-[#64736b]">Mês do relatório</span>
                <div className="relative">
                  <select value={reportMonth} onChange={(event) => setReportMonth(event.target.value)} className="min-h-12 w-full appearance-none rounded-xl border-2 border-[#d8d0c2] bg-white px-4 py-3 pr-10 text-sm font-black text-[#173f32] outline-none focus:border-[#3f7457] focus-visible:ring-2 focus-visible:ring-[#3f7457]/20">
                    {months.length
                      ? months.map((month) => <option key={month} value={month}>{formatMonth(month)}</option>)
                      : <option value={reportMonth}>{reportMonth ? monthLabel(reportMonth) : 'Sem meses disponíveis'}</option>}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#64736b]" size={18} />
                </div>
              </label>

              <div className="overflow-hidden rounded-2xl bg-[#173f32] text-white">
                <div className="border-b border-white/10 px-4 py-3">
                  <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#caddb3]">Resumo executivo</p>
                  <p className="mt-1 text-xs font-semibold text-white/65">{reportScope}</p>
                </div>
                <div className="grid grid-cols-3 divide-x divide-white/10">
                  <div className="px-2 py-3 text-center"><p className="text-[9px] font-bold uppercase text-white/45">OS</p><p className="mt-1 text-xl font-black">{monthlySummary.orders.length}</p></div>
                  <div className="px-2 py-3 text-center"><p className="text-[9px] font-bold uppercase text-white/45">Clientes</p><p className="mt-1 text-xl font-black">{monthlySummary.clients}</p></div>
                  <div className="px-2 py-3 text-center"><p className="text-[9px] font-bold uppercase text-white/45">Assinadas</p><p className="mt-1 text-xl font-black">{Math.round(monthlySummary.signatureRate * 100)}%</p><p className="text-[9px] font-semibold text-white/45">{monthlySummary.signedOrders} de {monthlySummary.orders.length}</p></div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-[#c8d7be] bg-[#e8f0e2] p-3"><p className="text-[9px] font-black uppercase text-[#64736b]">Receitas</p><p className="mt-1 truncate text-base font-black text-[#173f32]">{money.format(monthlySummary.revenue)}</p></div>
                <div className="rounded-xl border border-[#dfc9b8] bg-[#f2e4d8] p-3"><p className="text-[9px] font-black uppercase text-[#7b675a]">Despesas</p><p className="mt-1 truncate text-base font-black text-[#6f382a]">{money.format(monthlySummary.expenses)}</p></div>
                <div className="rounded-xl border border-[#dfd2aa] bg-[#f5ecd2] p-3"><p className="text-[9px] font-black uppercase text-[#75632f]">A receber</p><p className="mt-1 truncate text-base font-black text-[#5f501d]">{money.format(monthlySummary.receivable)}</p></div>
                <div className="rounded-xl border border-[#d8d0c2] bg-white p-3">
                  <p className="text-[9px] font-black uppercase text-[#64736b]">KM rodados</p>
                  <p className="mt-1 truncate text-base font-black text-[#173f32]">{monthlySummary.km.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km</p>
                  <p className="mt-1 text-[10px] font-semibold text-[#718078]">Média {monthlySummary.averageKm.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km por deslocamento</p>
                </div>
                <div className={`rounded-xl border p-3 ${monthlySummary.balance < 0 ? 'border-[#dfc9b8] bg-[#f2e4d8]' : 'border-[#c8d7be] bg-[#e8f0e2]'}`}><p className="text-[9px] font-black uppercase text-[#64736b]">Saldo do período</p><p className={`mt-1 truncate text-base font-black ${monthlySummary.balance < 0 ? 'text-[#6f382a]' : 'text-[#173f32]'}`}>{money.format(monthlySummary.balance)}</p></div>
                <div className="rounded-xl border border-[#d8d0c2] bg-white p-3"><p className="text-[9px] font-black uppercase text-[#64736b]">Ticket médio</p><p className="mt-1 truncate text-base font-black text-[#173f32]">{money.format(monthlySummary.averageTicket)}</p><p className="mt-1 text-[10px] font-semibold text-[#718078]">Média das OS de receita</p></div>
              </div>

              {!monthlySummary.orders.length && (
                <p className="rounded-xl border border-dashed border-[#c9c1b4] bg-white/60 px-4 py-5 text-center text-xs font-bold text-[#718078]">Não existem OS neste mês. Selecione outro período para gerar o relatório.</p>
              )}

              <p className="text-xs font-semibold leading-5 text-[#64736b]">O PDF inclui resumo executivo, saldo, ticket médio, comparação com o mês anterior, movimento semanal, resultados por técnico e cliente e o detalhamento das OS.</p>

              <div className="grid grid-cols-1 gap-2">
                <button type="button" onClick={() => void shareMonthlyReport()} disabled={reportAction !== null || !monthlySummary.orders.length} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#173f32] px-4 text-sm font-black text-white disabled:opacity-50">
                  {reportAction === 'share' ? <Loader2 className="animate-spin" size={19} /> : <Share2 size={19} />} Compartilhar PDF
                </button>
                <button type="button" onClick={() => void downloadMonthlyReport()} disabled={reportAction !== null || !monthlySummary.orders.length} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-[#3f7457] bg-white px-4 text-sm font-black text-[#173f32] disabled:opacity-50">
                  {reportAction === 'download' ? <Loader2 className="animate-spin" size={19} /> : <FileDown size={19} />} Baixar PDF
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </Layout>
  );
};
