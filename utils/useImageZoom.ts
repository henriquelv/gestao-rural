import { useRef, useState, useCallback } from 'react';

interface TouchPoint {
  x: number;
  y: number;
  time: number;
}

export const useImageZoom = (onZoomChange?: (zoom: number) => void) => {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const touchStartRef = useRef<TouchPoint | null>(null);
  const initialDistanceRef = useRef<number | null>(null);
  const initialZoomRef = useRef<number>(1);
  const initialOffsetRef = useRef({ x: 0, y: 0 });

  // Calcular distância entre dois dedos
  const getDistance = (touch1: React.Touch, touch2: React.Touch): number => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLImageElement>) => {
    if (e.touches.length === 1) {
      const now = Date.now();
      const touch = e.touches[0];
      
      // Double tap detector
      if (
        touchStartRef.current &&
        now - touchStartRef.current.time < 300 &&
        Math.abs(touch.clientX - touchStartRef.current.x) < 50 &&
        Math.abs(touch.clientY - touchStartRef.current.y) < 50
      ) {
        const newZoom = zoom === 1 ? 2.5 : 1;
        setZoom(newZoom);
        setOffset({ x: 0, y: 0 });
        onZoomChange?.(newZoom);
        touchStartRef.current = null;
        return;
      }

      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: now
      };
      
      // Pan initialization
      initialOffsetRef.current = { x: offset.x, y: offset.y };
    } else if (e.touches.length === 2) {
      touchStartRef.current = null;
      const distance = getDistance(e.touches[0], e.touches[1]);
      initialDistanceRef.current = distance;
      initialZoomRef.current = zoom;
    }
  }, [zoom, offset, onZoomChange]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLImageElement>) => {
    if (e.touches.length === 1 && zoom > 1 && touchStartRef.current) {
      // Panning
      const touch = e.touches[0];
      const dx = (touch.clientX - touchStartRef.current.x) / zoom;
      const dy = (touch.clientY - touchStartRef.current.y) / zoom;
      
      setOffset({
        x: initialOffsetRef.current.x + dx,
        y: initialOffsetRef.current.y + dy
      });
    } else if (e.touches.length === 2 && initialDistanceRef.current !== null) {
      // Pinch zoom
      const currentDistance = getDistance(e.touches[0], e.touches[1]);
      const ratio = currentDistance / initialDistanceRef.current;
      const newZoom = Math.max(1, Math.min(4, initialZoomRef.current * ratio));
      setZoom(newZoom);
      if (newZoom === 1) setOffset({ x: 0, y: 0 });
      onZoomChange?.(newZoom);
    }
  }, [zoom, onZoomChange]);

  const handleTouchEnd = useCallback(() => {
    initialDistanceRef.current = null;
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    onZoomChange?.(1);
  }, [onZoomChange]);

  const increaseZoom = useCallback(() => {
    setZoom(prev => {
      const newZoom = Math.min(4, prev + 0.5);
      onZoomChange?.(newZoom);
      return newZoom;
    });
  }, [onZoomChange]);

  const decreaseZoom = useCallback(() => {
    setZoom(prev => {
      const newZoom = Math.max(1, prev - 0.5);
      if (newZoom === 1) setOffset({ x: 0, y: 0 });
      onZoomChange?.(newZoom);
      return newZoom;
    });
  }, [onZoomChange]);

  return {
    zoom,
    offset,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    resetZoom,
    increaseZoom,
    decreaseZoom,
    imageStyle: {
      transform: `scale(${zoom}) translate(${offset.x}px, ${offset.y}px)`,
      transition: zoom === 1 ? 'transform 0.3s ease-out' : 'none',
      touchAction: 'none'
    }
  };
};
