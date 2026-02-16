import React, { useState, useEffect, useMemo } from 'react';
import { Layout } from '../../components/Layout';
import { Header } from '../../components/Header';
import { useNavigate } from 'react-router-dom';
import { FileText, LayoutGrid, List as ListIcon, X, Download, Filter, User, Presentation, Eye } from 'lucide-react';
import { db } from '../../services/db.service';
import { localdb } from '../../services/localdb';
import { FarmDoc, MediaItem } from '../../types';
import { SECTORS_LIST, getSectorColors } from '../../constants/sectors';
import { mediaService } from '../../services/media.service';
import { downloadService } from '../../services/download.service';
import { supabase } from '../../services/supabase';
import { notify } from '../../services/notification.service';

export const FarmNormsListScreen: React.FC = () => {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<FarmDoc[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [showFilters, setShowFilters] = useState(false);
  const [docUrls, setDocUrls] = useState<Record<string, string>>({});
  
  const [filterSectors, setFilterSectors] = useState<string[]>([]);

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
      if(type === 'ppt') return <Presentation size={24} className="text-orange-500" />;
      if(type === 'doc') return <FileText size={24} className="text-blue-600" />;
      return <FileText size={24} className="text-red-500" />; // pdf default
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
        <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200">
            <button onClick={() => setViewMode('list')} className={`flex-1 flex items-center justify-center py-2 rounded-md transition-all text-xs font-bold uppercase ${viewMode === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}><ListIcon size={16} className="mr-1" /> Lista</button>
            <button onClick={() => setViewMode('grid')} className={`flex-1 flex items-center justify-center py-2 rounded-md transition-all text-xs font-bold uppercase ${viewMode === 'grid' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}><LayoutGrid size={16} className="mr-1" /> Grade</button>
        </div>
      </div>

      <div className="flex-1 bg-gray-100 p-4 space-y-4 overflow-y-auto">
        {viewMode === 'list' ? (
             <div className="space-y-3">
                 {filteredDocs.map(doc => (
                     <div key={doc.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col">
                         <div className="flex items-center gap-3 overflow-hidden mb-2">
                             <div className="bg-blue-100 p-2 rounded-lg text-blue-600 shrink-0">
                                {getIcon(doc.media?.type)}
                             </div>
                             <div className="min-w-0 flex-1">
                                 <h3 className="font-bold text-gray-800 text-sm leading-tight truncate">{doc.title}</h3>
                                 <div className="flex items-center gap-2 mt-1">
                                    <span
                                      className="text-[10px] font-bold uppercase px-2 py-0.5 rounded"
                                      style={{ backgroundColor: getSectorColors(doc.sector).bg, color: getSectorColors(doc.sector).fg }}
                                    >
                                      {doc.sector}
                                    </span>
                                    {doc.responsible && <span className="text-[10px] text-gray-500 flex items-center gap-1"><User size={10}/> {doc.responsible}</span>}
                                 </div>
                             </div>
                         </div>
                         {doc.media && (
                           <div className="flex gap-2">
                             <button
                               onClick={() => navigate(`/norms/view/${doc.id}`, { state: { title: doc.title } })}
                               className="flex-1 bg-purple-600 text-white font-bold text-xs py-2 rounded-lg flex items-center justify-center gap-1 hover:bg-purple-700 active:bg-purple-800"
                             >
                               <Eye size={14} /> Visualizar
                             </button>
                             <button
                               onClick={() => handleDownload(doc)}
                               className="flex-1 bg-blue-600 text-white font-bold text-xs py-2 rounded-lg flex items-center justify-center gap-1 hover:bg-blue-700 active:bg-blue-800"
                             >
                               <Download size={14} /> Baixar
                             </button>
                           </div>
                         )}
                     </div>
                 ))}
             </div>
        ) : (
            <div className="grid grid-cols-2 gap-3">
                 {filteredDocs.map(doc => (
                     <div key={doc.id} className="bg-white p-3 rounded-xl shadow-sm border border-gray-200 flex flex-col items-center text-center">
                         <div className="mb-2 text-blue-300">{getIcon(doc.media?.type)}</div>
                         <h3 className="font-bold text-gray-800 text-xs leading-tight line-clamp-2 h-8">{doc.title}</h3>
                         <span
                          className="text-[10px] font-bold uppercase mt-2 px-2 py-0.5 rounded"
                          style={{ backgroundColor: getSectorColors(doc.sector).bg, color: getSectorColors(doc.sector).fg }}
                         >
                          {doc.sector}
                         </span>
                         {doc.media && (
                           <div className="flex gap-2 w-full">
                             <button
                               onClick={() => navigate(`/norms/view/${doc.id}`, { state: { title: doc.title } })}
                               className="flex-1 mt-3 bg-purple-600 text-white font-bold text-[10px] py-2 rounded-lg flex items-center justify-center gap-1 hover:bg-purple-700 active:bg-purple-800"
                             >
                               <Eye size={12} /> Ver
                             </button>
                             <button
                               onClick={() => handleDownload(doc)}
                               className="flex-1 mt-3 bg-blue-600 text-white font-bold text-[10px] py-2 rounded-lg flex items-center justify-center gap-1 hover:bg-blue-700 active:bg-blue-800"
                             >
                               <Download size={12} /> Baixar
                             </button>
                           </div>
                         )}
                     </div>
                 ))}
            </div>
        )}
        
        {filteredDocs.length === 0 && <p className="text-center text-gray-400 mt-10 col-span-2">Nenhuma norma encontrada.</p>}
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
              <button onClick={() => { setFilterSectors([]); setShowFilters(false); }} className="flex-1 py-4 text-gray-600 font-bold text-lg bg-gray-100 rounded-xl">Limpar</button>
              <button onClick={() => setShowFilters(false)} className="flex-2 w-2/3 py-4 text-white font-bold text-lg bg-blue-600 rounded-xl shadow-lg">Aplicar</button>
            </div>
          </div>
        </div>
      )}

    </Layout>
  );
};
