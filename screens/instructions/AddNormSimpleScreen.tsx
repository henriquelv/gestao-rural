
import React, { useState } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { Layout } from '../../components/Layout';
import { Header } from '../../components/Header';
import { FieldLabel } from '../../components/FieldLabel';
import { MicrophoneButton } from '../../components/MicrophoneButton';
import { FileText, Save, Clock, Paperclip, CheckCircle, Trash2, Presentation, Lock } from 'lucide-react';
import { db } from '../../services/db.service';
import { FarmDoc, MediaItem } from '../../types';
import { notify } from '../../services/notification.service';
import { PinRequestModal } from '../../components/PinRequestModal';
import { authService } from '../../services/auth.service';
import { mediaService } from '../../services/media.service';

export const AddNormSimpleScreen: React.FC = () => {
  const navigate = useNavigate();
  const { categoryId } = useParams<{ categoryId: string }>();
  const location = useLocation();
  const state = location.state as { fixedTimestamp: string, label: string } | null;
  const timestamp = state?.fixedTimestamp || new Date().toISOString();
  const categoryLabel = state?.label || 'Documento';

  const [title, setTitle] = useState('');
  const [docFile, setDocFile] = useState<MediaItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);

  const appendText = (setter: React.Dispatch<React.SetStateAction<string>>, text: string) => {
    setter(prev => prev ? prev + ' ' + text : text);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0];
      
      if (f.size > 5 * 1024 * 1024) {
          notify("Arquivo muito grande! Máximo 5MB.", "error");
          return;
      }

      let type: MediaItem['type'] = 'doc';
      if(f.type === 'application/pdf') type = 'pdf';
      else if(f.name.endsWith('.ppt') || f.name.endsWith('.pptx')) type = 'ppt';
      else if(f.type.startsWith('image/')) type = 'photo';

      notify("Processando arquivo...", "info");

      try {
        const saved = await mediaService.saveMediaFile(f, type);
        setDocFile(saved);
        notify("Arquivo anexado!", "success");
      } catch (e) {
        notify("Erro ao processar arquivo.", "error");
      }
    }
  };

  const handleSave = () => {
      if(!title) { notify("Defina um título.", "error"); return; }
      if(!docFile) { notify("Anexe um arquivo.", "error"); return; }
      
      if(authService.isAuthenticated()) {
        performSave();
      } else {
        setShowPinModal(true);
      }
  };

  const performSave = async () => {
      setIsSaving(true);
      try {
        const newDoc: FarmDoc = {
            id: crypto.randomUUID(),
            title: title,
            sector: categoryId || 'Geral', // Usamos o ID da categoria como "Setor" para filtrar depois
            responsible: 'Administrador', // Valor padrão oculto
            updatedAt: timestamp, 
            media: docFile
        };

        await db.addFarmDoc(newDoc);
        notify("Salvo com sucesso!", "success");
        navigate(`/norms/${categoryId}/list`, { state: { label: categoryLabel } });
      } catch (e) {
        console.error(e);
        notify("Erro ao salvar.", "error");
      } finally {
        setIsSaving(false);
      }
  };

  return (
    <Layout>
      <Header title={`Adicionar: ${categoryLabel}`} targetRoute={`/norms/${categoryId}/options`} />

      <div className="bg-blue-50 p-2 text-center border-b border-blue-100 flex items-center justify-center gap-2 text-blue-800 text-xs font-bold sticky top-16 z-20">
          <Clock size={14} /> Data: {new Date(timestamp).toLocaleString('pt-BR')}
      </div>

      <div className="flex-1 bg-white p-6 space-y-6 overflow-y-auto pb-10">
        
        <div>
            <FieldLabel label="Nome do Documento / Título" />
            <div className="relative">
                <input value={title} onChange={e => setTitle(e.target.value)} className="w-full p-4 pr-12 border-2 border-gray-200 rounded-xl font-bold text-gray-800 outline-none focus:border-blue-500" placeholder="Ex: Organograma 2024" autoFocus />
                <div className="absolute right-2 top-1/2 -translate-y-1/2"><MicrophoneButton onResult={t => appendText(setTitle, t)} /></div>
            </div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 transition-colors hover:border-blue-300">
            <FieldLabel label="Arquivo" helpText="PDF, Imagem ou PPT" />
            
            {!docFile && (
                <div className="grid grid-cols-1">
                    <label className={`w-full h-32 bg-orange-50 border-2 border-dashed border-orange-300 rounded-xl flex flex-col items-center justify-center active:scale-95 transition-transform shadow-sm cursor-pointer hover:bg-orange-100 group`}>
                        <div className="bg-white p-3 rounded-full shadow-sm mb-2 group-hover:scale-110 transition-transform">
                            <Paperclip size={24} className="text-orange-600"/>
                        </div>
                        <span className="text-xs font-black text-orange-800 text-center leading-tight uppercase">Clique para anexar</span>
                        <input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,image/*" className="hidden" onChange={handleUpload} />
                    </label>
                </div>
            )}

            {docFile && (
                <div className="flex flex-col gap-2 mt-2">
                    <div className="flex items-center p-3 bg-green-50 border border-green-200 rounded-lg">
                        {docFile.type === 'pdf' ? <FileText size={24} className="text-red-500 mr-3"/> : 
                         docFile.type === 'ppt' ? <Presentation size={24} className="text-orange-500 mr-3"/> :
                         <FileText size={24} className="text-blue-600 mr-3"/>}
                        
                        <div className="flex-1 overflow-hidden">
                            <span className="block truncate text-sm font-bold text-gray-800">{docFile.name}</span>
                            <span className="text-[10px] text-green-700 font-bold uppercase flex items-center gap-1"><CheckCircle size={10}/> Anexado</span>
                        </div>
                        <button onClick={() => setDocFile(null)} className="text-red-500 p-2 bg-white rounded-lg border border-red-100 shadow-sm hover:bg-red-50"><Trash2 size={16}/></button>
                    </div>
                </div>
            )}
        </div>

        <button onClick={handleSave} disabled={isSaving} className="w-full bg-green-600 active:bg-green-700 text-white py-4 rounded-xl font-black text-xl shadow-lg mt-4 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
            {isSaving ? 'SALVANDO...' : <>{!authService.isAuthenticated() && <Lock size={20} className="opacity-75"/>}<Save /> SALVAR</>}
        </button>
      </div>

      {showPinModal && (
        <PinRequestModal 
            onSuccess={() => { setShowPinModal(false); performSave(); }}
            onClose={() => setShowPinModal(false)}
            title="Autorização Necessária"
        />
      )}
    </Layout>
  );
};
