
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Layout } from '../../components/Layout';
import { Header } from '../../components/Header';
import { MicrophoneButton } from '../../components/MicrophoneButton';
import { FieldLabel } from '../../components/FieldLabel';
import { Camera, Video, Save, Clock, Trash2, FileText, Paperclip, Image as ImageIcon } from 'lucide-react';
import { MediaItem, Employee } from '../../types';
import { db } from '../../services/db.service';
import { notify } from '../../services/notification.service';
import { validateFileSize } from '../../utils/media-compression';
import { SECTORS_LIST, getSectorColors } from '../../constants/sectors';
import { mediaService } from '../../services/media.service';

export const AddImprovementScreen: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { fixedTimestamp: string } | null;
  const [timestamp] = useState(state?.fixedTimestamp || new Date().toISOString());

  const [employees, setEmployees] = useState<Employee[]>([]);

  const [employee, setEmployee] = useState('');
  const [sector, setSector] = useState('');
  const [desc, setDesc] = useState('');
  const [media, setMedia] = useState<MediaItem[]>([]);

  const handleGalleryPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type.startsWith('video/')) {
      void handleMedia(e, 'video');
      return;
    }
    void handleMedia(e, 'photo');
  };

  useEffect(() => {
    const load = async () => {
        const emps = await db.getEmployees();
        emps.sort((a, b) => a.name.localeCompare(b.name));
        setEmployees(emps);
        if(SECTORS_LIST.length > 0) setSector(SECTORS_LIST[0]);
    };
    load();
  }, []);

  const appendText = (setter: React.Dispatch<React.SetStateAction<string>>, text: string) => {
    setter(prev => prev ? prev + ' ' + text : text);
  };

  const handleMedia = async (e: React.ChangeEvent<HTMLInputElement>, category: 'photo'|'video'|'doc') => {
    if (media.length >= 5) { notify("Limite atingido.", "error"); return; }
    if(e.target.files?.[0]) {
       const f = e.target.files[0];

       if (!validateFileSize(f)) { notify("Arquivo muito grande.", "error"); return; }

       let type: MediaItem['type'] = 'doc';
       if(category === 'photo') type = 'photo';
       else if(category === 'video') type = 'video';
       else {
           if(f.type === 'application/pdf') type = 'pdf';
           else if(f.name.endsWith('.doc') || f.name.endsWith('.docx')) type = 'doc';
           else if(f.name.endsWith('.ppt') || f.name.endsWith('.pptx')) type = 'ppt';
       }

       try {
           const saved = await mediaService.saveMediaFile(f, type);
           setMedia(p => [...p, saved]);
           notify("Arquivo anexado.", "success");
       } catch (error) {
           notify("Erro ao processar arquivo.", "error");
       }
    }
  };

  const handleSave = async () => {
    if(!employee || !desc) { notify("Preencha funcionário e descrição.", "error"); return; }
    await db.addImprovement({
      id: crypto.randomUUID(),
      createdAt: timestamp,
      employee,
      sector,
      description: desc,
      media
    });
    notify("Melhoria salva com sucesso!", "success");
    navigate('/improvements/list');
  };

  return (
    <Layout>
      <Header title="Criar Melhoria" targetRoute="/improvements" />
      
      <div className="bg-green-50 p-2 text-center border-b border-green-100 flex items-center justify-center gap-2 text-green-800 text-xs font-bold sticky top-16 z-20">
          <Clock size={14} />
          Data: {new Date(timestamp).toLocaleString('pt-BR')} (Fixo)
      </div>

      <div className="flex-1 bg-white p-6 space-y-5 overflow-y-auto pb-10">
          <div>
            <FieldLabel label="Funcionário" />
            <select value={employee} onChange={e => setEmployee(e.target.value)} className="w-full p-4 border border-gray-200 rounded-xl bg-gray-50 font-bold text-gray-700">
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
            <FieldLabel label="O que foi feito?" />
            <div className="relative">
                <textarea value={desc} onChange={e => setDesc(e.target.value)} className="w-full p-3 pr-12 border-2 border-gray-200 rounded-lg h-24" placeholder="Descreva..." />
                <div className="absolute bottom-2 right-2"><MicrophoneButton onResult={t => appendText(setDesc, t)} /></div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
            <FieldLabel label="Evidências" />
            <div className="grid grid-cols-2 gap-2 mb-4">
                <label className="bg-blue-50 border-2 border-blue-100 rounded-xl flex flex-col items-center justify-center h-20 active:scale-95 transition-transform shadow-sm cursor-pointer hover:bg-blue-100">
                    <Camera size={24} className="text-blue-600 mb-1"/>
                    <span className="text-[10px] font-bold text-blue-800">FOTO</span>
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => handleMedia(e, 'photo')} disabled={media.length >= 5}/>
                </label>
                <label className="bg-purple-50 border-2 border-purple-100 rounded-xl flex flex-col items-center justify-center h-20 active:scale-95 transition-transform shadow-sm cursor-pointer hover:bg-purple-100">
                    <Video size={24} className="text-purple-600 mb-1"/>
                    <span className="text-[10px] font-bold text-purple-800">VÍDEO</span>
                    <input type="file" accept="video/*" capture="environment" className="hidden" onChange={e => handleMedia(e, 'video')} disabled={media.length >= 5}/>
                </label>
                <label className="bg-blue-50 border-2 border-blue-100 rounded-xl flex flex-col items-center justify-center h-20 active:scale-95 transition-transform shadow-sm cursor-pointer hover:bg-blue-100">
                    <ImageIcon size={24} className="text-blue-600 mb-1"/>
                    <span className="text-[10px] font-bold text-blue-800">GALERIA</span>
                    <input type="file" accept="image/*,video/*" className="hidden" onChange={handleGalleryPick} disabled={media.length >= 5}/>
                </label>
                <label className="bg-orange-50 border-2 border-orange-100 rounded-xl flex flex-col items-center justify-center h-20 active:scale-95 transition-transform shadow-sm cursor-pointer hover:bg-orange-100">
                    <Paperclip size={24} className="text-orange-600 mb-1"/>
                    <span className="text-[10px] font-bold text-orange-800 text-center leading-tight">DOCS<br/>Word/PPT/PDF</span>
                    <input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx" className="hidden" onChange={e => handleMedia(e, 'doc')} disabled={media.length >= 5}/>
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
                        <span className="flex-1 truncate text-xs font-medium">{m.name || m.type}</span>
                        <button onClick={() => setMedia(p => p.filter(x => x.id !== m.id))} className="text-red-500 p-1"><Trash2 size={16}/></button>
                    </div>
                ))}
            </div>
          </div>

          <button onClick={handleSave} className="w-full bg-green-600 text-white py-4 rounded-xl font-black text-xl shadow-lg mt-4 flex items-center justify-center gap-2">
            <Save /> SALVAR MELHORIA
          </button>
      </div>
    </Layout>
  );
};
