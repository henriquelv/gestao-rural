
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Camera, Image as ImageIcon, X, Save, Sparkles, Video, Play, Clock, Trash2, FileText, Paperclip } from 'lucide-react';
import { Layout } from '../components/Layout';
import { Header } from '../components/Header';
import { MicrophoneButton } from '../components/MicrophoneButton';
import { FieldLabel } from '../components/FieldLabel';
import { Anomaly, MediaItem, Employee } from '../types';
import { db } from '../services/db.service';
import { notify } from '../services/notification.service';
import { GoogleGenAI } from "@google/genai";
import { validateFileSize } from '../utils/media-compression';
import { SECTORS_LIST, getSectorColors } from '../constants/sectors';
import { mediaService } from '../services/media.service';
import { syncService } from '../services/sync.service';

export const AddAnomalyScreen: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { fixedTimestamp: string } | null;
  const [timestamp] = useState<string>(state?.fixedTimestamp || new Date().toISOString());

  const [employees, setEmployees] = useState<Employee[]>([]);

  const [responsible, setResponsible] = useState<string>(''); 
  const [sector, setSector] = useState<string>('');
  const [description, setDescription] = useState('');
  const [immediateSolution, setImmediateSolution] = useState('');
  const [media, setMedia] = useState<MediaItem[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

  useEffect(() => {
    const loadLists = async () => {
        const emps = await db.getEmployees();
        emps.sort((a, b) => a.name.localeCompare(b.name));
        setEmployees(emps);
        if(SECTORS_LIST.length > 0 && !sector) setSector(SECTORS_LIST[0]);
    };
    loadLists();
  }, []);

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const res = reader.result as string;
        if (!res) return reject(new Error('Falha ao ler blob'));
        const parts = res.split(',');
        resolve(parts.length > 1 ? parts[1] : res);
      };
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(blob);
    });
  };

  const analyzeLatestPhoto = async () => {
    const photo = media.slice().reverse().find(m => m.type === 'photo');
    if (!photo) { notify("Adicione uma foto primeiro.", "error"); return; }
    setAnalyzing(true);
    notify("Analisando imagem com IA...", "info");
    try {
      const blob = await mediaService.readMediaData(photo);
      if (!blob) throw new Error('Não foi possível ler a imagem');
      const base64Data = await blobToBase64(blob);
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts: [{ inlineData: { mimeType: photo.mimeType || 'image/jpeg', data: base64Data } }, { text: 'Descreva este problema agrícola de forma técnica e sugira uma solução imediata curta.' }] }
      });
      if (response.text) {
        setDescription(prev => (prev ? prev + '\n\n' : '') + response.text);
        notify("Análise concluída!", "success");
      }
    } catch (e) { notify("Erro ao analisar imagem.", "error"); } finally { setAnalyzing(false); }
  };

  const handleAppendText = (setter: React.Dispatch<React.SetStateAction<string>>, newText: string) => {
    setter(prev => {
        const spacer = prev.length > 0 && !prev.endsWith(' ') ? ' ' : '';
        return prev + spacer + newText;
    });
  };

  const determineMediaType = (file: File): MediaItem['type'] => {
      if (file.type.startsWith('image/')) return 'photo';
      if (file.type.startsWith('video/')) return 'video';
      if (file.type === 'application/pdf') return 'pdf';
      if (file.name.endsWith('.doc') || file.name.endsWith('.docx')) return 'doc';
      if (file.name.endsWith('.ppt') || file.name.endsWith('.pptx')) return 'ppt';
      return 'doc'; 
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (media.length >= 5) { notify("Limite máximo de 5 arquivos atingido.", "error"); return; }
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const type = determineMediaType(file);

      // Validação de Tamanho Rigorosa para DB JSONB (Máx 5MB)
      // O limite de Payload do Supabase Free é 6MB. Arquivos Base64 crescem 33%.
      // Então 4.5MB arquivo = ~6MB Payload.
      if (!validateFileSize(file, 4)) {
          notify("Arquivo muito grande. Máximo 4MB para envio seguro.", "error");
          return;
      }
      
      try {
          const saved = await mediaService.saveMediaFile(file, type);
          setMedia(prev => [...prev, saved]);
          notify("Arquivo anexado!", "success");

      } catch (error) {
          console.error(error);
          notify("Erro ao processar arquivo.", "error");
      }
    }
  };

  const handleSave = async () => {
    if (!responsible) { notify("Informe o Responsável.", "error"); return; }
    if (!sector) { notify("Selecione o Setor.", "error"); return; }
    if (!description.trim() && media.length === 0) { notify("Descreva o problema ou adicione um anexo.", "error"); return; }

    setLoading(true);
    const newAnomaly: Anomaly = {
      id: crypto.randomUUID(),
      createdAt: timestamp,
      responsible,
      sector,
      description,
      immediateSolution,
      media
    };

    // Verificar limite de 100 anomalias
    try {
      const allAnomalies = await db.getAnomalies();
      if (allAnomalies && allAnomalies.length >= 100) {
        // Deletar a mais antiga
        const oldest = allAnomalies.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
        if (oldest) {
          await db.deleteAnomaly(oldest.id);
        }
      }
    } catch (e) {
      console.error('Erro ao verificar limite de anomalias:', e);
    }

    try {
      await db.addAnomaly(newAnomaly);
      notify("Anomalia registrada com sucesso!", "success");
      // Tentar sincronizar imediatamente e avisar se falhar
      try {
        const res = await syncService.syncAll();
        if (!res.ok) {
          notify('Anomalia salva localmente, mas falha ao enviar (sem rede?).', 'warning');
        }
      } catch (syncErr) {
        console.error('Erro durante sincronização após salvar anomalia:', syncErr);
        notify('Anomalia salva localmente. Sincronização falhou.', 'warning');
      }
      setTimeout(() => navigate('/anomalies/list'), 1000);
    } catch (err) {
      console.error('Erro ao salvar anomalia:', err);
      notify('Erro ao salvar a anomalia. Tente novamente.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <Header title="Nova Anomalia" targetRoute="/anomalies" />
      
      <div className="bg-red-50 p-2 text-center border-b border-red-100 flex items-center justify-center gap-2 text-red-800 text-xs font-bold sticky top-16 z-20">
          <Clock size={14} />
          Data do Registro: {new Date(timestamp).toLocaleString('pt-BR')} (Fixo)
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-50 p-4 space-y-6 pb-10">
        
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <FieldLabel label="Responsável" helpText="Quem está registrando?" />
          <select 
            value={responsible} 
            onChange={(e) => setResponsible(e.target.value)}
            className="w-full p-4 text-lg bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-700 focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
          >
            <option value="">Selecione o funcionário...</option>
            {employees.map(emp => (
                <option key={emp.id} value={emp.name}>{emp.name}</option>
            ))}
          </select>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <FieldLabel label="Setor" helpText="Área da fazenda." />
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

        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 space-y-4">
            <div>
                <div className="flex justify-between items-center">
                    <FieldLabel label="Descrição" helpText="Explique o problema." />
                    {media.some(m => m.type === 'photo') && (
                        <button onClick={analyzeLatestPhoto} disabled={analyzing} className="mb-2 text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded font-bold flex gap-1 items-center">
                            <Sparkles size={12}/> Analisar Foto
                        </button>
                    )}
                </div>
                <div className="relative">
                    <textarea 
                        className="w-full p-3 pr-12 text-base border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none h-28 resize-none"
                        placeholder="Ex: Cerca caída no pasto..."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                    />
                    <div className="absolute bottom-2 right-2 z-10">
                        <MicrophoneButton onResult={(text) => handleAppendText(setDescription, text)} />
                    </div>
                </div>
            </div>
            
            <div>
                <FieldLabel label="Solução Imediata" />
                <div className="relative">
                    <input 
                        type="text"
                        className="w-full p-3 pr-12 text-base border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                        placeholder="Ex: Amarrei com arame"
                        value={immediateSolution}
                        onChange={(e) => setImmediateSolution(e.target.value)}
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 z-10">
                        <MicrophoneButton onResult={(text) => handleAppendText(setImmediateSolution, text)} />
                    </div>
                </div>
            </div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
            <FieldLabel label={`Evidências & Arquivos (${media.length}/5)`} helpText="Fotos, Vídeos, PDFs, Word ou PPT." />
            <div className="grid grid-cols-2 gap-2 mb-4">
                <label className="bg-blue-50 border-2 border-blue-100 rounded-xl flex flex-col items-center justify-center h-20 active:scale-95 transition-transform shadow-sm cursor-pointer hover:bg-blue-100">
                    <Camera size={24} className="text-blue-600 mb-1"/>
                    <span className="text-[10px] font-bold text-blue-800">FOTO</span>
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileSelect} disabled={media.length >= 5} />
                </label>
                <label className="bg-purple-50 border-2 border-purple-100 rounded-xl flex flex-col items-center justify-center h-20 active:scale-95 transition-transform shadow-sm cursor-pointer hover:bg-purple-100">
                    <Video size={24} className="text-purple-600 mb-1"/>
                    <span className="text-[10px] font-bold text-purple-800">VÍDEO</span>
                    <input type="file" accept="video/*" capture="environment" className="hidden" onChange={handleFileSelect} disabled={media.length >= 5} />
                </label>
                <label className="bg-blue-50 border-2 border-blue-100 rounded-xl flex flex-col items-center justify-center h-20 active:scale-95 transition-transform shadow-sm cursor-pointer hover:bg-blue-100">
                    <ImageIcon size={24} className="text-blue-600 mb-1"/>
                    <span className="text-[10px] font-bold text-blue-800">GALERIA</span>
                    <input type="file" accept="image/*,video/*" className="hidden" onChange={handleFileSelect} disabled={media.length >= 5} />
                </label>
                <label className="bg-orange-50 border-2 border-orange-100 rounded-xl flex flex-col items-center justify-center h-20 active:scale-95 transition-transform shadow-sm cursor-pointer hover:bg-orange-100">
                    <Paperclip size={24} className="text-orange-600 mb-1"/>
                    <span className="text-[10px] font-bold text-orange-800 text-center leading-tight">DOCS<br/>Word/PPT/PDF</span>
                    <input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx" className="hidden" onChange={handleFileSelect} disabled={media.length >= 5} />
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
                        
                        <span className="flex-1 text-xs truncate font-medium">{m.name || 'Arquivo sem nome'}</span>
                        <button onClick={() => setMedia(prev => prev.filter(i => i.id !== m.id))} className="text-red-500 p-1"><Trash2 size={16} /></button>
                    </div>
                ))}
            </div>
        </div>

        <button 
          onClick={handleSave} 
          disabled={loading || analyzing} 
          className="w-full bg-green-600 active:bg-green-700 text-white h-14 rounded-xl text-xl font-black uppercase shadow-lg flex items-center justify-center transition-colors hover:bg-green-700 mt-4"
        >
          {loading ? 'Salvando...' : <><Save className="mr-2" size={24} /> SALVAR</>}
        </button>

      </div>
    </Layout>
  );
};
