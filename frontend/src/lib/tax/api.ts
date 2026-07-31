import { api } from "@/src/lib/api";

export type TaxPreviewLine = {
  taxType: "IVA" | "IMPOCONSUMO" | "RETEFUENTE" | "RETEIVA" | "RETEICA" | "AUTORRETENCION" | "EXEMPT" | "EXCLUDED" | "NOT_TAXED" | "NONE";
  direction: "CHARGE" | "WITHHOLD" | "SELF";
  taxTreatment?: "TAXED" | "EXEMPT" | "EXCLUDED" | "NOT_TAXED" | null;
  informational?: boolean;
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
  grossFiscalTotal: number;
  calculationMethod: "AGGREGATE_V1" | "LINE_ROUNDED_V2";
  taxLines: TaxPreviewLine[];
  uvtValue: number;
  profileMissing?: boolean;
  saleConceptUsed?: string;
  reteIcaRateUsed?: number;
  reteIcaRateOverride?: number | null;
  sellerIsSimpleRegime?: boolean;
  hasMixedConcepts?: boolean;
  mixedConceptsWarning?: string | null;
};

export type BuyerFiscalContext = {
  buyerType: "NATURAL" | "JURIDICA";
  buyerName: string | null;
  buyerDocumentType: "CC" | "NIT" | "CE" | "PASAPORTE" | "TI";
  buyerDocumentNumber: string | null;
  buyerEmail: string | null;
  buyerDv?: string | null;
  buyerAddress?: string | null;
  buyerPhone?: string | null;
  buyerCountryCode?: string | null;
  buyerMunicipalityCode?: string | null;
  buyerTributeCode?: string | null;
  buyerIsFinalConsumer?: boolean;
  buyerIsIvaResponsable: boolean;
  buyerIsRetenedor: boolean;
  buyerIsGranContribuyente: boolean;
  buyerIsAutorretenedor: boolean;
  buyerIsRegimenSimple?: boolean;
  buyerRequiresElectronicInvoice: boolean;
  withholdingSubjectIsDeclarante?: boolean;
  fiscalMunicipalityCode: string | null;
  reteIcaRateOverride?: number;
  /** @deprecated Use reteIcaRateOverride. */
  icaRateOverride?: number;
  saleConcept?:
    | "GOODS"
    | "SERVICES"
    | "HONORARIOS"
    | "ARRENDAMIENTOS"
    | "FOOD_BEVERAGES"
    | "OTHER";
};

export type TaxPreviewRequest = {
  sourceType?: "ORDER" | "RESERVATION";
  sourceId?: string;
  buyerType?: BuyerFiscalContext["buyerType"];
  buyerName?: string;
  buyerDocumentType?: BuyerFiscalContext["buyerDocumentType"];
  buyerDocumentNumber?: string;
  buyerEmail?: string;
  buyerDv?: string;
  buyerAddress?: string;
  buyerPhone?: string;
  buyerCountryCode?: string;
  buyerMunicipalityCode?: string;
  buyerTributeCode?: string;
  buyerIsFinalConsumer?: boolean;
  buyerIsIvaResponsable: boolean;
  buyerIsRetenedor: boolean;
  buyerIsGranContribuyente: boolean;
  buyerIsAutorretenedor: boolean;
  buyerIsRegimenSimple?: boolean;
  buyerRequiresElectronicInvoice?: boolean;
  withholdingSubjectIsDeclarante?: boolean;
  fiscalMunicipalityCode?: string;
  reteIcaRateOverride?: number;
  /** @deprecated Use reteIcaRateOverride. */
  icaRateOverride?: number;
  saleConcept?: BuyerFiscalContext["saleConcept"];
  cartItems: Array<{ itemId: string; quantity: number; sourceLineKey?: string; unitPrice?: number }>;
};

export function getTaxPreview(data: TaxPreviewRequest) {
  return api<TaxPreviewResponse>("/sales/tax-preview", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
