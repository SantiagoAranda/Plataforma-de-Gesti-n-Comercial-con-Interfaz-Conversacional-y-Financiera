"use client";

import { useEffect } from "react";
import { useToasterStore, toast } from "react-hot-toast";

const MAX_TOASTS = 2;

export default function ToastLimitListener() {
  const { toasts } = useToasterStore();

  useEffect(() => {
    const visibleToasts = toasts.filter((t) => t.visible);
    if (visibleToasts.length > MAX_TOASTS) {
      const overflowCount = visibleToasts.length - MAX_TOASTS;
      visibleToasts.slice(0, overflowCount).forEach((t) => {
        toast.dismiss(t.id);
      });
    }
  }, [toasts]);

  return null;
}
