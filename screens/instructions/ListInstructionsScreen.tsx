
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout } from '../../components/Layout';
import { Header } from '../../components/Header';
import { Filter, X, Calendar, LayoutGrid, List as ListIcon, Table as TableIcon, FileText, Video, Download, Presentation, Image as ImageIcon } from 'lucide-react';
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
import { authService } from '../../services/auth.service';

export const ListInstructionsScreen: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { selectedSector?: string } | null;

  const [items, setItems] = useState<Instruction[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const viewMode = 'list';
  const [showFilters, setShowFilters] = useState(false);
  const [viewingMedia, setViewingMedia] = useState<MediaItem | null>(null);
  const [viewingUrl, setViewingUrl] = useState<string>('');
  const [viewingZoom, setViewingZoom] = useState(1);
  const [filterSectors, setFilterSectors] = useState<string[]>(state?.selectedSector ? [state.selectedSector] : []);
  const [filterPeriod, setFilterPeriod] = useState<'all' | 'today' | '7days'>('all');

  const viewingZoomGestures = useImageZoom((newZoom) => setViewingZoom(newZoom));

  const localDay = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('pt-BR');
    } catch {
      return '';
    }
  };

  const loadData = async () => {
    const data = await db.getInstructions();
    setItems(data);

    const urls: Record<string, string> = {};
    for (const item of data) {
      const photo = item.media?.find(m => m.type === 'photo');
      if (photo) {
        const url = await mediaService.loadMediaUrl(photo);
        if (url) urls[item.id] = url;
      }
    }
    setPhotoUrls(urls);
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
      const today = new Date().toISOString().split('T')[0];
      result = result.filter(i => i.createdAt.startsWith(today));
    }

    // Sort by most recent
    result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return result;
  }, [items, filterSectors, filterPeriod]);

  const activeFiltersCount = filterSectors.length + (filterPeriod !== 'all' ? 1 : 0);

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

      if (isRemoteHttpUrl(remoteUrl)) {
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
          <button
            onClick={() => setShowFilters(true)}
            className={`flex-1 flex items-center justify-center px-4 py-3 rounded-lg font-bold border-2 transition-colors ${activeFiltersCount > 0 ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}
          >
            <Filter size={18} className="mr-2" /> {activeFiltersCount > 0 ? `Filtros (${activeFiltersCount})` : 'Filtrar'}
          </button>
        </div>
      </div>

      <div className="flex-1 bg-gray-100 p-4 space-y-4 overflow-y-auto">
        <div className="space-y-3">
          {filteredItems.map((item, index) => {
            const dateStr = localDay(item.createdAt);
            const isLatest = index === 0; // Opcional, para destacar a mais recente
            
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
                      <p className="text-gray-400 text-sm">
                        {dateStr}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredItems.length === 0 && <p className="text-center text-gray-400 mt-10">Nenhuma instrução encontrada.</p>}
      </div>

      {showFilters && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center animate-in fade-in">
          <div className="bg-white w-full max-w-md p-6 rounded-t-2xl sm:rounded-xl shadow-2xl animate-in slide-in-from-bottom max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-gray-800">Filtrar</h2>
              <button onClick={() => setShowFilters(false)} className="p-2 bg-gray-100 rounded-full"><X size={24} /></button>
            </div>
            <div className="space-y-6 pb-6">
              <div>
                <label className="block text-sm font-bold text-gray-500 mb-2 uppercase flex items-center"><Calendar size={16} className="mr-1" /> Período</label>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => setFilterPeriod('today')} className={`p-3 rounded-lg font-bold border-2 ${filterPeriod === 'today' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}>Hoje</button>
                  <button onClick={() => setFilterPeriod('7days')} className={`p-3 rounded-lg font-bold border-2 ${filterPeriod === '7days' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}>7 Dias</button>
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
                      className={`p-2 rounded-lg text-sm font-bold border-2 ${filterSectors.includes(s) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 pt-4 border-t border-gray-100">
              <button onClick={() => { setFilterSectors([]); setFilterPeriod('all'); }} className="flex-1 py-4 text-gray-600 font-bold text-lg bg-gray-100 rounded-xl">Limpar</button>
              <button onClick={() => setShowFilters(false)} className="flex-2 w-2/3 py-4 text-white font-bold text-lg bg-blue-600 rounded-xl shadow-lg">Aplicar</button>
            </div>
          </div>
        </div>
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
