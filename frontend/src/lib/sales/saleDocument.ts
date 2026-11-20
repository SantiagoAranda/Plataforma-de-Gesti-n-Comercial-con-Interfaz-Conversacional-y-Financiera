import type { CommercialDocumentData, DocLine, DocumentKind } from "@/src/components/commercial-documents/types";
import type { BusinessLogoProfile } from "@/src/lib/businessLogo";
import type { Sale } from "@/src/types/sales";

const suffix = (id: string) => id.slice(-6).toUpperCase().padStart(6, "0");

export const DOCUMENT_LABEL: Record<DocumentKind, string> = {
  quotation: "Cotización",
  delivery: "Orden de entrega",
};

/** Estados fiscales de una venta ya facturada (el prototipo la llama Facturada o Validada). */
const INVOICED = ["PENDING", "PROCESSING", "SUBMITTED_PENDING_DIAN", "VALIDATED"];

/**
 * Documentos que el menú ofrece según el estado de la venta (prototipo del menú de Ventas):
 * - Pendiente: Cotización.
 * - Cerrada sin factura: orden de entrega (solo productos); además de factura electrónica y comprobante.
 * - Facturada o validada: documentos relacionados (orden de entrega, solo productos, y cotización).
 * - Cancelada, o factura rechazada o acreditada: ninguno.
 */
export function saleDocumentKinds(
  sale: Pick<Sale, "status" | "type" | "items">,
  fiscalStatus?: string | null,
): DocumentKind[] {
  if (sale.status === "CANCELADO" || !sale.items?.length) return [];
  if (fiscalStatus) {
    if (!INVOICED.includes(fiscalStatus)) return [];
    return sale.type === "PRODUCTO" ? ["delivery", "quotation"] : ["quotation"];
  }
  if (sale.status === "CERRADO") return sale.type === "PRODUCTO" ? ["delivery"] : [];
  return ["quotation"];
}

export type DocumentBusinessProfile = Pick<BusinessLogoProfile, "name" | "fiscalId" | "phoneWhatsapp">;

export function businessToDocument(business: DocumentBusinessProfile | null): CommercialDocumentData["business"] {
  const name = business?.name || "Mi Negocio";
  return {
    name,
    legalName: name,
    nit: business?.fiscalId || undefined,
    phone: business?.phoneWhatsapp ? `Tel. ${business.phoneWhatsapp}` : undefined,
  };
}

const unitPrice = (item: Sale["items"][number]) =>
  item.unitPrice > 0 ? item.unitPrice : item.qty > 0 ? item.price / item.qty : 0;

/**
 * Convierte una venta existente en los datos del visor de documentos.
 * shortcut: el número se deriva del id de la venta (COT-/OE-); la numeración propia llega con el modelo de cotización.
 */
export function saleToDocumentData(
  sale: Sale,
  kind: DocumentKind,
  business: DocumentBusinessProfile | null,
): CommercialDocumentData {
  const ctx = sale.fiscalContext;
  const document = ctx?.buyerDocumentNumber ? [ctx.buyerDocumentType, ctx.buyerDocumentNumber].filter(Boolean).join(" ") : "";
  const lines: DocLine[] = sale.items.map((it) => ({
    description: it.name,
    detail: it.options?.map((o) => o.optionName).filter(Boolean).join(", ") || undefined,
    quantity: it.qty,
    unitPrice: unitPrice(it),
  }));
  const summary = sale.fiscalSummary;

  return {
    number: `${kind === "quotation" ? "COT" : "OE"}-${suffix(sale.id)}`,
    issuedAt: sale.createdAt,
    validityDays: kind === "quotation" ? 15 : undefined,
    reference: kind === "delivery" ? `VTA-${suffix(sale.id)}` : undefined,
    business: businessToDocument(business),
    customer: {
      name: sale.customerName || ctx?.buyerName || "Consumidor final",
      document: document || undefined,
      phone: sale.customerWhatsapp || undefined,
      email: ctx?.buyerEmail || undefined,
    },
    lines,
    vatAmount: summary ? Number(summary.iva ?? 0) + Number(summary.impoconsumo ?? 0) : 0,
  };
}
