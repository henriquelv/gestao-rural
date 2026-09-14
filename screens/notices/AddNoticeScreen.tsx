import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  CalendarClock,
  Camera,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Loader2,
  Megaphone,
  Paperclip,
  Trash2,
  UserRound,
  Video
} from 'lucide-react';
import { Layout } from '../../components/Layout';
import { Header } from '../../components/Header';
import { MicrophoneButton } from '../../components/MicrophoneButton';
import { SearchableSelect } from '../../components/SearchableSelect';
import { Employee, MediaItem } from '../../types';
import { db } from '../../services/db.service';
import { notify } from '../../services/notification.service';
import { validateFileSize } from '../../utils/media-compression';
import { mediaService } from '../../services/media.service';
import { farmContextService } from '../../services/farm-context.service';
import { createId } from '../../utils/id';

type AttachmentCategory = 'photo' | 'video' | 'doc' | 'gallery';

const mediaTypeFor = (file: File, category: AttachmentCategory): MediaItem['type'] => {
  if (category === 'photo' || (category === 'gallery' && file.type.startsWith('image/'))) return 'photo';
  if (category === 'video' || (category === 'gallery' && file.type.startsWith('video/'))) return 'video';
  const extension = file.name.toLocaleLowerCase('pt-BR');
  if (file.type === 'application/pdf' || extension.endsWith('.pdf')) return 'pdf';
  if (extension.endsWith('.ppt') || extension.endsWith('.pptx')) return 'ppt';
  return 'doc';
};

const attachmentIcon = (type: MediaItem['type']) => {
  if (type === 'photo') return <ImageIcon size={18} />;
  if (type === 'video') return <Video size={18} />;
  return <FileText size={18} />;
};

export const AddNoticeScreen: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as { fixedTimestamp?: string } | null;
  const [timestamp] = useState(routeState?.fixedTimestamp || new Date().toISOString());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [content, setContent] = useState('');
  const [responsibleId, setResponsibleId] = useState('');
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const records = await db.getEmployees();
      if (!active) return;
      const sorted = [...records].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      const context = farmContextService.getContext();
      let current = sorted.find((employee) => String(employee.id) === String(context?.employee_id))
        || sorted.find((employee) => employee.name === context?.employee_name);
      if (!current && context?.employee_id && context?.employee_name) {
        current = {
          id: String(context.employee_id),
          name: context.employee_name,
          role: context.employee_role || (context.is_admin ? 'Administrador' : 'Técnico'),
          is_admin: context.is_admin === true,
          status: 'active'
        };
        sorted.push(current);
        sorted.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      }
      setEmployees(sorted);
      setResponsibleId(current?.id || '');
    };
    void load();
    return () => { active = false; };
  }, []);

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === responsibleId),
    [employees, responsibleId]
  );

  const appendVoiceText = (text: string) => setContent((current) => current ? `${current} ${text}` : text);

  const addAttachment = async (event: React.ChangeEvent<HTMLInputElement>, category: AttachmentCategory) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (media.length >= 5) return notify('Você pode anexar até 5 arquivos.', 'error');
    if (!validateFileSize(file)) return notify('O arquivo é maior que o limite permitido.', 'error');

    try {
      const saved = await mediaService.saveMediaFile(file, mediaTypeFor(file, category));
      setMedia((current) => [...current, saved]);
      notify('Anexo adicionado.', 'success');
    } catch (error) {
      console.error('Erro ao anexar ao comunicado:', error);
      notify('Não foi possível anexar o arquivo.', 'error');
    }
  };

  const removeAttachment = async (item: MediaItem) => {
    setMedia((current) => current.filter((mediaItem) => mediaItem.id !== item.id));
    await mediaService.deleteMedia(item).catch((error) => console.error('Erro ao remover anexo:', error));
  };

  const saveNotice = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSaving) return;
    if (!content.trim()) return notify('Escreva a mensagem do comunicado.', 'error');
    if (!selectedEmployee) return notify('Selecione o responsável.', 'error');

    setIsSaving(true);
    try {
      const context = farmContextService.getContext();
      await db.addNotice({
        id: createId('notice'),
        createdAt: timestamp,
        content: content.trim(),
        responsible: context?.employee_name || selectedEmployee.name,
        employee_id: context?.employee_id || selectedEmployee.id,
        employee_name: context?.employee_name || selectedEmployee.name,
        media
      });
      notify('Comunicado publicado.', 'success');
      navigate('/notices/list');
    } catch (error) {
      console.error('Erro ao salvar comunicado:', error);
      notify('Não foi possível salvar o comunicado.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Layout className="bg-[#f4f0e7]">
      <Header title="Novo comunicado" targetRoute="/notices" />

      <form onSubmit={saveNotice} className="flex-1 overflow-y-auto px-4 pb-10 pt-4">
        <section className="overflow-hidden rounded-[24px] bg-[#173f32] text-white shadow-[0_14px_30px_rgba(23,63,50,0.18)]">
          <div className="flex items-center gap-3 p-5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#c9b77d] text-[#173f32]"><Megaphone size={22} /></span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.17em] text-[#caddb3]">Publicação no mural</p>
              <h1 className="campo-display mt-1 text-2xl">O que a equipe precisa saber?</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 border-t border-white/10 px-5 py-3 text-xs font-semibold text-white/65">
            <CalendarClock size={15} className="shrink-0" />
            {new Date(timestamp).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })}
          </div>
        </section>

        <section className="mt-4 rounded-[22px] border border-[#d8d0c2] bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-[#173f32]">
            <UserRound size={19} />
            <div><p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#718078]">Autoria</p><h2 className="campo-display text-xl">Responsável</h2></div>
          </div>
          <SearchableSelect
            value={responsibleId}
            onChange={setResponsibleId}
            options={employees.map((employee) => ({ value: employee.id, label: employee.name, description: employee.is_admin ? 'Administrador' : 'Técnico' }))}
            placeholder="Selecione o responsável"
            searchPlaceholder="Buscar funcionário"
            disabled
          />
          <p className="mt-2 text-xs font-semibold text-[#718078]">A autoria é definida pelo perfil conectado.</p>
        </section>

        <section className="mt-4 rounded-[22px] border border-[#d8d0c2] bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div><p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#718078]">Mensagem</p><h2 className="campo-display text-xl text-[#173f32]">Comunicado</h2></div>
            <span className="text-[10px] font-bold text-[#89928d]">{content.length} caracteres</span>
          </div>
          <div className="relative">
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={7}
              maxLength={3000}
              placeholder="Escreva uma orientação, aviso ou informação importante para a equipe…"
              className="w-full resize-none rounded-2xl border-2 border-[#d8d0c2] bg-[#fcfaf6] px-4 pb-14 pt-4 text-base font-semibold leading-6 text-[#263f34] outline-none placeholder:font-medium placeholder:text-[#949b96] focus:border-[#3f7457] focus:ring-2 focus:ring-[#3f7457]/10"
            />
            <div className="absolute bottom-3 right-3 rounded-full border border-[#d8d0c2] bg-white shadow-sm">
              <MicrophoneButton onResult={appendVoiceText} className="h-10 w-10 bg-transparent text-[#3f7457] hover:bg-[#edf4e8]" />
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-[22px] border border-[#d8d0c2] bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#edf2e8] text-[#3f7457]"><Paperclip size={19} /></span>
            <div className="min-w-0 flex-1"><p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#718078]">Opcional</p><h2 className="campo-display text-xl text-[#173f32]">Anexos</h2></div>
            <span className="rounded-full bg-[#f1ede4] px-2.5 py-1 text-[10px] font-black text-[#6a6b64]">{media.length}/5</span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <label className="flex min-h-[78px] cursor-pointer items-center gap-3 rounded-xl border border-[#c6d5bf] bg-[#edf4e8] p-3 text-[#315f45] active:scale-[0.98]">
              <Camera size={21} /><span className="text-xs font-black uppercase tracking-wide">Câmera</span>
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => void addAttachment(event, 'photo')} disabled={media.length >= 5} />
            </label>
            <label className="flex min-h-[78px] cursor-pointer items-center gap-3 rounded-xl border border-[#c8d5df] bg-[#edf3f7] p-3 text-[#31596f] active:scale-[0.98]">
              <ImageIcon size={21} /><span className="text-xs font-black uppercase tracking-wide">Galeria</span>
              <input type="file" accept="image/*,video/*" className="hidden" onChange={(event) => void addAttachment(event, 'gallery')} disabled={media.length >= 5} />
            </label>
            <label className="flex min-h-[78px] cursor-pointer items-center gap-3 rounded-xl border border-[#d8ccb0] bg-[#f7f1df] p-3 text-[#745d25] active:scale-[0.98]">
              <Video size={21} /><span className="text-xs font-black uppercase tracking-wide">Vídeo</span>
              <input type="file" accept="video/*" capture="environment" className="hidden" onChange={(event) => void addAttachment(event, 'video')} disabled={media.length >= 5} />
            </label>
            <label className="flex min-h-[78px] cursor-pointer items-center gap-3 rounded-xl border border-[#dfc9c0] bg-[#f9eee9] p-3 text-[#84503f] active:scale-[0.98]">
              <FileText size={21} /><span className="text-xs font-black uppercase tracking-wide">Documento</span>
              <input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx" className="hidden" onChange={(event) => void addAttachment(event, 'doc')} disabled={media.length >= 5} />
            </label>
          </div>

          {media.length > 0 && (
            <div className="mt-3 space-y-2">
              {media.map((item) => (
                <div key={item.id} className="flex items-center gap-3 rounded-xl border border-[#e4ded3] bg-[#faf8f3] p-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#3f7457]">{attachmentIcon(item.type)}</span>
                  <span className="min-w-0 flex-1 truncate text-xs font-bold text-[#33483f]">{item.name || 'Anexo'}</span>
                  <button type="button" onClick={() => void removeAttachment(item)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#fbebe5] text-[#9f3f2d]" aria-label={`Remover ${item.name || 'anexo'}`}><Trash2 size={17} /></button>
                </div>
              ))}
            </div>
          )}
        </section>

        <button type="submit" disabled={isSaving} className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#173f32] px-5 text-sm font-black uppercase tracking-[0.08em] text-white shadow-[0_12px_24px_rgba(23,63,50,0.2)] transition active:scale-[0.99] disabled:opacity-50">
          {isSaving ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} />}
          {isSaving ? 'Publicando…' : 'Publicar comunicado'}
        </button>
      </form>
    </Layout>
  );
};
