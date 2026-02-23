import { useRef, useState, useCallback } from 'react';

interface TouchPoint {
  x: number;
  y: number;
  time: number;
}

export const useImageZoom = (onZoomChange?: (zoom: number) => void) => {
  const [zoom, setZoom] = useState(1);
  const touchStartRef = useRef<TouchPoint | null>(null);
  const lastTouchRef = useRef<TouchPoint | null>(null);
  const initialDistanceRef = useRef<number | null>(null);
  const initialZoomRef = useRef<number>(1);

  // Calcular distância entre dois dedos
  const getDistance = (touch1: React.Touch, touch2: React.Touch): number => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLImageElement>) => {
    if (e.touches.length === 1) {
      // Single touch - detectar double tap
      const now = Date.now();
      const touch = e.touches[0];
      
      if (
        touchStartRef.current &&
        now - touchStartRef.current.time < 300 &&
        Math.abs(touch.clientX - touchStartRef.current.x) < 50 &&
        Math.abs(touch.clientY - touchStartRef.current.y) < 50
      ) {
        // Double tap detectado
        const newZoom = zoom === 1 ? 2 : 1;
        setZoom(newZoom);
        onZoomChange?.(newZoom);
        touchStartRef.current = null;
        return;
      }

      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: now
      };
    } else if (e.touches.length === 2) {
      // Pinch zoom
      touchStartRef.current = null;
      const distance = getDistance(e.touches[0], e.touches[1]);
      initialDistanceRef.current = distance;
      initialZoomRef.current = zoom;
    }
  }, [zoom, onZoomChange]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLImageElement>) => {
    if (e.touches.length === 2 && initialDistanceRef.current !== null) {
      // Pinch zoom
      const currentDistance = getDistance(e.touches[0], e.touches[1]);
      const ratio = currentDistance / initialDistanceRef.current;
      const newZoom = Math.max(1, Math.min(3, initialZoomRef.current * ratio));
      setZoom(newZoom);
      onZoomChange?.(newZoom);
    }
  }, [onZoomChange]);

  const handleTouchEnd = useCallback(() => {
    initialDistanceRef.current = null;
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1);
    onZoomChange?.(1);
  }, [onZoomChange]);

  const increaseZoom = useCallback(() => {
    setZoom(prev => {
      const newZoom = Math.min(3, prev + 0.3);
      onZoomChange?.(newZoom);
      return newZoom;
    });
  }, [onZoomChange]);

  const decreaseZoom = useCallback(() => {
    setZoom(prev => {
      const newZoom = Math.max(1, prev - 0.3);
      onZoomChange?.(newZoom);
      return newZoom;
    });
  }, [onZoomChange]);

  return {
    zoom,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    resetZoom,
    increaseZoom,
    decreaseZoom
  };
};
