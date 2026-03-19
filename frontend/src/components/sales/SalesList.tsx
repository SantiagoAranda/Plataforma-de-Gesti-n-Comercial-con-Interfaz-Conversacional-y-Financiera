"use client";

import type { Sale } from "@/src/types/sales";
import SaleCard from "./SaleCard";
import { getBusinessDayKey } from "@/src/lib/businessDate";
import { DateSeparator } from "@/src/components/shared/DateSeparator";

type Props = {
  sales: Sale[];
  selectedId?: string | null;
  onSelect?: (sale: Sale) => void;
  onDetails?: (sale: Sale) => void;
  onSendWhatsApp?: (sale: Sale) => void;
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
  onSelect,
  onDetails,
  onSendWhatsApp,
}: Props) {
  const groups = groupSalesByDate(sales);

  return (
    <main className="flex flex-col p-4 gap-4 max-w-md mx-auto">
      {groups.map((group, idx) => (
        <div key={idx} className="flex flex-col gap-4">
          <DateSeparator dateISO={group.dateISO} />

          {group.sales.map((s) => (
            <SaleCard
              key={s.id}
              sale={s}
              selected={selectedId === s.id}
              onSelect={onSelect ? () => onSelect(s) : undefined}
              onDetails={onDetails}
              onSendWhatsApp={onSendWhatsApp}
            />
          ))}
        </div>
      ))}
    </main>
  );
}
