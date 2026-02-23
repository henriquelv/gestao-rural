import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { User, MapPin, Clock, FileText, CheckCircle, ZoomIn, Play, X, Volume2, Download, Presentation, Eye, Check } from 'lucide-react';
import { Layout } from '../components/Layout';
import { Header } from '../components/Header';
import { Anomaly, MediaItem } from '../types';
import { db } from '../services/db.service';
import { localdb } from '../services/localdb';
import { notify } from '../services/notification.service';
import { ai, Modality } from "../services/ai";
import { mediaService } from '../services/media.service';
import { useImageZoom } from '../utils/useImageZoom';

export const AnomalyDetailScreen: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [anomaly, setAnomaly] = useState<Anomaly | null>(null);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [employees, setEmployees] = useState<{id:string, name:string}[]>([]);
  
  const [lightboxMedia, setLightboxMedia] = useState<MediaItem | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string>('');
  const [lightboxZoom, setLightboxZoom] = useState(1);
  const [isPlayingTTS, setIsPlayingTTS] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolvedByName, setResolvedByName] = useState('');
  const audioContextRef = useRef<AudioContext | null>(null);

  // Gestos de zoom para lightbox
  const lightboxZoomGestures = useImageZoom((newZoom) => setLightboxZoom(newZoom));

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!id) return;
      const a = await db.getAnomalyById(id);
      if (a && mounted) setAnomaly(a);
      
      // Carregar lista de funcionários
      const emps = await db.getEmployees();
      emps.sort((a, b) => a.name.localeCompare(b.name));
      if (mounted) setEmployees(emps);
    };
    load();

    const unsub = localdb.subscribe('anomalies', () => {
      load();
    });

    return () => { mounted = false; unsub && unsub(); if (audioContextRef.current) audioContextRef.current.close(); };
  }, [id]);

  useEffect(() => {
    const run = async () => {
      if (!anomaly?.media?.length) {
        setMediaUrls({});
        return;
      }

      const entries = await Promise.all(
        anomaly.media.map(async (m) => {
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
  }, [anomaly?.id]);

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

  const handleSpeak = async () => {
    if (!anomaly || isPlayingTTS) return;
    setIsPlayingTTS(true);
    try {
          const textToSay = `Setor ${anomaly.sector}. Responsável: ${anomaly.responsible}. ${anomaly.description}`;
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: textToSay }] }],
        config: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } },
      });
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
        }
        const ctx = audioContextRef.current;
        const dataInt16 = new Int16Array(bytes.buffer);
        const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
        const channelData = buffer.getChannelData(0);
        for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.onended = () => setIsPlayingTTS(false);
        source.start();
      }
    } catch (e) {
      notify("Usando voz do sistema", "info");
      const utterance = new SpeechSynthesisUtterance(anomaly.description);
      utterance.lang = 'pt-BR';
      utterance.onend = () => setIsPlayingTTS(false);
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleResolveAnomaly = async () => {
    if (!anomaly || !resolvedByName.trim()) {
      notify('Selecione um funcionário responsável.', 'error');
      return;
    }

    try {
      const updatedAnomaly: Anomaly = {
        ...anomaly,
        resolvedAt: new Date().toISOString(),
        resolvedBy: resolvedByName
      };
      
      await db.updateAnomaly(updatedAnomaly);
      
      // Feedback diferente se offline ou online
      if (navigator.onLine) {
        notify('Anomalia marcada como resolvida e sincronizada!', 'success');
      } else {
        notify('Anomalia marcada como resolvida. Será sincronizada quando voltar online.', 'info');
      }
      
      setShowResolveModal(false);
      setResolvedByName('');
      setAnomaly(updatedAnomaly);
    } catch (e) {
      notify('Erro ao resolver anomalia.', 'error');
    }
  };

  if (!anomaly) return <Layout><div className="p-10 text-center">Carregando...</div></Layout>;

  // Separate visual media from documents
  const visualMedia = anomaly.media.filter(m => m.type === 'photo' || m.type === 'video');
  const docMedia = anomaly.media.filter(m => ['pdf', 'doc', 'ppt'].includes(m.type));
  const mediaUrl = (m: MediaItem) => {
    const cached = m.id ? (mediaUrls[m.id] || '') : '';
    return cached || m.remoteUrl || m.uri || '';
  };
  const bestFallbackUrl = (m: MediaItem) => {
    const cached = m.id ? (mediaUrls[m.id] || '') : '';
    return cached || m.remoteUrl || m.uri || '';
  };

  return (
    <Layout>
      <Header title="Detalhes" targetRoute="/anomalies/list" />
      <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-gray-50 pb-24">
        
        {/* Status de Resolução */}
        {anomaly.resolvedAt && (
          <div className="bg-green-50 p-5 rounded-xl shadow-sm border-2 border-green-300">
            <div className="flex items-center gap-3 mb-2">
              <Check size={24} className="text-green-600 flex-shrink-0" />
              <h3 className="text-lg font-bold text-green-800">Anomalia Resolvida</h3>
            </div>
            <p className="text-sm text-green-700 ml-9">
              Por: <span className="font-bold">{anomaly.resolvedBy}</span><br/>
              Em: {new Date(anomaly.resolvedAt).toLocaleString('pt-BR')}
            </p>
          </div>
        )}
        
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 space-y-4">
          <div className="flex items-center text-gray-500 font-medium">
            <Clock size={20} className="mr-3 text-blue-500" />
            <div className="flex flex-col"><span className="text-xs uppercase font-bold text-gray-400">Data</span><span className="text-lg text-gray-900">{new Date(anomaly.createdAt).toLocaleString('pt-BR')}</span></div>
          </div>
          <div className="flex items-center text-gray-500 font-medium border-t border-gray-100 pt-3">
            <MapPin size={20} className="mr-3 text-blue-500" />
            <div className="flex flex-col"><span className="text-xs uppercase font-bold text-gray-400">Setor</span><span className="text-lg text-gray-900">{anomaly.sector}</span></div>
          </div>
          <div className="flex items-center text-gray-500 font-medium border-t border-gray-100 pt-3">
            <User size={20} className="mr-3 text-blue-500" />
            <div className="flex flex-col"><span className="text-xs uppercase font-bold text-gray-400">Responsável</span><span className="text-lg text-gray-900">{anomaly.responsible}</span></div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 relative">
          <div className="flex justify-between items-center mb-3">
            <h3 className="flex items-center text-lg font-bold text-gray-800"><FileText className="mr-2 text-gray-400" /> Descrição</h3>
            <button onClick={handleSpeak} disabled={isPlayingTTS} className={`p-2 rounded-full transition-all ${isPlayingTTS ? 'bg-green-100 text-green-600 animate-pulse' : 'bg-gray-100 text-gray-600'}`}><Volume2 size={24} /></button>
          </div>
          <p className="text-gray-800 text-lg leading-relaxed whitespace-pre-wrap">{anomaly.description}</p>
        </div>

        {anomaly.immediateSolution && (
          <div className="bg-green-50 p-5 rounded-xl shadow-sm border border-green-200">
            <h3 className="flex items-center text-lg font-bold text-green-800 mb-3"><CheckCircle className="mr-2 text-green-600" /> Solução Imediata</h3>
            <p className="text-green-900 text-lg leading-relaxed whitespace-pre-wrap">{anomaly.immediateSolution}</p>
          </div>
        )}

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
                            {m.type === 'pdf' ? <Eye size={20} className="text-blue-500"/> : <Download size={20} className="text-gray-400"/>}
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* Botão de Resolver */}
        {!anomaly.resolvedAt && (
          <button
            onClick={() => setShowResolveModal(true)}
            className="w-full py-4 bg-green-600 text-white font-bold text-lg rounded-xl shadow-lg flex items-center justify-center gap-2 hover:bg-green-700 active:bg-green-800 transition-colors sticky bottom-4"
          >
            <Check size={24} />
            MARCAR COMO RESOLVIDA
          </button>
        )}
      </div>

      {/* Modal de Resolução */}
      {showResolveModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center animate-in fade-in">
          <div className="bg-white w-full max-w-md p-6 rounded-t-2xl sm:rounded-xl shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-gray-800">Resolver Anomalia</h2>
              <button onClick={() => setShowResolveModal(false)} className="p-2 bg-gray-100 rounded-full"><X size={24} /></button>
            </div>

            <div className="space-y-6 pb-6">
              <div>
                <label className="block text-sm font-bold text-gray-600 mb-3 uppercase">Funcionário Responsável *</label>
                <select
                  value={resolvedByName}
                  onChange={(e) => setResolvedByName(e.target.value)}
                  className="w-full p-3 border-2 border-gray-200 rounded-lg bg-white font-bold text-gray-700 focus:border-blue-600 focus:outline-none"
                >
                  <option value="">Selecione um funcionário...</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.name}>{emp.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowResolveModal(false)}
                className="flex-1 py-4 text-gray-600 font-bold text-lg bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleResolveAnomaly}
                disabled={!resolvedByName.trim()}
                className="flex-1 py-4 text-white font-bold text-lg bg-green-600 rounded-xl hover:bg-green-700 disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {lightboxMedia && (
        <div className="fixed inset-0 z-[60] bg-black flex flex-col justify-center items-center animate-in fade-in duration-200">
          <div className="absolute top-0 left-0 w-full h-16 bg-black/50 flex justify-between items-center px-4 z-50">
             <span className="text-white font-bold">Visualizador</span>
             <div className="flex items-center gap-2">
               {lightboxMedia.type === 'photo' && (
                 <div className="flex items-center gap-2">
                   <button
                     onClick={() => setLightboxZoom(Math.max(1, lightboxZoom - 0.25))}
                     className="text-white p-2 bg-white/10 rounded-full hover:bg-white/20"
                   >
                     −
                   </button>
                   <span className="text-white text-sm font-bold w-12 text-center">{Math.round(lightboxZoom * 100)}%</span>
                   <button
                     onClick={() => setLightboxZoom(Math.min(3, lightboxZoom + 0.25))}
                     className="text-white p-2 bg-white/10 rounded-full hover:bg-white/20"
                   >
                     +
                   </button>
                 </div>
               )}
               <button onClick={() => { setLightboxMedia(null); setLightboxUrl(''); setLightboxZoom(1); }} className="text-white p-2 bg-white/10 rounded-full hover:bg-white/20"><X size={24} /></button>
             </div>
          </div>
          
          <div className="w-full h-full flex items-center justify-center p-2 overflow-auto">
             {lightboxMedia.type === 'photo' && (
               <img
                 src={lightboxUrl || mediaUrl(lightboxMedia)}
                 className="object-contain select-none touch-none"
                 style={{ transform: `scale(${lightboxZoom})`, maxWidth: '100%', maxHeight: '90vh' }}
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
                     void el.play().catch(() => {});
                   }
                 }}
               />
             )}
             {(lightboxMedia.type === 'pdf' || lightboxMedia.type === 'doc' || lightboxMedia.type === 'ppt') && (
                 <div className="bg-white p-8 rounded-xl text-center">
                     <FileText size={64} className="text-gray-300 mx-auto mb-4"/>
                     <p className="font-bold mb-4">Este arquivo deve ser baixado para acessar.</p>
                     <a href={lightboxUrl || lightboxMedia.uri} download={lightboxMedia.name} className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold">Baixar Arquivo</a>
                 </div>
             )}
          </div>
        </div>
      )}
    </Layout>
  );
};
