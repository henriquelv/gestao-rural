
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Layout } from '../../components/Layout';
import { Header } from '../../components/Header';
import { MicrophoneButton } from '../../components/MicrophoneButton';
import { FieldLabel } from '../../components/FieldLabel';
import { Camera, Video, Save, Trash2, Clock, FileText, Paperclip, Image as ImageIcon, Lock } from 'lucide-react';
import { MediaItem } from '../../types';
import { db } from '../../services/db.service';
import { notify } from '../../services/notification.service';
import { validateFileSize } from '../../utils/media-compression';
import { SECTORS_LIST, getSectorColors } from '../../constants/sectors';
import { PinRequestModal } from '../../components/PinRequestModal';
import { authService } from '../../services/auth.service';
import { mediaService } from '../../services/media.service';

export const AddInstructionScreen: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { fixedTimestamp: string; selectedSector?: string } | null;
  const [timestamp] = useState(state?.fixedTimestamp || new Date().toISOString());
  const selectedSector = state?.selectedSector;

  const [employees, setEmployees] = useState<{id:string, name:string}[]>([]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [responsible, setResponsible] = useState('');
  const [sector, setSector] = useState(state?.selectedSector || '');
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [showPinModal, setShowPinModal] = useState(false);

  const handleGalleryPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type.startsWith('video/')) {
      void handleFileSelect(e, 'video');
      return;
    }
    void handleFileSelect(e, 'photo');
  };

  useEffect(() => {
    const load = async () => {
        const emps = await db.getEmployees();
        emps.sort((a, b) => a.name.localeCompare(b.name));
        setEmployees(emps);
        if(!sector && SECTORS_LIST.length > 0) setSector(SECTORS_LIST[0]);
    };
    load();
  }, []);

  const appendText = (setter: React.Dispatch<React.SetStateAction<string>>, text: string) => {
    setter(prev => prev ? prev + ' ' + text : text);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, category: 'doc' | 'video' | 'photo') => {
    if (media.length >= 5) { notify("Limite máximo de 5 arquivos.", "error"); return; }
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      if(!validateFileSize(file)) { notify("Arquivo muito grande.", "error"); return; }

      let type: MediaItem['type'] = 'doc';
      if (category === 'photo') type = 'photo';
      else if (category === 'video') type = 'video';
      else {
          if (file.type === 'application/pdf') type = 'pdf';
          else if (file.name.endsWith('.doc') || file.name.endsWith('.docx')) type = 'doc';
          else if (file.name.endsWith('.ppt') || file.name.endsWith('.pptx')) type = 'ppt';
      }

      try {
          const saved = await mediaService.saveMediaFile(file, type);
          setMedia(prev => [...prev, saved]);
          notify("Arquivo anexado!", "success");
      } catch(e) {
          notify("Erro ao processar arquivo.", "error");
      }
    }
  };

  const handleSave = () => {
    if (!title || !responsible) { notify('Preencha Título e Responsável.', "error"); return; }
    
    if(authService.isAuthenticated()) {
      performSave();
    } else {
      setShowPinModal(true);
    }
  };

  const performSave = async () => {
    await db.addInstruction({ id: crypto.randomUUID(), createdAt: timestamp, title, sector, description, media });
    notify('Instrução salva!', "success");
    navigate('/instructions/list', { state: { selectedSector } });
  };

  return (
    <Layout>
      <Header title="Nova Instrução" targetRoute="/instructions" />
      <div className="bg-purple-50 p-2 text-center border-b border-purple-100 flex items-center justify-center gap-2 text-purple-800 text-xs font-bold sticky top-16 z-20">
          <Clock size={14} /> Data: {new Date(timestamp).toLocaleString('pt-BR')} (Fixo)
      </div>

      <div className="flex-1 bg-white p-6 space-y-6 overflow-y-auto pb-10">
        <div>
           <FieldLabel label="Título" />
           <div className="relative">
             <input value={title} onChange={e => setTitle(e.target.value)} className="w-full p-3 pr-12 border-2 border-gray-200 rounded-lg text-lg font-bold" placeholder="Ex: Procedimento de Ordenha" />
             <div className="absolute right-2 top-1/2 -translate-y-1/2"><MicrophoneButton onResult={t => appendText(setTitle, t)} /></div>
           </div>
        </div>

        <div>
           <FieldLabel label="Responsável" />
           <select value={responsible} onChange={e => setResponsible(e.target.value)} className="w-full p-3 border border-gray-200 rounded-lg bg-gray-50 font-bold text-gray-700">
                <option value="">Selecione...</option>
                {employees.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
           </select>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <FieldLabel label="Setor" />
          <div className="grid grid-cols-2 gap-2">
            {SECTORS_LIST.map(s => (
                <button
                  key={s}
                  onClick={() => setSector(s)}
                  className={`p-3 rounded-lg border-2 text-sm font-bold transition-all shadow-sm ${sector === s ? 'scale-[1.01]' : ''}`}
                  style={sector === s ? { backgroundColor: getSectorColors(s).bg, color: getSectorColors(s).fg, borderColor: getSectorColors(s).border } : { backgroundColor: '#F9FAFB', color: '#4B5563', borderColor: '#F3F4F6' }}
                >
                  {s}
                </button>
            ))}
          </div>
        </div>

        <div>
           <FieldLabel label="Descrição" />
           <div className="relative">
             <textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full p-3 pr-12 border-2 border-gray-200 rounded-lg h-32" />
             <div className="absolute bottom-2 right-2"><MicrophoneButton onResult={t => appendText(setDescription, t)} /></div>
           </div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
           <FieldLabel label={`Arquivos (${media.length}/5)`} helpText="Adicione materiais de apoio." />
           <div className="grid grid-cols-2 gap-2 mb-4">
                <label className="bg-blue-50 border-2 border-blue-100 rounded-xl flex flex-col items-center justify-center h-20 active:scale-95 transition-transform shadow-sm cursor-pointer hover:bg-blue-100">
                    <Camera size={24} className="text-blue-600 mb-1"/>
                    <span className="text-[10px] font-bold text-blue-800">FOTO</span>
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => handleFileSelect(e, 'photo')} disabled={media.length >= 5} />
                </label>
                <label className="bg-purple-50 border-2 border-purple-100 rounded-xl flex flex-col items-center justify-center h-20 active:scale-95 transition-transform shadow-sm cursor-pointer hover:bg-purple-100">
                    <Video size={24} className="text-purple-600 mb-1"/>
                    <span className="text-[10px] font-bold text-purple-800">VÍDEO</span>
                    <input type="file" accept="video/*" capture="environment" className="hidden" onChange={e => handleFileSelect(e, 'video')} disabled={media.length >= 5} />
                </label>
                <label className="bg-blue-50 border-2 border-blue-100 rounded-xl flex flex-col items-center justify-center h-20 active:scale-95 transition-transform shadow-sm cursor-pointer hover:bg-blue-100">
                    <ImageIcon size={24} className="text-blue-600 mb-1"/>
                    <span className="text-[10px] font-bold text-blue-800">GALERIA</span>
                    <input type="file" accept="image/*,video/*" className="hidden" onChange={handleGalleryPick} disabled={media.length >= 5} />
                </label>
                <label className="bg-orange-50 border-2 border-orange-100 rounded-xl flex flex-col items-center justify-center h-20 active:scale-95 transition-transform shadow-sm cursor-pointer hover:bg-orange-100">
                    <Paperclip size={24} className="text-orange-600 mb-1"/>
                    <span className="text-[10px] font-bold text-orange-800 text-center leading-tight">DOCS<br/>Word/PPT/PDF</span>
                    <input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx" className="hidden" onChange={e => handleFileSelect(e, 'doc')} disabled={media.length >= 5} />
                </label>
           </div>
           
           <div className="flex flex-col gap-2">
               {media.map(m => (
                   <div key={m.id} className="flex items-center p-2 bg-gray-50 border rounded-lg">
                     {m.type === 'photo' && <ImageIcon size={20} className="text-blue-500 mr-2"/>}
                     {m.type === 'video' && <Video size={20} className="text-purple-500 mr-2"/>}
                     {m.type === 'pdf' && <FileText size={20} className="text-red-500 mr-2"/>}
                     {m.type === 'doc' && <FileText size={20} className="text-blue-700 mr-2"/>}
                     {m.type === 'ppt' && <FileText size={20} className="text-orange-500 mr-2"/>}
                     <span className="flex-1 text-xs truncate font-medium">{m.name || 'Arquivo'}</span>
                     <button onClick={() => setMedia(prev => prev.filter(x => x.id !== m.id))} className="text-red-500 p-1"><Trash2 size={16}/></button>
                   </div>
               ))}
           </div>
        </div>

        <button onClick={handleSave} className="w-full py-4 bg-green-600 text-white font-black text-xl rounded-xl shadow-lg flex items-center justify-center gap-2 mt-2 active:bg-green-700 hover:bg-green-700 transition-colors">
           {!authService.isAuthenticated() && <Lock size={20} className="opacity-75"/>}
           <Save /> SALVAR INSTRUÇÃO
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
