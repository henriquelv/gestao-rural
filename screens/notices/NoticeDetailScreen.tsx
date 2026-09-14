import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  CalendarDays,
  Download,
  FileText,
  Image as ImageIcon,
  Loader2,
  Megaphone,
  Paperclip,
  Play,
  Presentation,
  Trash2,
  UserRound,
  Video,
  X,
  ZoomIn
} from 'lucide-react';
import { Layout } from '../../components/Layout';
import { Header } from '../../components/Header';
import { MediaItem, Notice } from '../../types';
import { db } from '../../services/db.service';
import { localdb } from '../../services/localdb';
import { notify } from '../../services/notification.service';
import { mediaService } from '../../services/media.service';
import { useImageZoom } from '../../utils/useImageZoom';
import { downloadService } from '../../services/download.service';
import { supabase } from '../../services/supabase';
import { cleanNoticeContent, noticeAuthor } from '../../utils/notices';
import { permissionsService } from '../../services/permissions.service';
import { farmContextService } from '../../services/farm-context.service';

const isRemoteHttpUrl = (value: string) => /^https?:\/\//i.test(value)
  && !/localhost|127\.0\.0\.1|capacitor/i.test(value);

export const NoticeDetailScreen: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [lightboxMedia, setLightboxMedia] = useState<MediaItem | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState('');
  const [deleting, setDeleting] = useState(false);
  const lightboxZoomGestures = useImageZoom();

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!id) return;
      const records = await db.getNotices();
      if (!active) return;
      setNotice(records.find((item) => item.id === id) || null);
      setLoading(false);
    };
    void load();
    const unsubscribe = localdb.subscribe('notices', () => { void load(); });
    return () => { active = false; unsubscribe?.(); };
  }, [id]);

  useEffect(() => {
    let active = true;
    const loadMedia = async () => {
      if (!notice?.media?.length) {
        setMediaUrls({});
        return;
      }
      const entries = await Promise.all(notice.media.map(async (item) => {
        try {
          return [item.id, await mediaService.loadMediaUrl(item)] as const;
        } catch {
          return [item.id, item.remoteUrl || item.uri || ''] as const;
        }
      }));
      if (active) setMediaUrls(Object.fromEntries(entries));
    };
    void loadMedia();
    return () => { active = false; };
  }, [notice]);

  const resolveMediaUrl = (item: MediaItem) => mediaUrls[item.id] || item.remoteUrl || item.uri || '';

  const openMedia = async (item: MediaItem) => {
    setLightboxMedia(item);
    const cached = resolveMediaUrl(item);
    if (cached) return setLightboxUrl(cached);
    const loaded = await mediaService.loadMediaUrl(item);
    setLightboxUrl(loaded || item.remoteUrl || item.uri || '');
  };

  const downloadMedia = async (item: MediaItem, fallbackUrl = '') => {
    try {
      let remoteUrl = item.remoteUrl || '';
      if (!remoteUrl && item.remotePath) {
        remoteUrl = supabase.storage.from('media').getPublicUrl(item.remotePath).data?.publicUrl || '';
      }
      if (!remoteUrl && isRemoteHttpUrl(item.uri || '')) remoteUrl = item.uri || '';
      const source = isRemoteHttpUrl(remoteUrl) ? remoteUrl : fallbackUrl || resolveMediaUrl(item);
      if (!source) return notify('Arquivo indisponível neste aparelho.', 'error');
      await downloadService.downloadFile(source, item.name || 'anexo', item.mimeType || '', item.localPath);
    } catch (error) {
      console.error('Erro ao baixar anexo:', error);
      notify('Não foi possível baixar o arquivo.', 'error');
    }
  };

  const deleteNotice = async () => {
    if (!id) return;
    if (!permissionsService.isAdmin(farmContextService.getContext())) return;
    if (!confirm('Excluir definitivamente este comunicado?')) return;
    setDeleting(true);
    try {
      await db.deleteNotice(id);
      notify('Comunicado excluído.', 'success');
      navigate('/notices/list', { replace: true });
    } catch (error) {
      console.error('Erro ao excluir comunicado:', error);
      notify('Não foi possível excluir o comunicado.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <Layout className="bg-[#f4f0e7]">
        <Header title="Comunicado" targetRoute="/notices/list" />
        <div className="flex flex-1 items-center justify-center text-[#3f7457]"><Loader2 size={32} className="animate-spin" /></div>
      </Layout>
    );
  }

  if (!notice) {
    return (
      <Layout className="bg-[#f4f0e7]">
        <Header title="Comunicado" targetRoute="/notices/list" />
        <main className="flex flex-1 items-center justify-center p-6 text-center"><div><Megaphone className="mx-auto text-[#78936c]" size={38} /><p className="mt-3 font-bold text-[#68746d]">Comunicado não encontrado.</p></div></main>
      </Layout>
    );
  }

  const content = cleanNoticeContent(notice.content);
  const author = noticeAuthor(notice.employee_name, notice.responsible);
  const visualMedia = notice.media?.filter((item) => item.type === 'photo' || item.type === 'video') || [];
  const documents = notice.media?.filter((item) => item.type !== 'photo' && item.type !== 'video') || [];
  const isAdmin = permissionsService.isAdmin(farmContextService.getContext());

  return (
    <Layout className="bg-[#f4f0e7]">
      <Header title="Comunicado" targetRoute="/notices/list" />

      <main className="flex-1 overflow-y-auto px-4 pb-10 pt-4">
        <section className="relative overflow-hidden rounded-[26px] bg-[#173f32] p-5 text-white shadow-[0_16px_34px_rgba(23,63,50,0.2)]">
          <div className="pointer-events-none absolute -right-12 -top-14 h-40 w-40 rounded-full border-[26px] border-white/[0.06]" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#caddb3]">Mural da equipe</p>
              <p className="mt-3 flex items-center gap-2 text-sm font-bold text-white/80"><CalendarDays size={16} /> {new Date(notice.createdAt).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })}</p>
            </div>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#c9b77d] text-[#173f32]"><Megaphone size={21} /></span>
          </div>
          <div className="relative mt-5 flex min-w-0 items-center gap-2 border-t border-white/10 pt-4 text-xs font-semibold text-white/65">
            <UserRound size={15} className="shrink-0" /><span className="truncate">Publicado por {author}</span>
          </div>
        </section>

        <article className="mt-4 rounded-[24px] border border-[#d8d0c2] bg-white p-5 shadow-sm">
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#718078]">Mensagem</p>
          <p className="mt-3 whitespace-pre-wrap text-[17px] font-semibold leading-7 text-[#294238]">{content || 'Comunicado sem texto.'}</p>
        </article>

        {visualMedia.length > 0 && (
          <section className="mt-4 rounded-[24px] border border-[#d8d0c2] bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-[#173f32]"><ImageIcon size={20} /><h2 className="campo-display text-xl">Fotos e vídeos</h2><span className="ml-auto text-xs font-black text-[#718078]">{visualMedia.length}</span></div>
            <div className="grid grid-cols-2 gap-2">
              {visualMedia.map((item) => {
                const url = resolveMediaUrl(item);
                return (
                  <button key={item.id} type="button" onClick={() => void openMedia(item)} className="group relative aspect-square overflow-hidden rounded-2xl bg-[#173f32] text-white">
                    {item.type === 'photo' && url ? <img src={url} alt={item.name || 'Foto do comunicado'} className="h-full w-full object-cover" /> : item.type === 'photo' ? <ImageIcon className="m-auto" size={30} /> : <div className="flex h-full w-full items-center justify-center bg-[#112f27]"><Play fill="currentColor" size={34} /></div>}
                    <span className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/55"><ZoomIn size={15} /></span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {documents.length > 0 && (
          <section className="mt-4 rounded-[24px] border border-[#d8d0c2] bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-[#173f32]"><Paperclip size={20} /><h2 className="campo-display text-xl">Documentos</h2><span className="ml-auto text-xs font-black text-[#718078]">{documents.length}</span></div>
            <div className="space-y-2">
              {documents.map((item) => (
                <button key={item.id} type="button" onClick={() => void downloadMedia(item)} className="flex w-full items-center gap-3 rounded-xl border border-[#e4ded3] bg-[#faf8f3] p-3 text-left">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.type === 'ppt' ? 'bg-[#f7eadf] text-[#9a5534]' : item.type === 'pdf' ? 'bg-[#f8e7e3] text-[#a24736]' : 'bg-[#e7eef2] text-[#31596f]'}`}>
                    {item.type === 'ppt' ? <Presentation size={19} /> : <FileText size={19} />}
                  </span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-[#33483f]">{item.name || 'Documento'}</span><span className="mt-0.5 block text-[9px] font-black uppercase tracking-[0.1em] text-[#718078]">{item.type}</span></span>
                  <Download size={18} className="shrink-0 text-[#3f7457]" />
                </button>
              ))}
            </div>
          </section>
        )}

        {!notice.media?.length && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-[#ddd6ca] bg-[#faf8f3] px-4 py-3 text-xs font-semibold text-[#718078]"><Paperclip size={17} /> Este comunicado não possui anexos.</div>
        )}

        {isAdmin && (
          <button type="button" onClick={() => void deleteNotice()} disabled={deleting} className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-[#e0bcb3] bg-[#fbebe5] px-4 text-xs font-black uppercase tracking-[0.08em] text-[#8b3e2f] disabled:opacity-50">
            {deleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />} Excluir comunicado
          </button>
        )}
      </main>

      {lightboxMedia && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-[#081711]/95 backdrop-blur-sm">
          <div className="flex min-h-16 items-center justify-between gap-3 border-b border-white/10 px-4 pt-[env(safe-area-inset-top)] text-white">
            <span className="min-w-0 flex-1 truncate text-sm font-bold">{lightboxMedia.name || 'Anexo do comunicado'}</span>
            <button type="button" onClick={() => { setLightboxMedia(null); setLightboxUrl(''); }} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10" aria-label="Fechar visualizador"><X size={21} /></button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-3">
            {lightboxMedia.type === 'photo' ? (
              <img
                src={lightboxUrl || resolveMediaUrl(lightboxMedia)}
                alt={lightboxMedia.name || 'Foto ampliada'}
                className="max-h-full max-w-full object-contain"
                style={lightboxZoomGestures.imageStyle}
                onTouchStart={lightboxZoomGestures.handleTouchStart}
                onTouchMove={lightboxZoomGestures.handleTouchMove}
                onTouchEnd={lightboxZoomGestures.handleTouchEnd}
              />
            ) : (
              <video src={lightboxUrl || resolveMediaUrl(lightboxMedia)} controls autoPlay playsInline className="max-h-full w-full" />
            )}
          </div>
          <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <button type="button" onClick={() => void downloadMedia(lightboxMedia, lightboxUrl)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white text-xs font-black uppercase tracking-[0.08em] text-[#173f32]"><Download size={18} /> Baixar anexo</button>
          </div>
        </div>
      )}
    </Layout>
  );
};
