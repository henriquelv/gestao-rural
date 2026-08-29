
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout } from '../../components/Layout';
import { Header } from '../../components/Header';
import { X, Calendar, LayoutGrid, FileText, Video, Download, Presentation, Image as ImageIcon, Search, Paperclip, User } from 'lucide-react';
import { Instruction, MediaItem } from '../../types';
import { db } from '../../services/db.service';
import { localdb } from '../../services/localdb';
import { SECTORS_LIST, getSectorColors } from '../../constants/sectors';
import { mediaService } from '../../services/media.service';
import { downloadService } from '../../services/download.service';
import { supabase } from '../../services/supabase';
import { notify } from '../../services/notification.service';
import { useImageZoom } from '../../utils/useImageZoom';
import { PinRequestModal } from '../../components/PinRequestModal';
import { EmptyState, FilterOption, FilterSheet, FilterToolbar } from '../../components/UiPrimitives';
import { getAnomalyDate, getAnomalyTime, getBusinessDateKey } from '../../utils/anomaly-months';

const PAGE_SIZE = 40;

export const ListInstructionsScreen: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { selectedSector?: string } | null;

  const [items, setItems] = useState<Instruction[]>([]);
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const viewMode = 'list';
  const [showFilters, setShowFilters] = useState(false);
  const [viewingMedia, setViewingMedia] = useState<MediaItem | null>(null);
  const [viewingUrl, setViewingUrl] = useState<string>('');
  const [viewingZoom, setViewingZoom] = useState(1);
  const [filterSectors, setFilterSectors] = useState<string[]>(state?.selectedSector ? [state.selectedSector] : []);
  const [filterPeriod, setFilterPeriod] = useState<'all' | 'today' | '7days'>('all');
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterMedia, setFilterMedia] = useState<'all' | 'with' | 'without'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const viewingZoomGestures = useImageZoom((newZoom) => setViewingZoom(newZoom));

  const localDay = (iso: string) => {
    return getAnomalyDate(iso)?.toLocaleDateString('pt-BR') || 'Sem data';
  };

  const loadData = async () => {
    const data = await db.getInstructions();
    setItems(data);
  };

  useEffect(() => {
    loadData();
    const unsub = localdb.subscribe('instructions', () => { loadData(); });
    return () => unsub && unsub();
  }, []);

  const toggleSectorFilter = (s: string) => {
    setFilterSectors(prev => prev.includes(s) ? prev.filter(i => i !== s) : [...prev, s]);
  };

  const filteredItems = useMemo(() => {
    let result = [...items];
    if (filterSectors.length > 0) result = result.filter(i => filterSectors.includes(i.sector));
    if (filterPeriod === 'today') {
      const today = getBusinessDateKey(new Date());
      result = result.filter(i => getBusinessDateKey(i.createdAt) === today);
    } else if (filterPeriod === '7days') {
      const cutoff = getBusinessDateKey(new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)));
      result = result.filter(i => getBusinessDateKey(i.createdAt) >= cutoff);
    }
    if (filterEmployee) {
      result = result.filter(i => (i.employee_name || '').toLowerCase() === filterEmployee.toLowerCase());
    }
    if (filterMedia === 'with') result = result.filter(i => (i.media || []).length > 0);
    if (filterMedia === 'without') result = result.filter(i => !i.media || i.media.length === 0);
    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      result = result.filter(i => (i.title || '').toLowerCase().includes(term)
        || (i.description || '').toLowerCase().includes(term)
        || (i.sector || '').toLowerCase().includes(term)
        || (i.employee_name || '').toLowerCase().includes(term));
    }

    // Sort by most recent
    result.sort((a, b) => getAnomalyTime(b.createdAt) - getAnomalyTime(a.createdAt));

    return result;
  }, [items, filterSectors, filterPeriod, filterEmployee, filterMedia, searchTerm]);

  const employeeOptions = useMemo(() => {
    const names = items.map(i => String(i.employee_name || '').trim()).filter(Boolean);
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const visibleItems = useMemo(() => filteredItems.slice(0, visibleLimit), [filteredItems, visibleLimit]);

  useEffect(() => {
    setVisibleLimit(PAGE_SIZE);
  }, [filterSectors, filterPeriod, filterEmployee, filterMedia, searchTerm]);

  const activeFiltersCount = filterSectors.length
    + (filterPeriod !== 'all' ? 1 : 0)
    + (filterEmployee ? 1 : 0)
    + (filterMedia !== 'all' ? 1 : 0)
    + (searchTerm.trim() ? 1 : 0);

  const clearFilters = () => {
    setFilterSectors([]);
    setFilterPeriod('all');
    setFilterEmployee('');
    setFilterMedia('all');
    setSearchTerm('');
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'pdf': return <FileText size={18} className="text-red-500" />;
      case 'doc': return <FileText size={18} className="text-blue-600" />;
      case 'ppt': return <Presentation size={18} className="text-orange-500" />;
      case 'video': return <Video size={18} className="text-purple-600" />;
      case 'photo': return <ImageIcon size={18} className="text-blue-400" />;
      default: return <FileText size={18} className="text-gray-500" />;
    }
  };

  const openMedia = async (m: MediaItem) => {
    setViewingMedia(m);
    const url = await mediaService.loadMediaUrl(m);
    setViewingUrl(url || m.remoteUrl || m.uri || '');
  };



  const handleDownload = async (media: MediaItem, url: string) => {
    try {
      if (!media) return;

      const isRemoteHttpUrl = (u: string) => {
        if (!u) return false;
        return /^https?:\/\//i.test(u) && !/localhost/i.test(u) && !/127\.0\.0\.1/i.test(u) && !/capacitor/i.test(u);
      };

      let remoteUrl = media.remoteUrl || '';
      if (!remoteUrl && media.remotePath) {
        const { data } = supabase.storage.from('media').getPublicUrl(media.remotePath);
        remoteUrl = data?.publicUrl || '';
      }

      if (!remoteUrl && isRemoteHttpUrl(media.uri || '')) {
        remoteUrl = media.uri || '';
      }

      if (navigator.onLine && isRemoteHttpUrl(remoteUrl)) {
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
      <Header title="Lista de Instruções" targetRoute="/instructions" />

      <FilterToolbar
        activeCount={activeFiltersCount}
        onOpen={() => setShowFilters(true)}
        resultCount={filteredItems.length}
        totalCount={items.length}
      />

      <div className="flex-1 bg-gray-100 p-4 space-y-4 overflow-y-auto">
        <div className="space-y-3">
          {visibleItems.map((item) => {
            const dateStr = localDay(item.createdAt);
            const hasMedia = (item.media || []).length > 0;
            
            return (
              <div
                key={item.id}
                onClick={() => navigate(`/instructions/detail/${item.id}`)}
                className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-4 cursor-pointer hover:shadow-md active:opacity-90 transition-all"
              >
                <div className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Ícone Quadrado (como em Normas) */}
                    <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 border border-gray-100" style={{ backgroundColor: getSectorColors(item.sector).bg, color: getSectorColors(item.sector).fg }}>
                      <FileText size={24} />
                    </div>
                    
                    {/* Textos */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-gray-800 text-lg leading-tight mb-1 truncate">
                        {item.title || `Instrução - ${item.sector}`}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        <span className="inline-flex items-center gap-1"><Calendar size={13} />{dateStr}</span>
                        {item.employee_name && <span className="inline-flex items-center gap-1"><User size={13} />{item.employee_name}</span>}
                        {hasMedia && <span className="inline-flex items-center gap-1 text-blue-600 font-bold"><Paperclip size={13} />{item.media.length}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredItems.length === 0 && <EmptyState title="Nenhuma instrução encontrada" description="Ajuste os filtros ou registre uma nova instrução." />}
        {visibleItems.length < filteredItems.length && (
          <button
            type="button"
            onClick={() => setVisibleLimit((current) => current + PAGE_SIZE)}
            className="w-full min-h-12 rounded-lg border border-gray-300 bg-white px-4 text-sm font-black text-gray-800 shadow-sm"
          >
            Carregar mais ({filteredItems.length - visibleItems.length} restantes)
          </button>
        )}
      </div>

      {showFilters && (
        <FilterSheet title="Filtrar instruções" onClose={() => setShowFilters(false)} onClear={clearFilters}>
          <div>
            <label className="block text-sm font-black text-gray-500 mb-2 uppercase flex items-center"><Search size={16} className="mr-1" /> Busca</label>
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full p-3 border-2 border-gray-200 rounded-lg outline-none focus:border-blue-500 font-bold text-gray-700"
              placeholder="Título, descrição, setor ou funcionário"
            />
          </div>
          <div>
            <label className="block text-sm font-black text-gray-500 mb-2 uppercase flex items-center"><Calendar size={16} className="mr-1" /> Período</label>
            <div className="grid grid-cols-3 gap-2">
              <FilterOption active={filterPeriod === 'today'} onClick={() => setFilterPeriod('today')}>Hoje</FilterOption>
              <FilterOption active={filterPeriod === '7days'} onClick={() => setFilterPeriod('7days')}>7 Dias</FilterOption>
              <FilterOption active={filterPeriod === 'all'} onClick={() => setFilterPeriod('all')}>Todos</FilterOption>
            </div>
          </div>
          {employeeOptions.length > 0 && (
            <div>
              <label className="block text-sm font-black text-gray-500 mb-2 uppercase flex items-center"><User size={16} className="mr-1" /> Funcionário</label>
              <select
                value={filterEmployee}
                onChange={(e) => setFilterEmployee(e.target.value)}
                className="w-full p-3 border-2 border-gray-200 rounded-lg bg-white font-bold text-gray-700 outline-none focus:border-blue-500"
              >
                <option value="">Todos</option>
                {employeeOptions.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
          )}
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
        <div className="fixed inset-0 bg-black/95 z-[100] flex flex-col items-center justify-center p-4 animate-in fade-in">
          <button onClick={() => setViewingMedia(null)} className="absolute top-6 right-6 text-white bg-white/10 p-4 rounded-full backdrop-blur-md active:scale-95 transition-transform"><X size={32} /></button>

          <div className="w-full h-full flex items-center justify-center p-4">
            {viewingMedia.type === 'video' ? (
              <video src={viewingUrl} controls autoPlay className="max-w-full max-h-[80vh] rounded-lg shadow-2xl" />
            ) : viewingMedia.type === 'photo' ? (
              <img
                src={viewingUrl}
                className="object-contain rounded-lg shadow-lg select-none touch-none"
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
            ) : (
              <div className="bg-white p-10 rounded-3xl shadow-2xl max-w-sm w-full text-center animate-in zoom-in">
                <FileText size={64} className="text-blue-500 mx-auto mb-6" />
                <h3 className="text-xl font-black text-gray-800 mb-2">{viewingMedia.name || 'Documento'}</h3>
                <p className="text-sm text-gray-400 mb-8 uppercase tracking-widest">{viewingMedia.type}</p>
                <button onClick={() => handleDownload(viewingMedia, viewingUrl)} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-blue-700 transition-colors shadow-lg active:scale-95"><Download size={24} /> BAIXAR ARQUIVO</button>
              </div>
            )}
          </div>
        </div>
      )}


    </Layout>
  );
};
