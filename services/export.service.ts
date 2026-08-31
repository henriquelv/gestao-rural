import { Capacitor, registerPlugin } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

export interface ExportResult {
  fileName: string;
  native: boolean;
  uri?: string;
  notificationShown?: boolean;
  location?: 'downloads' | 'documents';
}

export interface SpreadsheetColumn {
  header: string;
  width?: number;
  type?: 'text' | 'number' | 'percent';
}

export interface SpreadsheetSheet {
  name: string;
  title: string;
  subtitle?: string;
  columns: SpreadsheetColumn[];
  rows: unknown[][];
}

interface NativeDownloadResult {
  uri?: string;
  notificationShown?: boolean;
}

interface NativeDownloadPlugin {
  save(options: {
    base64: string;
    fileName: string;
    mimeType: string;
  }): Promise<NativeDownloadResult>;
}

const NativeDownload = registerPlugin<NativeDownloadPlugin>('NativeDownload');

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const CSV_MIME = 'text/csv;charset=utf-8';

const sanitizeFileName = (name: string): string => {
  const sanitized = String(name || 'exportacao')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return sanitized || 'exportacao';
};

const escapeCsvCell = (value: unknown): string => {
  let text = value === null || value === undefined ? '' : String(value);
  // Impede CSV injection quando um texto digitado pelo usuário começa como fórmula.
  if (typeof value === 'string' && /^[\t\r\n ]*[=+\-@]/.test(text)) text = `'${text}`;
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const buildCsv = (rows: unknown[][]): string => (
  `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(';')).join('\r\n')}`
);

const xmlEscape = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const columnName = (index: number): string => {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
};

const sanitizeSheetName = (name: string, used: Set<string>): string => {
  const invalidSheetCharacters = new RegExp('[\\\\/?*\\[\\]:]', 'g');
  const base = String(name || 'Planilha').replace(invalidSheetCharacters, ' ').trim().slice(0, 31) || 'Planilha';
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate.toLocaleLowerCase('pt-BR'))) {
    const tail = ` ${suffix++}`;
    candidate = `${base.slice(0, 31 - tail.length)}${tail}`;
  }
  used.add(candidate.toLocaleLowerCase('pt-BR'));
  return candidate;
};

const cellXml = (reference: string, value: unknown, style: number): string => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${reference}" s="${style}" t="n"><v>${value}</v></c>`;
  }
  const text = String(value ?? '');
  const preserve = /^\s|\s$|[\r\n]/.test(text) ? ' xml:space="preserve"' : '';
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t${preserve}>${xmlEscape(text)}</t></is></c>`;
};

const worksheetXml = (sheet: SpreadsheetSheet): string => {
  const columns = sheet.columns.length > 0 ? sheet.columns : [{ header: 'Dados' }];
  const lastColumn = columnName(columns.length - 1);
  const rows: string[] = [];

  rows.push(`<row r="1" ht="28" customHeight="1">${cellXml('A1', sheet.title, 1)}</row>`);
  rows.push(`<row r="2" ht="22" customHeight="1">${cellXml('A2', sheet.subtitle || '', 2)}</row>`);
  rows.push('<row r="3"></row>');
  rows.push(`<row r="4" ht="32" customHeight="1">${columns.map((column, index) => cellXml(`${columnName(index)}4`, column.header, 3)).join('')}</row>`);

  sheet.rows.forEach((values, rowIndex) => {
    const excelRow = rowIndex + 5;
    const alternate = rowIndex % 2 === 1;
    const cells = columns.map((column, columnIndex) => {
      const value = values[columnIndex] ?? '';
      const style = column.type === 'percent' ? (alternate ? 7 : 6) : (alternate ? 5 : 4);
      return cellXml(`${columnName(columnIndex)}${excelRow}`, value, style);
    }).join('');
    rows.push(`<row r="${excelRow}">${cells}</row>`);
  });

  const lastRow = Math.max(sheet.rows.length + 4, 4);
  const columnDefinitions = columns.map((column, index) => {
    const width = Math.max(8, Math.min(Number(column.width || 18), 60));
    return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastColumn}${lastRow}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${columnDefinitions}</cols>
  <sheetData>${rows.join('')}</sheetData>
  <autoFilter ref="A4:${lastColumn}${lastRow}"/>
  <mergeCells count="2"><mergeCell ref="A1:${lastColumn}1"/><mergeCell ref="A2:${lastColumn}2"/></mergeCells>
  <pageMargins left="0.35" right="0.35" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
  <pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
};

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    <font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF166534"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF0FDF4"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFD1D5DB"/></left><right style="thin"><color rgb="FFD1D5DB"/></right><top style="thin"><color rgb="FFD1D5DB"/></top><bottom style="thin"><color rgb="FFD1D5DB"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="8">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="10" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>
    <xf numFmtId="10" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
    table[index] = value >>> 0;
  }
  return table;
})();

const crc32 = (bytes: Uint8Array): number => {
  let value = 0xFFFFFFFF;
  for (let index = 0; index < bytes.length; index += 1) value = crcTable[(value ^ bytes[index]) & 0xFF] ^ (value >>> 8);
  return (value ^ 0xFFFFFFFF) >>> 0;
};

const concatBytes = (chunks: Uint8Array[]): Uint8Array => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.length;
  });
  return result;
};

const zipFiles = (files: Array<{ name: string; content: string }>): Uint8Array => {
  const encoder = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let localOffset = 0;

  files.forEach((file) => {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const checksum = crc32(data);
    const local = new Uint8Array(30 + name.length + data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034B50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, 0, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    localChunks.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014B50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, localOffset, true);
    central.set(name, 46);
    centralChunks.push(central);
    localOffset += local.length;
  });

  const centralDirectory = concatBytes(centralChunks);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054B50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralDirectory.length, true);
  endView.setUint32(16, localOffset, true);
  endView.setUint16(20, 0, true);
  return concatBytes([...localChunks, centralDirectory, end]);
};

export const buildXlsx = (requestedSheets: SpreadsheetSheet[]): Uint8Array => {
  if (requestedSheets.length === 0) throw new Error('A planilha precisa ter pelo menos uma aba.');
  const usedNames = new Set<string>();
  const sheets = requestedSheets.map((sheet) => ({ ...sheet, name: sanitizeSheetName(sheet.name, usedNames) }));
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
</Types>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${sheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`;
  const workbookRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

  return zipFiles([
    { name: '[Content_Types].xml', content: contentTypes },
    { name: '_rels/.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', content: workbook },
    { name: 'xl/_rels/workbook.xml.rels', content: workbookRelationships },
    { name: 'xl/styles.xml', content: stylesXml },
    ...sheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, content: worksheetXml(sheet) }))
  ]);
};

type ExportPayload = BlobPart | Uint8Array;

const normalizeBlobPart = (data: ExportPayload): BlobPart => {
  if (!(data instanceof Uint8Array)) return data;
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy.buffer;
};

const toBase64 = async (data: ExportPayload): Promise<string> => {
  const blob = new Blob([normalizeBlobPart(data)]);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.split(',')[1];
      if (base64) resolve(base64);
      else reject(new Error('Falha ao preparar o arquivo para salvar.'));
    };
    reader.onerror = () => reject(reader.error || new Error('Falha ao preparar o arquivo para salvar.'));
    reader.readAsDataURL(blob);
  });
};

const saveExport = async (data: ExportPayload, fileName: string, mimeType: string): Promise<ExportResult> => {
  if (Capacitor.isNativePlatform()) {
    const base64 = await toBase64(data);
    try {
      const saved = await NativeDownload.save({ base64, fileName, mimeType });
      return { fileName, native: true, uri: saved.uri, notificationShown: saved.notificationShown, location: 'downloads' };
    } catch (error) {
      console.warn('[Export] Download nativo indisponível; usando Documentos.', {
        message: error instanceof Error ? error.message : String(error)
      });
      const saved = await Filesystem.writeFile({
        path: `Gestao Rural/${fileName}`,
        data: base64,
        directory: Directory.Documents,
        recursive: true
      });
      return { fileName, native: true, uri: saved.uri, notificationShown: false, location: 'documents' };
    }
  }

  const url = URL.createObjectURL(new Blob([normalizeBlobPart(data)], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 100);
  return { fileName, native: false };
};

export const exportCsv = async (rows: unknown[][], requestedName: string): Promise<ExportResult> => {
  const baseName = sanitizeFileName(requestedName).replace(/\.csv$/i, '');
  const fileName = `${baseName}.csv`;
  return saveExport(buildCsv(rows), fileName, CSV_MIME);
};

export const exportXlsx = async (sheets: SpreadsheetSheet[], requestedName: string): Promise<ExportResult> => {
  const baseName = sanitizeFileName(requestedName).replace(/\.xlsx$/i, '');
  const fileName = `${baseName}.xlsx`;
  return saveExport(buildXlsx(sheets), fileName, XLSX_MIME);
};
