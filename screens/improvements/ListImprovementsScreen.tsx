import React, { useState, useEffect, useMemo } from 'react';
import { Layout } from '../../components/Layout';
import { Header } from '../../components/Header';
import { Improvement, MediaItem } from '../../types';
import { db } from '../../services/db.service';
import { localdb } from '../../services/localdb';
import { Calendar, LayoutGrid, X, Video, Download, FileText, Presentation, Image as ImageIcon, Trash2, User, Search, Paperclip } from 'lucide-react';
import { SECTORS_LIST, getSectorColors } from '../../constants/sectors';
import { mediaService } from '../../services/media.service';
import { useImageZoom } from '../../utils/useImageZoom';
import { PinRequestModal } from '../../components/PinRequestModal';
import { notify } from '../../services/notification.service';
import { EmptyState, FilterOption, FilterSheet, FilterToolbar } from '../../components/UiPrimitives';
import { MediaThumbnail } from '../../components/MediaThumbnail';
import { getAnomalyDate, getAnomalyTime, getBusinessDateKey, getBusinessMonthKey } from '../../utils/anomaly-months';

const PAGE_SIZE = 40;

export const ListImprovementsScreen: React.FC = () => {
  const [items, setItems] = useState<Improvement[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Improvement | null>(null);
  const [viewingMedia, setViewingMedia] = useState<MediaItem | null>(null);
  const [viewingUrl, setViewingUrl] = useState<string>('');
  const [viewingZoom, setViewingZoom] = useState(1);
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);

  const [filterSectors, setFilterSectors] = useState<string[]>([]);
  const [filterPeriod, setFilterPeriod] = useState<'all' | 'today' | '7days' | 'month'>('all');
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterMedia, setFilterMedia] = useState<'all' | 'with' | 'without'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showPinModal, setShowPinModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => Promise<void> | void) | null>(null);

  // Gestos de zoom
  const viewingZoomGestures = useImageZoom((newZoom) => setViewingZoom(newZoom));

  useEffect(() => {
    let mounted = true;
    const load = async () => { if (!mounted) return; const data = await db.getImprovements(); if (mounted) setItems(data); };
    load();
    const unsub = localdb.subscribe('improvements', () => { load(); });
    return () => { mounted = false; unsub && unsub(); };
  }, []);

  const toggleSectorFilter = (s: string) => {
    setFilterSectors(prev => prev.includes(s) ? prev.filter(i => i !== s) : [...prev, s]);
  };

  const filteredItems = useMemo(() => {
    let res = [...items];
    if (filterSectors.length > 0) res = res.filter(i => filterSectors.includes(i.sector));
    if (filterPeriod === 'today') {
      const today = getBusinessDateKey(new Date());
      res = res.filter(i => getBusinessDateKey(i.createdAt) === today);
    } else if (filterPeriod === '7days') {
      const cutoff = getBusinessDateKey(new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)));
      res = res.filter(i => getBusinessDateKey(i.createdAt) >= cutoff);
    } else if (filterPeriod === 'month') {
      const month = getBusinessMonthKey(new Date());
      res = res.filter(i => getBusinessMonthKey(i.createdAt) === month);
    }
    if (filterEmployee) {
      res = res.filter(i => String(i.employee_name || i.employee || '').toLowerCase() === filterEmployee.toLowerCase());
    }
    if (filterMedia === 'with') res = res.filter(i => (Array.isArray(i.media) ? i.media : []).length > 0);
    if (filterMedia === 'without') res = res.filter(i => (Array.isArray(i.media) ? i.media : []).length === 0);
    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      res = res.filter(i => String(i.description || '').toLowerCase().includes(term)
        || String(i.sector || '').toLowerCase().includes(term)
        || String(i.employee || '').toLowerCase().includes(term)
        || String(i.employee_name || '').toLowerCase().includes(term));
    }
    res.sort((a, b) => getAnomalyTime(b.createdAt) - getAnomalyTime(a.createdAt));
    return res;
  }, [items, filterSectors, filterPeriod, filterEmployee, filterMedia, searchTerm]);

  const employeeOptions = useMemo(() => {
    const names = items.map(i => String(i.employee_name || i.employee || '').trim()).filter(Boolean);
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
      case 'pdf': return <FileText size={20} className="text-red-500" />;
      case 'doc': return <FileText size={20} className="text-blue-600" />;
      case 'ppt': return <Presentation size={20} className="text-orange-500" />;
      case 'video': return <Video size={20} className="text-purple-600" />;
      case 'photo': return <ImageIcon size={20} className="text-blue-400" />;
      default: return <FileText size={20} className="text-gray-500" />;
    }
  };

  const openMedia = async (m: MediaItem) => {
    setViewingMedia(m);
    const url = await mediaService.loadMediaUrl(m);
    setViewingUrl(url || m.remoteUrl || m.uri || '');
  };

  const handleDelete = async (improvement: Improvement) => {
    const action = async () => {
      try {
        await db.deleteImprovement(improvement.id);
        notify('Melhoria excluída!', 'success');
        // Reload items
        const data = await db.getImprovements();
        setItems(data);
      } catch (e) {
        notify('Erro ao excluir melhoria.', 'error');
      }
    };

    setPendingAction(() => action);
    setShowPinModal(true);
  };

  return (
    <Layout>
      <Header title="Lista de Melhorias" targetRoute="/improvements" />

      <FilterToolbar
        activeCount={activeFiltersCount}
        onOpen={() => setShowFilters(true)}
        resultCount={filteredItems.length}
        totalCount={items.length}
      />

      <div className="flex-1 bg-gray-100 p-4 overflow-y-auto">
        <div className="space-y-3">
          {visibleItems.map(i => {
            const media = Array.isArray(i.media) ? i.media : [];
            const photo = media.find(m => m?.type === 'photo');
            const hasVideo = media.some(m => m?.type === 'video');
            const hasDocs = media.some(m => ['pdf', 'doc', 'ppt'].includes(m?.type));
            const employeeName = i.employee_name || i.employee;
            
            return (
              <div
                key={i.id}
                onClick={() => setSelectedItem(i)}
                className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-4 cursor-pointer hover:shadow-md active:opacity-90 transition-all"
              >
                <div className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Ícone Quadrado */}
                    <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 border border-gray-100" style={{ backgroundColor: getSectorColors(i.sector).bg, color: getSectorColors(i.sector).fg }}>
                      {photo ? <ImageIcon size={24} /> : hasVideo ? <Video size={24} /> : <Presentation size={24} />}
                    </div>
                    
                    {/* Textos */}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1">
                        <h3 className="font-black text-gray-800 text-base leading-tight truncate">
                          Melhoria - {i.sector}
                        </h3>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(i); }} className="p-1 -mr-1 -mt-1 text-gray-300 hover:text-red-500 active:text-red-600 transition-colors">
                          <Trash2 size={18} />
                        </button>
                      </div>
                      <p className="text-gray-600 text-sm mb-2 line-clamp-2">
                        {i.description}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        <span className="inline-flex items-center gap-1"><Calendar size={13} />{getAnomalyDate(i.createdAt)?.toLocaleDateString('pt-BR') || 'Sem data'}</span>
                        <span className="inline-flex items-center gap-1 min-w-0"><User size={13} /><span className="truncate max-w-[120px]">{employeeName}</span></span>
                        {(photo || hasVideo || hasDocs) && (
                          <span className="inline-flex items-center gap-1 text-blue-600 font-bold"><Paperclip size={13} />{i.media.length}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {filteredItems.length === 0 && <EmptyState title="Nenhuma melhoria encontrada" description="Ajuste os filtros ou registre uma nova melhoria." />}
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
      </div>

      {showFilters && (
        <FilterSheet title="Filtrar melhorias" onClose={() => setShowFilters(false)} onClear={clearFilters}>
          <div>
            <label className="block text-sm font-black text-gray-500 mb-2 uppercase flex items-center"><Search size={16} className="mr-1" /> Busca</label>
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full p-3 border-2 border-gray-200 rounded-lg outline-none focus:border-blue-500 font-bold text-gray-700"
              placeholder="Descrição, setor ou funcionário"
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
              value={filterEmployee}
              onChange={(e) => setFilterEmployee(e.target.value)}
              className="w-full p-3 border-2 border-gray-200 rounded-lg bg-white font-bold text-gray-700 outline-none focus:border-blue-500"
            >
              <option value="">Todos</option>
              {employeeOptions.map(name => <option key={name} value={name}>{name}</option>)}
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

      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-green-600 p-4 flex justify-between items-center text-white"><h3 className="font-bold text-lg">Detalhe</h3><button onClick={() => setSelectedItem(null)}><X /></button></div>
            <div className="p-6 overflow-y-auto">
              <p className="font-bold mb-2 inline-flex px-2 py-1 rounded" style={{ backgroundColor: getSectorColors(selectedItem.sector).bg, color: getSectorColors(selectedItem.sector).fg }}>{selectedItem.sector}</p>
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 mb-4"><p className="text-gray-800 text-lg">{selectedItem.description}</p></div>
              {selectedItem.media.length > 0 && <div className="grid grid-cols-2 gap-2">{selectedItem.media.map(m => (
                <div key={m.id} className="h-40 bg-gray-100 rounded-lg overflow-hidden relative flex items-center justify-center cursor-pointer" onClick={() => openMedia(m)}>
                  {m.type === 'photo'
                    ? <MediaThumbnail item={m} alt="Foto da melhoria" className="w-full h-full object-cover" />
                    : getIcon(m.type)}
                </div>
              ))}</div>}
            </div>
            <div className="p-4 bg-gray-50 border-t border-gray-200"><button onClick={() => setSelectedItem(null)} className="w-full py-3 bg-gray-200 text-gray-700 font-bold rounded-xl">FECHAR</button></div>
          </div>
        </div>
      )}

      {/* MEDIA VIEWER */}
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
            ) : viewingMedia.type === 'pdf' ? (
              <iframe src={viewingUrl || viewingMedia.uri} className="w-full h-full bg-white rounded-lg shadow-lg" title="PDF Viewer" />
            ) : (
              <div className="bg-white p-6 rounded-xl text-center">
                <div className="mb-4 flex justify-center">{getIcon(viewingMedia.type)}</div>
                <h3 className="font-bold text-gray-800 mb-2">Baixar Arquivo</h3>
                <p className="text-sm text-gray-500 mb-4 uppercase">{viewingMedia.type}</p>
                <a href={viewingUrl || viewingMedia.uri} download={viewingMedia.name || 'arquivo'} className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold flex items-center gap-2"><Download size={20} /> BAIXAR</a>
              </div>
            )}
          </div>
        </div>
      )}

      {showPinModal && (
        <PinRequestModal
          title="Excluir Melhoria?"
          description="Tem certeza que deseja excluir esta melhoria? Ela não poderá ser recuperada. Digite o PIN."
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
