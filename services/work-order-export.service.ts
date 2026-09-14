import { Anomaly, MediaItem } from '../types';
import {
  clientSignature,
  regularWorkOrderMedia,
  workOrderKm,
  workOrderKmUnitValue,
  workOrderProjectValue,
  workOrderReceivable,
  workOrderTotal
} from '../utils/work-orders';
import { mediaService } from './media.service';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const GREEN = '173F32';
const PALE = 'EDF4E8';
const SAND = 'F4F0E7';
const TERRACOTTA = '9F5039';

type ExportFormat = 'excel' | 'word' | 'pdf' | 'csv';

interface EmbeddedImage {
  dataUrl: string;
  bytes: Uint8Array;
  width: number;
  height: number;
  extension: 'jpeg' | 'png';
}

interface ResolvedMedia {
  item: MediaItem;
  image: EmbeddedImage | null;
  label: string;
  isSignature: boolean;
}

interface ExportResult {
  fileName: string;
  format: ExportFormat;
}

interface ReportBreakdown {
  name: string;
  orders: number;
  revenue: number;
  expenses: number;
  receivable: number;
  km: number;
  averageKm: number;
}

interface ReportSummary {
  orders: number;
  clients: number;
  technicians: number;
  revenue: number;
  expenses: number;
  balance: number;
  receivable: number;
  km: number;
  averageKm: number;
  averageTicket: number;
  signedOrders: number;
  signatureRate: number;
  byTechnician: ReportBreakdown[];
  byClient: ReportBreakdown[];
}

const serviceDate = (item: Anomaly): string => item.serviceDate || item.createdAt.slice(0, 10);

const formatDateValue = (value: string): string => {
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
};

const safeFilePart = (value: string): string => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9_-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80);

const periodLabel = (items: Anomaly[]): string => {
  const dates = items.map(serviceDate).filter(Boolean).sort();
  if (!dates.length) return new Date().toISOString().slice(0, 10);
  const first = dates[0];
  const last = dates[dates.length - 1];
  return first === last ? first : `${first}-a-${last}`;
};

const periodDisplayLabel = (items: Anomaly[]): string => {
  const dates = items.map(serviceDate).filter(Boolean).sort();
  if (!dates.length) return 'Sem período informado';
  const first = formatDateValue(dates[0]);
  const last = formatDateValue(dates[dates.length - 1]);
  return first === last ? first : `${first} a ${last}`;
};

const summarizeBreakdown = (items: Anomaly[], keyFor: (item: Anomaly) => string): ReportBreakdown[] => {
  const grouped = new Map<string, ReportBreakdown & { kmOrders: number }>();
  items.forEach((item) => {
    const name = keyFor(item).trim() || 'Não informado';
    const row = grouped.get(name) || {
      name,
      orders: 0,
      revenue: 0,
      expenses: 0,
      receivable: 0,
      km: 0,
      averageKm: 0,
      kmOrders: 0
    };
    const total = workOrderTotal(item);
    row.orders += 1;
    if (item.serviceOrderType === 'receita') row.revenue += total;
    if (item.serviceOrderType === 'despesa') row.expenses += total;
    row.receivable += workOrderReceivable(item);
    row.km += workOrderKm(item);
    if (workOrderKm(item) > 0) row.kmOrders += 1;
    grouped.set(name, row);
  });
  return Array.from(grouped.values())
    .map(({ kmOrders, ...row }) => ({ ...row, averageKm: kmOrders ? row.km / kmOrders : 0 }))
    .sort((a, b) => b.orders - a.orders || a.name.localeCompare(b.name, 'pt-BR'));
};

const summarizeOrders = (items: Anomaly[]): ReportSummary => {
  const revenueOrders = items.filter((item) => item.serviceOrderType === 'receita');
  const kmOrders = items.filter((item) => workOrderKm(item) > 0);
  const revenue = revenueOrders.reduce((sum, item) => sum + workOrderTotal(item), 0);
  const expenses = items
    .filter((item) => item.serviceOrderType === 'despesa')
    .reduce((sum, item) => sum + workOrderTotal(item), 0);
  const signedOrders = items.filter((item) => Boolean(clientSignature(item))).length;
  const km = items.reduce((sum, item) => sum + workOrderKm(item), 0);
  return {
    orders: items.length,
    clients: new Set(items.map((item) => item.clientName?.trim()).filter(Boolean)).size,
    technicians: new Set(items.map((item) => item.responsible?.trim()).filter(Boolean)).size,
    revenue,
    expenses,
    balance: revenue - expenses,
    receivable: items.reduce((sum, item) => sum + workOrderReceivable(item), 0),
    km,
    averageKm: kmOrders.length ? km / kmOrders.length : 0,
    averageTicket: revenueOrders.length ? revenue / revenueOrders.length : 0,
    signedOrders,
    signatureRate: items.length ? signedOrders / items.length : 0,
    byTechnician: summarizeBreakdown(items, (item) => item.responsible || ''),
    byClient: summarizeBreakdown(items, (item) => item.clientName || '')
  };
};

const sortOrders = (items: Anomaly[]): Anomaly[] => [...items].sort((a, b) =>
  serviceDate(a).localeCompare(serviceDate(b)) || a.createdAt.localeCompare(b.createdAt));

const blobToDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

const dataUrlToBytes = (dataUrl: string): Uint8Array => {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

const mediaBlob = async (item: MediaItem): Promise<Blob | null> => {
  const local = await mediaService.readMediaData(item);
  if (local?.type.startsWith('image/')) return local;
  try {
    const source = await mediaService.loadMediaUrl(item);
    if (!source || source === mediaService.getUnavailablePlaceholder()) return null;
    const response = await fetch(source);
    if (!response.ok) return null;
    const blob = await response.blob();
    return blob.type.startsWith('image/') ? blob : null;
  } catch {
    return null;
  }
};

const normalizeImage = async (blob: Blob, preserveTransparency: boolean): Promise<EmbeddedImage | null> => {
  const source = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = reject;
      element.src = source;
    });
    const maxWidth = preserveTransparency ? 1100 : 1280;
    const maxHeight = preserveTransparency ? 500 : 1100;
    const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    if (!preserveTransparency) {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(image, 0, 0, width, height);
    const extension: EmbeddedImage['extension'] = preserveTransparency ? 'png' : 'jpeg';
    const mimeType = preserveTransparency ? 'image/png' : 'image/jpeg';
    const normalizedBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mimeType, preserveTransparency ? undefined : 0.76));
    if (!normalizedBlob) return null;
    const dataUrl = await blobToDataUrl(normalizedBlob);
    return { dataUrl, bytes: dataUrlToBytes(dataUrl), width, height, extension };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(source);
  }
};

const resolveOrderMedia = async (item: Anomaly): Promise<ResolvedMedia[]> => {
  const signature = clientSignature(item);
  const visualMedia = [
    ...regularWorkOrderMedia(item).filter((media) => media.type === 'photo' || media.mimeType?.startsWith('image/')),
    ...(signature ? [signature] : [])
  ];
  const resolved: ResolvedMedia[] = [];
  for (let index = 0; index < visualMedia.length; index += 1) {
    const media = visualMedia[index];
    const isSignature = media.purpose === 'client_signature';
    const blob = await mediaBlob(media);
    resolved.push({
      item: media,
      image: blob ? await normalizeImage(blob, isSignature) : null,
      label: isSignature ? 'Assinatura do cliente' : `Foto ${index + 1}: ${media.name || 'imagem da OS'}`,
      isSignature
    });
  }
  return resolved;
};

const nonVisualAttachments = (item: Anomaly): MediaItem[] => regularWorkOrderMedia(item)
  .filter((media) => media.type !== 'photo' && !media.mimeType?.startsWith('image/'));

const orderFields = (item: Anomaly): Array<[string, string]> => {
  const fields: Array<[string, string]> = [
    ['Data da OS', formatDateValue(serviceDate(item))],
    ['Cliente', item.clientName || 'Não informado'],
    ['Tipo de OS', item.serviceOrderType === 'despesa' ? 'Despesa' : 'Receita'],
    ['Técnico responsável', item.responsible || 'Não informado'],
    ['Criado por', item.createdByEmployeeName || item.employee_name || item.responsible || 'Não informado']
  ];
  if (item.serviceOrderType === 'receita') {
    fields.push(
      ['Valor do projeto', money.format(workOrderProjectValue(item))],
      ['Recebimento', item.paymentStatus === 'recebido' ? 'Recebido' : 'A receber'],
      ['Valor total da OS', money.format(workOrderTotal(item))]
    );
  } else {
    fields.push(
      ['Valor da visita', money.format(item.visitValue || 0)],
      ['KM rodados', `${number.format(item.kmQuantity || 0)} km`],
      ['Valor total do deslocamento', money.format(item.kmValue || 0)],
      ['Valor médio por KM', `${money.format(workOrderKmUnitValue(item))}/km`],
      ['Outros valores a receber', money.format(item.additionalExpenseValue || 0)],
      ['Descrição dos outros valores', item.additionalExpenseDescription || '-'],
      ['Valor total da OS', money.format(workOrderTotal(item))]
    );
  }
  if (item.location) {
    fields.push(
      ['Endereço aproximado', item.location.address || 'Não identificado'],
      ['Coordenadas', `${item.location.latitude.toFixed(6)}, ${item.location.longitude.toFixed(6)}`],
      ['Precisão', item.location.accuracy === undefined ? '-' : `${Math.round(item.location.accuracy)} m`]
    );
  }
  if (item.description) fields.push(['Observações', item.description]);
  fields.push(['ID da OS', item.id]);
  return fields;
};

const downloadBlob = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4_000);
};

const csvCell = (value: unknown): string => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toLocaleString('pt-BR', { useGrouping: false, maximumFractionDigits: 6 });
  }
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
};

const tabularHeader = [
  'Data da OS', 'Ano', 'Mês', 'Cliente', 'Tipo de OS', 'Técnico responsável', 'Criado por', 'Situação do recebimento',
  'Valor do projeto (R$)', 'Valor da visita (R$)', 'KM rodados', 'Valor total do deslocamento (R$)', 'Valor médio por KM (R$)',
  'Outros valores a receber (R$)', 'Descrição dos outros valores', 'Valor total da OS (R$)', 'Valor pendente a receber (R$)',
  'Impacto líquido da OS (R$)',
  'Assinatura do cliente', 'Quantidade de fotos', 'Outros anexos', 'Endereço aproximado', 'Latitude', 'Longitude', 'Precisão (m)',
  'Localização capturada em', 'Observações', 'Criada no aplicativo em', 'ID da OS'
];

const tabularRow = (item: Anomaly): Array<string | number> => {
  const [year, month] = serviceDate(item).split('-');
  const photos = regularWorkOrderMedia(item).filter((media) => media.type === 'photo' || media.mimeType?.startsWith('image/'));
  return [
    formatDateValue(serviceDate(item)), year, month, item.clientName || '',
    item.serviceOrderType === 'receita' ? 'Receita' : item.serviceOrderType === 'despesa' ? 'Despesa' : '',
    item.responsible || '', item.createdByEmployeeName || item.employee_name || item.responsible || '',
    item.serviceOrderType === 'receita' ? (item.paymentStatus === 'recebido' ? 'Recebido' : 'A receber') : 'Não se aplica',
    item.serviceOrderType === 'receita' ? workOrderProjectValue(item) : 0,
    item.serviceOrderType === 'despesa' ? item.visitValue || 0 : 0,
    item.serviceOrderType === 'despesa' ? item.kmQuantity || 0 : 0,
    item.serviceOrderType === 'despesa' ? item.kmValue || 0 : 0,
    item.serviceOrderType === 'despesa' ? workOrderKmUnitValue(item) : 0,
    item.serviceOrderType === 'despesa' ? item.additionalExpenseValue || 0 : 0,
    item.serviceOrderType === 'despesa' ? item.additionalExpenseDescription || '' : '',
    workOrderTotal(item), workOrderReceivable(item), item.serviceOrderType === 'despesa' ? -workOrderTotal(item) : workOrderTotal(item),
    clientSignature(item) ? 'Sim' : 'Não', photos.length,
    nonVisualAttachments(item).map((media) => media.name || media.type).join(' | '),
    item.location?.address || '', item.location?.latitude ?? '', item.location?.longitude ?? '',
    item.location?.accuracy === undefined ? '' : Math.round(item.location.accuracy),
    item.location?.capturedAt ? new Date(item.location.capturedAt).toLocaleString('pt-BR') : '',
    item.description || '', new Date(item.createdAt).toLocaleString('pt-BR'), item.id
  ];
};

const exportCsv = async (items: Anomaly[]): Promise<ExportResult> => {
  const sorted = sortOrders(items);
  const csv = '\uFEFF' + [tabularHeader, ...sorted.map(tabularRow)].map((row) => row.map(csvCell).join(';')).join('\r\n');
  const fileName = `OS-Campo-Legado-${safeFilePart(periodLabel(sorted))}.csv`;
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), fileName);
  return { fileName, format: 'csv' };
};

const exportExcel = async (items: Anomaly[]): Promise<ExportResult> => {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Campo Legado Consultoria';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.subject = 'Ordens de Serviço';

  const sorted = sortOrders(items);
  const summary = summarizeOrders(sorted);
  const detailLastRow = sorted.length + 1;
  const detailColumn = (column: string) => `'Ordens de Serviço'!$${column}$2:$${column}$${detailLastRow}`;
  const summarySheet = workbook.addWorksheet('Resumo gerencial', {
    views: [{ state: 'frozen', ySplit: 3, showGridLines: false }],
    properties: { defaultRowHeight: 20 }
  });
  summarySheet.columns = [
    { width: 34 }, { width: 16 }, { width: 20 }, { width: 20 },
    { width: 20 }, { width: 16 }, { width: 18 }, { width: 18 }
  ];
  summarySheet.mergeCells('A1:H1');
  summarySheet.getCell('A1').value = 'RELATÓRIO GERENCIAL DE ORDENS DE SERVIÇO';
  summarySheet.getCell('A1').font = { name: 'Georgia', bold: true, size: 19, color: { argb: 'FFFFFFFF' } };
  summarySheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${GREEN}` } };
  summarySheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' };
  summarySheet.getRow(1).height = 34;
  summarySheet.mergeCells('A2:H2');
  summarySheet.getCell('A2').value = `Campo Legado Consultoria • Período: ${periodDisplayLabel(sorted)}`;
  summarySheet.getCell('A2').font = { bold: true, size: 11, color: { argb: `FF${GREEN}` } };
  summarySheet.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${PALE}` } };
  summarySheet.mergeCells('A3:H3');
  summarySheet.getCell('A3').value = `Gerado em ${new Date().toLocaleString('pt-BR')} • Os indicadores respeitam os filtros aplicados no aplicativo.`;
  summarySheet.getCell('A3').font = { italic: true, size: 9, color: { argb: 'FF66756D' } };

  const writeKpi = (
    startColumn: number,
    label: string,
    value: number,
    formula: string,
    numberFormat: string,
    accent = GREEN
  ) => {
    summarySheet.mergeCells(5, startColumn, 5, startColumn + 1);
    summarySheet.mergeCells(6, startColumn, 7, startColumn + 1);
    const labelCell = summarySheet.getCell(5, startColumn);
    const valueCell = summarySheet.getCell(6, startColumn);
    labelCell.value = label.toUpperCase();
    labelCell.font = { bold: true, size: 9, color: { argb: 'FF66756D' } };
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${SAND}` } };
    labelCell.alignment = { vertical: 'middle', horizontal: 'left' };
    valueCell.value = { formula, result: value };
    valueCell.numFmt = numberFormat;
    valueCell.font = { bold: true, size: 16, color: { argb: `FF${accent}` } };
    valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
    valueCell.alignment = { vertical: 'middle', horizontal: 'left' };
    [labelCell, valueCell].forEach((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD8D0C2' } },
        bottom: { style: 'thin', color: { argb: 'FFD8D0C2' } },
        left: { style: 'thin', color: { argb: 'FFD8D0C2' } },
        right: { style: 'thin', color: { argb: 'FFD8D0C2' } }
      };
    });
  };
  writeKpi(1, 'Ordens de serviço', summary.orders, `COUNTA(${detailColumn('AC')})`, '0');
  writeKpi(3, 'Clientes atendidos', summary.clients, `SUMPRODUCT((${detailColumn('D')}<>"")/COUNTIF(${detailColumn('D')},${detailColumn('D')}&""))`, '0');
  writeKpi(5, 'Receitas', summary.revenue, `SUMIFS(${detailColumn('P')},${detailColumn('E')},"Receita")`, 'R$ #,##0.00');
  writeKpi(7, 'Despesas', summary.expenses, `SUMIFS(${detailColumn('P')},${detailColumn('E')},"Despesa")`, 'R$ #,##0.00', TERRACOTTA);

  const secondRowKpis: Array<[string, number, string, string, string?]> = [
    ['Saldo do período', summary.balance, `SUMIFS(${detailColumn('P')},${detailColumn('E')},"Receita")-SUMIFS(${detailColumn('P')},${detailColumn('E')},"Despesa")`, 'R$ #,##0.00', summary.balance < 0 ? TERRACOTTA : GREEN],
    ['Projetos a receber', summary.receivable, `SUM(${detailColumn('Q')})`, 'R$ #,##0.00', TERRACOTTA],
    ['KM registrados', summary.km, `SUM(${detailColumn('K')})`, '#,##0.00'],
    ['OS assinadas', summary.signatureRate, `COUNTIF(${detailColumn('S')},"Sim")/COUNTA(${detailColumn('AC')})`, '0%']
  ];
  secondRowKpis.forEach(([label, value, formula, numberFormat, accent], index) => {
    const startColumn = index * 2 + 1;
    summarySheet.mergeCells(9, startColumn, 9, startColumn + 1);
    summarySheet.mergeCells(10, startColumn, 11, startColumn + 1);
    const labelCell = summarySheet.getCell(9, startColumn);
    const valueCell = summarySheet.getCell(10, startColumn);
    labelCell.value = label.toUpperCase();
    labelCell.font = { bold: true, size: 9, color: { argb: 'FF66756D' } };
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${SAND}` } };
    valueCell.value = { formula, result: value };
    valueCell.numFmt = numberFormat;
    valueCell.font = { bold: true, size: 16, color: { argb: `FF${accent || GREEN}` } };
    valueCell.alignment = { vertical: 'middle' };
    [labelCell, valueCell].forEach((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD8D0C2' } },
        bottom: { style: 'thin', color: { argb: 'FFD8D0C2' } },
        left: { style: 'thin', color: { argb: 'FFD8D0C2' } },
        right: { style: 'thin', color: { argb: 'FFD8D0C2' } }
      };
    });
  });
  summarySheet.mergeCells('A13:H13');
  summarySheet.getCell('A13').value = `Ticket médio das receitas: ${money.format(summary.averageTicket)}  •  Média por deslocamento: ${number.format(summary.averageKm)} km  •  ${summary.technicians} técnico${summary.technicians === 1 ? '' : 's'} no período`;
  summarySheet.getCell('A13').font = { bold: true, color: { argb: `FF${GREEN}` }, size: 10 };
  summarySheet.getCell('A13').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${PALE}` } };
  summarySheet.getCell('A13').alignment = { vertical: 'middle', wrapText: true };
  summarySheet.getRow(13).height = 27;

  const addSummaryTable = (
    title: string,
    rows: ReportBreakdown[],
    startRow: number,
    criteriaColumn: 'D' | 'F'
  ): number => {
    summarySheet.mergeCells(startRow, 1, startRow, 8);
    const titleCell = summarySheet.getCell(startRow, 1);
    titleCell.value = title.toUpperCase();
    titleCell.font = { name: 'Georgia', bold: true, size: 13, color: { argb: `FF${GREEN}` } };
    titleCell.alignment = { vertical: 'middle' };
    summarySheet.getRow(startRow).height = 28;
    const headerRow = summarySheet.getRow(startRow + 1);
    ['Nome', 'OS', 'Receitas', 'Despesas', 'A receber', 'KM', 'Média KM', 'Saldo'].forEach((label, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = label;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${GREEN}` } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
      cell.alignment = { vertical: 'middle', horizontal: index === 0 ? 'left' : 'right' };
    });
    headerRow.height = 26;
    rows.forEach((row, rowIndex) => {
      const sheetRow = startRow + 2 + rowIndex;
      const output = summarySheet.getRow(sheetRow);
      output.getCell(1).value = row.name;
      output.getCell(2).value = { formula: `COUNTIF(${detailColumn(criteriaColumn)},A${sheetRow})`, result: row.orders };
      output.getCell(3).value = { formula: `SUMIFS(${detailColumn('P')},${detailColumn(criteriaColumn)},A${sheetRow},${detailColumn('E')},"Receita")`, result: row.revenue };
      output.getCell(4).value = { formula: `SUMIFS(${detailColumn('P')},${detailColumn(criteriaColumn)},A${sheetRow},${detailColumn('E')},"Despesa")`, result: row.expenses };
      output.getCell(5).value = { formula: `SUMIFS(${detailColumn('Q')},${detailColumn(criteriaColumn)},A${sheetRow})`, result: row.receivable };
      output.getCell(6).value = { formula: `SUMIFS(${detailColumn('K')},${detailColumn(criteriaColumn)},A${sheetRow})`, result: row.km };
      output.getCell(7).value = { formula: `IFERROR(SUMIFS(${detailColumn('K')},${detailColumn(criteriaColumn)},A${sheetRow})/COUNTIFS(${detailColumn(criteriaColumn)},A${sheetRow},${detailColumn('K')},">0"),0)`, result: row.averageKm };
      output.getCell(8).value = { formula: `SUMIFS(${detailColumn('R')},${detailColumn(criteriaColumn)},A${sheetRow})`, result: row.revenue - row.expenses };
      output.alignment = { vertical: 'middle', wrapText: true };
      output.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      [3, 4, 5, 8].forEach((column) => { output.getCell(column).numFmt = 'R$ #,##0.00'; });
      [6, 7].forEach((column) => { output.getCell(column).numFmt = '#,##0.00'; });
      if (rowIndex % 2 === 0) output.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${SAND}` } };
      output.eachCell((cell, columnNumber) => {
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFD8D0C2' } } };
        cell.font = { size: 9, color: { argb: `FF${GREEN}` }, bold: columnNumber === 1 };
      });
    });
    return startRow + 2 + rows.length + 2;
  };
  const clientSummaryStart = addSummaryTable('Resultados por técnico', summary.byTechnician, 15, 'F');
  addSummaryTable('Resultados por cliente', summary.byClient, clientSummaryStart, 'D');
  summarySheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  summarySheet.headerFooter.oddFooter = '&LCampo Legado Consultoria&CRelatório gerencial&R&P / &N';

  const sheet = workbook.addWorksheet('Ordens de Serviço', {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
    properties: { defaultRowHeight: 19 }
  });
  sheet.addRow(tabularHeader);
  sorted.forEach((item) => sheet.addRow(tabularRow(item)));
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sorted.length + 1), column: tabularHeader.length } };
  const header = sheet.getRow(1);
  header.height = 31;
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${GREEN}` } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  sheet.columns.forEach((column, index) => {
    const widths = [14, 9, 8, 34, 14, 30, 28, 20, 19, 19, 13, 22, 20, 24, 34, 19, 20, 20, 15, 17, 34, 40, 15, 15, 14, 23, 42, 23, 38];
    column.width = widths[index] || 18;
  });
  for (let rowIndex = 2; rowIndex <= sorted.length + 1; rowIndex += 1) {
    const row = sheet.getRow(rowIndex);
    row.alignment = { vertical: 'top', wrapText: true };
    if (rowIndex % 2 === 0) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${SAND}` } };
    [9, 10, 12, 13, 14, 16, 17, 18].forEach((column) => { row.getCell(column).numFmt = 'R$ #,##0.00'; });
    row.getCell(11).numFmt = '0.00';
  }
  sheet.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 5,
    fitToHeight: 0,
    paperSize: 9,
    pageOrder: 'overThenDown',
    printTitlesRow: '1:1'
  };
  sheet.headerFooter.oddFooter = '&LCampo Legado Consultoria&COrdens de Serviço&R&P / &N';

  const mediaSheet = workbook.addWorksheet('Imagens e assinaturas', { properties: { defaultRowHeight: 18 } });
  mediaSheet.columns = [{ width: 22 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 22 }];
  let mediaRow = 1;
  let hasVisualMedia = false;
  for (let orderIndex = 0; orderIndex < sorted.length; orderIndex += 1) {
    const item = sorted[orderIndex];
    const resolved = await resolveOrderMedia(item);
    if (!resolved.length) continue;
    hasVisualMedia = true;
    mediaSheet.mergeCells(mediaRow, 1, mediaRow, 6);
    const title = mediaSheet.getCell(mediaRow, 1);
    title.value = `OS ${orderIndex + 1} • ${formatDateValue(serviceDate(item))} • ${item.clientName || 'Cliente'} • ${item.responsible || 'Técnico'}`;
    title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${GREEN}` } };
    title.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    title.alignment = { vertical: 'middle' };
    mediaSheet.getRow(mediaRow).height = 25;
    mediaRow += 1;
    for (const media of resolved) {
      mediaSheet.mergeCells(mediaRow, 1, mediaRow, 6);
      const label = mediaSheet.getCell(mediaRow, 1);
      label.value = media.image ? media.label : `${media.label} — imagem indisponível neste aparelho`;
      label.font = { bold: true, color: { argb: media.isSignature ? `FF${TERRACOTTA}` : `FF${GREEN}` } };
      label.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${PALE}` } };
      mediaRow += 1;
      if (media.image) {
        const maxPixelWidth = 560;
        const maxPixelHeight = media.isSignature ? 190 : 370;
        const scale = Math.min(1, maxPixelWidth / media.image.width, maxPixelHeight / media.image.height);
        const pixelWidth = Math.max(120, Math.round(media.image.width * scale));
        const pixelHeight = Math.max(70, Math.round(media.image.height * scale));
        const imageId = workbook.addImage({ extension: media.image.extension, base64: media.image.dataUrl });
        mediaSheet.addImage(imageId, {
          tl: { col: 0.15, row: mediaRow - 0.85 },
          ext: { width: pixelWidth, height: pixelHeight },
          editAs: 'oneCell'
        });
        // Excel positions images in pixels but reserves rows in points. A small
        // safety margin prevents the following image (usually the signature)
        // from overlapping the previous one when the workbook is printed.
        const occupiedRows = Math.ceil(pixelHeight / 18) + 5;
        for (let offset = 0; offset < occupiedRows; offset += 1) mediaSheet.getRow(mediaRow + offset).height = 15;
        mediaRow += occupiedRows;
      }
      mediaRow += 1;
    }
    const files = nonVisualAttachments(item);
    if (files.length) {
      mediaSheet.mergeCells(mediaRow, 1, mediaRow, 6);
      mediaSheet.getCell(mediaRow, 1).value = `Outros anexos: ${files.map((file) => file.name || file.type).join(' • ')}`;
      mediaSheet.getCell(mediaRow, 1).alignment = { wrapText: true };
      mediaSheet.getCell(mediaRow, 1).font = { italic: true, color: { argb: 'FF66756D' } };
      mediaRow += 2;
    }
  }
  if (!hasVisualMedia) {
    mediaSheet.mergeCells('A1:F3');
    mediaSheet.getCell('A1').value = 'As OS exportadas não possuem fotos ou assinaturas.';
    mediaSheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    mediaSheet.getCell('A1').font = { bold: true, color: { argb: 'FF66756D' } };
  }
  mediaSheet.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  const buffer = await workbook.xlsx.writeBuffer();
  const fileName = `OS-Campo-Legado-${safeFilePart(periodLabel(sorted))}.xlsx`;
  downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName);
  return { fileName, format: 'excel' };
};

const exportWord = async (items: Anomaly[]): Promise<ExportResult> => {
  const docx = await import('docx');
  const sorted = sortOrders(items);
  const summary = summarizeOrders(sorted);
  const pageWidthDxa = 9360;
  const summaryCell = (label: string, value: string, accent = GREEN) => new docx.TableCell({
    width: { size: pageWidthDxa / 4, type: docx.WidthType.DXA },
    margins: { top: 130, bottom: 130, left: 150, right: 150 },
    shading: { fill: 'F7F4ED' },
    children: [
      new docx.Paragraph({
        spacing: { after: 70 },
        children: [new docx.TextRun({ text: label.toUpperCase(), bold: true, color: '66756D', size: 15, font: 'Aptos' })]
      }),
      new docx.Paragraph({
        children: [new docx.TextRun({ text: value, bold: true, color: accent, size: 25, font: 'Aptos Display' })]
      })
    ]
  });
  const summaryRows = [
    [
      summaryCell('Ordens de serviço', String(summary.orders)),
      summaryCell('Clientes', String(summary.clients)),
      summaryCell('Técnicos', String(summary.technicians)),
      summaryCell('OS assinadas', `${summary.signedOrders} (${Math.round(summary.signatureRate * 100)}%)`)
    ],
    [
      summaryCell('Receitas', money.format(summary.revenue)),
      summaryCell('Despesas', money.format(summary.expenses), TERRACOTTA),
      summaryCell('Saldo do período', money.format(summary.balance), summary.balance < 0 ? TERRACOTTA : GREEN),
      summaryCell('Projetos a receber', money.format(summary.receivable), TERRACOTTA)
    ],
    [
      summaryCell('KM registrados', `${number.format(summary.km)} km`),
      summaryCell('Média por deslocamento', `${number.format(summary.averageKm)} km`),
      summaryCell('Ticket médio receita', money.format(summary.averageTicket)),
      summaryCell('Período', periodDisplayLabel(sorted))
    ]
  ].map((cells) => new docx.TableRow({ children: cells }));

  const breakdownTable = (rows: ReportBreakdown[], maxRows = 10) => {
    const widths = [3160, 760, 1500, 1500, 1220, 1220];
    const headers = ['Nome', 'OS', 'Receitas', 'Despesas', 'A receber', 'KM'];
    const header = new docx.TableRow({
      tableHeader: true,
      children: headers.map((label, index) => new docx.TableCell({
        width: { size: widths[index], type: docx.WidthType.DXA },
        margins: { top: 95, bottom: 95, left: 110, right: 110 },
        shading: { fill: GREEN },
        children: [new docx.Paragraph({
          alignment: index === 0 ? docx.AlignmentType.LEFT : docx.AlignmentType.RIGHT,
          children: [new docx.TextRun({ text: label.toUpperCase(), bold: true, color: 'FFFFFF', size: 14, font: 'Aptos' })]
        })]
      }))
    });
    const body = rows.slice(0, maxRows).map((row, rowIndex) => {
      const values = [row.name, String(row.orders), money.format(row.revenue), money.format(row.expenses), money.format(row.receivable), number.format(row.km)];
      return new docx.TableRow({
        children: values.map((value, index) => new docx.TableCell({
          width: { size: widths[index], type: docx.WidthType.DXA },
          margins: { top: 85, bottom: 85, left: 110, right: 110 },
          shading: { fill: rowIndex % 2 === 0 ? 'F7F4ED' : 'FFFFFF' },
          children: [new docx.Paragraph({
            alignment: index === 0 ? docx.AlignmentType.LEFT : docx.AlignmentType.RIGHT,
            children: [new docx.TextRun({ text: value, bold: index === 0, color: GREEN, size: 15, font: 'Aptos' })]
          })]
        }))
      });
    });
    return new docx.Table({
      width: { size: pageWidthDxa, type: docx.WidthType.DXA },
      columnWidths: widths,
      rows: [header, ...body]
    });
  };
  const children: Array<InstanceType<typeof docx.Paragraph> | InstanceType<typeof docx.Table>> = [
    new docx.Paragraph({
      spacing: { before: 520, after: 120 },
      children: [new docx.TextRun({ text: 'CAMPO LEGADO CONSULTORIA', bold: true, color: TERRACOTTA, size: 17, font: 'Aptos' })]
    }),
    new docx.Paragraph({
      heading: docx.HeadingLevel.TITLE,
      spacing: { after: 100 },
      children: [new docx.TextRun({ text: 'Relatório de Ordens de Serviço', bold: true, color: GREEN, size: 38, font: 'Georgia' })]
    }),
    new docx.Paragraph({
      spacing: { after: 300 },
      children: [new docx.TextRun({ text: `Período: ${periodDisplayLabel(sorted)} | Gerado em ${new Date().toLocaleString('pt-BR')}`, color: '66756D', size: 19, font: 'Aptos' })]
    }),
    new docx.Paragraph({
      heading: docx.HeadingLevel.HEADING_1,
      children: [new docx.TextRun({ text: 'Resumo gerencial', bold: true, color: GREEN, size: 28, font: 'Georgia' })]
    }),
    new docx.Table({
      width: { size: pageWidthDxa, type: docx.WidthType.DXA },
      columnWidths: [2340, 2340, 2340, 2340],
      rows: summaryRows
    }),
    new docx.Paragraph({
      heading: docx.HeadingLevel.HEADING_2,
      spacing: { before: 280, after: 110 },
      children: [new docx.TextRun({ text: 'Resultados por técnico', bold: true, color: GREEN, size: 23, font: 'Georgia' })]
    }),
    breakdownTable(summary.byTechnician),
    new docx.Paragraph({
      heading: docx.HeadingLevel.HEADING_2,
      spacing: { before: 280, after: 110 },
      children: [new docx.TextRun({ text: 'Clientes com mais atendimentos', bold: true, color: GREEN, size: 23, font: 'Georgia' })]
    }),
    breakdownTable(summary.byClient),
    new docx.Paragraph({ children: [new docx.PageBreak()] })
  ];

  for (let orderIndex = 0; orderIndex < sorted.length; orderIndex += 1) {
    const item = sorted[orderIndex];
    if (orderIndex > 0) children.push(new docx.Paragraph({ children: [new docx.PageBreak()] }));
    children.push(
      new docx.Paragraph({
        heading: docx.HeadingLevel.HEADING_1,
        children: [new docx.TextRun({ text: `${String(orderIndex + 1).padStart(2, '0')} • ${item.clientName || 'Cliente não informado'}`, bold: true, color: GREEN, size: 28 })]
      }),
      new docx.Paragraph({ children: [new docx.TextRun({ text: `${item.serviceOrderType === 'despesa' ? 'OS DESPESA' : 'OS RECEITA'} • ${formatDateValue(serviceDate(item))}`, bold: true, color: TERRACOTTA, size: 19 })] })
    );
    children.push(new docx.Table({
      width: { size: pageWidthDxa, type: docx.WidthType.DXA },
      columnWidths: [2900, 6460],
      rows: orderFields(item).map(([label, value], fieldIndex) => new docx.TableRow({
        children: [
          new docx.TableCell({
            shading: { fill: fieldIndex % 2 === 0 ? PALE : SAND },
            width: { size: 2900, type: docx.WidthType.DXA },
            margins: { top: 90, bottom: 90, left: 120, right: 120 },
            children: [new docx.Paragraph({ children: [new docx.TextRun({ text: label.toUpperCase(), bold: true, color: '66756D', size: 16 })] })]
          }),
          new docx.TableCell({
            shading: { fill: fieldIndex % 2 === 0 ? 'F9FBF7' : 'FFFFFF' },
            width: { size: 6460, type: docx.WidthType.DXA },
            margins: { top: 90, bottom: 90, left: 120, right: 120 },
            children: [new docx.Paragraph({ children: [new docx.TextRun({ text: value || '-', color: GREEN, size: 18 })] })]
          })
        ]
      }))
    }));

    const resolved = await resolveOrderMedia(item);
    if (resolved.length) {
      children.push(new docx.Paragraph({
        heading: docx.HeadingLevel.HEADING_2,
        spacing: { before: 280, after: 120 },
        children: [new docx.TextRun({ text: 'Imagens e assinatura', bold: true, color: GREEN, size: 24 })]
      }));
      for (const media of resolved) {
        children.push(new docx.Paragraph({ children: [new docx.TextRun({ text: media.label, bold: true, color: media.isSignature ? TERRACOTTA : GREEN, size: 18 })] }));
        if (!media.image) {
          children.push(new docx.Paragraph({ children: [new docx.TextRun({ text: 'Imagem indisponível neste aparelho no momento da exportação.', italics: true, color: '7A857F' })] }));
          continue;
        }
        const maxWidth = 540;
        const maxHeight = media.isSignature ? 220 : 420;
        const scale = Math.min(1, maxWidth / media.image.width, maxHeight / media.image.height);
        children.push(new docx.Paragraph({
          alignment: docx.AlignmentType.CENTER,
          spacing: { before: 80, after: 180 },
          children: [new docx.ImageRun({
            type: media.image.extension === 'jpeg' ? 'jpg' : 'png',
            data: media.image.bytes,
            transformation: {
              width: Math.max(120, Math.round(media.image.width * scale)),
              height: Math.max(60, Math.round(media.image.height * scale))
            },
            altText: { title: media.label, description: media.label, name: media.label }
          })]
        }));
      }
    } else {
      children.push(new docx.Paragraph({ spacing: { before: 240 }, children: [new docx.TextRun({ text: 'Esta OS não possui fotos ou assinatura.', italics: true, color: '7A857F' })] }));
    }
    const files = nonVisualAttachments(item);
    if (files.length) {
      children.push(new docx.Paragraph({
        children: [new docx.TextRun({ text: `Outros anexos: ${files.map((file) => file.name || file.type).join(' • ')}`, bold: true, color: '66756D' })]
      }));
    }
  }

  const document = new docx.Document({
    creator: 'Campo Legado Consultoria',
    title: 'Ordens de Serviço',
    description: 'Exportação das Ordens de Serviço do aplicativo Campo Legado',
    styles: {
      default: {
        document: {
          run: { font: 'Aptos', size: 22, color: GREEN },
          paragraph: { spacing: { after: 120, line: 300 } }
        },
        title: {
          run: { font: 'Georgia', size: 38, bold: true, color: GREEN },
          paragraph: { spacing: { before: 0, after: 120 } }
        },
        heading1: {
          run: { font: 'Georgia', size: 30, bold: true, color: GREEN },
          paragraph: { spacing: { before: 300, after: 160 } }
        },
        heading2: {
          run: { font: 'Georgia', size: 25, bold: true, color: GREEN },
          paragraph: { spacing: { before: 240, after: 120 } }
        }
      }
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 708, footer: 708 }
        }
      },
      headers: {
        default: new docx.Header({
          children: [new docx.Paragraph({
            children: [new docx.TextRun({ text: 'CAMPO LEGADO CONSULTORIA | ORDENS DE SERVIÇO', bold: true, color: '66756D', size: 14, font: 'Aptos' })]
          })]
        })
      },
      footers: {
        default: new docx.Footer({
          children: [new docx.Paragraph({
            alignment: docx.AlignmentType.RIGHT,
            children: [
              new docx.TextRun({ text: 'Página ', color: '66756D', size: 14, font: 'Aptos' }),
              new docx.TextRun({ children: [docx.PageNumber.CURRENT], color: '66756D', size: 14, font: 'Aptos' })
            ]
          })]
        })
      },
      children
    }]
  });
  const blob = await docx.Packer.toBlob(document);
  const fileName = `OS-Campo-Legado-${safeFilePart(periodLabel(sorted))}.docx`;
  downloadBlob(blob, fileName);
  return { fileName, format: 'word' };
};

const exportPdf = async (items: Anomaly[]): Promise<ExportResult> => {
  const { jsPDF } = await import('jspdf');
  const sorted = sortOrders(items);
  const summary = summarizeOrders(sorted);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  const green: [number, number, number] = [23, 63, 50];
  const muted: [number, number, number] = [102, 117, 108];
  const pale: [number, number, number] = [244, 240, 231];
  const terracotta: [number, number, number] = [159, 80, 57];
  let firstPage = true;

  const summaryCard = (x: number, y: number, width: number, label: string, value: string, negative = false) => {
    pdf.setFillColor(...(negative ? [246, 233, 225] as [number, number, number] : [237, 244, 232] as [number, number, number]));
    pdf.roundedRect(x, y, width, 17, 2.2, 2.2, 'F');
    pdf.setTextColor(...muted);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.1);
    pdf.text(label.toUpperCase(), x + 3, y + 5);
    pdf.setTextColor(...(negative ? terracotta : green));
    pdf.setFontSize(10.5);
    pdf.text(pdf.splitTextToSize(value, width - 6)[0], x + 3, y + 12.5);
  };

  const summaryRanking = (title: string, rows: ReportBreakdown[], y: number): number => {
    pdf.setTextColor(...green);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10.5);
    pdf.text(title, margin, y);
    y += 5;
    const widths = [76, 14, 32, 28, 28];
    const headers = ['Nome', 'OS', 'Receitas', 'Despesas', 'KM'];
    pdf.setFillColor(...green);
    pdf.rect(margin, y, contentWidth, 7, 'F');
    let x = margin;
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(6.1);
    headers.forEach((header, index) => {
      pdf.text(header, x + 2, y + 4.6);
      x += widths[index];
    });
    y += 7;
    rows.slice(0, 5).forEach((row, index) => {
      pdf.setFillColor(...(index % 2 === 0 ? [250, 249, 246] as [number, number, number] : pale));
      pdf.rect(margin, y, contentWidth, 7.5, 'F');
      const values = [row.name, String(row.orders), money.format(row.revenue), money.format(row.expenses), number.format(row.km)];
      x = margin;
      pdf.setTextColor(...green);
      pdf.setFont('helvetica', index === 0 ? 'bold' : 'normal');
      pdf.setFontSize(6.1);
      values.forEach((value, valueIndex) => {
        const clipped = pdf.splitTextToSize(value, widths[valueIndex] - 4)[0];
        pdf.text(clipped, x + 2, y + 4.9);
        x += widths[valueIndex];
      });
      y += 7.5;
    });
    return y + 5;
  };

  pdf.setFillColor(...green);
  pdf.rect(0, 0, pageWidth, 44, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.text('CAMPO LEGADO CONSULTORIA', margin, 12);
  pdf.setFontSize(20);
  pdf.text('RELATÓRIO DE ORDENS DE SERVIÇO', margin, 24);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.text(`Período: ${periodDisplayLabel(sorted)} | ${summary.orders} OS`, margin, 33);
  pdf.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, margin, 38);

  let summaryY = 52;
  pdf.setTextColor(...green);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11.5);
  pdf.text('RESUMO GERENCIAL', margin, summaryY);
  summaryY += 6;
  const cardGap = 3;
  const cardWidth = (contentWidth - cardGap) / 2;
  const cards: Array<[string, string, boolean?]> = [
    ['Ordens de serviço', String(summary.orders)],
    ['Clientes atendidos', String(summary.clients)],
    ['Receitas', money.format(summary.revenue)],
    ['Despesas', money.format(summary.expenses), true],
    ['Saldo do período', money.format(summary.balance), summary.balance < 0],
    ['Projetos a receber', money.format(summary.receivable), true],
    ['KM registrados', `${number.format(summary.km)} km`],
    ['Média por deslocamento', `${number.format(summary.averageKm)} km`],
    ['Ticket médio das receitas', money.format(summary.averageTicket)],
    ['OS assinadas', `${summary.signedOrders} de ${summary.orders} (${Math.round(summary.signatureRate * 100)}%)`]
  ];
  cards.forEach(([label, value, negative], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    summaryCard(margin + column * (cardWidth + cardGap), summaryY + row * 20, cardWidth, label, value, negative);
  });
  summaryY += Math.ceil(cards.length / 2) * 20 + 4;
  summaryY = summaryRanking('RESULTADOS POR TÉCNICO - PRINCIPAIS', summary.byTechnician, summaryY);
  if (summaryY + 53 > pageHeight - 17) {
    pdf.addPage();
    summaryY = 18;
  }
  summaryRanking('CLIENTES COM MAIS ATENDIMENTOS', summary.byClient, summaryY);
  firstPage = false;

  const orderHeader = (item: Anomaly, index: number, section = 'FICHA DA OS') => {
    if (!firstPage) pdf.addPage();
    firstPage = false;
    pdf.setFillColor(...green);
    pdf.rect(0, 0, pageWidth, 30, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.text(section, margin, 12);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`OS ${String(index + 1).padStart(2, '0')} de ${sorted.length} • ${item.id.slice(0, 8).toUpperCase()}`, margin, 20);
    pdf.setFont('helvetica', 'bold');
    pdf.text(formatDateValue(serviceDate(item)), pageWidth - margin, 16, { align: 'right' });
  };

  for (let orderIndex = 0; orderIndex < sorted.length; orderIndex += 1) {
    const item = sorted[orderIndex];
    orderHeader(item, orderIndex);
    let y = 40;
    pdf.setTextColor(...green);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    const clientLines = pdf.splitTextToSize(item.clientName || 'Cliente não informado', contentWidth);
    pdf.text(clientLines, margin, y);
    y += clientLines.length * 7 + 2;
    pdf.setTextColor(...terracotta);
    pdf.setFontSize(8);
    pdf.text(item.serviceOrderType === 'despesa' ? 'OS DESPESA' : 'OS RECEITA', margin, y);
    y += 7;

    const drawField = (label: string, value: string) => {
      const lines = pdf.splitTextToSize(value || '-', contentWidth - 57);
      const height = Math.max(10, 5 + lines.length * 4);
      if (y + height > pageHeight - 16) {
        pdf.addPage();
        y = 18;
      }
      pdf.setFillColor(...pale);
      pdf.roundedRect(margin, y, contentWidth, height, 1.7, 1.7, 'F');
      pdf.setTextColor(...muted);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(6.5);
      pdf.text(label.toUpperCase(), margin + 3, y + 6);
      pdf.setTextColor(...green);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.2);
      pdf.text(lines, margin + 54, y + 6);
      y += height + 2;
    };
    orderFields(item).forEach(([label, value]) => drawField(label, value));
    const files = nonVisualAttachments(item);
    if (files.length) drawField('Outros anexos', files.map((file) => file.name || file.type).join(' • '));

    const resolved = await resolveOrderMedia(item);
    if (!resolved.length) {
      if (y + 14 > pageHeight - 16) { pdf.addPage(); y = 18; }
      pdf.setTextColor(...muted);
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(8);
      pdf.text('Esta OS não possui fotos ou assinatura.', margin, y + 7);
    }
    for (const media of resolved) {
      orderHeader(item, orderIndex, media.isSignature ? 'ASSINATURA DO CLIENTE' : 'EVIDÊNCIA FOTOGRÁFICA');
      pdf.setTextColor(...green);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.text(pdf.splitTextToSize(`${item.clientName || 'Cliente'} • ${media.label}`, contentWidth), margin, 40);
      if (!media.image) {
        pdf.setFillColor(...pale);
        pdf.roundedRect(margin, 54, contentWidth, 35, 3, 3, 'F');
        pdf.setTextColor(...muted);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.text('A imagem estava registrada, mas não ficou disponível neste aparelho durante a exportação.', pageWidth / 2, 73, { align: 'center', maxWidth: contentWidth - 18 });
        continue;
      }
      const availableWidth = contentWidth;
      const availableHeight = pageHeight - 70;
      const scale = Math.min(availableWidth / media.image.width, availableHeight / media.image.height);
      const imageWidth = media.image.width * scale;
      const imageHeight = media.image.height * scale;
      const x = (pageWidth - imageWidth) / 2;
      const yImage = 52 + Math.max(0, (availableHeight - imageHeight) / 2);
      try {
        pdf.addImage(media.image.dataUrl, media.image.extension === 'jpeg' ? 'JPEG' : 'PNG', x, yImage, imageWidth, imageHeight, undefined, 'FAST');
      } catch {
        pdf.setTextColor(...muted);
        pdf.setFontSize(9);
        pdf.text('Não foi possível inserir esta imagem no PDF.', pageWidth / 2, 75, { align: 'center' });
      }
    }
  }

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page);
    pdf.setDrawColor(218, 220, 213);
    pdf.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
    pdf.setTextColor(...muted);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    pdf.text('Campo Legado Consultoria • Exportação detalhada de OS', margin, pageHeight - 7);
    pdf.text(`${page}/${pages}`, pageWidth - margin, pageHeight - 7, { align: 'right' });
  }
  const blob = pdf.output('blob');
  const fileName = `OS-Campo-Legado-${safeFilePart(periodLabel(sorted))}.pdf`;
  downloadBlob(blob, fileName);
  return { fileName, format: 'pdf' };
};

export const workOrderExportService = {
  async export(items: Anomaly[], format: ExportFormat): Promise<ExportResult> {
    if (!items.length) throw new Error('EMPTY_EXPORT');
    if (format === 'excel') return exportExcel(items);
    if (format === 'word') return exportWord(items);
    if (format === 'pdf') return exportPdf(items);
    return exportCsv(items);
  }
};
