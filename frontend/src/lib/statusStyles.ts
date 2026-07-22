// src/lib/statusStyles.ts

export const STATUS_STYLES = {
  "PENDIENTE DE CIERRE": {
    label: "Pendiente de cierre",
    border: "border-l-4 border-sky-500",
    badge: "bg-sky-50 text-sky-700 border border-sky-200",
    softBg: "bg-sky-50",
    dotColor: "bg-sky-500",
  },

  CONFIRMADO: {
    label: "Confirmado",
    border: "border-l-4 border-blue-500",
    badge: "bg-blue-50 text-blue-700 border border-blue-200",
    softBg: "bg-blue-50",
    dotColor: "bg-blue-500",
  },

  CERRADO: {
    label: "Cerrado",
    border: "border-l-4 border-emerald-500",
    badge: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    softBg: "bg-emerald-50",
    dotColor: "bg-emerald-500",
  },

  PENDIENTE: {
    label: "Pendiente",
    border: "border-l-4 border-amber-500",
    badge: "bg-amber-50 text-amber-700 border border-amber-200",
    softBg: "bg-amber-50",
    dotColor: "bg-amber-500",
  },

  CANCELADO: {
    label: "Cancelado",
    border: "border-l-4 border-rose-500",
    badge: "bg-rose-50 text-rose-700 border border-rose-200",
    softBg: "bg-rose-50",
    dotColor: "bg-rose-500",
  },
} as const;

export type StatusKey = keyof typeof STATUS_STYLES;

const FALLBACK_STYLE = {
  label: "Desconocido",
  border: "border-l-4 border-slate-300",
  badge: "bg-slate-100 text-slate-600 border border-slate-200",
  softBg: "bg-slate-50",
  dotColor: "bg-slate-400",
};

export function getStatusStyles(status?: string) {
  if (!status) return FALLBACK_STYLE;

  return STATUS_STYLES[status as StatusKey] ?? FALLBACK_STYLE;
}

