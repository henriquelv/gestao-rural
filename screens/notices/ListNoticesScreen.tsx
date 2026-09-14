import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  Megaphone,
  Paperclip,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  UserRound,
  Video,
  X
} from 'lucide-react';
import { Layout } from '../../components/Layout';
import { Header } from '../../components/Header';
import { Notice } from '../../types';
import { db } from '../../services/db.service';
import { localdb } from '../../services/localdb';
import { cleanNoticeContent, noticeAuthor, noticePreview } from '../../utils/notices';

type PeriodFilter = 'all' | 'today' | '7days' | 'month';
type AttachmentFilter = 'all' | 'with' | 'without';

const isSameLocalDay = (date: Date, reference: Date) => date.toLocaleDateString('pt-BR') === reference.toLocaleDateString('pt-BR');

const dateLabel = (iso: string) => {
  const date = new Date(iso);
  if (isSameLocalDay(date, new Date())) return `Hoje, ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', '');
};

const mediaSymbol = (notice: Notice) => {
  if (notice.media?.some((item) => item.type === 'photo')) return <ImageIcon size={18} />;
  if (notice.media?.some((item) => item.type === 'video')) return <Video size={18} />;
  return <FileText size={18} />;
};

export const ListNoticesScreen: React.FC = () => {
  const navigate = useNavigate();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [responsibleFilter, setResponsibleFilter] = useState('all');
  const [attachmentFilter, setAttachmentFilter] = useState<AttachmentFilter>('all');

  useEffect(() => {
    let active = true;
    const load = async () => {
      const records = await db.getNotices();
      if (active) setNotices(records);
    };
    void load();
    const unsubscribe = localdb.subscribe('notices', () => { void load(); });
    return () => { active = false; unsubscribe?.(); };
  }, []);

  const authors = useMemo(() => Array.from(new Set(notices.map((notice) => noticeAuthor(notice.employee_name, notice.responsible))))
    .sort((a, b) => a.localeCompare(b, 'pt-BR')), [notices]);

  const filteredNotices = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
    const now = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    return [...notices]
      .filter((notice) => {
        const createdAt = new Date(notice.createdAt);
        const author = noticeAuthor(notice.employee_name, notice.responsible);
        if (periodFilter === 'today' && !isSameLocalDay(createdAt, now)) return false;
        if (periodFilter === '7days' && createdAt < sevenDaysAgo) return false;
        if (periodFilter === 'month' && notice.createdAt.slice(0, 7) !== currentMonth) return false;
        if (responsibleFilter !== 'all' && author !== responsibleFilter) return false;
        if (attachmentFilter === 'with' && !notice.media?.length) return false;
        if (attachmentFilter === 'without' && Boolean(notice.media?.length)) return false;
        if (normalizedSearch && !`${cleanNoticeContent(notice.content)} ${author}`.toLocaleLowerCase('pt-BR').includes(normalizedSearch)) return false;
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [attachmentFilter, notices, periodFilter, responsibleFilter, search]);

  const activeFilters = Number(periodFilter !== 'all') + Number(responsibleFilter !== 'all') + Number(attachmentFilter !== 'all');
  const clearFilters = () => {
    setPeriodFilter('all');
    setResponsibleFilter('all');
    setAttachmentFilter('all');
  };

  return (
    <Layout className="bg-[#f4f0e7]">
      <Header title="Mural de comunicados" targetRoute="/notices" />

      <section className="border-b border-[#d8d0c2] bg-white px-4 py-3">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6c7a72]" size={18} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar mensagem ou autor"
              className="h-12 w-full rounded-xl border-2 border-[#d8d0c2] bg-[#faf8f3] pl-10 pr-3 text-sm font-semibold text-[#173f32] outline-none placeholder:text-[#929994] focus:border-[#3f7457] focus-visible:ring-2 focus-visible:ring-[#3f7457]/20"
            />
          </div>
          <button type="button" onClick={() => setShowFilters(true)} className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 ${activeFilters ? 'border-[#173f32] bg-[#173f32] text-white' : 'border-[#d8d0c2] bg-white text-[#476356]'}`} aria-label="Abrir filtros">
            <SlidersHorizontal size={20} />
            {activeFilters > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#b84b36] px-1 text-[10px] font-black text-white">{activeFilters}</span>}
          </button>
          <button type="button" onClick={() => navigate('/notices/add', { state: { fixedTimestamp: new Date().toISOString() } })} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#3f7457] text-white shadow-sm" aria-label="Novo comunicado"><Plus size={22} /></button>
        </div>

        <div className="mt-3 flex items-center justify-between text-[11px] font-bold text-[#718078]">
          <span>{filteredNotices.length} de {notices.length} comunicado{notices.length === 1 ? '' : 's'}</span>
          {activeFilters > 0 && <button type="button" onClick={clearFilters} className="font-black uppercase tracking-[0.08em] text-[#3f7457]">Limpar filtros</button>}
        </div>
      </section>

      <main className="flex-1 overflow-y-auto px-4 pb-9 pt-4">
        {filteredNotices.length === 0 ? (
          <section className="rounded-[24px] border-2 border-dashed border-[#cfc7ba] bg-white px-6 py-12 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#edf2e8] text-[#3f7457]"><Megaphone size={27} /></span>
            <h2 className="campo-display mt-4 text-2xl text-[#173f32]">Nenhum comunicado</h2>
            <p className="mt-2 text-sm font-semibold leading-5 text-[#718078]">Ajuste sua busca ou publique uma nova mensagem para a equipe.</p>
          </section>
        ) : (
          <div className="space-y-3">
            {filteredNotices.map((notice, index) => {
              const author = noticeAuthor(notice.employee_name, notice.responsible);
              return (
                <button
                  key={notice.id}
                  type="button"
                  onClick={() => navigate(`/notices/detail/${notice.id}`)}
                  className="campo-reveal w-full overflow-hidden rounded-[22px] border border-[#d8d0c2] bg-white text-left shadow-[0_8px_20px_rgba(47,64,55,0.08)] transition active:scale-[0.99]"
                  style={{ animationDelay: `${Math.min(index, 6) * 55}ms` }}
                >
                  <div className="flex items-center justify-between gap-3 border-b border-[#ebe5da] bg-[#faf8f3] px-4 py-2.5">
                    <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.05em] text-[#557065]"><CalendarDays size={14} /> {dateLabel(notice.createdAt)}</span>
                    {notice.media?.length > 0 && <span className="flex items-center gap-1 rounded-full bg-[#e5ecdf] px-2 py-1 text-[10px] font-black text-[#315f45]"><Paperclip size={12} /> {notice.media.length}</span>}
                  </div>
                  <div className="flex items-center gap-3 p-4">
                    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${notice.media?.length ? 'bg-[#edf3f7] text-[#31596f]' : 'bg-[#edf2e8] text-[#3f7457]'}`}>
                      {notice.media?.length ? mediaSymbol(notice) : <Megaphone size={21} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold leading-5 text-[#294238]">{noticePreview(notice.content, 150) || 'Comunicado sem texto'}</span>
                      <span className="mt-2 flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-[#718078]"><UserRound size={13} className="shrink-0" /><span className="truncate">{author}</span></span>
                    </span>
                    <ChevronRight size={20} className="shrink-0 text-[#8b958f]" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>

      {showFilters && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#10231d]/65 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowFilters(false); }}>
          <section className="w-full max-w-md rounded-t-[28px] bg-[#f8f4eb] p-5 shadow-2xl sm:rounded-[28px]" role="dialog" aria-modal="true" aria-label="Filtros de comunicados">
            <div className="flex items-center justify-between">
              <div><p className="text-[10px] font-black uppercase tracking-[0.17em] text-[#718078]">Refinar mural</p><h2 className="campo-display mt-1 text-2xl text-[#173f32]">Filtros</h2></div>
              <button type="button" onClick={() => setShowFilters(false)} className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d8d0c2] bg-white text-[#173f32]" aria-label="Fechar filtros"><X size={20} /></button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.1em] text-[#64736b]">Período</span>
                <div className="grid grid-cols-2 gap-2">
                  {([['all', 'Todos'], ['today', 'Hoje'], ['7days', 'Últimos 7 dias'], ['month', 'Este mês']] as const).map(([value, label]) => (
                    <button key={value} type="button" onClick={() => setPeriodFilter(value)} className={`rounded-xl border-2 px-2 py-3 text-xs font-black uppercase ${periodFilter === value ? 'border-[#173f32] bg-[#173f32] text-white' : 'border-[#d8d0c2] bg-white text-[#52655b]'}`}>{label}</button>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.1em] text-[#64736b]">Responsável</span>
                <select value={responsibleFilter} onChange={(event) => setResponsibleFilter(event.target.value)} className="w-full rounded-xl border-2 border-[#d8d0c2] bg-white px-3 py-3 font-bold text-[#173f32] outline-none focus:border-[#3f7457]">
                  <option value="all">Todos os responsáveis</option>
                  {authors.map((author) => <option key={author} value={author}>{author}</option>)}
                </select>
              </label>

              <div>
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.1em] text-[#64736b]">Anexos</span>
                <div className="grid grid-cols-3 gap-2">
                  {([['all', 'Todos'], ['with', 'Com anexo'], ['without', 'Sem anexo']] as const).map(([value, label]) => (
                    <button key={value} type="button" onClick={() => setAttachmentFilter(value)} className={`rounded-xl border-2 px-2 py-3 text-[10px] font-black uppercase ${attachmentFilter === value ? 'border-[#173f32] bg-[#173f32] text-white' : 'border-[#d8d0c2] bg-white text-[#52655b]'}`}>{label}</button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-[auto_1fr] gap-2">
              <button type="button" onClick={clearFilters} className="flex items-center justify-center gap-2 rounded-xl border-2 border-[#d8d0c2] bg-white px-4 py-3 text-xs font-black uppercase text-[#52655b]"><RotateCcw size={16} /> Limpar</button>
              <button type="button" onClick={() => setShowFilters(false)} className="rounded-xl bg-[#173f32] px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-white">Ver {filteredNotices.length}</button>
            </div>
          </section>
        </div>
      )}
    </Layout>
  );
};
