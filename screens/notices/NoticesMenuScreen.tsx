import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BellRing, Megaphone, MessageSquarePlus, Paperclip } from 'lucide-react';
import { Layout } from '../../components/Layout';
import { Header } from '../../components/Header';
import { db } from '../../services/db.service';
import { localdb } from '../../services/localdb';
import { noticePreview } from '../../utils/notices';

export const NoticesMenuScreen: React.FC = () => {
  const navigate = useNavigate();
  const [noticeCount, setNoticeCount] = useState(0);
  const [latestMessage, setLatestMessage] = useState('Nenhum comunicado publicado ainda.');

  useEffect(() => {
    let active = true;
    const load = async () => {
      const notices = await db.getNotices();
      if (!active) return;
      const sorted = [...notices].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setNoticeCount(sorted.length);
      setLatestMessage(sorted[0] ? noticePreview(sorted[0].content, 88) : 'Nenhum comunicado publicado ainda.');
    };
    void load();
    const unsubscribe = localdb.subscribe('notices', () => { void load(); });
    return () => { active = false; unsubscribe?.(); };
  }, []);

  const addNotice = () => navigate('/notices/add', { state: { fixedTimestamp: new Date().toISOString() } });

  return (
    <Layout className="bg-[#f4f0e7]">
      <Header title="Comunicados" targetRoute="/" />

      <main className="flex-1 overflow-y-auto px-4 pb-9 pt-4">
        <section className="rounded-2xl bg-[#173f32] p-5 text-white shadow-sm">
          <div className="flex items-center gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#c9b77d] text-[#173f32]">
              <Megaphone size={22} />
            </span>
            <div>
              <h1 className="campo-display text-2xl">Mural da equipe</h1>
              <p className="mt-1 text-xs font-semibold text-white/65">Avisos e orientações da Campo Legado.</p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-3 text-xs font-semibold text-white/65">
            <BellRing size={16} className="shrink-0 text-[#caddb3]" />
            Comunicados ficam disponíveis no aparelho mesmo sem internet.
          </div>
        </section>

        <button
          type="button"
          onClick={addNotice}
          className="campo-reveal mt-4 flex w-full items-center gap-4 rounded-[22px] border border-[#9eb78f] bg-[#3f7457] p-4 text-left text-white shadow-[0_12px_26px_rgba(45,95,67,0.2)] transition active:scale-[0.985]"
          style={{ animationDelay: '90ms' }}
        >
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/10 p-3">
            <MessageSquarePlus size={25} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-white/60">Publicar</span>
            <span className="campo-display mt-1 block text-2xl">Novo comunicado</span>
          </span>
          <ArrowRight size={21} className="shrink-0 text-white/65" />
        </button>

        <button
          type="button"
          onClick={() => navigate('/notices/list')}
          className="campo-reveal mt-3 w-full overflow-hidden rounded-[22px] border border-[#d8d0c2] bg-white text-left shadow-[0_10px_24px_rgba(45,63,54,0.1)] transition active:scale-[0.985]"
          style={{ animationDelay: '170ms' }}
        >
          <div className="flex items-center gap-4 p-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#e5ecdf] p-3 text-[#315f45]">
              <BellRing size={24} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="campo-display text-2xl text-[#173f32]">Ver mural</span>
                <span className="rounded-full bg-[#173f32] px-2 py-0.5 text-[10px] font-black text-white">{noticeCount}</span>
              </span>
              <span className="mt-1 block truncate text-xs font-semibold text-[#718078]">{latestMessage}</span>
            </span>
            <ArrowRight size={21} className="shrink-0 text-[#718078]" />
          </div>
          <div className="flex items-center gap-2 border-t border-[#ece6db] bg-[#faf8f3] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.1em] text-[#65746c]">
            <Paperclip size={13} /> Mensagens, fotos, vídeos e documentos
          </div>
        </button>
      </main>
    </Layout>
  );
};
