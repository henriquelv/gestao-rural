import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { User, Clock, FileText, ZoomIn, Play, X, Download, Presentation, Eye } from 'lucide-react';
import { Layout } from '../../components/Layout';
import { Header } from '../../components/Header';
import { Notice, MediaItem } from '../../types';
import { db } from '../../services/db.service';
import { localdb } from '../../services/localdb';
import { notify } from '../../services/notification.service';
import { mediaService } from '../../services/media.service';
import { useImageZoom } from '../../utils/useImageZoom';
import { PinRequestModal } from '../../components/PinRequestModal';
import { authService } from '../../services/auth.service';
import { Trash2 } from 'lucide-react';
import { getSectorColors } from '../../constants/sectors';
import { downloadService } from '../../services/download.service';
import { supabase } from '../../services/supabase';

export const NoticeDetailScreen: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});

  const [lightboxMedia, setLightboxMedia] = useState<MediaItem | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string>('');
  const [showPinModal, setShowPinModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => Promise<void> | void) | null>(null);

  const lightboxZoomGestures = useImageZoom();

  const parseSectorFromContent = (content: string) => {
    const raw = (content || '').toString();
    const m = raw.match(/^\[Setor:\s*(.+?)\]\s*/i);
    if (!m) return { sector: '', content: raw };
    return { sector: (m[1] || '').trim(), content: raw.replace(m[0], '') };
  };

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!id) return;
      const items = await db.getNotices();
      const found = items.find(n => n.id === id);
      if (found && mounted) setNotice(found);
    };
    load();

    const unsub = localdb.subscribe('notices', () => { load(); });
    return () => { mounted = false; unsub && unsub(); };
  }, [id]);

  useEffect(() => {
    const run = async () => {
      if (!notice?.media?.length) {
        setMediaUrls({});
        return;
      }

      const entries = await Promise.all(
        notice.media.map(async (m) => {
          try {
            const url = await mediaService.loadMediaUrl(m);
            return [m.id, url] as const;
          } catch {
            return [m.id, m.uri || ''] as const;
          }
        })
      );

      const next: Record<string, string> = {};
      for (const [mid, u] of entries) next[mid] = u;
      setMediaUrls(next);
    };

    void run();
  }, [notice?.id]);

  const openMedia = async (m: MediaItem) => {
    setLightboxMedia(m);
    const cached = m.id ? (mediaUrls[m.id] || '') : '';
    if (cached) {
      setLightboxUrl(cached);
      return;
    }
    const url = await mediaService.loadMediaUrl(m);
    setLightboxUrl(url || m.remoteUrl || m.uri || '');
  };

  const mediaUrl = (m: MediaItem) => {
    const cached = m.id ? (mediaUrls[m.id] || '') : '';
    return cached || m.remoteUrl || m.uri || '';
  };

  const bestFallbackUrl = (m: MediaItem) => {
    const cached = m.id ? (mediaUrls[m.id] || '') : '';
    return cached || m.remoteUrl || m.uri || '';
  };

  const handleDelete = async () => {
    const action = async () => {
      if (!id) return;
      try {
        await db.deleteNotice(id);
        notify('Comunicado excluído com sucesso!', 'success');
        navigate('/notices/list');
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

      const localUrl = url || lightboxUrl || media.uri || '';
      if (localUrl) {
        await downloadService.downloadFile(localUrl, media.name || 'documento', media.mimeType || '', media.localPath);
        return;
      }

      notify('Arquivo local não disponível.', 'error');
    } catch (e) {
      console.error('Erro no handleDownload:', e);
    }
  };

  if (!notice) return <Layout><div className="p-10 text-center">Carregando...</div></Layout>;

  const parsed = parseSectorFromContent(notice.content);
  const visualMedia = notice.media.filter(m => m.type === 'photo' || m.type === 'video');
  const docMedia = notice.media.filter(m => ['pdf', 'doc', 'ppt'].includes(m.type));

  return (
    <Layout>
      <Header title="Detalhes do Comunicado" targetRoute="/notices/list" />
      <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-gray-50 pb-24">

        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 space-y-4">
          <div className="flex items-center text-gray-500 font-medium">
            <Clock size={20} className="mr-3 text-blue-500" />
            <div className="flex flex-col"><span className="text-xs uppercase font-bold text-gray-400">Data</span><span className="text-lg text-gray-900">{new Date(notice.createdAt).toLocaleString('pt-BR')}</span></div>
          </div>
          <div className="flex items-center text-gray-500 font-medium border-t border-gray-100 pt-3">
            <User size={20} className="mr-3 text-blue-500" />
            <div className="flex flex-col"><span className="text-xs uppercase font-bold text-gray-400">Responsável</span><span className="text-lg text-gray-900">{notice.responsible}</span></div>
          </div>
          {parsed.sector && (
            <div className="border-t border-gray-100 pt-3">
              <span className="text-xs font-bold uppercase px-3 py-1 rounded" style={{ backgroundColor: getSectorColors(parsed.sector).bg, color: getSectorColors(parsed.sector).fg }}>{parsed.sector}</span>
            </div>
          )}
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
          <h3 className="flex items-center text-lg font-bold text-gray-800 mb-3"><FileText className="mr-2 text-gray-400" /> Conteúdo</h3>
          <p className="text-gray-800 text-lg leading-relaxed whitespace-pre-wrap">{parsed.content}</p>
        </div>

        {/* VISUAL MEDIA GRID */}
        {visualMedia.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-gray-600 ml-1">Evidências Visuais</h3>
            <div className="grid grid-cols-2 gap-3">
              {visualMedia.map(m => (
                <div key={m.id} className="relative rounded-xl overflow-hidden shadow-md bg-gray-900 aspect-square group" onClick={() => openMedia(m)}>
                  {m.type === 'photo' && (
                    <img
                      src={mediaUrl(m)}
                      className="w-full h-full object-cover opacity-90 group-hover:opacity-100"
                      onError={(e) => {
                        const next = bestFallbackUrl(m);
                        if (next && (e.currentTarget as HTMLImageElement).src !== next) {
                          (e.currentTarget as HTMLImageElement).src = next;
                        }
                      }}
                    />
                  )}
                  {m.type === 'video' && <div className="w-full h-full flex items-center justify-center relative bg-black"><Play fill="white" className="absolute text-white drop-shadow-lg" size={40} /></div>}
                  <div className="absolute bottom-2 right-2 bg-black/50 text-white p-1 rounded-full"><ZoomIn size={16} /></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DOCUMENT LIST */}
        {docMedia.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-gray-600 ml-1">Documentos Anexados</h3>
            <div className="space-y-2">
              {docMedia.map(m => (
                <div key={m.id} onClick={() => openMedia(m)} className="flex items-center gap-3 p-4 bg-white rounded-xl shadow-sm border border-gray-200 active:bg-blue-50 cursor-pointer">
                  {m.type === 'pdf' ? <FileText size={24} className="text-red-500" /> :
                    m.type === 'ppt' ? <Presentation size={24} className="text-orange-500" /> :
                      <FileText size={24} className="text-blue-600" />}
                  <div className="flex-1 overflow-hidden">
                    <p className="font-bold text-gray-800 text-sm truncate">{m.name || 'Documento sem nome'}</p>
                    <p className="text-[10px] text-gray-400 uppercase">{m.type}</p>
                  </div>
                  {m.type === 'pdf' ? <Eye size={20} className="text-blue-500" /> : <Download size={20} className="text-gray-400" />}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ações */}
        <div className="flex gap-3 sticky bottom-4">
          <button
            onClick={handleDelete}
            className="flex-1 py-4 px-6 bg-white text-red-500 font-bold rounded-2xl shadow-lg flex items-center justify-center gap-2 border-2 border-red-100 hover:bg-red-50 active:scale-95 transition-all"
          >
            <Trash2 size={24} />
            EXCLUIR REGISTRO
          </button>
        </div>
      </div>

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

      {lightboxMedia && (
        <div className="fixed inset-0 z-[60] bg-black flex flex-col justify-center items-center animate-in fade-in duration-200">
          <div className="absolute top-0 left-0 w-full h-16 bg-black/50 flex justify-between items-center px-4 z-50">
            <span className="text-white font-bold">Visualizador</span>
            <div className="flex items-center gap-2">
              <button onClick={() => { setLightboxMedia(null); setLightboxUrl(''); }} className="text-white p-2 bg-white/10 rounded-full hover:bg-white/20"><X size={24} /></button>
            </div>
          </div>

          <div className="w-full h-full flex items-center justify-center p-2 overflow-auto">
            {lightboxMedia.type === 'photo' && (
              <img
                src={lightboxUrl || mediaUrl(lightboxMedia)}
                className="max-w-full max-h-[90vh] object-contain transition-transform"
                style={lightboxZoomGestures.imageStyle}
                onTouchStart={lightboxZoomGestures.handleTouchStart}
                onTouchMove={lightboxZoomGestures.handleTouchMove}
                onTouchEnd={lightboxZoomGestures.handleTouchEnd}
                onError={(e) => {
                  const next = bestFallbackUrl(lightboxMedia);
                  if (next && (e.currentTarget as HTMLImageElement).src !== next) {
                    (e.currentTarget as HTMLImageElement).src = next;
                  }
                }}
              />
            )}
            {lightboxMedia.type === 'video' && (
              <video
                src={lightboxUrl || mediaUrl(lightboxMedia)}
                controls
                autoPlay
                playsInline
                className="max-w-full max-h-[80vh] w-full"
                onError={(e) => {
                  const next = bestFallbackUrl(lightboxMedia);
                  const el = e.currentTarget as HTMLVideoElement;
                  if (next && el.src !== next) {
                    el.src = next;
                    void el.play().catch(() => { });
                  }
                }}
              />
            )}
            {(lightboxMedia.type === 'pdf' || lightboxMedia.type === 'doc' || lightboxMedia.type === 'ppt') && (
              <div className="bg-white p-8 rounded-xl text-center">
                <FileText size={64} className="text-gray-300 mx-auto mb-4" />
                <p className="font-bold mb-4">Este arquivo deve ser baixado para acessar.</p>
                <button onClick={() => handleDownload(lightboxMedia, lightboxUrl)} className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold"><Download size={20} className="inline mr-2" />Baixar Arquivo</button>
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
};
