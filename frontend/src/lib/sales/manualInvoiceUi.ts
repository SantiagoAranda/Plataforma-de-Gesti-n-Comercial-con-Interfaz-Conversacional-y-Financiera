import type { Sale } from "../../types/sales";

export type InvoiceCapability = {
  documentsLoaded: boolean;
  factusEnabled: boolean;
  factusConfigured: boolean;
  taxSettingsEnabled: boolean;
  responsibility52: boolean;
};

export function canGenerateElectronicInvoice(
  sale: Sale,
  hasInvoice: boolean,
  capability: InvoiceCapability,
  pending: boolean,
) {
  return capability.documentsLoaded && capability.factusEnabled && capability.factusConfigured &&
    capability.taxSettingsEnabled && capability.responsibility52 && !hasInvoice && !pending &&
    sale.sourceType === "ORDER" && sale.status === "CERRADO" &&
    Boolean(sale.accountingPostedAt && sale.inventoryPostedAt);
}

export function firstInvoiceConfirmationStep(sale: Sale): "warning" | "confirm" {
  return sale.requiresLegacyInvoiceWarning ? "warning" : "confirm";
}

export function continueInvoiceConfirmation(step: "warning" | "confirm"): "confirm" {
  return step === "warning" ? "confirm" : step;
}

export function canSubmitInvoiceStep(step: "warning" | "confirm" | "sending" | null): boolean {
  return step === "confirm";
}

export function cancelInvoiceConfirmation(): null {
  return null;
}
