
import React, { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Layout } from '../../components/Layout';
import { Header } from '../../components/Header';
import { FileText, Download, Presentation, Image as ImageIcon, Eye } from 'lucide-react';
import { db } from '../../services/db.service';
import { localdb } from '../../services/localdb';
import { FarmDoc, MediaItem } from '../../types';
import { mediaService } from '../../services/media.service';
import { downloadService } from '../../services/download.service';
import { supabase } from '../../services/supabase';
import { notify } from '../../services/notification.service';

export const NormsCategoryListScreen: React.FC = () => {
  const { categoryId } = useParams<{ categoryId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const label = (location.state as any)?.label || 'Lista';

  const [docs, setDocs] = useState<FarmDoc[]>([]);
  const [docUrls, setDocUrls] = useState<Record<string, string>>({});

  useEffect(() => { 
      let mounted = true;
      const load = async () => {
        const allDocs = await db.getFarmDocs();
        // Filtra onde o 'sector' é igual ao categoryId
        const filtered = allDocs.filter(d => d.sector === categoryId);
        if (!mounted) return;
        setDocs(filtered);

        const urls: Record<string, string> = {};
        await Promise.all(
          filtered.map(async (doc) => {
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
  }, [categoryId]);

  const getIcon = (type: MediaItem['type'] | undefined) => {
      if(type === 'ppt') return <Presentation size={24} className="text-orange-500" />;
      if(type === 'photo') return <ImageIcon size={24} className="text-purple-500" />;
      return <FileText size={24} className="text-red-500" />;
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

        if (isRemoteHttpUrl(remoteUrl)) {
          console.log('Download usando URL remota:', remoteUrl);
          await downloadService.downloadFile(remoteUrl, media.name || 'documento', media.mimeType || '', media.localPath);
          return;
        }

        const localUrl = docUrls[doc.id] || media.uri || '';
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
      <Header title={label} targetRoute={`/norms/${categoryId}/options`} />
      
      <div className="flex-1 bg-gray-100 p-4 space-y-4 overflow-y-auto">
         {docs.map(doc => (
             <div key={doc.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col">
                 <div className="flex items-center gap-3 overflow-hidden mb-2">
                     <div className="bg-gray-100 p-3 rounded-lg text-gray-600 shrink-0">
                        {getIcon(doc.media?.type)}
                     </div>
                     <div className="min-w-0 flex-1">
                         <h3 className="font-bold text-gray-800 text-base leading-tight truncate">{doc.title}</h3>
                         <p className="text-xs text-gray-400 mt-1">{new Date(doc.updatedAt).toLocaleDateString()}</p>
                     </div>
                 </div>
                 {doc.media && (
                   <div className="flex gap-2">
                     <button
                       onClick={() => navigate(`/norms/view/${doc.id}`, { state: { title: doc.title } })}
                       className="flex-1 bg-purple-600 text-white font-bold text-xs py-3 rounded-lg flex items-center justify-center gap-1 hover:bg-purple-700 active:bg-purple-800"
                     >
                       <Eye size={16} /> VISUALIZAR
                     </button>
                     <button
                       onClick={() => handleDownload(doc)}
                       className="flex-1 bg-blue-600 text-white font-bold text-xs py-3 rounded-lg flex items-center justify-center gap-1 hover:bg-blue-700 active:bg-blue-800"
                     >
                       <Download size={16} /> BAIXAR
                     </button>
                   </div>
                 )}
             </div>
         ))}

         {docs.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                <FileText size={48} className="mb-2 opacity-20"/>
                <p>Nenhum documento encontrado.</p>
                <p className="text-xs">Use a opção "Adicionar" no menu anterior.</p>
            </div>
         )}
      </div>
    </Layout>
  );
};
