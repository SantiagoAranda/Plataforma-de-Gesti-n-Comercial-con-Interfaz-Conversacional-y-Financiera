"use client";

import { useMemo } from "react";
import DocumentModal from "@/src/components/commercial-documents/DocumentModal";
import type { DocumentKind } from "@/src/components/commercial-documents/types";
import type { BusinessLogoProfile } from "@/src/lib/businessLogo";
import { saleToDocumentData } from "@/src/lib/sales/saleDocument";
import type { Sale } from "@/src/types/sales";

export default function SaleDocumentModal({
  sale,
  kind,
  business,
  onClose,
}: {
  sale: Sale;
  kind: DocumentKind;
  business: BusinessLogoProfile | null;
  onClose: () => void;
}) {
  const data = useMemo(() => saleToDocumentData(sale, kind, business), [sale, kind, business]);
  return <DocumentModal kind={kind} data={data} onClose={onClose} />;
}
