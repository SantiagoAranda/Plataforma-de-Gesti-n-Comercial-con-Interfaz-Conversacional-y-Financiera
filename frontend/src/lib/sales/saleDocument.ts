import type { CommercialDocumentData, DocLine, DocumentKind } from "@/src/components/commercial-documents/types";
import type { BusinessLogoProfile } from "@/src/lib/businessLogo";
import type { Sale } from "@/src/types/sales";

const suffix = (id: string) => id.slice(-6).toUpperCase().padStart(6, "0");

export const DOCUMENT_LABEL: Record<DocumentKind, string> = {
  quotation: "Cotización",
  delivery: "Orden de entrega",
};

/** La cotización aplica a cualquier venta vigente; la orden de entrega solo a productos. */
export function canShowSaleDocument(sale: Pick<Sale, "status" | "type" | "items">, kind: DocumentKind) {
  if (sale.status === "CANCELADO" || !sale.items?.length) return false;
  return kind === "quotation" || sale.type === "PRODUCTO";
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
  business: Pick<BusinessLogoProfile, "name" | "fiscalId" | "phoneWhatsapp"> | null,
): CommercialDocumentData {
  const ctx = sale.fiscalContext;
  const document = ctx?.buyerDocumentNumber ? [ctx.buyerDocumentType, ctx.buyerDocumentNumber].filter(Boolean).join(" ") : "";
  const lines: DocLine[] = sale.items.map((it) => ({
    description: it.name,
    detail: it.options?.map((o) => o.optionName).filter(Boolean).join(", ") || undefined,
    quantity: it.qty,
    unitPrice: unitPrice(it),
  }));
  const name = business?.name || "Mi Negocio";
  const summary = sale.fiscalSummary;

  return {
    number: `${kind === "quotation" ? "COT" : "OE"}-${suffix(sale.id)}`,
    issuedAt: sale.createdAt,
    validityDays: kind === "quotation" ? 15 : undefined,
    reference: kind === "delivery" ? `VTA-${suffix(sale.id)}` : undefined,
    business: {
      name,
      legalName: name,
      nit: business?.fiscalId || undefined,
      phone: business?.phoneWhatsapp ? `Tel. ${business.phoneWhatsapp}` : undefined,
    },
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
