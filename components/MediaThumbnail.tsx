import React, { useEffect, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { MediaItem } from '../types';
import { mediaService } from '../services/media.service';

interface MediaThumbnailProps {
  item: MediaItem;
  alt: string;
  className?: string;
}

export const MediaThumbnail: React.FC<MediaThumbnailProps> = ({ item, alt, className = '' }) => {
  const [source, setSource] = useState('');

  useEffect(() => {
    let mounted = true;
    void mediaService.loadMediaUrl(item)
      .then((url) => {
        if (mounted) setSource(url || mediaService.getUnavailablePlaceholder());
      })
      .catch((error) => {
        console.warn('[MediaThumbnail] Falha isolada ao carregar miniatura:', error);
        if (mounted) setSource(mediaService.getUnavailablePlaceholder());
      });
    return () => { mounted = false; };
  }, [item.id, item.localPath, item.remotePath, item.remoteUrl, item.uri]);

  if (!source) {
    return (
      <div className={`flex items-center justify-center text-gray-300 ${className}`}>
        <ImageIcon size={28} />
      </div>
    );
  }

  return (
    <img
      src={source}
      alt={alt}
      loading="lazy"
      className={className}
      onError={() => setSource(mediaService.getUnavailablePlaceholder())}
    />
  );
};
