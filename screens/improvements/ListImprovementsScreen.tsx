import React, { useState, useEffect, useMemo } from 'react';
import { Layout } from '../../components/Layout';
import { Header } from '../../components/Header';
import { Improvement, MediaItem } from '../../types';
import { db } from '../../services/db.service';
import { localdb } from '../../services/localdb';
import { Filter, Calendar, LayoutGrid, X, Camera, Video, List as ListIcon, Download, FileText, Presentation, Image as ImageIcon, Trash2, User } from 'lucide-react';
import { SECTORS_LIST, getSectorColors } from '../../constants/sectors';
import { mediaService } from '../../services/media.service';
import { useImageZoom } from '../../utils/useImageZoom';
import { PinRequestModal } from '../../components/PinRequestModal';
import { authService } from '../../services/auth.service';
import { notify } from '../../services/notification.service';

export const ListImprovementsScreen: React.FC = () => {
  const [items, setItems] = useState<Improvement[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Improvement | null>(null);
  const [viewingMedia, setViewingMedia] = useState<MediaItem | null>(null);
  const [viewingUrl, setViewingUrl] = useState<string>('');
  const [viewingZoom, setViewingZoom] = useState(1);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});

  const [filterSectors, setFilterSectors] = useState<string[]>([]);
  const [filterPeriod, setFilterPeriod] = useState<'all' | 'month'>('all');
  const [showPinModal, setShowPinModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => Promise<void> | void) | null>(null);

  // Gestos de zoom
  const viewingZoomGestures = useImageZoom((newZoom) => setViewingZoom(newZoom));

  const bestMediaUrl = (m: MediaItem | null | undefined) => {
    if (!m) return '';
    const cached = m.id ? (mediaUrls[m.id] || '') : '';
    return cached || m.remoteUrl || m.uri || '';
  };

  useEffect(() => {
    let mounted = true;
    const load = async () => { if (!mounted) return; const data = await db.getImprovements(); if (mounted) setItems(data); };
    load();
    const unsub = localdb.subscribe('improvements', () => { load(); });
    return () => { mounted = false; unsub && unsub(); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadThumbs = async () => {
      const entries: Array<[string, string]> = [];
      for (const it of items) {
        for (const m of it.media || []) {
          if (!m?.id) continue;
          if (mediaUrls[m.id]) continue;
          const url = await mediaService.loadMediaUrl(m);
          if (url) entries.push([m.id, url]);
        }
      }
      if (cancelled) return;
      if (entries.length > 0) {
        setMediaUrls(prev => {
          const next = { ...prev };
          for (const [id, url] of entries) next[id] = url;
          return next;
        });
      }
    };
    if (items.length > 0) loadThumbs();
    return () => { cancelled = true; };
  }, [items]);

  const toggleSectorFilter = (s: string) => {
    setFilterSectors(prev => prev.includes(s) ? prev.filter(i => i !== s) : [...prev, s]);
  };

  const filteredItems = useMemo(() => {
    let res = items;
    if (filterSectors.length > 0) res = res.filter(i => filterSectors.includes(i.sector));
    if (filterPeriod === 'month') {
      const month = new Date().toISOString().substring(0, 7);
      res = res.filter(i => i.createdAt.startsWith(month));
    }
    return res;
  }, [items, filterSectors, filterPeriod]);

  const activeFiltersCount = filterSectors.length + (filterPeriod !== 'all' ? 1 : 0);

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

      {/* TOOLBAR */}
      <div className="bg-white border-b border-gray-200 p-2 shadow-sm z-10 sticky top-16 flex flex-col gap-2">
        <div className="flex gap-2">
          <button onClick={() => setShowFilters(true)} className={`flex-1 flex items-center justify-center px-4 py-3 rounded-lg font-bold border-2 transition-colors ${activeFiltersCount > 0 ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>
            <Filter size={18} className="mr-2" /> {activeFiltersCount > 0 ? `Filtros (${activeFiltersCount})` : 'Filtrar'}
          </button>
        </div>
      </div>

      <div className="flex-1 bg-gray-100 p-4 overflow-y-auto">
        <div className="space-y-3">
          {filteredItems.map(i => {
            const photo = i.media?.find(m => m.type === 'photo');
            const hasVideo = i.media?.some(m => m.type === 'video');
            
            return (
              <div
                key={i.id}
                onClick={() => setSelectedItem(i)}
                className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-4 cursor-pointer hover:shadow-md active:opacity-90 transition-all"
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
                        <h3 className="font-bold text-gray-800 text-lg leading-tight truncate">
                          Melhoria - {i.sector}
                        </h3>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(i); }} className="p-1 -mr-1 -mt-1 text-gray-300 hover:text-red-500 active:text-red-600 transition-colors">
                          <Trash2 size={18} />
                        </button>
                      </div>
                      <p className="text-gray-600 text-sm mb-2 line-clamp-2">
                        {i.description}
                      </p>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-400">
                          {new Date(i.createdAt).toLocaleDateString('pt-BR')}
                        </span>
                        <span className="text-gray-500 font-medium">
                           {i.employee}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {filteredItems.length === 0 && <p className="col-span-2 text-center text-gray-400 mt-10">Nenhuma melhoria encontrada.</p>}
        </div>
      </div>

      {/* FILTER MODAL */}
      {showFilters && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center animate-in fade-in">
          <div className="bg-white w-full max-w-md p-6 rounded-t-2xl sm:rounded-xl shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-gray-800">Filtrar</h2>
              <button onClick={() => setShowFilters(false)} className="p-2 bg-gray-100 rounded-full"><X size={24} /></button>
            </div>
            <div className="space-y-6 pb-6">
              <div>
                <label className="block text-sm font-bold text-gray-500 mb-2 uppercase flex items-center"><Calendar size={16} className="mr-1" /> Período</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setFilterPeriod('month')} className={`p-3 rounded-lg font-bold border-2 ${filterPeriod === 'month' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}>Este Mês</button>
                  <button onClick={() => setFilterPeriod('all')} className={`p-3 rounded-lg font-bold border-2 ${filterPeriod === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}>Todos</button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-500 mb-2 uppercase flex items-center"><LayoutGrid size={16} className="mr-1" /> Setores</label>
                <div className="grid grid-cols-2 gap-2">
                  {SECTORS_LIST.map(s => (
                    <button
                      key={s}
                      onClick={() => toggleSectorFilter(s)}
                      className="p-2 rounded-lg text-sm font-bold border-2"
                      style={filterSectors.includes(s)
                        ? { backgroundColor: getSectorColors(s).bg, color: getSectorColors(s).fg, borderColor: getSectorColors(s).border }
                        : { backgroundColor: '#FFFFFF', color: '#374151', borderColor: '#E5E7EB' }
                      }
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 pt-4 border-t border-gray-100">
              <button onClick={() => { setFilterSectors([]); setFilterPeriod('all'); setShowFilters(false); }} className="flex-1 py-4 text-gray-600 font-bold text-lg bg-gray-100 rounded-xl">Limpar</button>
              <button onClick={() => setShowFilters(false)} className="flex-2 w-2/3 py-4 text-white font-bold text-lg bg-blue-600 rounded-xl shadow-lg">Aplicar</button>
            </div>
          </div>
        </div>
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
                  {m.type === 'photo' ? (
                    bestMediaUrl(m) ? (
                      <img
                        src={bestMediaUrl(m)}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const next = m.remoteUrl || m.uri || '';
                          if (next && (e.currentTarget as HTMLImageElement).src !== next) {
                            (e.currentTarget as HTMLImageElement).src = next;
                          }
                        }}
                      />
                    ) : getIcon(m.type)
                  ) : getIcon(m.type)}
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
