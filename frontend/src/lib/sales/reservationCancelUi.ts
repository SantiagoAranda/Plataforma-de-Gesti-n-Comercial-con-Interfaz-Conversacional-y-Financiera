type CancelableSale = {
  sourceType: "ORDER" | "RESERVATION" | string;
  status: string;
  scheduledAt?: string | null;
};

/**
 * Ventas: standalone reservations can be cancelled until they are CANCELADO; a pending ORDER
 * with an appointment (mirror reservation) too — through the ORDER, never the mirror's id.
 * A confirmed ORDER is undone with «Revertir venta», not here.
 */
export function canCancelReservation(sale: CancelableSale): boolean {
  if (sale.sourceType === "RESERVATION") return sale.status !== "CANCELADO";
  return sale.sourceType === "ORDER" && sale.status === "PENDIENTE" && Boolean(sale.scheduledAt);
}

export function reservationCancelPrompt(sale: CancelableSale): string {
  return sale.status === "CERRADO"
    ? "La reserva está confirmada: se revertirán el inventario y los registros contables, y el horario quedará libre."
    : "El horario de esta reserva quedará libre.";
}

/** Public page: only PENDING reservations, and only with the booking-time token. */
export function canCancelPublicReservation(
  status: string,
  token: string | null | undefined,
): boolean {
  return status === "PENDING" && Boolean(token);
}

/** Customer link; the token (when known) is what authorizes cancelling. */
export function reservationLink(
  origin: string,
  id: string,
  token?: string | null,
): string {
  const base = `${origin}/reserva/${encodeURIComponent(id)}`;
  return token ? `${base}?t=${encodeURIComponent(token)}` : base;
}

/** Prefers the backend's Spanish message (e.g. 403/409) over a generic text. */
export function cancelErrorMessage(body: unknown, fallback: string): string {
  const message = (body as { message?: unknown } | null)?.message;
  if (typeof message === "string" && message.trim()) return message;
  if (Array.isArray(message) && typeof message[0] === "string") return message[0];
  return fallback;
}
