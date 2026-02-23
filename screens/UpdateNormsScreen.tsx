import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { Header } from '../components/Header';
import { FileText, Upload, Eye, CheckCircle, Presentation } from 'lucide-react';
import { db } from '../services/db.service';
import { localdb } from '../services/localdb';
import { FarmDoc, MediaItem } from '../types';
import { notify } from '../services/notification.service';
import { PinRequestModal } from '../components/PinRequestModal';
import { authService } from '../services/auth.service';
import { mediaService } from '../services/media.service';

const DOC_TYPES = [
  { id: 'organogram', label: 'Organograma' },
  { id: 'salary', label: 'Plano de Cargos e Salários' },
  { id: 'norms', label: 'Normas da Fazenda' },
  { id: 'roles', label: 'Responsabilidades de Função' },
  { id: 'dayoff', label: 'Plano de Folgas' },
];

export const UpdateNormsScreen: React.FC = () => {
  const [docs, setDocs] = useState<Record<string, FarmDoc>>({});
  const [docUrls, setDocUrls] = useState<Record<string, string>>({});
  const [showPinModal, setShowPinModal] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<{ file: File; typeId: string; typeLabel: string } | null>(null);

  useEffect(() => { 
    let mounted = true;
    const run = () => { if (mounted) load(); };
    run();
    const unsub = localdb.subscribe('farm_docs', () => { load(); });
    return () => { mounted = false; unsub && unsub(); };
  }, []);

  const load = async () => {
    const loaded: Record<string, FarmDoc> = {};
    const urls: Record<string, string> = {};
    for (const d of DOC_TYPES) {
      const found = await db.getFarmDoc(d.id);
      if (found) {
        loaded[d.id] = found;
        if (found.media) {
          urls[d.id] = await mediaService.loadMediaUrl(found.media);
        }
      }
    }
    setDocs(loaded);
    setDocUrls(urls);
  };

  const performUpload = async (file: File, typeId: string, typeLabel: string) => {
    let type: MediaItem['type'] = 'doc';
    if (file.type === 'application/pdf') type = 'pdf';
    else if (file.name.endsWith('.ppt') || file.name.endsWith('.pptx')) type = 'ppt';
    try {
      const saved = await mediaService.saveMediaFile(file, type);
      const doc: FarmDoc = { id: typeId, title: typeLabel, sector: 'Administração', updatedAt: new Date().toISOString(), media: saved };
      await db.saveFarmDoc(doc);
      await load();
      notify(`${typeLabel} atualizado!`, 'success');
    } catch (e) {
      notify('Erro ao processar arquivo.', 'error');
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, typeId: string, typeLabel: string) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!authService.isAuthenticated()) {
        setPendingUpload({ file, typeId, typeLabel });
        setShowPinModal(true);
        return;
      }
      await performUpload(file, typeId, typeLabel);
    }
  };

  return (
    <Layout>
      <Header title="Atualizar Normas" targetRoute="/norms" />
      <div className="flex-1 bg-gray-100 p-4 space-y-4 overflow-y-auto">
        <p className="text-sm text-gray-500 text-center mb-2">Selecione um documento padrão abaixo para atualizar o arquivo.</p>
        
        {DOC_TYPES.map(item => {
          const doc = docs[item.id];
          return (
            <div key={item.id} className={`bg-white p-4 rounded-xl shadow-sm border-2 ${doc ? 'border-green-100' : 'border-gray-200'}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className={`p-2 rounded-lg ${doc ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                  {doc ? <CheckCircle size={24} /> : <FileText size={24} />}
                </div>
                <div className="flex-1">
                    <h3 className="font-bold text-gray-800 text-lg leading-tight">{item.label}</h3>
                    {doc && <span className="text-[10px] text-green-600 font-bold uppercase">Atualizado</span>}
                </div>
              </div>
              
              {doc && (
                <div className="bg-gray-50 p-3 rounded-lg mb-3 border border-gray-100 flex justify-between items-center">
                   <div className="flex flex-col">
                       <p className="text-xs text-gray-500">Em: {new Date(doc.updatedAt).toLocaleDateString()}</p>
                       <p className="text-xs font-bold text-gray-600 uppercase">{doc.media?.type}</p>
                   </div>
                   {doc.media && (
                       <a href={docUrls[item.id] || doc.media.uri} download={doc.media.name} className="flex items-center gap-1 text-blue-600 font-bold text-xs bg-blue-50 px-2 py-1 rounded hover:bg-blue-100">
                          <Eye size={12} /> Ver
                       </a>
                   )}
                </div>
              )}

              <label className={`w-full text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors ${doc ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-600 hover:bg-blue-700'}`}>
                <Upload size={18} />
                {doc ? 'SUBSTITUIR ARQUIVO' : 'ANEXAR ARQUIVO'}
                <input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx" className="hidden" onChange={(e) => handleUpload(e, item.id, item.label)} />
              </label>
            </div>
          );
        })}
      </div>
      {showPinModal && (
        <PinRequestModal
          onSuccess={async () => {
            setShowPinModal(false);
            if (pendingUpload) {
              await performUpload(pendingUpload.file, pendingUpload.typeId, pendingUpload.typeLabel);
              setPendingUpload(null);
            }
          }}
          onClose={() => { setShowPinModal(false); setPendingUpload(null); }}
          title="Autorização Necessária"
        />
      )}
    </Layout>
  );
};

