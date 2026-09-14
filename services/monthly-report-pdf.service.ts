import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { jsPDF } from 'jspdf';
import { APP_BRAND } from '../constants/app';
import { Anomaly } from '../types';
import { monthLabel, MonthlyReportBreakdown, MonthlyReportSummary, summarizeMonthlyWorkOrders, workOrderDate } from '../utils/monthly-report';
import { workOrderKm, workOrderKmUnitValue, workOrderTotal } from '../utils/work-orders';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const green: [number, number, number] = [23, 63, 50];
const muted: [number, number, number] = [102, 117, 108];
const pale: [number, number, number] = [244, 240, 231];
const lightGreen: [number, number, number] = [229, 236, 223];
const terracotta: [number, number, number] = [159, 80, 57];

const blobToBase64 = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

const sourceToDataUrl = async (source: string): Promise<string> => {
  try {
    const response = await fetch(source);
    if (!response.ok) return '';
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  } catch {
    return '';
  }
};

const safeFilePart = (value: string): string => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9_-]+/g, '-')
  .replace(/^-+|-+$/g, '');

const formatDate = (value: string): string => {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
};

interface PdfFile {
  blob: Blob;
  file: File;
  fileName: string;
}

interface ReportOptions {
  monthKey: string;
  scopeLabel: string;
}

const addMetricCard = (pdf: jsPDF, x: number, y: number, width: number, label: string, value: string, accent: 'green' | 'terracotta' = 'green') => {
  pdf.setFillColor(...(accent === 'green' ? lightGreen : [242, 228, 216] as [number, number, number]));
  pdf.roundedRect(x, y, width, 19, 2.5, 2.5, 'F');
  pdf.setTextColor(...muted);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(6.5);
  pdf.text(label.toUpperCase(), x + 3.5, y + 5.5);
  pdf.setTextColor(...(accent === 'green' ? green : terracotta));
  pdf.setFontSize(12);
  pdf.text(value, x + 3.5, y + 13.5);
};

const reportSummaryLines = (summary: MonthlyReportSummary): string[] => {
  if (!summary.orders.length) {
    return ['Nenhuma Ordem de Serviço foi registrada no período selecionado.'];
  }
  return [
    `${summary.orders.length} Ordem${summary.orders.length === 1 ? '' : 'ns'} de Serviço para ${summary.clients} cliente${summary.clients === 1 ? '' : 's'} no mês.`,
    `${money.format(summary.revenue)} em receitas, ${money.format(summary.expenses)} em despesas e saldo de ${money.format(summary.balance)}.`,
    `${money.format(summary.receivable)} em projetos ainda marcados como a receber.`,
    `${summary.km.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km rodados, com média de ${summary.averageKm.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km por deslocamento.`,
    `${summary.signedOrders} de ${summary.orders.length} OS com assinatura do cliente (${Math.round(summary.signatureRate * 100)}%).`
  ];
};

const previousMonthKey = (monthKey: string): string => {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year || new Date().getFullYear(), (month || 1) - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const variationLabel = (current: number, previous: number): string => {
  if (previous === 0) return current === 0 ? 'sem variação' : 'novo movimento';
  const variation = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(variation) < 0.05) return 'sem variação';
  return `${variation >= 0 ? '+' : ''}${variation.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
};

const drawBreakdownTable = (
  pdf: jsPDF,
  title: string,
  rows: MonthlyReportBreakdown[],
  y: number,
  maxRows = 10
): number => {
  const margin = 16;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const widths = [45, 10, 25, 25, 18, 23, 30];
  const headers = ['Nome', 'OS', 'Receitas', 'Despesas', 'KM', 'Média KM', 'A receber'];

  pdf.setTextColor(...green);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text(title, margin, y);
  y += 5;
  pdf.setFillColor(...green);
  pdf.rect(margin, y, pageWidth - margin * 2, 8, 'F');
  let x = margin;
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(6.5);
  headers.forEach((header, index) => {
    pdf.text(header, x + 2, y + 5);
    x += widths[index];
  });
  y += 8;

  rows.slice(0, maxRows).forEach((row, rowIndex) => {
    pdf.setFillColor(...(rowIndex % 2 === 0 ? [250, 249, 246] as [number, number, number] : pale));
    pdf.rect(margin, y, pageWidth - margin * 2, 8, 'F');
    const values = [
      row.name,
      String(row.orders),
      money.format(row.revenue),
      money.format(row.expenses),
      row.km.toLocaleString('pt-BR', { maximumFractionDigits: 1 }),
      row.averageKm.toLocaleString('pt-BR', { maximumFractionDigits: 1 }),
      money.format(row.receivable)
    ];
    x = margin;
    pdf.setTextColor(...green);
    pdf.setFont('helvetica', rowIndex === 0 ? 'bold' : 'normal');
    pdf.setFontSize(6.4);
    values.forEach((value, index) => {
      const clipped = index === 0
        ? pdf.splitTextToSize(value, widths[index] - 4)[0]
        : value;
      pdf.text(clipped, x + 2, y + 5);
      x += widths[index];
    });
    y += 8;
  });
  if (!rows.length) {
    pdf.setFillColor(...pale);
    pdf.rect(margin, y, pageWidth - margin * 2, 10, 'F');
    pdf.setTextColor(...muted);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.text('Sem registros no período.', margin + 3, y + 6.5);
    y += 10;
  }
  return y + 6;
};

const breakdownTableHeight = (rows: MonthlyReportBreakdown[], maxRows: number): number =>
  19 + (rows.length ? Math.min(rows.length, maxRows) * 8 : 10);

export const monthlyReportPdfService = {
  async create(orders: Anomaly[], options: ReportOptions): Promise<PdfFile> {
    const [{ jsPDF }, logoDataUrl] = await Promise.all([
      import('jspdf'),
      sourceToDataUrl(APP_BRAND.logoUri)
    ]);
    const summary = summarizeMonthlyWorkOrders(orders, options.monthKey);
    const previousSummary = summarizeMonthlyWorkOrders(orders, previousMonthKey(options.monthKey));
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 16;
    const contentWidth = pageWidth - margin * 2;

    pdf.setFillColor(...green);
    pdf.rect(0, 0, pageWidth, 42, 'F');
    if (logoDataUrl) {
      try {
        pdf.addImage(logoDataUrl, 'JPEG', margin, 8, 31, 21, undefined, 'FAST');
      } catch {
        // A identidade textual permanece caso a imagem local esteja indisponível.
      }
    }
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.text('RELATÓRIO MENSAL DE OS', pageWidth - margin, 15, { align: 'right' });
    pdf.setFontSize(11);
    pdf.text(monthLabel(options.monthKey), pageWidth - margin, 23, { align: 'right' });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.text(options.scopeLabel, pageWidth - margin, 30, { align: 'right' });
    pdf.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, pageWidth - margin, 35, { align: 'right' });

    let y = 51;
    pdf.setTextColor(...green);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text('RESUMO EXECUTIVO', margin, y);
    y += 7;
    reportSummaryLines(summary).forEach((line) => {
      pdf.setFillColor(...lightGreen);
      pdf.circle(margin + 2, y - 1.2, 1.2, 'F');
      pdf.setTextColor(...green);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      const wrapped = pdf.splitTextToSize(line, contentWidth - 8);
      pdf.text(wrapped, margin + 6, y);
      y += wrapped.length * 4.3 + 3;
    });

    y += 2;
    const gap = 3;
    const cardWidth = (contentWidth - gap * 2) / 3;
    addMetricCard(pdf, margin, y, cardWidth, 'Ordens de serviço', String(summary.orders.length));
    addMetricCard(pdf, margin + cardWidth + gap, y, cardWidth, 'Clientes atendidos', String(summary.clients));
    addMetricCard(pdf, margin + (cardWidth + gap) * 2, y, cardWidth, 'Valor a receber', money.format(summary.receivable), 'terracotta');
    y += 22;
    addMetricCard(pdf, margin, y, cardWidth, 'Receitas', money.format(summary.revenue));
    addMetricCard(pdf, margin + cardWidth + gap, y, cardWidth, 'Despesas', money.format(summary.expenses), 'terracotta');
    addMetricCard(pdf, margin + (cardWidth + gap) * 2, y, cardWidth, 'Saldo do período', money.format(summary.balance), summary.balance < 0 ? 'terracotta' : 'green');
    y += 22;
    addMetricCard(pdf, margin, y, cardWidth, 'KM registrados', summary.km.toLocaleString('pt-BR', { maximumFractionDigits: 1 }));
    addMetricCard(pdf, margin + cardWidth + gap, y, cardWidth, 'Ticket médio', money.format(summary.averageTicket));
    addMetricCard(pdf, margin + (cardWidth + gap) * 2, y, cardWidth, 'OS assinadas', `${Math.round(summary.signatureRate * 100)}%`);
    y += 28;

    pdf.setTextColor(...green);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text('MOVIMENTO AO LONGO DO MÊS', margin, y);
    y += 7;
    const maxWeek = Math.max(1, ...summary.byWeek.map((week) => week.orders));
    summary.byWeek.forEach((week, index) => {
      const rowY = y + index * 9;
      pdf.setTextColor(...muted);
      pdf.setFontSize(7);
      pdf.text(`Dias ${week.label}`, margin, rowY + 4.5);
      pdf.setFillColor(232, 231, 224);
      pdf.roundedRect(margin + 28, rowY, contentWidth - 43, 6, 2, 2, 'F');
      if (week.orders > 0) {
        pdf.setFillColor(...green);
        pdf.roundedRect(margin + 28, rowY, Math.max(4, ((contentWidth - 43) * week.orders) / maxWeek), 6, 2, 2, 'F');
      }
      pdf.setTextColor(...green);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${week.orders} OS`, pageWidth - margin, rowY + 4.5, { align: 'right' });
    });
    y += summary.byWeek.length * 9 + 5;

    const comparisonHeight = previousSummary.orders.length ? 47 : 24;
    if (y + comparisonHeight > pageHeight - 18) {
      pdf.addPage();
      y = 20;
    }
    pdf.setTextColor(...green);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text('COMPARAÇÃO COM O MÊS ANTERIOR', margin, y);
    y += 7;
    if (!previousSummary.orders.length) {
      pdf.setFillColor(...pale);
      pdf.roundedRect(margin, y, contentWidth, 12, 2, 2, 'F');
      pdf.setTextColor(...muted);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.text(`Não há OS em ${monthLabel(previousSummary.monthKey)} para comparação.`, margin + 4, y + 7.5);
      y += 18;
    } else {
      const comparisons: Array<[string, string, string, number, number]> = [
        ['Ordens de serviço', String(summary.orders.length), String(previousSummary.orders.length), summary.orders.length, previousSummary.orders.length],
        ['Receitas', money.format(summary.revenue), money.format(previousSummary.revenue), summary.revenue, previousSummary.revenue],
        ['Despesas', money.format(summary.expenses), money.format(previousSummary.expenses), summary.expenses, previousSummary.expenses],
        ['KM registrados', number.format(summary.km), number.format(previousSummary.km), summary.km, previousSummary.km]
      ];
      const comparisonGap = 3;
      const comparisonWidth = (contentWidth - comparisonGap) / 2;
      comparisons.forEach(([label, currentValue, previousValue, currentNumber, previousNumber], index) => {
        const x = margin + (index % 2) * (comparisonWidth + comparisonGap);
        const rowY = y + Math.floor(index / 2) * 18;
        pdf.setFillColor(...(index % 2 === 0 ? lightGreen : pale));
        pdf.roundedRect(x, rowY, comparisonWidth, 15, 2, 2, 'F');
        pdf.setTextColor(...muted);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(6.2);
        pdf.text(label.toUpperCase(), x + 3, rowY + 4.5);
        pdf.setTextColor(...green);
        pdf.setFontSize(8.4);
        pdf.text(currentValue, x + 3, rowY + 10.5);
        pdf.setFontSize(6.4);
        pdf.setTextColor(...terracotta);
        pdf.text(variationLabel(currentNumber, previousNumber), x + comparisonWidth - 3, rowY + 5, { align: 'right' });
        pdf.setTextColor(...muted);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`anterior: ${previousValue}`, x + comparisonWidth - 3, rowY + 11, { align: 'right' });
      });
      y += 41;
    }

    const technicianRowsLimit = 20;
    if (y + breakdownTableHeight(summary.byTechnician, technicianRowsLimit) > pageHeight - 18) {
      pdf.addPage();
      y = 20;
    }
    y = drawBreakdownTable(
      pdf,
      'RESULTADOS POR TÉCNICO',
      summary.byTechnician,
      y,
      technicianRowsLimit
    );
    const clientRowsLimit = 10;
    if (y + breakdownTableHeight(summary.byClient, clientRowsLimit) > pageHeight - 18) {
      pdf.addPage();
      y = 20;
    }
    y = drawBreakdownTable(
      pdf,
      'CLIENTES COM MAIS ATENDIMENTOS',
      summary.byClient,
      y,
      clientRowsLimit
    );

    pdf.addPage();
    y = 18;
    pdf.setTextColor(...green);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text('DETALHAMENTO DAS ORDENS DE SERVIÇO', margin, y);
    y += 7;
    pdf.setTextColor(...muted);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.text('Relação completa para conferência dos valores e atendimentos do mês.', margin, y);
    y += 7;

    const detailWidths = [17, 38, 25, 14, 12, 19, 19, 18, 16];
    const detailHeaders = ['Data', 'Cliente', 'Técnico', 'Tipo', 'KM', 'Valor KM', 'Outros', 'Média/KM', 'Total'];
    const drawDetailHeader = () => {
      pdf.setFillColor(...green);
      pdf.rect(margin, y, contentWidth, 8, 'F');
      let x = margin;
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(5.8);
      detailHeaders.forEach((header, index) => {
        pdf.text(header, x + 2, y + 5);
        x += detailWidths[index];
      });
      y += 8;
    };
    drawDetailHeader();

    summary.orders.forEach((item, index) => {
      if (y > pageHeight - 22) {
        pdf.addPage();
        y = 18;
        drawDetailHeader();
      }
      pdf.setFillColor(...(index % 2 === 0 ? [250, 249, 246] as [number, number, number] : pale));
      pdf.rect(margin, y, contentWidth, 10, 'F');
      const values = [
        formatDate(workOrderDate(item)),
        item.clientName || '-',
        item.responsible || '-',
        item.serviceOrderType === 'despesa' ? 'Despesa' : 'Receita',
        item.serviceOrderType === 'despesa'
          ? workOrderKm(item).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
          : '-',
        item.serviceOrderType === 'despesa' ? money.format(item.kmValue || 0) : '-',
        item.serviceOrderType === 'despesa' ? money.format(item.additionalExpenseValue || 0) : '-',
        item.serviceOrderType === 'despesa' ? money.format(workOrderKmUnitValue(item)) : '-',
        money.format(workOrderTotal(item))
      ];
      let x = margin;
      pdf.setTextColor(...green);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(5.7);
      values.forEach((value, valueIndex) => {
        const clipped = pdf.splitTextToSize(value, detailWidths[valueIndex] - 4)[0];
        pdf.text(clipped, x + 2, y + 6);
        x += detailWidths[valueIndex];
      });
      y += 10;
    });
    if (!summary.orders.length) {
      pdf.setFillColor(...pale);
      pdf.rect(margin, y, contentWidth, 14, 'F');
      pdf.setTextColor(...muted);
      pdf.setFontSize(8);
      pdf.text('Nenhuma Ordem de Serviço registrada no mês.', margin + 3, y + 8);
      y += 14;
    }

    if (y > pageHeight - 75) {
      pdf.addPage();
      y = 18;
    } else {
      y += 8;
    }
    pdf.setTextColor(...green);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text('PONTOS PARA ACOMPANHAR', margin, y);
    y += 7;
    const actions: string[] = [];
    if (summary.receivable > 0) actions.push(`Revisar os ${money.format(summary.receivable)} marcados como “a receber”.`);
    if (summary.signedOrders < summary.orders.length) actions.push(`${summary.orders.length - summary.signedOrders} OS sem assinatura; avaliar quando a confirmação do cliente é necessária.`);
    if (summary.averageKm > 0) actions.push(`A média foi de ${summary.averageKm.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km por deslocamento registrado.`);
    if (!actions.length) actions.push('Manter os registros atualizados para permitir comparação consistente entre os meses.');
    actions.forEach((action, index) => {
      pdf.setTextColor(...green);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.text(`${index + 1}.`, margin, y);
      pdf.setFont('helvetica', 'normal');
      const wrapped = pdf.splitTextToSize(action, contentWidth - 8);
      pdf.text(wrapped, margin + 6, y);
      y += wrapped.length * 4.2 + 3;
    });

    y += 3;
    pdf.setFillColor(...pale);
    pdf.roundedRect(margin, y, contentWidth, 21, 2.5, 2.5, 'F');
    pdf.setTextColor(...muted);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.text('ESCOPO E PREMISSAS', margin + 4, y + 6);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.8);
    const caveat = 'Valores calculados pelas OS disponíveis no aplicativo para o perfil ativo. Registros offline pendentes aparecem após serem salvos neste aparelho; outros dispositivos dependem da sincronização com o Supabase.';
    pdf.text(pdf.splitTextToSize(caveat, contentWidth - 8), margin + 4, y + 12);

    const pages = pdf.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
      pdf.setPage(page);
      pdf.setDrawColor(218, 220, 213);
      pdf.line(margin, pageHeight - 13, pageWidth - margin, pageHeight - 13);
      pdf.setTextColor(...muted);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.5);
      pdf.text('Fonte: Ordens de Serviço disponíveis no aplicativo Campo Legado.', margin, pageHeight - 8);
      pdf.text(`${page}/${pages}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
    }

    const blob = pdf.output('blob');
    const fileName = `Relatorio-Mensal-OS-${safeFilePart(monthLabel(options.monthKey))}.pdf`;
    const file = new File([blob], fileName, { type: 'application/pdf', lastModified: Date.now() });
    return { blob, file, fileName };
  },

  async share(orders: Anomaly[], options: ReportOptions): Promise<'shared' | 'downloaded'> {
    const generated = await this.create(orders, options);
    const text = `Relatório mensal de OS — ${monthLabel(options.monthKey)}`;
    if (Capacitor.isNativePlatform()) {
      const saved = await Filesystem.writeFile({
        path: `relatorios/${generated.fileName}`,
        data: await blobToBase64(generated.blob),
        directory: Directory.Cache,
        recursive: true
      });
      await Share.share({
        title: 'Relatório mensal de Ordens de Serviço',
        text,
        files: [saved.uri],
        dialogTitle: 'Compartilhar relatório mensal'
      });
      return 'shared';
    }
    const shareData: ShareData = {
      title: 'Relatório mensal de Ordens de Serviço',
      text,
      files: [generated.file]
    };
    if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
      await navigator.share(shareData);
      return 'shared';
    }
    this.downloadGenerated(generated);
    return 'downloaded';
  },

  async download(orders: Anomaly[], options: ReportOptions): Promise<void> {
    this.downloadGenerated(await this.create(orders, options));
  },

  downloadGenerated(generated: PdfFile): void {
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
