"use client";

import { Minus, Plus } from "lucide-react";

export type StockMovementType = "PURCHASE" | "ADJUSTMENT_POSITIVE" | "ADJUSTMENT_NEGATIVE";

type Props = {
  quantity: string;
  unitCost: string;
  reason: string;
  movementType: StockMovementType;
  onQuantityChange: (value: string) => void;
  onUnitCostChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onMovementTypeChange: (value: StockMovementType) => void;
};

const movementOptions: { label: string; value: StockMovementType }[] = [
  { label: "Compra", value: "PURCHASE" },
  { label: "Ajuste +", value: "ADJUSTMENT_POSITIVE" },
  { label: "Ajuste -", value: "ADJUSTMENT_NEGATIVE" },
];

export function InventoryStockForm({
  quantity,
  unitCost,
  reason,
  movementType,
  onQuantityChange,
  onUnitCostChange,
  onReasonChange,
  onMovementTypeChange,
}: Props) {
  return (
    <div className="space-y-5">
      <div className="flex bg-neutral-100 rounded-full p-1">
        {movementOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onMovementTypeChange(option.value)}
            className={`flex-1 py-2 rounded-full text-xs font-bold transition ${
              movementType === option.value
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-500"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
            Cantidad
          </label>
          <div className="flex items-center rounded-2xl border border-neutral-100 bg-white px-2 py-2 shadow-sm">
            <button
              type="button"
              onClick={() => onQuantityChange(String(Math.max(1, Number(quantity || 1) - 1)))}
              className="grid h-8 w-8 place-items-center rounded-full bg-neutral-100 text-neutral-600"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <input
              value={quantity}
              onChange={(e) => onQuantityChange(e.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              className="min-w-0 flex-1 bg-transparent px-2 text-center text-sm font-black outline-none"
            />
            <button
              type="button"
              onClick={() => onQuantityChange(String(Number(quantity || 0) + 1))}
              className="grid h-8 w-8 place-items-center rounded-full bg-emerald-100 text-emerald-700"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
            Costo unit.
          </label>
          <div className="flex h-[48px] items-center rounded-2xl border border-neutral-100 bg-white px-4 shadow-sm">
            <span className="mr-2 text-sm text-neutral-400">$</span>
            <input
              value={unitCost}
              onChange={(e) => onUnitCostChange(e.target.value.replace(/[^0-9.,]/g, ""))}
              inputMode="decimal"
              placeholder="0"
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
          Motivo
        </label>
        <input
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder="Ej: reposicion semanal"
          className="w-full rounded-2xl border border-neutral-100 bg-white px-4 py-3 text-sm font-semibold outline-none shadow-sm focus:border-emerald-500"
        />
      </div>
    </div>
  );
}
