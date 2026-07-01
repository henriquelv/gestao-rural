import React from 'react';
import { Filter, Inbox, X } from 'lucide-react';

type Tone = 'blue' | 'green' | 'red' | 'gray' | 'orange';

const toneClasses: Record<Tone, { solid: string; soft: string; outline: string }> = {
  blue: {
    solid: 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700',
    soft: 'bg-blue-50 text-blue-700 border-blue-100',
    outline: 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50'
  },
  green: {
    solid: 'bg-green-600 text-white border-green-600 hover:bg-green-700',
    soft: 'bg-green-50 text-green-700 border-green-100',
    outline: 'bg-white text-green-700 border-green-200 hover:bg-green-50'
  },
  red: {
    solid: 'bg-red-600 text-white border-red-600 hover:bg-red-700',
    soft: 'bg-red-50 text-red-700 border-red-100',
    outline: 'bg-white text-red-700 border-red-200 hover:bg-red-50'
  },
  gray: {
    solid: 'bg-gray-800 text-white border-gray-800 hover:bg-gray-900',
    soft: 'bg-gray-100 text-gray-700 border-gray-200',
    outline: 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
  },
  orange: {
    solid: 'bg-orange-600 text-white border-orange-600 hover:bg-orange-700',
    soft: 'bg-orange-50 text-orange-700 border-orange-100',
    outline: 'bg-white text-orange-700 border-orange-200 hover:bg-orange-50'
  }
};

interface ActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode;
  tone?: Tone;
  variant?: 'solid' | 'soft' | 'outline';
  full?: boolean;
}

export const ActionButton: React.FC<ActionButtonProps> = ({
  icon,
  tone = 'blue',
  variant = 'solid',
  full,
  className = '',
  children,
  ...props
}) => (
  <button
    {...props}
    className={`${full ? 'w-full' : ''} min-h-11 px-4 py-2.5 rounded-lg border text-sm font-black uppercase tracking-normal inline-flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed transition-all ${toneClasses[tone][variant]} ${className}`}
  >
    {icon}
    <span className="min-w-0 break-words leading-tight">{children}</span>
  </button>
);

interface FilterToolbarProps {
  activeCount: number;
  onOpen: () => void;
  resultCount?: number;
  totalCount?: number;
}

export const FilterToolbar: React.FC<FilterToolbarProps> = ({ activeCount, onOpen, resultCount, totalCount }) => (
  <div className="bg-white border-b border-gray-200 p-3 shadow-sm z-10 sticky top-16">
    <div className="flex items-center gap-2">
      <ActionButton
        onClick={onOpen}
        tone={activeCount > 0 ? 'blue' : 'gray'}
        variant={activeCount > 0 ? 'solid' : 'outline'}
        full
        icon={<Filter size={18} />}
      >
        {activeCount > 0 ? `Filtros (${activeCount})` : 'Filtrar'}
      </ActionButton>
      {typeof resultCount === 'number' && typeof totalCount === 'number' && (
        <div className="min-w-[78px] text-right">
          <p className="text-[10px] font-black uppercase text-gray-400">Registros</p>
          <p className="text-sm font-black text-gray-700">{resultCount}/{totalCount}</p>
        </div>
      )}
    </div>
  </div>
);

interface FilterSheetProps {
  title?: string;
  children: React.ReactNode;
  onClose: () => void;
  onClear: () => void;
}

export const FilterSheet: React.FC<FilterSheetProps> = ({ title = 'Filtrar', children, onClose, onClear }) => (
  <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center animate-in fade-in">
    <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-xl font-black text-gray-800 uppercase">{title}</h2>
        <button onClick={onClose} className="p-2 bg-gray-100 rounded-full text-gray-700 active:scale-95">
          <X size={22} />
        </button>
      </div>
      <div className="p-5 space-y-6 overflow-y-auto">{children}</div>
      <div className="p-4 border-t border-gray-100 flex gap-3 bg-white">
        <ActionButton onClick={onClear} tone="gray" variant="soft" full>Limpar</ActionButton>
        <ActionButton onClick={onClose} tone="blue" full>Aplicar</ActionButton>
      </div>
    </div>
  </div>
);

interface EmptyStateProps {
  title: string;
  description?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ title, description }) => (
  <div className="text-center p-8 mt-8 border border-dashed border-gray-200 rounded-xl bg-white">
    <Inbox size={34} className="mx-auto mb-3 text-gray-300" />
    <p className="font-black text-gray-500">{title}</p>
    {description && <p className="text-sm text-gray-400 mt-1">{description}</p>}
  </div>
);

interface FilterOptionProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export const FilterOption: React.FC<FilterOptionProps> = ({ active, onClick, children, style }) => (
  <button
    onClick={onClick}
    className={`min-h-11 p-2 rounded-lg text-sm font-black border-2 transition-all ${active ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
    style={active ? style : undefined}
  >
    {children}
  </button>
);
