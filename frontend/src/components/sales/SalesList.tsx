"use client";

import type { Sale } from "@/src/types/sales";
import SaleCard from "./SaleCard";
import { getBusinessDayKey, getRelativeBusinessDayLabel } from "@/src/lib/businessDate";

type Props = {
  sales: Sale[];
  selectedId?: string | null;
  onSelect?: (sale: Sale) => void;
  onDetails?: (sale: Sale) => void;
  onSendWhatsApp?: (sale: Sale) => void;
};

function getDayLabel(date: Date) {
  return getRelativeBusinessDayLabel(date);
}

function groupSalesByDate(sales: Sale[]) {
  const groups: Record<string, Sale[]> = {};

  sales.forEach((sale) => {
    const date = new Date(sale.createdAt);
    const key = getBusinessDayKey(date);

    if (!groups[key]) groups[key] = [];

    groups[key].push(sale);
  });

  return Object.entries(groups)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([dateKey, sales]) => ({
      label: getDayLabel(new Date(`${dateKey}T12:00:00Z`)),
      sales,
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
    <main className="flex flex-col p-4 gap-6 max-w-md mx-auto pb-24">

      {sales?.length === 0 && (
        <div className="text-center text-gray-400 text-sm mt-10">
          No hay ventas todavía
        </div>
      )}

      {groups.map((group, idx) => (
        <div key={idx} className="flex flex-col gap-4">

          {/* etiqueta de día */}
          <div className="flex justify-center">
            <span className="bg-white/60 backdrop-blur-sm text-[11px] font-semibold text-gray-500 px-3 py-1 rounded-full uppercase tracking-wider">
              {group.label}
            </span>
          </div>

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
