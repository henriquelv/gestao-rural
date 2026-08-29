import React, { useState, useEffect, useMemo } from 'react';
import { Layout } from '../../components/Layout';
import { Header } from '../../components/Header';
import { useNavigate } from 'react-router-dom';
import { Filter, X, LayoutGrid, List as ListIcon, FileText, User, Eye, Download, Trash2, Image as ImageIcon, Video, Presentation } from 'lucide-react';
import { db } from '../../services/db.service';
import { localdb } from '../../services/localdb';
import { FarmDoc, MediaItem } from '../../types';
import { SECTORS_LIST, getSectorColors } from '../../constants/sectors';
import { mediaService } from '../../services/media.service';
import { downloadService } from '../../services/download.service';
import { supabase } from '../../services/supabase';
import { notify } from '../../services/notification.service';
import { authService } from '../../services/auth.service';
import { PinRequestModal } from '../../components/PinRequestModal';
import { useImageZoom } from '../../utils/useImageZoom';

export const FarmNormsListScreen: React.FC = () => {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<FarmDoc[]>([]);
  const [viewMode] = useState<'list' | 'grid'>('list');
  const [showFilters, setShowFilters] = useState(false);
  const [docUrls, setDocUrls] = useState<Record<string, string>>({});
  const [viewingMedia, setViewingMedia] = useState<MediaItem | null>(null);
  const [viewingUrl, setViewingUrl] = useState<string>('');
  const [viewingZoom, setViewingZoom] = useState(1);
  const viewingZoomGestures = useImageZoom((newZoom) => setViewingZoom(newZoom));

  const [filterSectors, setFilterSectors] = useState<string[]>([]);

  // Deletion logic
  const [showPinModal, setShowPinModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const d = await db.getFarmDocs();
      if (!mounted) return;
      setDocs(d);

      const urls: Record<string, string> = {};
      await Promise.all(
        d.map(async (doc) => {
          if (doc.media) {
            urls[doc.id] = await mediaService.loadMediaUrl(doc.media);
          }
        })
      );
      if (!mounted) return;
      setDocUrls(urls);
    };
    load();
    const unsub = localdb.subscribe('farm_docs', () => load());
    return () => { mounted = false; unsub && unsub(); };
  }, []);

  const toggleSectorFilter = (s: string) => {
    setFilterSectors(prev => prev.includes(s) ? prev.filter(i => i !== s) : [...prev, s]);
  };

  const filteredDocs = useMemo(() => {
    let res = docs;
    if (filterSectors.length > 0) {
      res = res.filter(d => filterSectors.includes(d.sector));
    }
    return res;
  }, [docs, filterSectors]);

  const activeFiltersCount = filterSectors.length;

  const getIcon = (type: MediaItem['type'] | undefined) => {
    if (type === 'ppt') return <Presentation size={24} />;
    if (type === 'doc') return <FileText size={24} />;
    if (type === 'video') return <Video size={24} />;
    if (type === 'photo') return <ImageIcon size={24} />;
    return <FileText size={24} />; // pdf default
  };

  const openMedia = (m: MediaItem | undefined, url: string) => {
    if (!m) return;
    setViewingMedia(m);
    setViewingUrl(url || m.remoteUrl || m.uri || '');
  };

  const handleDownload = async (doc: FarmDoc) => {
    try {
      if (!doc.media) return;
      const media = doc.media;

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

      const localUrl = await mediaService.loadMediaUrl(media);
      if (localUrl) {
        await downloadService.downloadFile(localUrl, media.name || 'documento', media.mimeType || '', media.localPath);
        return;
      }

      notify('Arquivo local não disponível.', 'error');
    } catch (e) {
      console.error('Erro no handleDownload:', e);
    }
  };

  const handleDelete = async (doc: FarmDoc) => {
    const action = async () => {
      try {
        await db.deleteFarmDoc(doc.id);
        notify('Norma excluída com sucesso!', 'success');
      } catch (e) {
        notify('Erro ao excluir norma.', 'error');
      }
    };

    setPendingAction(() => action);
    setShowPinModal(true);
  };

  return (
    <Layout>
      <Header title="Lista de Normas" targetRoute="/norms" />

      {/* TOOLBAR */}
      <div className="bg-white border-b border-gray-200 p-2 shadow-sm z-10 sticky top-16 flex flex-col gap-2">
        <div className="flex gap-2">
          <button onClick={() => setShowFilters(true)} className={`flex-1 flex items-center justify-center px-4 py-3 rounded-lg font-bold border-2 transition-colors ${activeFiltersCount > 0 ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>
            <Filter size={18} className="mr-2" /> {activeFiltersCount > 0 ? `Filtros (${activeFiltersCount})` : 'Filtrar'}
          </button>
        </div>
      </div>

      <div className="flex-1 bg-gray-100 p-4 space-y-4 overflow-y-auto">
        <div className="space-y-3">
          {filteredDocs.map(doc => {
            const photo = doc.media?.type === 'photo' ? doc.media : null;
            const hasVideo = doc.media?.type === 'video';
            const photoUrl = docUrls[doc.id] || (photo ? mediaService.getRemoteUrl(photo) : '');
            
            return (
              <div
                key={doc.id}
                onClick={() => {
                  if (doc.media) void openMedia(doc.media, photoUrl);
                }}
                className={`bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-4 transition-all ${doc.media ? 'cursor-pointer hover:shadow-md active:opacity-90' : ''}`}
              >
                <div className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Ícone Quadrado */}
                    <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 border border-gray-100" style={{ backgroundColor: getSectorColors(doc.sector).bg, color: getSectorColors(doc.sector).fg }}>
                      {getIcon(doc.media?.type)}
                    </div>
                    
                    {/* Textos */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-gray-800 text-lg leading-tight mb-1 truncate">
                        {doc.title || `Norma - ${doc.sector}`}
                      </h3>
                      <p className="text-gray-400 text-sm">
                        {new Date(doc.updatedAt || Date.now()).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredDocs.length === 0 && <p className="text-center text-gray-400 mt-10">Nenhuma norma encontrada.</p>}
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
              <button onClick={() => { setFilterSectors([]); setShowFilters(false); }} className="flex-1 py-4 text-gray-600 font-bold text-lg bg-gray-100 rounded-xl">Limpar</button>
              <button onClick={() => setShowFilters(false)} className="flex-2 w-2/3 py-4 text-white font-bold text-lg bg-blue-600 rounded-xl shadow-lg">Aplicar</button>
            </div>
          </div>
        </div>
      )}

      {showPinModal && (
        <PinRequestModal
          title="Excluir Norma?"
          description="Tem certeza que deseja excluir esta norma? Ela não poderá ser recuperada. Digite o PIN."
          onSuccess={() => {
            void (async () => {
              setShowPinModal(false);
              if (pendingAction) {
                await pendingAction();
              }
              setPendingAction(null);
            })();
          }}
          onClose={() => {
            setShowPinModal(false);
            setPendingAction(null);
          }}
        />
      )}

      {viewingMedia && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col justify-center items-center animate-in fade-in duration-200">
          <div className="absolute top-0 left-0 w-full h-16 bg-black/50 flex justify-between items-center px-4 z-50">
            <span className="text-white font-bold">Visualizador</span>
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
              <button onClick={() => { setViewingMedia(null); setViewingUrl(''); setViewingZoom(1); }} className="text-white p-2 bg-white/10 rounded-full hover:bg-white/20"><X size={24} /></button>
            </div>
          </div>

          <div className="w-full h-full flex items-center justify-center p-2 overflow-auto">
            {viewingMedia.type === 'video' ? (
              <video src={viewingUrl} controls autoPlay className="max-w-full max-h-[80vh] rounded-lg shadow-2xl" />
            ) : viewingMedia.type === 'photo' ? (
              <img
                src={viewingUrl}
                className="max-w-full max-h-[90vh] object-contain transition-transform select-none touch-none"
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
                <button onClick={() => handleDownload(viewingMedia as any)} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-blue-700 transition-colors shadow-lg active:scale-95"><Download size={24} /> BAIXAR ARQUIVO</button>
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
};
