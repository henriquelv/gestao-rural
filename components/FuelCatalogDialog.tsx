import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CarFront, Fuel, Loader2, X } from 'lucide-react';
import { normalizeCatalogName, normalizePlate, validateFuelCatalog } from '../utils/fuel-catalog';

export const FuelCatalogDialog: React.FC<{
  kind: 'vehicle' | 'station';
  onClose: () => void;
  onSave: (name: string, detail: string) => Promise<void>;
}> = ({ kind, onClose, onSave }) => {
  const vehicle = kind === 'vehicle';
  const [name, setName] = useState('');
  const [detail, setDetail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    input.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
      if (event.key !== 'Tab') return;
      const fields = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') || []);
      if (event.shiftKey && document.activeElement === fields[0]) { event.preventDefault(); fields.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === fields.at(-1)) { event.preventDefault(); fields[0]?.focus(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose, saving]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (saving) return;
    const validation = validateFuelCatalog(kind, name, detail);
    if (validation) { setError(validation); return; }
    setSaving(true); setError('');
    try { await onSave(normalizeCatalogName(name), detail); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o cadastro.'); }
    finally { setSaving(false); }
  };
  const Icon = vehicle ? CarFront : Fuel;
  return createPortal(<div className="fixed inset-0 z-[125] flex items-end justify-center bg-[#0b281f]/55 sm:items-center sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-[24px] border border-[#d8d0c2] bg-[#f8f4eb] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[24px]">
      <div className="mb-5 flex items-center gap-3"><Icon size={24} className="text-[#315f45]"/><h2 id={titleId} className="campo-display flex-1 text-2xl text-[#173f32]">{vehicle ? 'Adicionar veículo' : 'Adicionar posto'}</h2><button disabled={saving} type="button" aria-label="Fechar cadastro" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#e5ecdf] text-[#173f32]"><X size={20}/></button></div>
      <form onSubmit={save} className="space-y-4">
        <label className="block text-xs font-bold text-[#65736b]">{vehicle ? 'Nome ou modelo do veículo' : 'Nome do posto'}<input ref={input} required maxLength={100} disabled={saving} value={name} onChange={event => setName(event.target.value)} placeholder={vehicle ? 'Ex.: Corolla Cross' : 'Ex.: Posto Central'} className="mt-2 min-h-12 w-full rounded-xl border-2 border-[#d8d0c2] bg-white px-3 text-base font-semibold text-[#173f32] outline-none focus:border-[#3f7457]"/></label>
        <label className="block text-xs font-bold text-[#65736b]">{vehicle ? 'Placa' : 'Endereço'} <span className="font-normal">(opcional)</span><input maxLength={vehicle ? 8 : 200} disabled={saving} value={detail} autoCapitalize={vehicle ? 'characters' : 'sentences'} onChange={event => setDetail(vehicle ? normalizePlate(event.target.value) : event.target.value)} placeholder={vehicle ? 'ABC1D23' : 'Rua, número ou referência'} className="mt-2 min-h-12 w-full rounded-xl border-2 border-[#d8d0c2] bg-white px-3 text-base font-semibold text-[#173f32] outline-none focus:border-[#3f7457]"/></label>
        <p className="text-xs leading-5 text-[#718078]">Este cadastro ficará disponível somente no seu perfil. Pode ser usado sem internet e será sincronizado quando a conexão voltar.</p>
        {error && <p role="alert" className="rounded-xl border border-[#d7a392] bg-[#f8e9e0] p-3 text-sm text-[#8a3f31]">{error}</p>}
        <button disabled={saving} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#173f32] text-sm font-bold text-white disabled:opacity-60">{saving && <Loader2 size={18} className="animate-spin"/>}{saving ? 'Salvando…' : vehicle ? 'Salvar veículo' : 'Salvar posto'}</button>
      </form>
    </section>
  </div>, document.body);
};
