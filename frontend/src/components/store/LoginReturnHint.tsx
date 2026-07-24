"use client";

import { ChevronLeft } from "lucide-react";

export default function LoginReturnHint({
  onClick,
  disabled = false,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Volver al inicio de sesión"
      className="fixed left-0 top-1/2 z-[70] flex h-20 w-8 -translate-y-1/2 items-center justify-center rounded-r-2xl border border-l-0 border-[#0b3f64]/20 bg-white/85 text-[#0b3f64] shadow-[0_0_18px_rgba(11,63,100,0.18)] backdrop-blur-sm transition-colors hover:bg-white hover:text-[#092f4a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b3f64] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60"
    >
      <ChevronLeft className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
