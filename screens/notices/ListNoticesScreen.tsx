import React, { useState, useEffect, useMemo } from 'react';
import { Layout } from '../../components/Layout';
import { Header } from '../../components/Header';
import { Bell, Image as ImageIcon, FileText, Video, X, Download, List as ListIcon, LayoutGrid, Filter, Calendar, Presentation } from 'lucide-react';
import { Notice, MediaItem } from '../../types';
import { db } from '../../services/db.service';
import { localdb } from '../../services/localdb';
import { mediaService } from '../../services/media.service';
import { downloadService } from '../../services/download.service';
import { supabase } from '../../services/supabase';
import { notify } from '../../services/notification.service';
import { getSectorColors } from '../../constants/sectors';
import { useImageZoom } from '../../utils/useImageZoom';

export const ListNoticesScreen: React.FC = () => {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [showFilters, setShowFilters] = useState(false);
  const [viewingMedia, setViewingMedia] = useState<MediaItem | null>(null);
  const [viewingUrl, setViewingUrl] = useState<string>('');
  const [viewingZoom, setViewingZoom] = useState(1);
  const [filterPeriod, setFilterPeriod] = useState<'all'|'today'>('all');

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
    load();
    const onOnline = () => load();
    window.addEventListener('online', onOnline);
    const unsub = localdb.subscribe('notices', () => load());
    return () => { window.removeEventListener('online', onOnline); unsub && unsub(); };
  }, []);

  const localDay = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('pt-BR');
    } catch {
      return '';
    }
  };

  const filteredNotices = useMemo(() => {
      let res = notices;
      if(filterPeriod === 'today') {
          const today = new Date().toLocaleDateString('pt-BR');
          res = res.filter(n => localDay(n.createdAt) === today);
      }
      return res;
  }, [notices, filterPeriod]);

  const getIcon = (type: string) => {
      switch(type) {
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
      <Header title="Comunicados" targetRoute="/notices" />

      {/* TOOLBAR */}
      <div className="bg-white border-b border-gray-200 p-2 shadow-sm z-10 sticky top-16 flex flex-col gap-2">
        <div className="flex gap-2">
            <button onClick={() => setShowFilters(true)} className={`flex-1 flex items-center justify-center px-4 py-3 rounded-lg font-bold border-2 transition-colors ${filterPeriod !== 'all' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                <Filter size={18} className="mr-2" /> {filterPeriod !== 'all' ? `Filtros (1)` : 'Filtrar'}
            </button>
        </div>
        <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200">
            <button onClick={() => setViewMode('list')} className={`flex-1 flex items-center justify-center py-2 rounded-md transition-all text-xs font-bold uppercase ${viewMode === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}><ListIcon size={16} className="mr-1" /> Lista</button>
            <button onClick={() => setViewMode('grid')} className={`flex-1 flex items-center justify-center py-2 rounded-md transition-all text-xs font-bold uppercase ${viewMode === 'grid' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}><LayoutGrid size={16} className="mr-1" /> Grade</button>
        </div>
      </div>

      <div className="flex-1 bg-gray-100 p-4 overflow-y-auto">
        <div className={viewMode === 'list' ? "space-y-4" : "grid grid-cols-2 gap-3"}>
            {filteredNotices.map(n => (
              (() => {
                const parsed = parseSectorFromContent(n.content);
                const sector = parsed.sector;
                const content = parsed.content;
                return (
              <div key={n.id} className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden ${viewMode === 'list' ? 'border-l-4 border-l-orange-500 p-4' : 'flex flex-col'}`}>
                {viewMode === 'grid' && (
                    <div className="h-20 bg-orange-50 flex items-center justify-center border-b border-gray-100"><Bell className="text-orange-200" /></div>
                )}
                <div className={viewMode === 'grid' ? 'p-3' : ''}>
                    <div className={viewMode === 'list' ? "flex justify-between items-start mb-2" : "mb-2"}>
                       <span className="font-bold text-gray-800 text-xs">{n.responsible}</span>
                       <span className="text-[10px] text-gray-500 font-bold bg-gray-100 px-2 py-1 rounded">{new Date(n.createdAt).toLocaleDateString('pt-BR')}</span>
                    </div>
                    {sector && (
                      <div className="mb-2">
                        <span className="text-[10px] font-bold uppercase px-2 py-1 rounded" style={{ backgroundColor: getSectorColors(sector).bg, color: getSectorColors(sector).fg }}>{sector}</span>
                      </div>
                    )}
                    <p className={`text-gray-700 ${viewMode === 'grid' ? 'text-xs line-clamp-3' : 'line-clamp-2'}`}>{content}</p>
                    {n.media.length > 0 && (
                        <div className="flex gap-2 mt-3 flex-wrap">
                            {n.media.map((m, idx) => (
                                <button key={idx} onClick={() => openMedia(m)} className="bg-gray-100 p-2 rounded hover:bg-gray-200 transition-colors">
                                    {getIcon(m.type)}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
              </div>
                );
              })()
            ))}
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
                        <button onClick={() => setFilterPeriod('today')} className={`p-3 rounded-lg font-bold border-2 ${filterPeriod === 'today' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}>Hoje</button>
                        <button onClick={() => setFilterPeriod('all')} className={`p-3 rounded-lg font-bold border-2 ${filterPeriod === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}>Todos</button>
                    </div>
                </div>
            </div>
            <div className="flex gap-3 pt-4 border-t border-gray-100">
              <button onClick={() => { setFilterPeriod('all'); setShowFilters(false); }} className="flex-1 py-4 text-gray-600 font-bold text-lg bg-gray-100 rounded-xl">Limpar</button>
              <button onClick={() => setShowFilters(false)} className="flex-2 w-2/3 py-4 text-white font-bold text-lg bg-blue-600 rounded-xl shadow-lg">Aplicar</button>
            </div>
          </div>
        </div>
      )}

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
    </Layout>
  );
};
