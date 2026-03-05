// src/lib/statusStyles.ts

export const STATUS_STYLES = {
  CONFIRMADO: {
    label: "Confirmado",
    border: "border-l-4 border-blue-500",
    badge: "bg-blue-100 text-blue-700",
    softBg: "bg-blue-50",
  },

  CERRADO: {
    label: "Cerrado",
    border: "border-l-4 border-green-500",
    badge: "bg-green-100 text-green-700",
    softBg: "bg-green-50",
  },

  PENDIENTE: {
    label: "Pendiente",
    border: "border-l-4 border-yellow-500",
    badge: "bg-yellow-100 text-yellow-700",
    softBg: "bg-yellow-50",
  },

  CANCELADO: {
    label: "Cancelado",
    border: "border-l-4 border-red-500",
    badge: "bg-red-100 text-red-700",
    softBg: "bg-red-50",
  },
} as const;

export type StatusKey = keyof typeof STATUS_STYLES;

const FALLBACK_STYLE = {
  label: "Desconocido",
  border: "border-l-4 border-gray-300",
  badge: "bg-gray-100 text-gray-600",
  softBg: "bg-gray-50",
};

export function getStatusStyles(status?: StatusKey) {
  if (!status) return FALLBACK_STYLE;

  return STATUS_STYLES[status] ?? FALLBACK_STYLE;
}