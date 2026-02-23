import React, { useState, useEffect, useMemo } from 'react';
import { Layout } from '../../components/Layout';
import { Header } from '../../components/Header';
import { Improvement, MediaItem } from '../../types';
import { db } from '../../services/db.service';
import { localdb } from '../../services/localdb';
import { Filter, Calendar, LayoutGrid, X, Camera, Video, List as ListIcon, Download, FileText, Presentation, Image as ImageIcon } from 'lucide-react';
import { SECTORS_LIST, getSectorColors } from '../../constants/sectors';
import { mediaService } from '../../services/media.service';
import { useImageZoom } from '../../utils/useImageZoom';

export const ListImprovementsScreen: React.FC = () => {
  const [items, setItems] = useState<Improvement[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Improvement | null>(null);
  const [viewingMedia, setViewingMedia] = useState<MediaItem | null>(null);
  const [viewingUrl, setViewingUrl] = useState<string>('');
  const [viewingZoom, setViewingZoom] = useState(1);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});

  const [filterSectors, setFilterSectors] = useState<string[]>([]);
  const [filterPeriod, setFilterPeriod] = useState<'all'|'month'>('all');

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
      switch(type) {
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
        <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200">
            <button onClick={() => setViewMode('list')} className={`flex-1 flex items-center justify-center py-2 rounded-md transition-all text-xs font-bold uppercase ${viewMode === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}><ListIcon size={16} className="mr-1" /> Lista</button>
            <button onClick={() => setViewMode('grid')} className={`flex-1 flex items-center justify-center py-2 rounded-md transition-all text-xs font-bold uppercase ${viewMode === 'grid' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}><LayoutGrid size={16} className="mr-1" /> Grade</button>
        </div>
      </div>

      <div className="flex-1 bg-gray-100 p-4 overflow-y-auto">
          <div className={viewMode === 'list' ? "space-y-3" : "grid grid-cols-2 gap-3"}>
            {filteredItems.map(i => {
              const photo = i.media.find(m => m.type === 'photo');
              const photoUrl = bestMediaUrl(photo);
              return (
                <div key={i.id} onClick={() => setSelectedItem(i)} className={`bg-white rounded-xl shadow-sm border border-gray-200 cursor-pointer overflow-hidden ${viewMode === 'list' ? 'p-4' : 'flex flex-col'}`}>
                    {viewMode === 'grid' && (
                        <div className="h-24 bg-green-50 flex items-center justify-center border-b border-gray-100 relative">
                            {photo && photoUrl ? (
                              <img
                                src={photoUrl}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  const next = photo?.remoteUrl || photo?.uri || '';
                                  if (next && (e.currentTarget as HTMLImageElement).src !== next) {
                                    (e.currentTarget as HTMLImageElement).src = next;
                                  }
                                }}
                              />
                            ) : <Camera className="text-green-200"/>}
                        </div>
                    )}
                    <div className={viewMode === 'grid' ? 'p-3 flex-1' : ''}>
                        <div className="flex justify-between items-start mb-2">
                            <span
                              className="text-[10px] font-bold px-2 py-0.5 rounded truncate max-w-[70%]"
                              style={{ backgroundColor: getSectorColors(i.sector).bg, color: getSectorColors(i.sector).fg }}
                            >
                              {i.sector}
                            </span>
                            <span className="text-[10px] text-gray-500 font-bold">{new Date(i.createdAt).toLocaleDateString('pt-BR')}</span>
                        </div>
                        <h3 className={`font-bold text-gray-800 leading-tight mb-2 ${viewMode === 'grid' ? 'text-xs line-clamp-2' : 'line-clamp-2'}`}>{i.description}</h3>
                        <p className="text-[10px] text-gray-500 mb-2">Feito por: {i.employee}</p>
                        
                        {viewMode === 'list' && i.media.length > 0 && (
                            <div className="mt-2 flex gap-2 overflow-x-auto pb-1" onClick={(e) => e.stopPropagation()}>
                                {i.media.map((m, idx) => (
                                    <div 
                                        key={idx} 
                                        className="h-14 w-14 rounded-lg bg-gray-100 flex items-center justify-center border border-gray-200 overflow-hidden relative cursor-pointer"
                                        onClick={() => openMedia(m)}
                                    >
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
                                ))}
                            </div>
                        )}
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
                    <label className="block text-sm font-bold text-gray-500 mb-2 uppercase flex items-center"><Calendar size={16} className="mr-1"/> Período</label>
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => setFilterPeriod('month')} className={`p-3 rounded-lg font-bold border-2 ${filterPeriod === 'month' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}>Este Mês</button>
                        <button onClick={() => setFilterPeriod('all')} className={`p-3 rounded-lg font-bold border-2 ${filterPeriod === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}>Todos</button>
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-bold text-gray-500 mb-2 uppercase flex items-center"><LayoutGrid size={16} className="mr-1"/> Setores</label>
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
                  {viewingMedia.type === 'photo' && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setViewingZoom(Math.max(1, viewingZoom - 0.25))}
                        className="text-white p-2 bg-white/10 rounded-full hover:bg-white/20"
                      >
                        −
                      </button>
                      <span className="text-white text-sm font-bold w-12 text-center">{Math.round(viewingZoom * 100)}%</span>
                      <button
                        onClick={() => setViewingZoom(Math.min(3, viewingZoom + 0.25))}
                        className="text-white p-2 bg-white/10 rounded-full hover:bg-white/20"
                      >
                        +
                      </button>
                    </div>
                  )}
                  <button onClick={() => { setViewingMedia(null); setViewingUrl(''); setViewingZoom(1); }} className="bg-white/20 p-2 rounded-full text-white hover:bg-white/30"><X size={20} /></button>
                </div>
            </div>
            <div className="flex-1 flex items-center justify-center p-2 relative bg-gray-900 overflow-auto">
                {viewingMedia.type === 'photo' ? (
                    <img
                      src={viewingUrl || viewingMedia.remoteUrl || viewingMedia.uri}
                      className="object-contain select-none touch-none"
                      style={{ transform: `scale(${viewingZoom})`, maxWidth: '100%', maxHeight: '90vh' }}
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
                          void el.play().catch(() => {});
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
    </Layout>
  );
};
