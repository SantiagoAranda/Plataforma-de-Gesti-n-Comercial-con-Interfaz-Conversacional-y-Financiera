"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

interface ReservationBackButtonProps {
  fallbackSlug?: string;
}

export default function ReservationBackButton({
  fallbackSlug,
}: ReservationBackButtonProps) {
  const router = useRouter();

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else if (fallbackSlug) {
      router.push(`/tienda/${fallbackSlug}`);
    } else {
      router.push("/");
    }
  };

  return (
    <button
      type="button"
      onClick={handleBack}
      className="inline-flex items-center gap-1.5 rounded-full bg-slate-100/90 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200/80 active:scale-95 shadow-sm"
      aria-label="Volver"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      <span>Volver</span>
    </button>
  );
}
