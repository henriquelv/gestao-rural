import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Check, Eraser, PenLine, Trash2 } from 'lucide-react';

const dataUrlToBlob = (dataUrl: string): Blob | null => {
  try {
    const [metadata, data] = dataUrl.split(',');
    if (!metadata || !data) return null;
    const mimeType = metadata.match(/data:([^;]+)/)?.[1] || 'image/png';
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: mimeType });
  } catch {
    return null;
  }
};

const canvasToPng = async (canvas: HTMLCanvasElement): Promise<Blob | null> => {
  if (typeof canvas.toBlob === 'function') {
    const blob = await new Promise<Blob | null>((resolve) => {
      let finished = false;
      const finish = (result: Blob | null) => {
        if (finished) return;
        finished = true;
        resolve(result);
      };
      try {
        canvas.toBlob((result) => finish(result), 'image/png');
        window.setTimeout(() => finish(null), 1_500);
      } catch {
        finish(null);
      }
    });
    if (blob?.size) return blob;
  }

  try {
    return dataUrlToBlob(canvas.toDataURL('image/png'));
  } catch {
    return null;
  }
};

interface ClientSignaturePadProps {
  existingUrl?: string;
  saving?: boolean;
  onSave: (blob: Blob) => Promise<boolean>;
  onRemove: () => void;
  onError?: () => void;
}

export interface ClientSignaturePadHandle {
  commit: () => Promise<boolean>;
}

export const ClientSignaturePad = React.forwardRef<ClientSignaturePadHandle, ClientSignaturePadProps>(({
  existingUrl,
  saving = false,
  onSave,
  onRemove,
  onError
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [hasStroke, setHasStroke] = useState(false);

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    context?.clearRect(0, 0, canvas.width, canvas.height);
    setHasStroke(false);
  };

  useEffect(() => {
    if (existingUrl) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const width = Math.max(canvas.clientWidth, 280);
    const height = 154;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineWidth = 2.2;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#173f32';
  }, [existingUrl]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const startDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const context = event.currentTarget.getContext('2d');
    if (!context) return;
    const current = point(event);
    drawingRef.current = true;
    setHasStroke(true);
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Alguns WebViews/Safari recusam pointer capture; o desenho ainda funciona.
    }
    context.beginPath();
    context.arc(current.x, current.y, 1.15, 0, Math.PI * 2);
    context.fillStyle = '#173f32';
    context.fill();
    context.beginPath();
    context.moveTo(current.x, current.y);
  };

  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    event.preventDefault();
    const context = event.currentTarget.getContext('2d');
    if (!context) return;
    const current = point(event);
    context.lineTo(current.x, current.y);
    context.stroke();
    setHasStroke(true);
  };

  const stopDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    if (drawingRef.current) {
      const context = event.currentTarget.getContext('2d');
      const current = point(event);
      context?.lineTo(current.x, current.y);
      context?.stroke();
    }
    drawingRef.current = false;
    try {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Liberar a captura é best-effort em navegadores móveis antigos.
    }
  };

  const save = useCallback(async (): Promise<boolean> => {
    const canvas = canvasRef.current;
    if (!canvas || !hasStroke) return true;
    const blob = await canvasToPng(canvas);
    if (!blob) {
      onError?.();
      return false;
    }
    try {
      const saved = await onSave(blob);
      if (saved) setHasStroke(false);
      return saved;
    } catch {
      onError?.();
      return false;
    }
  }, [hasStroke, onError, onSave]);

  useImperativeHandle(ref, () => ({ commit: save }), [save]);

  if (existingUrl) {
    return (
      <div className="rounded-xl border border-[#c9d9c0] bg-[#f6f8f3] p-3">
        <img src={existingUrl} alt="Assinatura do cliente" className="h-28 w-full object-contain" />
        <div className="mt-3 flex items-center justify-between border-t border-[#dce5d7] pt-3">
          <span className="flex items-center gap-2 text-xs font-bold text-[#315f45]"><Check size={16} /> Assinatura registrada</span>
          <button type="button" onClick={onRemove} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-red-700">
            <Trash2 size={15} /> Remover
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-[#b9c8b2] bg-[#fbfcf8]">
        <canvas
          ref={canvasRef}
          className="block h-[154px] w-full touch-none"
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={stopDrawing}
          onPointerCancel={stopDrawing}
          onContextMenu={(event) => event.preventDefault()}
          aria-label="Área para assinatura do cliente"
          aria-describedby="signature-pad-help"
        />
        {!hasStroke && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-[#87948c]">
            <PenLine size={24} />
            <span id="signature-pad-help" className="mt-2 text-xs font-semibold">Assine com o dedo nesta área</span>
          </div>
        )}
        <div className="pointer-events-none absolute bottom-7 left-7 right-7 border-b border-[#c8d0c8]" />
      </div>
      <div className="mt-2 flex justify-end gap-2">
        {hasStroke && <span className="mr-auto self-center text-[11px] font-bold text-[#315f45]">Assinatura pronta</span>}
        <button type="button" onClick={clear} disabled={!hasStroke || saving} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-[#52655b] disabled:opacity-40">
          <Eraser size={15} /> Limpar
        </button>
        <button type="button" onClick={() => void save()} disabled={!hasStroke || saving} className="rounded-lg bg-[#315f45] px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
          {saving ? 'Salvando…' : 'Confirmar assinatura'}
        </button>
      </div>
    </div>
  );
});

ClientSignaturePad.displayName = 'ClientSignaturePad';
