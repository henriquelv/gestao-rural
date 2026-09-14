import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  CalendarDays,
  CircleDollarSign,
  CopyPlus,
  Download,
  ExternalLink,
  FileText,
  FileCheck2,
  Loader2,
  MapPin,
  Paperclip,
  Pencil,
  RefreshCw,
  Trash2,
  UserRound,
  UsersRound
} from 'lucide-react';
import { Header } from '../components/Header';
import { Layout } from '../components/Layout';
import { WorkOrderReceiptPreview } from '../components/WorkOrderReceiptPreview';
import { db } from '../services/db.service';
import { mediaService } from '../services/media.service';
import { farmContextService } from '../services/farm-context.service';
import { notify } from '../services/notification.service';
import { permissionsService } from '../services/permissions.service';
import { localdb } from '../services/localdb';
import { Anomaly } from '../types';
import {
  clientSignature,
  regularWorkOrderMedia,
  workOrderKmUnitValue,
  workOrderProjectValue,
  workOrderTotal
} from '../utils/work-orders';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const formatServiceDate = (item: Anomaly) => {
  const value = item.serviceDate || item.createdAt.slice(0, 10);
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
};

export const AnomalyDetailScreen: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [workOrder, setWorkOrder] = useState<Anomaly | null>(null);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [mediaRefresh, setMediaRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!id) return;
      const item = await db.getAnomalyById(id);
      if (!active) return;
      if (item && !permissionsService.canAccessWorkOrder(item, farmContextService.getContext())) {
        setAccessDenied(true);
        setWorkOrder(null);
        setLoading(false);
        return;
      }
      setAccessDenied(false);
      setWorkOrder(item);
      setLoading(false);
      if (!item?.media?.length) return;
      const resolved = await Promise.all(item.media.map(async (media) => [media.id, await mediaService.loadMediaUrl(media)] as const));
      if (active) setMediaUrls(Object.fromEntries(resolved));
    };
    void load();
    const unsubscribe = localdb.subscribe('anomalies', () => { void load(); });
    return () => { active = false; unsubscribe?.(); };
  }, [id, mediaRefresh]);

  if (loading) {
    return (
      <Layout className="bg-[#f4f0e7]">
        <Header title="Detalhes da OS" targetRoute="/anomalies/list" />
        <div className="flex flex-1 items-center justify-center text-[#3f7457]"><Loader2 className="animate-spin" size={32} /></div>
      </Layout>
    );
  }

  if (!workOrder) {
    return (
      <Layout className="bg-[#f4f0e7]">
        <Header title="Detalhes da OS" targetRoute="/anomalies/list" />
        <div className="flex flex-1 items-center justify-center p-6 text-center font-bold text-[#68746d]">{accessDenied ? 'Esta Ordem de Serviço não pertence ao seu perfil.' : 'Ordem de Serviço não encontrada.'}</div>
      </Layout>
    );
  }

  const mapUrl = workOrder.location
    ? `https://www.google.com/maps?q=${workOrder.location.latitude},${workOrder.location.longitude}`
    : '';
  const isAdmin = permissionsService.isAdmin(farmContextService.getContext());
  const attachments = regularWorkOrderMedia(workOrder);
  const signature = clientSignature(workOrder);

  const deleteWorkOrder = async () => {
    if (!confirm(`Excluir definitivamente a OS de ${workOrder.clientName || 'cliente não informado'}?`)) return;
    setDeleting(true);
    try {
      await db.deleteAnomaly(workOrder.id);
      notify('Ordem de Serviço excluída.', 'success');
      navigate('/anomalies/list', { replace: true });
    } catch (error) {
      console.error('Erro ao excluir OS:', error);
      notify('Não foi possível excluir a Ordem de Serviço.', 'error');
      setDeleting(false);
    }
  };

  const exportReceipt = () => {
    setShowReceipt(true);
  };

  return (
    <Layout className="bg-[#f4f0e7]">
      <Header title="Detalhes da OS" targetRoute="/anomalies/list" />

      <main className="flex-1 overflow-y-auto px-4 pb-10 pt-4">
        <button type="button" onClick={exportReceipt} className="mb-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-[#3f7457] bg-[#edf4e8] px-4 text-xs font-black uppercase tracking-[0.07em] text-[#173f32] shadow-sm">
          <FileCheck2 size={19} /> {signature ? 'Gerar comprovante assinado' : 'Gerar comprovante da OS'}
        </button>
        <button
          type="button"
          onClick={() => navigate(`/anomalies/clone/${workOrder.id}`)}
          className="mb-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-[#c8a75c] bg-[#f7efda] px-4 text-xs font-black uppercase tracking-[0.07em] text-[#5d4819] shadow-sm transition active:scale-[0.99]"
        >
          <CopyPlus size={19} /> Clonar esta OS
        </button>
        {isAdmin && (
          <section className="mb-4 rounded-2xl border border-[#d8d0c2] bg-[#fbf8f1] p-3 shadow-sm" aria-label="Ações administrativas">
            <p className="mb-2 px-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#718078]">Ações da gestão</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => navigate(`/anomalies/edit/${workOrder.id}`)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#173f32] px-3 text-xs font-black uppercase tracking-wide text-white">
                <Pencil size={17} /> Editar OS
              </button>
              <button type="button" onClick={() => void deleteWorkOrder()} disabled={deleting} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#e0bcb3] bg-[#fbebe5] px-3 text-xs font-black uppercase tracking-wide text-[#8b3e2f] disabled:opacity-50">
                {deleting ? <Loader2 className="animate-spin" size={17} /> : <Trash2 size={17} />} Excluir
              </button>
            </div>
          </section>
        )}

        <section className="overflow-hidden rounded-2xl border border-[#d8d0c2] bg-white shadow-sm">
          <div className="bg-[#173f32] px-5 py-5 text-white">
            <div className="flex items-center justify-between gap-3">
              <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#d9e6ce]">
                {workOrder.serviceOrderType === 'despesa' ? 'OS Despesa' : 'OS Receita'}
              </span>
              <span className="font-mono text-[10px] text-white/60">{workOrder.id.slice(0, 8).toUpperCase()}</span>
            </div>
            <h2 className="campo-display mt-4 text-2xl leading-tight">{workOrder.clientName || 'Cliente não informado'}</h2>
            <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-white/75">
              <CalendarDays size={16} /> {formatServiceDate(workOrder)}
            </p>
          </div>

          <dl className="divide-y divide-[#ebe5da]">
            <div className="flex gap-3 px-4 py-4">
              <UsersRound className="mt-0.5 shrink-0 text-[#3f7457]" size={20} />
              <div>
                <dt className="text-[10px] font-black uppercase tracking-[0.1em] text-[#718078]">Cliente</dt>
                <dd className="mt-1 font-bold text-[#173f32]">{workOrder.clientName || '-'}</dd>
              </div>
            </div>
            <div className="flex gap-3 px-4 py-4">
              <UserRound className="mt-0.5 shrink-0 text-[#3f7457]" size={20} />
              <div>
                <dt className="text-[10px] font-black uppercase tracking-[0.1em] text-[#718078]">Técnico</dt>
                <dd className="mt-1 font-bold text-[#173f32]">{workOrder.responsible || '-'}</dd>
              </div>
            </div>
          </dl>
        </section>

        <section className="mt-4 rounded-2xl border border-[#d8d0c2] bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-[#173f32]">
            <CircleDollarSign size={21} />
            <h2 className="campo-display text-xl">Valores</h2>
          </div>
          {workOrder.serviceOrderType === 'receita' ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-[#edf4e8] p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#5f7668]">Valor do projeto</p>
                <p className="mt-1 text-base font-black text-[#173f32]">{money.format(workOrderProjectValue(workOrder))}</p>
              </div>
              <div className={`rounded-xl p-3 ${workOrder.paymentStatus === 'recebido' ? 'bg-[#e4eee0]' : 'bg-[#f5ecd2]'}`}>
                <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#6f6b61]">Recebimento</p>
                <p className="mt-1 text-base font-black text-[#173f32]">{workOrder.paymentStatus === 'recebido' ? 'Recebido' : 'A receber'}</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-[#edf4e8] p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#5f7668]">Valor da visita</p>
                <p className="mt-1 text-base font-black text-[#173f32]">{money.format(workOrder.visitValue || 0)}</p>
              </div>
              <div className="rounded-xl bg-[#f1ede4] p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#6f6b61]">KM rodados</p>
                <p className="mt-1 text-base font-black text-[#173f32]">{String(workOrder.kmQuantity || 0).replace('.', ',')} KM</p>
              </div>
              <div className="rounded-xl bg-[#edf4e8] p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#5f7668]">Valor total do deslocamento</p>
                <p className="mt-1 text-base font-black text-[#173f32]">{money.format(workOrder.kmValue || 0)}</p>
              </div>
              {(workOrder.additionalExpenseValue || 0) > 0 && (
                <div className="col-span-2 rounded-xl border border-[#ded4bf] bg-[#f7f1e5] p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#756646]">Outros valores a receber</p>
                  <p className="mt-1 text-base font-black text-[#4f452f]">{money.format(workOrder.additionalExpenseValue || 0)}</p>
                  {workOrder.additionalExpenseDescription && (
                    <p className="mt-1 text-xs font-semibold leading-5 text-[#776d5d]">{workOrder.additionalExpenseDescription}</p>
                  )}
                </div>
              )}
              <div className="col-span-2 rounded-xl bg-[#f1ede4] p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#6f6b61]">Valor médio por KM</p>
                <p className="mt-1 text-base font-black text-[#173f32]">{money.format(workOrderKmUnitValue(workOrder))} / km</p>
              </div>
              <div className="col-span-2 rounded-xl bg-[#173f32] p-3 text-white">
                <p className="text-[10px] font-black uppercase tracking-[0.08em] text-white/60">Total da despesa</p>
                <p className="mt-1 text-base font-black">{money.format(workOrderTotal(workOrder))}</p>
              </div>
            </div>
          )}
        </section>

        <section className="mt-4 rounded-2xl border border-[#d8d0c2] bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[#173f32]">
            <MapPin size={21} />
            <h2 className="campo-display text-xl">Localização</h2>
          </div>
          {workOrder.location ? (
            <div className="mt-3">
              {workOrder.location.address && (
                <div className="mb-3 rounded-xl border border-[#d7e1d0] bg-[#edf4e8] p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.1em] text-[#557065]">Endereço aproximado</p>
                  <p className="mt-1 text-sm font-bold leading-5 text-[#173f32]">{workOrder.location.address}</p>
                  <p className="mt-2 text-[10px] font-semibold text-[#68746d]">© OpenStreetMap contributors</p>
                </div>
              )}
              <p className="font-mono text-sm font-bold text-[#33483f]">
                {workOrder.location.latitude.toFixed(6)}, {workOrder.location.longitude.toFixed(6)}
              </p>
              <p className="mt-1 text-xs text-[#68746d]">
                Capturada em {new Date(workOrder.location.capturedAt).toLocaleString('pt-BR')}
                {workOrder.location.accuracy !== undefined ? ` • precisão aproximada de ${Math.round(workOrder.location.accuracy)} m` : ''}
              </p>
              <a
                href={mapUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#edf4e8] px-4 py-3 text-xs font-black uppercase text-[#173f32]"
              >
                <ExternalLink size={16} /> Abrir no mapa
              </a>
            </div>
          ) : (
            <p className="mt-3 text-sm font-semibold text-[#68746d]">Localização não registrada nesta OS.</p>
          )}
        </section>

        {workOrder.description && (
          <section className="mt-4 rounded-2xl border border-[#d8d0c2] bg-white p-4 shadow-sm">
            <h2 className="campo-display text-xl text-[#173f32]">Observações</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#3f5148]">{workOrder.description}</p>
          </section>
        )}

        <section className="mt-4 rounded-2xl border border-[#d8d0c2] bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-[#173f32]">
            <Paperclip size={21} />
            <h2 className="campo-display text-xl">Anexos</h2>
            <span className="ml-auto text-xs font-bold text-[#68746d]">{attachments.length}</span>
          </div>

          {!attachments.length ? (
            <p className="text-sm font-semibold text-[#68746d]">Nenhum anexo nesta OS.</p>
          ) : (
            <div className="space-y-3">
              {attachments.map((media) => {
                const url = mediaUrls[media.id] || '';
                return (
                  <div key={media.id} className="overflow-hidden rounded-xl border border-[#e5ded2] bg-[#faf8f3]">
                    {media.type === 'photo' && url && <img src={url} alt={media.name || 'Foto anexada'} className="max-h-72 w-full object-cover" />}
                    <div className="flex items-center gap-3 p-3">
                      <FileText size={19} className="shrink-0 text-[#3f7457]" />
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#33483f]">{media.name || 'Anexo'}</span>
                      {url && (
                        <a href={url} download={media.name || 'anexo'} target="_blank" rel="noreferrer" className="rounded-lg bg-white p-2 text-[#173f32]" aria-label="Baixar anexo">
                          <Download size={18} />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {signature && (
          <section className="mt-4 rounded-2xl border border-[#d8d0c2] bg-white p-4 shadow-sm">
            <h2 className="campo-display text-xl text-[#173f32]">Assinatura do cliente</h2>
            <div className="mt-3 rounded-xl border border-[#dce5d7] bg-[#f8faf5] p-3">
              {mediaUrls[signature.id] ? (
                <img
                  src={mediaUrls[signature.id]}
                  alt="Assinatura do cliente"
                  className="h-32 w-full object-contain"
                  onError={() => setMediaUrls((current) => ({ ...current, [signature.id]: '' }))}
                />
              ) : (
                <div className="flex min-h-32 flex-col items-center justify-center px-4 text-center">
                  <p className="text-xs font-bold leading-5 text-[#68746d]">A assinatura está registrada, mas a imagem não carregou neste momento.</p>
                  <button type="button" onClick={() => setMediaRefresh((current) => current + 1)} className="mt-3 flex min-h-10 items-center gap-2 rounded-xl border border-[#b9c8b2] bg-white px-4 text-xs font-black text-[#315f45]">
                    <RefreshCw size={15} /> Tentar novamente
                  </button>
                </div>
              )}
            </div>
          </section>
        )}
      </main>
      {showReceipt && (
        <WorkOrderReceiptPreview
          item={workOrder}
          signatureUrl={signature ? mediaUrls[signature.id] || '' : ''}
          onClose={() => setShowReceipt(false)}
        />
      )}
    </Layout>
  );
};
