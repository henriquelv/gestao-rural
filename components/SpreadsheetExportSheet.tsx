import React from 'react';
import { Download, FileSpreadsheet, FileText, X } from 'lucide-react';

interface SpreadsheetExportSheetProps {
  open: boolean;
  count: number;
  busy?: boolean;
  onClose: () => void;
  onExcel: () => void;
  onCsv: () => void;
}

export const SpreadsheetExportSheet: React.FC<SpreadsheetExportSheetProps> = ({
  open,
  count,
  busy = false,
  onClose,
  onExcel,
  onCsv
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Baixar planilha">
      <button type="button" className="absolute inset-0 bg-black/45" onClick={onClose} aria-label="Fechar exportação" />
      <div className="relative w-full max-w-lg rounded-t-lg bg-white px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-3 shadow-2xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded bg-gray-300" />
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <Download size={21} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-black text-gray-900">Baixar planilha</h2>
            <p className="text-xs font-semibold text-gray-500">{count} {count === 1 ? 'registro' : 'registros'}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 disabled:opacity-50" aria-label="Fechar">
            <X size={22} />
          </button>
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={onExcel}
            disabled={busy || count === 0}
            className="flex min-h-14 w-full items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-left text-emerald-950 disabled:opacity-50"
          >
            <FileSpreadsheet size={24} className="shrink-0 text-emerald-700" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black">Excel completo</span>
              <span className="block text-xs font-semibold text-emerald-800">Arquivo .xlsx organizado e formatado</span>
            </span>
          </button>
          <button
            type="button"
            onClick={onCsv}
            disabled={busy || count === 0}
            className="flex min-h-14 w-full items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 text-left text-gray-900 disabled:opacity-50"
          >
            <FileText size={24} className="shrink-0 text-gray-600" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black">CSV</span>
              <span className="block text-xs font-semibold text-gray-500">Formato simples para outros sistemas</span>
            </span>
          </button>
        </div>

        {busy && <p className="pt-3 text-center text-xs font-bold text-emerald-700">Preparando arquivo...</p>}
      </div>
    </div>
  );
};
