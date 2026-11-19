"use client";

import { useMemo } from "react";
import DocumentModal from "@/src/components/commercial-documents/DocumentModal";
import type { BusinessLogoProfile } from "@/src/lib/businessLogo";
import { quotationToDocumentData } from "@/src/lib/quotations/quotationPresentation";
import type { Quotation } from "@/src/types/quotations";

export default function QuotationDocumentModal({
  quotation,
  business,
  onClose,
}: {
  quotation: Quotation;
  business: BusinessLogoProfile | null;
  onClose: () => void;
}) {
  const data = useMemo(() => quotationToDocumentData(quotation, business), [quotation, business]);
  return <DocumentModal kind="quotation" data={data} onClose={onClose} />;
}
