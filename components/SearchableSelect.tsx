import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export interface SearchableOption {
  value: string;
  label: string;
  description?: string;
}

interface SearchableSelectProps {
  value: string;
  options: SearchableOption[];
  onChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
}

const normalizeSearch = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt-BR');

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  value,
  options,
  onChange,
  placeholder,
  searchPlaceholder = 'Digite para buscar',
  emptyMessage = 'Nenhum resultado encontrado.',
  disabled = false
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = options.find((option) => option.value === value);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalizeSearch(query.trim());
    if (!normalizedQuery) return options;
    return options.filter((option) => normalizeSearch(`${option.label} ${option.description || ''}`).includes(normalizedQuery));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => searchRef.current?.focus(), 80);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const choose = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
    setQuery('');
  };

  return (
    <>
      <button
        type="button"
        onClick={() => !disabled && setOpen(true)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex min-h-[54px] w-full items-center gap-3 rounded-xl border-2 border-[#d8d0c2] bg-white px-4 py-3 text-left text-base font-bold text-[#173f32] outline-none transition hover:border-[#9eb195] focus:border-[#3f7457] focus-visible:ring-2 focus-visible:ring-[#3f7457]/20 disabled:bg-[#f2f0e9] disabled:text-[#68746d]"
      >
        <span className={`min-w-0 flex-1 ${selected ? '' : 'text-[#78827c]'}`}>
          <span className="block truncate">{selected?.label || placeholder}</span>
          {selected?.description && <span className="mt-0.5 block truncate text-xs font-semibold text-[#718078]">{selected.description}</span>}
        </span>
        <ChevronDown size={20} className="shrink-0" />
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-[#0b281f]/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label={placeholder}
            className="flex max-h-[86dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[28px] border border-[#d8d0c2] bg-[#f8f4eb] shadow-2xl sm:rounded-[28px]"
          >
            <div className="flex items-center gap-3 border-b border-[#ddd5c8] px-4 pb-3 pt-4">
              <div className="relative min-w-0 flex-1">
                <Search size={19} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#557065]" />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full rounded-xl border-2 border-[#d8d0c2] bg-white py-3.5 pl-11 pr-4 font-bold text-[#173f32] outline-none placeholder:font-semibold placeholder:text-[#89928d] focus:border-[#3f7457] focus-visible:ring-2 focus-visible:ring-[#3f7457]/20"
                />
              </div>
              <button type="button" onClick={() => setOpen(false)} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#173f32] text-white" aria-label="Fechar busca">
                <X size={21} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
              <p className="px-2 pb-2 text-[11px] font-black uppercase tracking-[0.14em] text-[#6d776f]">
                {filteredOptions.length} {filteredOptions.length === 1 ? 'resultado' : 'resultados'}
              </p>
              <div className="space-y-2">
                {filteredOptions.map((option) => {
                  const isSelected = option.value === value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => choose(option.value)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition ${isSelected ? 'border-[#76966a] bg-[#e4edda]' : 'border-[#e1dacd] bg-white active:bg-[#edf2e8]'}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-black leading-5 text-[#173f32]">{option.label}</span>
                        {option.description && <span className="mt-1 block text-xs font-semibold text-[#68746d]">{option.description}</span>}
                      </span>
                      {isSelected && <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#3f7457] text-white"><Check size={16} strokeWidth={3} /></span>}
                    </button>
                  );
                })}
              </div>
              {filteredOptions.length === 0 && (
                <div className="rounded-xl border border-dashed border-[#c9c0b1] bg-white px-5 py-10 text-center text-sm font-semibold text-[#68746d]">{emptyMessage}</div>
              )}
            </div>
          </section>
        </div>,
        document.body
      )}
    </>
  );
};
