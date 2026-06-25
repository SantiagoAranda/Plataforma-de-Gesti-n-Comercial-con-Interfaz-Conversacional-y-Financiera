import { api } from "@/src/lib/api";

export type TaxPreviewLine = {
  taxType: "IVA" | "IMPOCONSUMO" | "RETEFUENTE" | "RETEIVA" | "RETEICA" | "AUTORRETENCION";
  direction: "CHARGE" | "WITHHOLD" | "SELF";
  baseAmount: number;
  rate: number;
  taxAmount: number;
  accountCode: string;
  applied: boolean;
  reason: string | null;
};

export type TaxPreviewResponse = {
  subtotal: number;
  vatTotal: number;
  impoconsumoTotal: number;
  reteFuenteTotal: number;
  reteIvaTotal: number;
  reteIcaTotal: number;
  autoRetencionTotal: number;
  netReceived: number;
  taxLines: TaxPreviewLine[];
  uvtValue: number;
  profileMissing?: boolean;
};

export type BuyerFiscalContext = {
  buyerType: "NATURAL" | "JURIDICA";
  buyerName: string | null;
  buyerDocumentType: "CC" | "NIT" | "CE" | "PASAPORTE" | "TI";
  buyerDocumentNumber: string | null;
  buyerEmail: string | null;
  buyerIsIvaResponsable: boolean;
  buyerIsRetenedor: boolean;
  buyerIsGranContribuyente: boolean;
  buyerIsAutorretenedor: boolean;
  buyerIsRegimenSimple: boolean;
  fiscalMunicipalityCode: string | null;
  saleConcept:
    | "GOODS"
    | "SERVICES"
    | "HONORARIOS"
    | "ARRENDAMIENTOS"
    | "FOOD_BEVERAGES"
    | "OTHER";
};

export type TaxPreviewRequest = {
  buyerType?: BuyerFiscalContext["buyerType"];
  buyerName?: string;
  buyerDocumentType?: BuyerFiscalContext["buyerDocumentType"];
  buyerDocumentNumber?: string;
  buyerEmail?: string;
  buyerIsIvaResponsable: boolean;
  buyerIsRetenedor: boolean;
  buyerIsGranContribuyente: boolean;
  buyerIsAutorretenedor: boolean;
  buyerIsRegimenSimple: boolean;
  fiscalMunicipalityCode?: string;
  saleConcept: BuyerFiscalContext["saleConcept"];
  cartItems: Array<{ itemId: string; quantity: number }>;
};

export function getTaxPreview(data: TaxPreviewRequest) {
  return api<TaxPreviewResponse>("/sales/tax-preview", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
