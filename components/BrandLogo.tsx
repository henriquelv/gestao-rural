import React, { useState } from 'react';
import { APP_BRAND } from '../constants/app';

interface BrandLogoProps {
  className?: string;
  compact?: boolean;
  inverse?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  className = '',
  compact = false,
  inverse = false
}) => {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <div className={`flex items-center ${compact ? 'gap-2' : 'gap-3'} ${className}`}>
      {!imageFailed && (
        <div className={`${compact ? 'h-10 w-24' : 'h-14 w-32'} overflow-hidden rounded-md ${inverse ? 'bg-white' : ''}`}>
          <img
            src={APP_BRAND.logoUri}
            alt="Campo Legado Consultoria"
            className="h-full w-full object-contain"
            onError={() => setImageFailed(true)}
          />
        </div>
      )}

      {imageFailed && (
        <div
          aria-label={APP_BRAND.fullName}
          className={`${compact ? 'h-9 w-9 text-base' : 'h-12 w-12 text-xl'} flex shrink-0 items-center justify-center rounded-full border-2 font-black ${inverse ? 'border-white/70 text-white' : 'border-emerald-900 text-emerald-950'}`}
        >
          CL
        </div>
      )}
    </div>
  );
};
