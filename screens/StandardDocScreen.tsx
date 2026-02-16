import React, { useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Header } from '../components/Header';
import { FileText, Download, CheckCircle } from 'lucide-react';
import { db } from '../services/db.service';
import { localdb } from '../services/localdb';
import { FarmDoc, MediaItem } from '../types';
import { mediaService } from '../services/media.service';
import { downloadService } from '../services/download.service';
import { supabase } from '../services/supabase';
import { notify } from '../services/notification.service';
import { useImageZoom } from '../utils/useImageZoom';

export const StandardDocScreen: React.FC = () => {
  const { docId } = useParams<{ docId: string }>();
  const location = useLocation();
  const titleFromState = (location.state as any)?.title || 'Documento';

  const [currentDoc, setCurrentDoc] = useState<FarmDoc | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string>('');
  const [viewingUrl, setViewingUrl] = useState<string>('');
  const [viewingZoom, setViewingZoom] = useState(1);

  const viewingZoomGestures = useImageZoom((newZoom) => setViewingZoom(newZoom));

  useEffect(() => {
    loadDoc();
    const unsub = localdb.subscribe('farm_docs', () => { loadDoc(); });
    return () => { unsub && unsub(); };
  }, [docId]);

  const loadDoc = async () => {
    if (!docId) return;
    const doc = await db.getFarmDoc(docId);
    if (doc) {
        setCurrentDoc(doc);
        if (doc.media) {
          const url = await mediaService.loadMediaUrl(doc.media);
          setDownloadUrl(url);
          setViewingUrl(url || doc.media.remoteUrl || doc.media.uri || '');
        } else {
          setDownloadUrl('');
        }
    }
  };

  const handleDownload = async () => {
    try {
      if (!currentDoc?.media) return;
      const media = currentDoc.media;

      const isRemoteHttpUrl = (u: string) => {
        if (!u) return false;
        return /^https?:\/\//i.test(u) && !/localhost/i.test(u) && !/127\.0\.0\.1/i.test(u) && !/capacitor/i.test(u);
      };

      // Tentar resolver a melhor URL remota possível
      let remoteUrl = media.remoteUrl || '';
      if (!remoteUrl && media.remotePath) {
        const { data } = supabase.storage.from('media').getPublicUrl(media.remotePath);
        remoteUrl = data?.publicUrl || '';
      }

      // Alguns registros antigos podem vir com a URL em `uri`
      if (!remoteUrl && isRemoteHttpUrl(media.uri || '')) {
        remoteUrl = media.uri || '';
      }

      // A tela pode ter resolvido uma URL válida previamente
      if (!remoteUrl && isRemoteHttpUrl(downloadUrl || '')) {
        remoteUrl = downloadUrl;
      }

      if (isRemoteHttpUrl(remoteUrl)) {
        console.log('Download usando URL remota:', remoteUrl);
        await downloadService.downloadFile(remoteUrl, media.name || 'documento.pdf', media.mimeType || '', media.localPath);
        return;
      }

      const localUrl = downloadUrl || media.uri || '';
      if (localUrl) {
        await downloadService.downloadFile(localUrl, media.name || 'documento.pdf', media.mimeType || '', media.localPath);
        return;
      }

      notify('Arquivo local não disponível.', 'error');
    } catch (e) {
      console.error('Erro no handleDownload:', e);
      notify('Erro ao baixar documento.', 'error');
    }
  };

  return (
    <Layout>
      <Header title={titleFromState} targetRoute="/norms" />
      
      <div className="flex-1 bg-gray-50 p-6 flex flex-col items-center justify-center">
        
        {currentDoc?.media ? (
          <div className="w-full flex-1 flex flex-col items-center justify-center">
            <div className="w-full max-w-3xl">
              <div className="h-16 bg-white flex items-center justify-between px-4 rounded-t-xl border border-b-0 border-gray-100">
                <div>
                  <p className="font-bold text-gray-800">{currentDoc.title}</p>
                  <p className="text-[10px] text-gray-400">{new Date(currentDoc.updatedAt).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  {currentDoc.media.type === 'photo' && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => setViewingZoom(Math.max(1, viewingZoom - 0.25))} className="p-2 bg-gray-100 rounded-full">−</button>
                      <span className="text-sm font-bold w-12 text-center">{Math.round(viewingZoom * 100)}%</span>
                      <button onClick={() => setViewingZoom(Math.min(3, viewingZoom + 0.25))} className="p-2 bg-gray-100 rounded-full">+</button>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-gray-900 p-4 rounded-b-xl border border-gray-100">
                {currentDoc.media.type === 'photo' ? (
                  <div className="flex items-center justify-center p-2 relative overflow-auto" style={{ maxHeight: '70vh' }}>
                    <img
                      src={viewingUrl || currentDoc.media.remoteUrl || currentDoc.media.uri}
                      className="object-contain select-none touch-none"
                      style={{ transform: `scale(${viewingZoom})`, maxWidth: '100%', maxHeight: '70vh' }}
                      onTouchStart={viewingZoomGestures.handleTouchStart}
                      onTouchMove={viewingZoomGestures.handleTouchMove}
                      onTouchEnd={viewingZoomGestures.handleTouchEnd}
                      onError={(e) => {
                        const next = currentDoc.media.remoteUrl || currentDoc.media.uri || '';
                        if (next && (e.currentTarget as HTMLImageElement).src !== next) {
                          (e.currentTarget as HTMLImageElement).src = next;
                        }
                      }}
                    />
                  </div>
                ) : currentDoc.media.type === 'video' ? (
                  <video src={viewingUrl || currentDoc.media.remoteUrl || currentDoc.media.uri} controls autoPlay playsInline className="max-w-full max-h-full" />
                ) : (
                  <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden mx-auto">
                    <div className="bg-green-50 p-6 flex flex-col items-center justify-center border-b border-green-100">
                      <CheckCircle size={48} className="text-green-500 mb-2" />
                      <h3 className="text-green-800 font-bold text-lg">Arquivo Disponível</h3>
                      <p className="text-green-600 text-xs">{new Date(currentDoc.updatedAt).toLocaleDateString()}</p>
                    </div>
                    <div className="p-6 space-y-4">
                      <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                        <FileText className="text-blue-500" />
                        <div className="flex-1 overflow-hidden">
                          <p className="font-bold text-gray-800 text-sm truncate">{currentDoc.media.name}</p>
                          <p className="text-[10px] text-gray-400 uppercase">{currentDoc.media.type}</p>
                        </div>
                      </div>

                      <button onClick={handleDownload} className="flex items-center justify-center gap-2 bg-blue-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors active:bg-blue-800">
                        <Download size={18} /> Baixar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-sm text-center">
            <div className="mb-6">
              <div className="w-24 h-24 bg-gray-200 rounded-full mx-auto flex items-center justify-center mb-4 text-gray-400">
                <FileText size={40} />
              </div>
              <h3 className="text-xl font-bold text-gray-700">Nenhum documento</h3>
              <p className="text-gray-500 text-sm mt-1">Nenhum arquivo disponível para download.</p>
            </div>
          </div>
        )}

      </div>

    </Layout>
  );
};
