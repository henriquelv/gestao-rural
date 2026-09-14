import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { APP_BRAND } from '../constants/app';
import { Anomaly } from '../types';
import { clientSignature, workOrderKmUnitValue, workOrderProjectValue, workOrderTotal } from '../utils/work-orders';
import { mediaService } from './media.service';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const cleanFilePart = (value: string): string => (value || 'cliente')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9_-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 48) || 'cliente';

const formatDate = (item: Anomaly): string => {
  const value = item.serviceDate || item.createdAt.slice(0, 10);
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
};

const blobToDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

const blobToBase64 = async (blob: Blob): Promise<string> => {
  const dataUrl = await blobToDataUrl(blob);
  return dataUrl.split(',')[1] || '';
};

const sourceToDataUrl = async (source?: string): Promise<string> => {
  if (!source) return '';
  if (source.startsWith('data:')) return source;
  try {
    const response = await fetch(source);
    if (!response.ok) return '';
    return await blobToDataUrl(await response.blob());
  } catch {
    return '';
  }
};

const getSignatureDataUrl = async (item: Anomaly, resolvedUrl?: string): Promise<string> => {
  const signature = clientSignature(item);
  if (!signature) return '';

  const direct = await sourceToDataUrl(resolvedUrl);
  if (direct) return direct;

  const localBlob = await mediaService.readMediaData(signature);
  if (localBlob?.type.startsWith('image/')) return blobToDataUrl(localBlob);

  const fallbackUrl = await mediaService.loadMediaUrl(signature);
  return sourceToDataUrl(fallbackUrl);
};

export interface WorkOrderPdfFile {
  blob: Blob;
  file: File;
  fileName: string;
}

export type WorkOrderShareResult = 'shared' | 'downloaded';

export const workOrderPdfService = {
  async create(item: Anomaly, signatureUrl?: string): Promise<WorkOrderPdfFile> {
    const [{ jsPDF }, signatureDataUrl, logoDataUrl] = await Promise.all([
      import('jspdf'),
      getSignatureDataUrl(item, signatureUrl),
      sourceToDataUrl(APP_BRAND.logoUri)
    ]);

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 16;
    const contentWidth = pageWidth - margin * 2;
    const green: [number, number, number] = [23, 63, 50];
    const muted: [number, number, number] = [103, 118, 109];
    const pale: [number, number, number] = [244, 240, 231];

    pdf.setFillColor(...green);
    pdf.rect(0, 0, pageWidth, 36, 'F');
    if (logoDataUrl) {
      try {
        pdf.addImage(logoDataUrl, 'JPEG', margin, 7, 31, 21, undefined, 'FAST');
      } catch {
        // O comprovante continua válido mesmo se a logo local não puder ser lida.
      }
    }
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(17);
    pdf.text('COMPROVANTE DE OS', pageWidth - margin, 14, { align: 'right' });
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`${APP_BRAND.fullName}  |  ${item.id.slice(0, 8).toUpperCase()}`, pageWidth - margin, 21, { align: 'right' });
    pdf.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, pageWidth - margin, 27, { align: 'right' });

    let y = 46;
    const ensureSpace = (height: number) => {
      if (y + height <= pageHeight - 18) return;
      pdf.addPage();
      y = 18;
    };
    const field = (label: string, value: string, height = 18) => {
      ensureSpace(height + 3);
      pdf.setFillColor(...pale);
      pdf.roundedRect(margin, y, contentWidth, height, 2.5, 2.5, 'F');
      pdf.setTextColor(...muted);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.text(label.toUpperCase(), margin + 4, y + 5.5);
      pdf.setTextColor(...green);
      pdf.setFontSize(10.5);
      const lines = pdf.splitTextToSize(value || '-', contentWidth - 8);
      pdf.text(lines.slice(0, Math.max(1, Math.floor((height - 8) / 4.6))), margin + 4, y + 12);
      y += height + 3;
    };

    pdf.setTextColor(...green);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(20);
    const clientLines = pdf.splitTextToSize(item.clientName || 'Cliente não informado', contentWidth);
    pdf.text(clientLines, margin, y);
    y += clientLines.length * 7 + 3;

    pdf.setFontSize(9);
    pdf.setTextColor(...muted);
    pdf.text(`${item.serviceOrderType === 'despesa' ? 'OS DESPESA' : 'OS RECEITA'}  •  ${formatDate(item)}`, margin, y);
    y += 8;

    field('Técnico responsável', item.responsible || '-');

    if (item.serviceOrderType === 'receita') {
      field('Valor do projeto', money.format(workOrderProjectValue(item)));
      field('Situação do recebimento', item.paymentStatus === 'recebido' ? 'Recebido' : 'A receber');
    } else {
      field('Valor da visita', money.format(item.visitValue || 0));
      field('KM rodados', `${(item.kmQuantity || 0).toLocaleString('pt-BR')} km`);
      field('Valor total do deslocamento', money.format(item.kmValue || 0));
      field('Valor médio por KM', `${money.format(workOrderKmUnitValue(item))} / km`);
      if ((item.additionalExpenseValue || 0) > 0) {
        field(
          'Outros valores a receber',
          `${money.format(item.additionalExpenseValue || 0)}${item.additionalExpenseDescription ? ` — ${item.additionalExpenseDescription}` : ''}`
        );
      }
      field('Total da despesa', money.format(workOrderTotal(item)));
    }

    if (item.location) {
      const coordinates = `${item.location.latitude.toFixed(6)}, ${item.location.longitude.toFixed(6)}`;
      const location = [item.location.address, coordinates].filter(Boolean).join(' — ');
      field('Localização da visita', location, item.location.address ? 23 : 18);
    }

    if (item.description) {
      const lines = pdf.splitTextToSize(item.description, contentWidth - 8);
      const height = Math.min(48, Math.max(20, 11 + lines.length * 4.5));
      ensureSpace(height + 3);
      pdf.setDrawColor(209, 219, 203);
      pdf.setFillColor(249, 250, 247);
      pdf.roundedRect(margin, y, contentWidth, height, 2.5, 2.5, 'FD');
      pdf.setTextColor(...muted);
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      pdf.text('OBSERVAÇÕES', margin + 4, y + 5.5);
      pdf.setTextColor(...green);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.text(lines.slice(0, 8), margin + 4, y + 12);
      y += height + 3;
    }

    ensureSpace(58);
    pdf.setTextColor(...green);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text('ASSINATURA DO CLIENTE', margin, y + 4);
    y += 8;
    pdf.setDrawColor(210, 218, 207);
    pdf.setFillColor(250, 251, 248);
    pdf.roundedRect(margin, y, contentWidth, 43, 2.5, 2.5, 'FD');
    if (signatureDataUrl) {
      try {
        pdf.addImage(signatureDataUrl, 'PNG', margin + 22, y + 4, contentWidth - 44, 28, undefined, 'FAST');
      } catch {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(...muted);
        pdf.text('Assinatura registrada no aplicativo.', pageWidth / 2, y + 20, { align: 'center' });
      }
      pdf.setDrawColor(...muted);
      pdf.line(margin + 30, y + 33, pageWidth - margin - 30, y + 33);
      pdf.setTextColor(...green);
      pdf.setFontSize(8);
      pdf.text(item.clientName || 'Cliente', pageWidth / 2, y + 38, { align: 'center' });
    } else {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      pdf.setTextColor(...muted);
      pdf.text('Esta OS foi salva sem assinatura.', pageWidth / 2, y + 22, { align: 'center' });
    }

    const pages = pdf.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
      pdf.setPage(page);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(...muted);
      pdf.text(`Campo Legado Consultoria • página ${page} de ${pages}`, pageWidth / 2, pageHeight - 8, { align: 'center' });
    }

    const blob = pdf.output('blob');
    const datePart = (item.serviceDate || item.createdAt.slice(0, 10)).replace(/-/g, '');
    const fileName = `OS-${datePart}-${cleanFilePart(item.clientName || '')}.pdf`;
    const file = new File([blob], fileName, { type: 'application/pdf', lastModified: Date.now() });
    return { blob, file, fileName };
  },

  async share(item: Anomaly, signatureUrl?: string): Promise<WorkOrderShareResult> {
    const generated = await this.create(item, signatureUrl);
    const shareText = `Comprovante da OS de ${item.clientName || 'cliente'} — ${formatDate(item)}`;

    if (Capacitor.isNativePlatform()) {
      const saved = await Filesystem.writeFile({
        path: `comprovantes/${generated.fileName}`,
        data: await blobToBase64(generated.blob),
        directory: Directory.Cache,
        recursive: true
      });
      await Share.share({
        title: 'Comprovante da Ordem de Serviço',
        text: shareText,
        files: [saved.uri],
        dialogTitle: 'Compartilhar comprovante'
      });
      return 'shared';
    }

    const shareData: ShareData = {
      title: 'Comprovante da Ordem de Serviço',
      text: shareText,
      files: [generated.file]
    };
    if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
      await navigator.share(shareData);
      return 'shared';
    }

    this.downloadGenerated(generated);
    return 'downloaded';
  },

  async download(item: Anomaly, signatureUrl?: string): Promise<void> {
    this.downloadGenerated(await this.create(item, signatureUrl));
  },

  downloadGenerated(generated: WorkOrderPdfFile): void {
    const url = URL.createObjectURL(generated.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = generated.fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
  }
};
