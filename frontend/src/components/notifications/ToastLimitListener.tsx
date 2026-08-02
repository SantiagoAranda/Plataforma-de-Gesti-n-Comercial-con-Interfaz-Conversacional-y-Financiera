"use client";

import { useEffect, useRef } from "react";
import { useToasterStore, toast } from "react-hot-toast";

const MAX_TOASTS = 2;
const MAX_DURATION = 3000;

export default function ToastLimitListener() {
  const { toasts } = useToasterStore();
  const timerMapRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  useEffect(() => {
    const visibleToasts = toasts.filter((t) => t.visible);

    // Enforce max 2 visible toasts
    if (visibleToasts.length > MAX_TOASTS) {
      const overflowCount = visibleToasts.length - MAX_TOASTS;
      visibleToasts.slice(0, overflowCount).forEach((t) => {
        toast.dismiss(t.id);
      });
    }

    // Enforce strict 3 second timeout for all visible toasts
    visibleToasts.forEach((t) => {
      if (!timerMapRef.current.has(t.id)) {
        const timer = setTimeout(() => {
          toast.dismiss(t.id);
          timerMapRef.current.delete(t.id);
        }, MAX_DURATION);
        timerMapRef.current.set(t.id, timer);
      }
    });

    // Clean up timers for dismissed toasts
    const visibleIds = new Set(visibleToasts.map((t) => t.id));
    timerMapRef.current.forEach((timer, id) => {
      if (!visibleIds.has(id)) {
        clearTimeout(timer);
        timerMapRef.current.delete(id);
      }
    });
  }, [toasts]);

  return null;
}
