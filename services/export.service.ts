import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

export interface CsvExportResult {
  fileName: string;
  native: boolean;
  uri?: string;
}

const sanitizeFileName = (name: string): string => {
  const sanitized = String(name || 'exportacao')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return sanitized || 'exportacao';
};
const escapeCsvCell = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const buildCsv = (rows: unknown[][]): string => (
  `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(';')).join('\r\n')}`
);

const toBase64 = async (text: string): Promise<string> => {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
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

export const exportCsv = async (rows: unknown[][], requestedName: string): Promise<CsvExportResult> => {
  const baseName = sanitizeFileName(requestedName).replace(/\.csv$/i, '');
  const fileName = `${baseName}.csv`;
  const csv = buildCsv(rows);

  if (Capacitor.isNativePlatform()) {
    const saved = await Filesystem.writeFile({
      path: `Gestao Rural/${fileName}`,
      data: await toBase64(csv),
      directory: Directory.Documents,
      recursive: true
    });
    return { fileName, native: true, uri: saved.uri };
  }

  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
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
