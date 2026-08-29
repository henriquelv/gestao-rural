import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../components/Layout';
import { Header } from '../../components/Header';
import { Notice, MediaItem } from '../../types';
import { db } from '../../services/db.service';
import { localdb } from '../../services/localdb';
import { mediaService } from '../../services/media.service';
import { downloadService } from '../../services/download.service';
import { supabase } from '../../services/supabase';
import { notify } from '../../services/notification.service';
import { getSectorColors } from '../../constants/sectors';
import { useImageZoom } from '../../utils/useImageZoom';
import { PinRequestModal } from '../../components/PinRequestModal';
import { EmptyState, FilterOption, FilterSheet, FilterToolbar } from '../../components/UiPrimitives';
import { SECTORS_LIST } from '../../constants/sectors';
import { Trash2, User, Image as ImageIcon, Video, FileText, Presentation, Download, X, Calendar, LayoutGrid, Paperclip, Search } from 'lucide-react';
import { getAnomalyDate, getAnomalyTime, getBusinessDateKey, getBusinessMonthKey } from '../../utils/anomaly-months';

const PAGE_SIZE = 40;

export const ListNoticesScreen: React.FC = () => {
  const navigate = useNavigate();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [viewingMedia, setViewingMedia] = useState<MediaItem | null>(null);
  const [viewingUrl, setViewingUrl] = useState<string>('');
  const [viewingZoom, setViewingZoom] = useState(1);
  const [filterPeriod, setFilterPeriod] = useState<'all' | 'today' | '7days' | 'month'>('all');
  const [filterSectors, setFilterSectors] = useState<string[]>([]);
  const [filterResponsible, setFilterResponsible] = useState('');
  const [filterMedia, setFilterMedia] = useState<'all' | 'with' | 'without'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showPinModal, setShowPinModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => Promise<void> | void) | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);

  // Gestos de zoom
  const viewingZoomGestures = useImageZoom((newZoom) => setViewingZoom(newZoom));

  const load = async () => {
    const data = await db.getNotices();
    setNotices(data);
  };

  const parseSectorFromContent = (content: string) => {
    const raw = (content || '').toString();
    const m = raw.match(/^\[Setor:\s*(.+?)\]\s*/i);
    if (!m) return { sector: '', content: raw };
    return { sector: (m[1] || '').trim(), content: raw.replace(m[0], '') };
  };

  useEffect(() => {
    const init = async () => {
      await load();
    };
    init();
    const onOnline = () => load();
    window.addEventListener('online', onOnline);
    const unsub = localdb.subscribe('notices', () => load());
    return () => { window.removeEventListener('online', onOnline); unsub && unsub(); };
  }, []);

  const localDay = (iso: string) => {
    return getAnomalyDate(iso)?.toLocaleDateString('pt-BR') || 'Sem data';
  };

  const toggleSectorFilter = (sector: string) => {
    setFilterSectors(prev => prev.includes(sector) ? prev.filter(item => item !== sector) : [...prev, sector]);
  };

  const filteredNotices = useMemo(() => {
    let res = [...notices];
    if (filterPeriod === 'today') {
      const today = getBusinessDateKey(new Date());
      res = res.filter(n => getBusinessDateKey(n.createdAt) === today);
    } else if (filterPeriod === '7days') {
      const cutoff = getBusinessDateKey(new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)));
      res = res.filter(n => getBusinessDateKey(n.createdAt) >= cutoff);
    } else if (filterPeriod === 'month') {
      const month = getBusinessMonthKey(new Date());
      res = res.filter(n => getBusinessMonthKey(n.createdAt) === month);
    }
    if (filterSectors.length > 0) {
      res = res.filter(n => filterSectors.includes(parseSectorFromContent(n.content).sector));
    }
    if (filterResponsible) {
      res = res.filter(n => (n.employee_name || n.responsible || '').toLowerCase() === filterResponsible.toLowerCase());
    }
    if (filterMedia === 'with') res = res.filter(n => (n.media || []).length > 0);
    if (filterMedia === 'without') res = res.filter(n => !n.media || n.media.length === 0);
    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      res = res.filter(n => {
        const parsed = parseSectorFromContent(n.content);
        return parsed.content.toLowerCase().includes(term)
          || parsed.sector.toLowerCase().includes(term)
          || (n.responsible || '').toLowerCase().includes(term)
          || (n.employee_name || '').toLowerCase().includes(term);
      });
    }
    res.sort((a, b) => getAnomalyTime(b.createdAt) - getAnomalyTime(a.createdAt));
    return res;
  }, [notices, filterPeriod, filterSectors, filterResponsible, filterMedia, searchTerm]);

  const responsibleOptions = useMemo(() => {
    const names = notices.map(n => String(n.employee_name || n.responsible || '').trim()).filter(Boolean);
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  }, [notices]);

  const visibleNotices = useMemo(() => filteredNotices.slice(0, visibleLimit), [filteredNotices, visibleLimit]);

  useEffect(() => {
    setVisibleLimit(PAGE_SIZE);
  }, [filterPeriod, filterSectors, filterResponsible, filterMedia, searchTerm]);

  const activeFiltersCount = filterSectors.length
    + (filterPeriod !== 'all' ? 1 : 0)
    + (filterResponsible ? 1 : 0)
    + (filterMedia !== 'all' ? 1 : 0)
    + (searchTerm.trim() ? 1 : 0);

  const clearFilters = () => {
    setFilterPeriod('all');
    setFilterSectors([]);
    setFilterResponsible('');
    setFilterMedia('all');
    setSearchTerm('');
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'pdf': return <FileText size={16} className="text-red-500" />;
      case 'doc': return <FileText size={16} className="text-blue-600" />;
      case 'ppt': return <Presentation size={16} className="text-orange-500" />;
      case 'video': return <Video size={16} className="text-purple-500" />;
      case 'photo': return <ImageIcon size={16} className="text-blue-400" />;
      default: return <FileText size={16} className="text-gray-500" />;
    }
  };

  const openMedia = async (m: MediaItem) => {
    setViewingMedia(m);
    const url = await mediaService.loadMediaUrl(m);
    setViewingUrl(url || m.remoteUrl || m.uri || '');
  };

  const handleDelete = async (notice: Notice) => {
    const action = async () => {
      try {
        await db.deleteNotice(notice.id);
        notify('Comunicado excluído!', 'success');
        load();
      } catch (e) {
        notify('Erro ao excluir comunicado.', 'error');
      }
    };

    setPendingAction(() => action);
    setShowPinModal(true);
  };

  const handleDownload = async (media: MediaItem, url: string) => {
    try {
      if (!media) return;

      const isRemoteHttpUrl = (u: string) => {
        if (!u) return false;
        return /^https?:\/\//i.test(u) && !/localhost/i.test(u) && !/127\.0\.0\.1/i.test(u) && !/capacitor/i.test(u);
      };

      // Resolver URL remota do documento
      let remoteUrl = media.remoteUrl || '';
      if (!remoteUrl && media.remotePath) {
        const { data } = supabase.storage.from('media').getPublicUrl(media.remotePath);
        remoteUrl = data?.publicUrl || '';
      }

      if (!remoteUrl && isRemoteHttpUrl(media.uri || '')) {
        remoteUrl = media.uri || '';
      }

      if (navigator.onLine && isRemoteHttpUrl(remoteUrl)) {
        console.log('Download usando URL remota:', remoteUrl);
        await downloadService.downloadFile(remoteUrl, media.name || 'documento', media.mimeType || '', media.localPath);
        return;
      }

      const localUrl = url || viewingUrl || media.uri || '';
      if (localUrl) {
        await downloadService.downloadFile(localUrl, media.name || 'documento', media.mimeType || '', media.localPath);
        return;
      }

      notify('Arquivo local não disponível.', 'error');
    } catch (e) {
      console.error('Erro no handleDownload:', e);
    }
  };

  return (
    <Layout>
      <Header title="Comunicados" targetRoute="/notices" />

      <FilterToolbar
        activeCount={activeFiltersCount}
        onOpen={() => setShowFilters(true)}
        resultCount={filteredNotices.length}
        totalCount={notices.length}
      />

      <div className="flex-1 bg-gray-100 p-4 overflow-y-auto">
        <div className="space-y-3">
          {visibleNotices.map(n => {
            const parsed = parseSectorFromContent(n.content);
            const sector = parsed.sector;
            const content = parsed.content;
            const photo = n.media?.find(m => m.type === 'photo');
            const hasVideo = n.media?.some(m => m.type === 'video');
            const hasDocs = n.media?.some(m => ['pdf', 'doc', 'ppt'].includes(m.type));
            const author = n.employee_name || n.responsible;
            
            return (
              <div
                key={n.id}
                onClick={() => navigate(`/notices/detail/${n.id}`)}
                className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-4 cursor-pointer hover:shadow-md active:opacity-90 transition-all"
              >
                <div className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 border border-gray-100" style={{ backgroundColor: getSectorColors(sector).bg, color: getSectorColors(sector).fg }}>
                      {photo ? <ImageIcon size={24} /> : hasVideo ? <Video size={24} /> : <FileText size={24} />}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1">
                        <h3 className="font-black text-gray-800 text-base leading-tight truncate">
                          {sector || 'Comunicado'}
                        </h3>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(n); }} className="p-1 -mr-1 -mt-1 text-gray-300 hover:text-red-500 active:text-red-600 transition-colors">
                          <Trash2 size={18} />
                        </button>
                      </div>
                      <p className="text-gray-600 text-sm mb-2 line-clamp-2">
                        {content}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        <span className="inline-flex items-center gap-1"><Calendar size={13} />{localDay(n.createdAt)}</span>
                        <span className="inline-flex items-center gap-1 min-w-0"><User size={13} /><span className="truncate max-w-[120px]">{author}</span></span>
                        {(photo || hasVideo || hasDocs) && (
                          <span className="inline-flex items-center gap-1 text-blue-600 font-bold">
                            <Paperclip size={13} />{n.media.length}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {filteredNotices.length === 0 && (
            <EmptyState title="Nenhum comunicado encontrado" description="Ajuste os filtros ou registre um novo comunicado." />
          )}
          {visibleNotices.length < filteredNotices.length && (
            <button
              type="button"
              onClick={() => setVisibleLimit((current) => current + PAGE_SIZE)}
              className="w-full min-h-12 rounded-lg border border-gray-300 bg-white px-4 text-sm font-black text-gray-800 shadow-sm"
            >
              Carregar mais ({filteredNotices.length - visibleNotices.length} restantes)
            </button>
          )}
        </div>
      </div>

      {showFilters && (
        <FilterSheet title="Filtrar comunicados" onClose={() => setShowFilters(false)} onClear={clearFilters}>
          <div>
            <label className="block text-sm font-black text-gray-500 mb-2 uppercase flex items-center"><Search size={16} className="mr-1" /> Busca</label>
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full p-3 border-2 border-gray-200 rounded-lg outline-none focus:border-blue-500 font-bold text-gray-700"
              placeholder="Texto, setor ou funcionário"
            />
          </div>
          <div>
            <label className="block text-sm font-black text-gray-500 mb-2 uppercase flex items-center"><Calendar size={16} className="mr-1" /> Período</label>
            <div className="grid grid-cols-2 gap-2">
              <FilterOption active={filterPeriod === 'today'} onClick={() => setFilterPeriod('today')}>Hoje</FilterOption>
              <FilterOption active={filterPeriod === '7days'} onClick={() => setFilterPeriod('7days')}>7 Dias</FilterOption>
              <FilterOption active={filterPeriod === 'month'} onClick={() => setFilterPeriod('month')}>Este Mês</FilterOption>
              <FilterOption active={filterPeriod === 'all'} onClick={() => setFilterPeriod('all')}>Todos</FilterOption>
            </div>
          </div>
          <div>
            <label className="block text-sm font-black text-gray-500 mb-2 uppercase flex items-center"><User size={16} className="mr-1" /> Funcionário</label>
            <select
              className="w-full p-3 border-2 border-gray-200 rounded-lg bg-white font-bold text-gray-700 outline-none focus:border-blue-500"
              value={filterResponsible}
              onChange={(e) => setFilterResponsible(e.target.value)}
            >
              <option value="">Todos</option>
              {responsibleOptions.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-black text-gray-500 mb-2 uppercase flex items-center"><LayoutGrid size={16} className="mr-1" /> Setores</label>
            <div className="grid grid-cols-2 gap-2">
              {SECTORS_LIST.map(s => (
                <FilterOption
                  key={s}
                  active={filterSectors.includes(s)}
                  onClick={() => toggleSectorFilter(s)}
                  style={{ backgroundColor: getSectorColors(s).bg, color: getSectorColors(s).fg, borderColor: getSectorColors(s).border }}
                >
                  {s}
                </FilterOption>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-black text-gray-500 mb-2 uppercase flex items-center"><Paperclip size={16} className="mr-1" /> Anexos</label>
            <div className="grid grid-cols-3 gap-2">
              <FilterOption active={filterMedia === 'all'} onClick={() => setFilterMedia('all')}>Todos</FilterOption>
              <FilterOption active={filterMedia === 'with'} onClick={() => setFilterMedia('with')}>Com</FilterOption>
              <FilterOption active={filterMedia === 'without'} onClick={() => setFilterMedia('without')}>Sem</FilterOption>
            </div>
          </div>
        </FilterSheet>
      )}

      {viewingMedia && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col animate-in fade-in duration-200">
          <div className="h-16 bg-black flex items-center justify-between px-4 shrink-0">
            <span className="text-white font-bold truncate pr-4 text-sm">{viewingMedia.name || viewingMedia.type}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => { setViewingMedia(null); setViewingUrl(''); }} className="bg-white/20 p-2 rounded-full text-white hover:bg-white/30"><X size={20} /></button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center p-2 relative bg-gray-900 overflow-auto">
            {viewingMedia.type === 'photo' ? (
              <img
                src={viewingUrl || viewingMedia.remoteUrl || viewingMedia.uri}
                className="object-contain"
                style={viewingZoomGestures.imageStyle}
                onTouchStart={viewingZoomGestures.handleTouchStart}
                onTouchMove={viewingZoomGestures.handleTouchMove}
                onTouchEnd={viewingZoomGestures.handleTouchEnd}
                onError={(e) => {
                  const next = viewingMedia.remoteUrl || viewingMedia.uri || '';
                  if (next && (e.currentTarget as HTMLImageElement).src !== next) {
                    (e.currentTarget as HTMLImageElement).src = next;
                  }
                }}
              />
            ) : viewingMedia.type === 'video' ? (
              <video
                src={viewingUrl || viewingMedia.remoteUrl || viewingMedia.uri}
                controls
                autoPlay
                playsInline
                className="max-w-full max-h-full"
                onError={(e) => {
                  const next = viewingMedia.remoteUrl || viewingMedia.uri || '';
                  const el = e.currentTarget as HTMLVideoElement;
                  if (next && el.src !== next) {
                    el.src = next;
                    void el.play().catch(() => { });
                  }
                }}
              />
            ) : (
              <div className="bg-white p-6 rounded-xl text-center">
                <FileText size={48} className="text-gray-300 mx-auto mb-4" />
                <h3 className="font-bold text-gray-800 mb-2">Baixar Arquivo</h3>
                <p className="text-sm text-gray-500 mb-4 uppercase">{viewingMedia.type}</p>
                <button onClick={() => handleDownload(viewingMedia, viewingUrl)} className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold flex items-center gap-2 hover:bg-blue-700 active:bg-blue-800"><Download size={20} /> BAIXAR</button>
              </div>
            )}
          </div>
        </div>
      )}

      {showPinModal && (
        <PinRequestModal
          title="Excluir Comunicado?"
          description="Tem certeza que deseja excluir este comunicado? Ele não poderá ser recuperado. Digite o PIN."
          onSuccess={() => {
            setShowPinModal(false);
            if (pendingAction) {
              void pendingAction();
              setPendingAction(null);
            }
          }}
          onClose={() => {
            setShowPinModal(false);
            setPendingAction(null);
          }}
        />
      )}
    </Layout>
  );
};
