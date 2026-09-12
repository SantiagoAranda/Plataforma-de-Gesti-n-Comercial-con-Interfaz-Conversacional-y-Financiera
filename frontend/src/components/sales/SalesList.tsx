"use client";

import type { Sale } from "@/src/types/sales";
import type { FiscalDocument } from "@/src/types/fiscal-documents";
import SaleCard from "./SaleCard";
import { getBusinessDayKey } from "@/src/lib/businessDate";

type Props = {
  sales: Sale[];
  selectedId?: string | null;
  highlightedId?: string | null;
  targetId?: string | null;
  onSaleElement?: (saleId: string, element: HTMLDivElement | null) => void;
  onSelect?: (sale: Sale) => void;
  onDetails?: (sale: Sale) => void;
  onReceipt?: (sale: Sale) => void;
  onSendWhatsApp?: (sale: Sale) => void;
  taxSettingsEnabled?: boolean;
  electronicInvoicingEnabled?: boolean;
  invoicesByOrder?: Map<string, FiscalDocument>;
  creditNotesByInvoice?: Map<string, FiscalDocument>;
  onFiscalView?: (document: FiscalDocument) => void;
  onFiscalReceipt?: (sale: Sale, document: FiscalDocument) => void;
  onFiscalDownload?: (document: FiscalDocument, kind: "pdf" | "xml") => void;
  onFiscalDispatch?: (document: FiscalDocument) => void;
  onFiscalRetry?: (document: FiscalDocument) => void;
  onFiscalAnnul?: (document: FiscalDocument) => void;
  onCompleteAnnulment?: (document: FiscalDocument) => void;
};

function groupSalesByDate(sales: Sale[]) {
  const sortedSales = [...sales].sort((a, b) => {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  const groups: Record<string, Sale[]> = {};

  sortedSales.forEach((sale) => {
    const date = new Date(sale.createdAt);
    const key = getBusinessDayKey(date);

    if (!groups[key]) groups[key] = [];

    groups[key].push(sale);
  });

  return Object.entries(groups)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([dateKey, groupSales]) => ({
      dateISO: dateKey,
      sales: groupSales,
    }));
}

export default function SalesList({
  sales,
  selectedId,
  highlightedId,
  targetId,
  onSaleElement,
  onSelect,
  onDetails,
  onReceipt,
  onSendWhatsApp,
  taxSettingsEnabled = false,
  electronicInvoicingEnabled = false,
  invoicesByOrder,
  creditNotesByInvoice,
  onFiscalView,
  onFiscalReceipt,
  onFiscalDownload,
  onFiscalDispatch,
  onFiscalRetry,
  onFiscalAnnul,
  onCompleteAnnulment,
}: Props) {
  const groups = groupSalesByDate(sales);

  return (
    <main className="flex flex-col px-3 pb-4 gap-4 max-w-md mx-auto sm:max-w-3xl sm:px-4">
      {groups.map((group) => (
        <div key={group.dateISO} className="flex flex-col gap-4">
          {group.sales.map((s) => {
            const invoice = invoicesByOrder?.get(s.id);
            return (
            <div
              key={s.id}
              ref={
                targetId === s.id && onSaleElement
                  ? (element) => onSaleElement(s.id, element)
                  : undefined
              }
              data-sale-id={s.id}
              className={`rounded-xl transition-all duration-300 motion-reduce:transition-none ${
                highlightedId === s.id
                  ? "bg-[#0B3F64]/10 ring-2 ring-[#0B3F64]"
                  : ""
              }`}
            >
              <SaleCard
                sale={s}
                selected={selectedId === s.id}
                onSelect={onSelect ? () => onSelect(s) : undefined}
                onDetails={onDetails}
                onReceipt={onReceipt}
                onSendWhatsApp={onSendWhatsApp}
                taxSettingsEnabled={taxSettingsEnabled}
                electronicInvoicingEnabled={electronicInvoicingEnabled}
                fiscalDocument={invoice}
                creditNote={invoice ? creditNotesByInvoice?.get(invoice.id) : undefined}
                onFiscalView={onFiscalView}
                onFiscalReceipt={onFiscalReceipt}
                onFiscalDownload={onFiscalDownload}
                onFiscalDispatch={onFiscalDispatch}
                onFiscalRetry={onFiscalRetry}
                onFiscalAnnul={onFiscalAnnul}
                onCompleteAnnulment={onCompleteAnnulment}
              />
            </div>
            );
          })}
        </div>
      ))}
    </main>
  );
}
