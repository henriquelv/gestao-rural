import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { BrandLogo } from './BrandLogo';

interface HeaderProps {
  title: string;
  showBack?: boolean;
  targetRoute?: string;
}

export const Header: React.FC<HeaderProps> = ({ title, showBack = true, targetRoute }) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (targetRoute) navigate(targetRoute);
    else navigate(-1);
  };

  return (
    <header className="sticky top-0 z-50 flex h-[72px] shrink-0 items-center border-b border-[#d8d0c2] bg-[#f8f4eb] px-4 shadow-[0_5px_18px_rgba(29,55,45,0.08)]">
      {showBack && (
        <button
          type="button"
          onClick={handleBack}
          className="mr-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#d8d0c2] bg-white text-[#173f32] transition-colors hover:bg-[#edf1e8] active:bg-[#dfe8da] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3f7457]/30"
          aria-label="Voltar"
        >
          <ArrowLeft size={21} strokeWidth={2.4} />
        </button>
      )}

      <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
        <h1 className="campo-display max-h-10 min-w-0 flex-1 overflow-hidden text-lg leading-5 tracking-[-0.015em] text-[#173f32]">
          {title}
        </h1>
        <div className="shrink-0 rounded-lg bg-white px-2 py-0.5 shadow-sm">
          <BrandLogo compact />
        </div>
      </div>
    </header>
  );
};
