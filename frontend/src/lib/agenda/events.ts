import type { Sale } from "@/src/types/sales";
import { formatLocalDateKey } from "@/src/lib/datetime";

export type AgendaEventStatus =
  | "PENDIENTE"
  | "CONFIRMADO"
  | "CANCELADO"
  | "COMPLETADO";

export type AgendaEvent = {
  id: string;
  customerName: string;
  description: string;
  scheduledAt: string;
  status: AgendaEventStatus;
  location?: string | null;
  amount?: number | null;
  reference?: string | null;
};

function parseDate(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function saleToAgendaEvent(sale: Sale): AgendaEvent | null {
  const scheduled = parseDate(sale.scheduledAt);
  if (!scheduled) return null;

  const customerName = sale.customerName?.trim() || "Cliente";
  const description =
    sale.items?.[0]?.name?.trim() ||
    (sale.type === "SERVICIO" ? "Servicio" : "Evento");

  const status: AgendaEventStatus =
    sale.status === "CANCELADO"
      ? "CANCELADO"
      : sale.status === "CERRADO"
        ? "COMPLETADO"
        : sale.status === "PENDIENTE DE CIERRE"
          ? "CONFIRMADO"
          : "PENDIENTE";

  return {
    id: sale.id,
    customerName,
    description,
    scheduledAt: sale.scheduledAt as string,
    status,
    amount: Number.isFinite(sale.total) ? sale.total : null,
  };
}

export function getAgendaEventsForDate(sales: Sale[], date: Date): AgendaEvent[] {
  const key = formatLocalDateKey(date);

  return sales
    .map(saleToAgendaEvent)
    .filter((ev): ev is AgendaEvent => {
      if (!ev) return false;
      const d = parseDate(ev.scheduledAt);
      if (!d) return false;
      return formatLocalDateKey(d) === key;
    })
    .sort((a, b) => {
      const at = parseDate(a.scheduledAt)?.getTime() ?? 0;
      const bt = parseDate(b.scheduledAt)?.getTime() ?? 0;
      return at - bt;
    });
}

export function getAgendaEventDateKeys(sales: Sale[]) {
  const keys = new Set<string>();
  for (const sale of sales) {
    const d = parseDate(sale.scheduledAt);
    if (!d) continue;
    keys.add(formatLocalDateKey(d));
  }
  return keys;
}
