import React, { useEffect, useState } from 'react';
import { ArrowLeft, Download, FileSignature, Loader2, MapPin, Share2 } from 'lucide-react';
import { Anomaly } from '../types';
import { notify } from '../services/notification.service';
import { workOrderPdfService } from '../services/work-order-pdf.service';
import { workOrderKmUnitValue, workOrderProjectValue, workOrderTotal } from '../utils/work-orders';

interface WorkOrderReceiptPreviewProps {
  item: Anomaly;
  signatureUrl?: string;
  onClose: () => void;
}

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const serviceDate = (item: Anomaly) => {
  const value = item.serviceDate || item.createdAt.slice(0, 10);
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
};

const ReceiptField: React.FC<{ label: string; value: React.ReactNode; wide?: boolean; dark?: boolean }> = ({ label, value, wide, dark }) => (
  <div className={`${wide ? 'col-span-2' : ''} rounded-xl border px-3.5 py-3 ${dark ? 'border-[#173f32] bg-[#173f32] text-white' : 'border-[#d9ded5] bg-[#fafbf8] text-[#173f32]'}`}>
    <p className={`text-[9px] font-black uppercase tracking-[0.11em] ${dark ? 'text-white/55' : 'text-[#718078]'}`}>{label}</p>
    <div className="mt-1.5 text-sm font-black leading-5">{value}</div>
  </div>
);

export const WorkOrderReceiptPreview: React.FC<WorkOrderReceiptPreviewProps> = ({ item, signatureUrl, onClose }) => {
  const [action, setAction] = useState<'share' | 'download' | null>(null);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const location = item.location
    ? [item.location.address, `${item.location.latitude.toFixed(6)}, ${item.location.longitude.toFixed(6)}`].filter(Boolean).join(' · ')
    : 'Não registrada';

  const sharePdf = async () => {
    setAction('share');
    try {
      const result = await workOrderPdfService.share(item, signatureUrl);
      notify(result === 'shared' ? 'Comprovante pronto para compartilhar.' : 'PDF salvo no aparelho.', 'success');
    } catch (error) {
      if ((error as { name?: string })?.name !== 'AbortError') {
        console.error('Erro ao compartilhar comprovante:', error);
        notify('Não foi possível compartilhar o PDF.', 'error');
      }
    } finally {
      setAction(null);
    }
  };

  const downloadPdf = async () => {
    setAction('download');
    try {
      await workOrderPdfService.download(item, signatureUrl);
      notify('PDF salvo no aparelho.', 'success');
    } catch (error) {
      console.error('Erro ao salvar comprovante:', error);
      notify('Não foi possível gerar o PDF.', 'error');
    } finally {
      setAction(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-center bg-[#e7e3d9]" role="dialog" aria-modal="true" aria-label="Comprovante da Ordem de Serviço">
      <div className="flex h-full w-full max-w-md flex-col bg-[#f4f0e7] shadow-2xl">
        <header className="receipt-controls flex shrink-0 items-center gap-3 border-b border-[#d8d0c2] bg-[#f8f4eb] px-4 py-3" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
          <button type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#d8d0c2] bg-white text-[#173f32]" aria-label="Voltar aos detalhes da OS">
            <ArrowLeft size={22} strokeWidth={2.4} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#718078]">Visualização</p>
            <h1 className="campo-display truncate text-xl text-[#173f32]">Comprovante da OS</h1>
          </div>
          <button type="button" onClick={() => void sharePdf()} disabled={action !== null} className="flex h-11 items-center gap-2 rounded-xl bg-[#173f32] px-3.5 text-xs font-black uppercase text-white disabled:opacity-60">
            {action === 'share' ? <Loader2 className="animate-spin" size={18} /> : <Share2 size={18} />} Compartilhar
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-3">
          <article className="work-order-receipt mx-auto min-h-full rounded-2xl bg-white px-5 py-6 text-[#173f32] shadow-sm">
            <div className="flex items-start justify-between gap-4 border-b-[3px] border-[#173f32] pb-4">
              <div>
                <p className="campo-display text-2xl">Campo Legado</p>
                <p className="mt-1 text-[9px] font-black uppercase tracking-[0.14em] text-[#718078]">Gestão Rural</p>
              </div>
              <p className="text-right font-mono text-[9px] font-bold uppercase leading-4 text-[#718078]">Ordem de Serviço<br />{item.id.slice(0, 8).toUpperCase()}</p>
            </div>

            <div className="py-5">
              <span className="rounded-full bg-[#e4eee0] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-[#315f45]">{item.serviceOrderType === 'despesa' ? 'OS Despesa' : 'OS Receita'}</span>
              <h2 className="campo-display mt-3 text-2xl leading-tight">{item.clientName || 'Cliente não informado'}</h2>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <ReceiptField label="Data" value={serviceDate(item)} />
              <ReceiptField label="Técnico" value={item.responsible || '-'} />
              {item.serviceOrderType === 'receita' ? (
                <>
                  <ReceiptField label="Valor do projeto" value={money.format(workOrderProjectValue(item))} />
                  <ReceiptField label="Recebimento" value={item.paymentStatus === 'recebido' ? 'Recebido' : 'A receber'} />
                </>
              ) : (
                <>
                  <ReceiptField label="Valor da visita" value={money.format(item.visitValue || 0)} />
                  <ReceiptField label="KM rodados" value={`${(item.kmQuantity || 0).toLocaleString('pt-BR')} km`} />
                  <ReceiptField label="Valor total do deslocamento" value={money.format(item.kmValue || 0)} />
                  <ReceiptField label="Valor médio por KM" value={`${money.format(workOrderKmUnitValue(item))} / km`} wide />
                  {(item.additionalExpenseValue || 0) > 0 && (
                    <ReceiptField
                      label="Outros valores a receber"
                      value={`${money.format(item.additionalExpenseValue || 0)}${item.additionalExpenseDescription ? ` — ${item.additionalExpenseDescription}` : ''}`}
                      wide
                    />
                  )}
                  <ReceiptField label="Total da despesa" value={money.format(workOrderTotal(item))} wide dark />
                </>
              )}
              <ReceiptField label="Localização" value={<span className="flex items-start gap-1.5"><MapPin size={15} className="mt-0.5 shrink-0" /> {location}</span>} wide />
            </div>

            {item.description && (
              <section className="mt-5">
                <h3 className="campo-display text-lg">Observações</h3>
                <p className="mt-2 whitespace-pre-wrap border-l-[3px] border-[#9aaf8e] bg-[#f5f7f2] p-3 text-xs leading-5 text-[#42564c]">{item.description}</p>
              </section>
            )}

            <section className="mt-6">
              <h3 className="campo-display flex items-center gap-2 text-lg"><FileSignature size={19} /> Assinatura do cliente</h3>
              <div className="mt-3 rounded-xl border border-[#d9ded5] bg-[#fafbf8] p-4 text-center">
                {signatureUrl ? (
                  <>
                    <img src={signatureUrl} alt="Assinatura do cliente" className="h-28 w-full object-contain" />
                    <div className="mx-auto mt-1 w-4/5 border-t border-[#718078]" />
                    <p className="mt-2 text-xs font-black">{item.clientName || 'Cliente'}</p>
                  </>
                ) : (
                  <div className="py-8 text-xs font-bold text-[#718078]">Esta OS foi salva sem assinatura.</div>
                )}
              </div>
            </section>

            <p className="mt-7 border-t border-[#d9ded5] pt-3 text-center text-[9px] font-semibold text-[#718078]">Comprovante gerado pelo aplicativo Campo Legado Consultoria.</p>
          </article>
        </div>

        <footer className="receipt-controls grid shrink-0 grid-cols-2 gap-2 border-t border-[#d8d0c2] bg-[#f8f4eb] p-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          <button type="button" onClick={onClose} className="min-h-12 rounded-xl border border-[#d8d0c2] bg-white text-sm font-black text-[#173f32]">Voltar para a OS</button>
          <button type="button" onClick={() => void downloadPdf()} disabled={action !== null} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#173f32] text-sm font-black text-white disabled:opacity-60">
            {action === 'download' ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />} Salvar PDF
          </button>
        </footer>
      </div>
    </div>
  );
};
