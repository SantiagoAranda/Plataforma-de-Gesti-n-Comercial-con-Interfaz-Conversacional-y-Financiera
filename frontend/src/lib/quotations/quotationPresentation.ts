import type { CommercialDocumentData } from "@/src/components/commercial-documents/types";
import { businessToDocument, type DocumentBusinessProfile } from "@/src/lib/sales/saleDocument";
import { buildWhatsAppUrl } from "@/src/lib/whatsapp";
import type { Quotation, QuotationAction } from "@/src/types/quotations";

/** Lo que ve el negocio: «vencida» no es un estado del backend, se deriva de `expired`. */
export type QuotationView = "OPEN" | "EXPIRED" | "ACCEPTED" | "REJECTED" | "CANCELLED" | "CONVERTED";

export const quotationView = (q: Pick<Quotation, "status" | "expired">): QuotationView =>
  q.status === "OPEN" && q.expired ? "EXPIRED" : q.status;

// Colores del prototipo del menú de Ventas (estado «Cotización» en violeta).
export const QUOTATION_BADGES: Record<QuotationView, { label: string; badge: string; dot: string }> = {
  OPEN: { label: "Cotización", badge: "bg-violet-100 text-violet-700 border border-violet-200", dot: "bg-violet-500" },
  EXPIRED: { label: "Vencida", badge: "bg-slate-100 text-slate-600 border border-slate-300", dot: "bg-slate-400" },
  ACCEPTED: { label: "Aceptada", badge: "bg-emerald-50 text-emerald-700 border border-emerald-200", dot: "bg-emerald-500" },
  REJECTED: { label: "Rechazada", badge: "bg-red-50 text-red-700 border border-red-200", dot: "bg-red-500" },
  CANCELLED: { label: "Cancelada", badge: "bg-orange-50 text-orange-700 border border-orange-200", dot: "bg-orange-500" },
  CONVERTED: { label: "Convertida", badge: "bg-blue-50 text-blue-700 border border-blue-200", dot: "bg-blue-500" },
};

/** Misma tabla de transiciones del backend (QuotationsService.transition): solo se ofrece lo válido. */
export const QUOTATION_ACTIONS: Record<QuotationView, QuotationAction[]> = {
  OPEN: ["send", "accept", "reject", "cancel"],
  EXPIRED: ["reject", "cancel"],
  ACCEPTED: ["cancel"],
  REJECTED: [],
  CANCELLED: [],
  CONVERTED: [],
};

export const quotationActions = (q: Pick<Quotation, "status" | "expired">) => QUOTATION_ACTIONS[quotationView(q)];

export function quotationToDocumentData(q: Quotation, business: DocumentBusinessProfile | null): CommercialDocumentData {
  return {
    number: q.displayNumber,
    issuedAt: q.createdAt,
    validityDays: q.validityDays,
    business: businessToDocument(business),
    customer: {
      name: q.customer.name || "Consumidor final",
      document: q.customer.document || undefined,
      phone: q.customer.whatsapp || undefined,
      email: q.customer.email || undefined,
    },
    lines: q.items.map((i) => ({
      description: i.name,
      detail: i.description || undefined,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
    })),
    vatAmount: q.taxTotal,
  };
}

const money = (n: number) => `$${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(n)}`;

/** Enlace de WhatsApp con el resumen de la cotización; null si el cliente no dejó número. */
export function quotationWhatsAppUrl(q: Quotation, businessName?: string, link?: string) {
  if (!q.customer.whatsapp) return null;
  const until = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Bogota" }).format(new Date(q.validUntil));
  const lines = [
    `Hola, *${q.customer.name || "Cliente"}*. Te compartimos la cotización *${q.displayNumber}*${businessName ? ` de *${businessName}*` : ""}:`,
    "",
    ...q.items.map((i) => `- ${i.quantity} x ${i.name}: ${i.lineTotal === null ? "consultar precio" : money(i.lineTotal)}`),
    "",
    `*Total: ${money(q.total)}*`,
    `Válida hasta el ${until}.`,
    ...(link ? ["", `Ver y descargar: ${link}`] : []),
  ];
  return buildWhatsAppUrl(q.customer.whatsapp, lines.join("\n"));
}
