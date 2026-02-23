import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout } from '../../components/Layout';
import { Header } from '../../components/Header';
import { Filter, X, Calendar, LayoutGrid, List as ListIcon, FileText, Video, Download, Presentation, Image as ImageIcon } from 'lucide-react';
import { Instruction, MediaItem } from '../../types';
import { db } from '../../services/db.service';
import { localdb } from '../../services/localdb';
import { SECTORS_LIST, getSectorColors } from '../../constants/sectors';
import { mediaService } from '../../services/media.service';
import { downloadService } from '../../services/download.service';
import { supabase } from '../../services/supabase';
import { notify } from '../../services/notification.service';
import { useImageZoom } from '../../utils/useImageZoom';

export const ListInstructionsScreen: React.FC = () => {
  const location = useLocation();
  const state = location.state as { selectedSector?: string } | null;
  
  const [items, setItems] = useState<Instruction[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [showFilters, setShowFilters] = useState(false);
  const [viewingMedia, setViewingMedia] = useState<MediaItem | null>(null);
  const [viewingUrl, setViewingUrl] = useState<string>('');
  const [viewingZoom, setViewingZoom] = useState(1);
  const [filterSectors, setFilterSectors] = useState<string[]>(state?.selectedSector ? [state.selectedSector] : []);
  const [filterPeriod, setFilterPeriod] = useState<'all'|'today'|'7days'>('all');

  // Gestos de zoom
  const viewingZoomGestures = useImageZoom((newZoom) => setViewingZoom(newZoom));

  useEffect(() => {
    let mounted = true;
    const load = async () => { const data = await db.getInstructions(); if (mounted) setItems(data); };
    load();
    const unsub = localdb.subscribe('instructions', () => { load(); });
    return () => { mounted = false; unsub && unsub(); };
  }, []);

  const toggleSectorFilter = (s: string) => {
    setFilterSectors(prev => prev.includes(s) ? prev.filter(i => i !== s) : [...prev, s]);
  };

  const filteredItems = useMemo(() => {
      let res = items;
      if (filterSectors.length > 0) res = res.filter(i => filterSectors.includes(i.sector));
      if (filterPeriod === 'today') {
          const today = new Date().toISOString().split('T')[0];
          res = res.filter(i => i.createdAt.startsWith(today));
      }
      return res;
  }, [items, filterSectors, filterPeriod]);

  const activeFiltersCount = filterSectors.length + (filterPeriod !== 'all' ? 1 : 0);

  const getIcon = (type: string) => {
      switch(type) {
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

        // Resolver URL remota do documento
        let remoteUrl = media.remoteUrl || '';
        if (!remoteUrl && media.remotePath) {
          const { data } = supabase.storage.from('media').getPublicUrl(media.remotePath);
          remoteUrl = data?.publicUrl || '';
        }

        if (!remoteUrl && isRemoteHttpUrl(media.uri || '')) {
          remoteUrl = media.uri || '';
        }

        if (isRemoteHttpUrl(remoteUrl)) {
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
      <Header title="Lista de Instruções" targetRoute="/instructions" />
      
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
            {filteredItems.map(inst => (
                <div key={inst.id} className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden ${viewMode === 'list' ? 'p-4' : 'flex flex-col'}`}>
                    {viewMode === 'grid' && (
                        <div className="h-24 bg-blue-50 flex items-center justify-center border-b border-gray-100"><FileText size={32} className="text-blue-300"/></div>
                    )}
                    <div className={viewMode === 'grid' ? 'p-3 flex-1 flex flex-col' : ''}>
                        <div className="flex justify-between items-start mb-2">
                            <span
                              className="text-[10px] font-bold uppercase px-2 py-1 rounded"
                              style={{ backgroundColor: getSectorColors(inst.sector).bg, color: getSectorColors(inst.sector).fg }}
                            >
                              {inst.sector}
                            </span>
                            <span className="text-[10px] text-gray-400 font-bold">{new Date(inst.createdAt).toLocaleDateString()}</span>
                        </div>
                        <h3 className={`font-bold text-gray-800 ${viewMode === 'grid' ? 'text-xs line-clamp-2' : 'text-lg'}`}>{inst.title}</h3>
                        
                        {viewMode === 'list' && inst.media && inst.media.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-100 grid gap-2">
                                {inst.media.map((m, idx) => (
                                    <button 
                                        key={m.id || idx} 
                                        onClick={() => openMedia(m)} 
                                        className="flex items-center gap-2 text-sm text-blue-600 font-bold p-3 bg-blue-50 rounded-lg hover:bg-blue-100 active:bg-blue-200 text-left transition-colors"
                                    >
                                        {getIcon(m.type)}
                                        <span className="truncate">{m.name || (m.type === 'pdf' ? 'Documento PDF' : 'Arquivo')}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                        
                        {viewMode === 'grid' && inst.media && inst.media.length > 0 && (
                            <button 
                                onClick={() => openMedia(inst.media[0])} 
                                className="mt-auto w-full bg-blue-50 text-blue-600 text-xs font-bold py-2 rounded hover:bg-blue-100"
                            >
                                Abrir ({inst.media.length})
                            </button>
                        )}
                    </div>
                </div>
            ))}
            {filteredItems.length === 0 && <p className="col-span-2 text-center text-gray-400 mt-10">Nenhuma instrução encontrada.</p>}
         </div>
      </div>

      {/* FILTER MODAL */}
      {showFilters && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center animate-in fade-in">
          <div className="bg-white w-full max-w-md p-6 rounded-t-2xl sm:rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-gray-800">Filtrar</h2>
              <button onClick={() => setShowFilters(false)} className="p-2 bg-gray-100 rounded-full"><X size={24} /></button>
            </div>
            <div className="space-y-6 pb-6">
                <div>
                    <label className="block text-sm font-bold text-gray-500 mb-2 uppercase flex items-center"><Calendar size={16} className="mr-1"/> Período</label>
                    <div className="grid grid-cols-3 gap-2">
                        <button onClick={() => setFilterPeriod('today')} className={`p-3 rounded-lg font-bold border-2 ${filterPeriod === 'today' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}>Hoje</button>
                        <button onClick={() => setFilterPeriod('7days')} className={`p-3 rounded-lg font-bold border-2 ${filterPeriod === '7days' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}>7 Dias</button>
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

      {/* MEDIA VIEWER */}
      {viewingMedia && (
        <div className="fixed inset-0 z-[100] bg-gray-900 flex flex-col animate-in fade-in duration-200">
            <div className="h-16 bg-gray-900 flex items-center justify-between px-4 shrink-0 shadow-md">
                <span className="text-white font-bold truncate pr-4">{viewingMedia.name || 'Visualizador'}</span>
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
                  <button onClick={() => { setViewingMedia(null); setViewingUrl(''); setViewingZoom(1); }} className="bg-white/10 p-2 rounded-full text-white hover:bg-white/20"><X size={20} /></button>
                </div>
            </div>
            <div className="flex-1 flex items-center justify-center bg-gray-200 relative p-4 overflow-auto">
                {viewingMedia.type === 'video' ? (
                    <video
                      src={viewingUrl || viewingMedia.remoteUrl || viewingMedia.uri}
                      controls
                      autoPlay
                      playsInline
                      className="max-w-full max-h-[80vh] rounded-lg shadow-2xl bg-black w-full"
                      onError={(e) => {
                        const next = viewingMedia.remoteUrl || viewingMedia.uri || '';
                        const el = e.currentTarget as HTMLVideoElement;
                        if (next && el.src !== next) {
                          el.src = next;
                          void el.play().catch(() => {});
                        }
                      }}
                    />
                ) : viewingMedia.type === 'photo' ? (
                    <img
                      src={viewingUrl || viewingMedia.remoteUrl || viewingMedia.uri}
                      className="object-contain rounded-lg shadow-lg select-none touch-none"
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
                ) : (
                     <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full text-center">
                        <FileText size={48} className="text-gray-300 mx-auto mb-4" />
                        <h3 className="font-bold text-gray-800 mb-2">Baixar Arquivo</h3>
                        <p className="text-sm text-gray-500 mb-4 uppercase">{viewingMedia.type}</p>
                        <button onClick={() => handleDownload(viewingMedia, viewingUrl)} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors mt-4 active:bg-blue-800"><Download size={20} /> DOWNLOAD</button>
                     </div>
                )}
            </div>
        </div>
      )}
    </Layout>
  );
};
