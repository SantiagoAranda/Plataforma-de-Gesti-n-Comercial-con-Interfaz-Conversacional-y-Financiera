"use client";

import { useCallback, useRef } from "react";

type Options = {
  onLongPress: () => void;
  delay?: number;
};

/**
 * Hook para detectar una pulsación larga (long press).
 * Soporta eventos de mouse y touch.
 */
export function useLongPress({ onLongPress, delay = 500 }: Options) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTriggeredRef = useRef(false);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const moveThreshold = 15; // píxeles

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(
    (e: any) => {
      // Registrar punto de inicio para detectar movimiento
      const point = e.touches ? e.touches[0] : e;
      startPointRef.current = { x: point.clientX, y: point.clientY };
      
      isTriggeredRef.current = false;
      clearTimer();

      timerRef.current = setTimeout(() => {
        isTriggeredRef.current = true;
        onLongPress();
      }, delay);
    },
    [clearTimer, delay, onLongPress]
  );

  const move = useCallback(
    (e: any) => {
      if (!startPointRef.current) return;
      
      const point = e.touches ? e.touches[0] : e;
      const dx = point.clientX - startPointRef.current.x;
      const dy = point.clientY - startPointRef.current.y;

      // Si se mueve más del umbral, cancelar el timer
      if (Math.hypot(dx, dy) > moveThreshold) {
        clearTimer();
      }
    },
    [clearTimer]
  );

  const end = useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  return {
    handlers: {
      onMouseDown: start,
      onMouseUp: end,
      onMouseLeave: end,
      onMouseMove: move,
      onTouchStart: start,
      onTouchEnd: end,
      onTouchMove: move,
    },
    isLongPressTriggered: () => isTriggeredRef.current,
  };
}