"use client";

import { useCallback, useRef, useEffect } from "react";

type Options = {
  onLongPress: () => void;
  delay?: number;
};

/**
 * Hook para detectar una pulsación larga (long press) usando PointerEvents.
 * Evita conflictos con elementos clickeables dentro del contenedor.
 */
export function useLongPress({ onLongPress, delay = 600 }: Options) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTriggeredRef = useRef(false);

  const clear = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const start = useCallback((event: any) => {
    const target = event.target as HTMLElement;
    // Si se hace click en un botón, input, select, link o textarea, ignorar el long press.
    if (target.closest("button, a, input, select, textarea")) return;

    isTriggeredRef.current = false;
    clear();
    timeoutRef.current = setTimeout(() => {
      onLongPress();
      isTriggeredRef.current = true;
      timeoutRef.current = null;
    }, delay);
  }, [clear, delay, onLongPress]);

  // Limpiar el timeout al desmontar
  useEffect(() => clear, [clear]);

  return {
    handlers: {
      onPointerDown: start,
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
    },
    isLongPressTriggered: () => isTriggeredRef.current,
  };
}