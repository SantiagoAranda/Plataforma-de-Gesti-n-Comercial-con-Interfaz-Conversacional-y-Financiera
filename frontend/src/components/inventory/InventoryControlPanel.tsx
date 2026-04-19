"use client";

import { Banknote, PackageCheck, RotateCcw, ShoppingBag, TrendingDown, TrendingUp } from "lucide-react";
import { InventoryMovementFeed, type InventoryMovement } from "./InventoryMovementFeed";
import { formatMoney } from "@/src/lib/formatters";

export type InventoryAction = "PURCHASE" | "SALE" | "PURCHASE_RETURN" | "SALE_RETURN";

type Props = {
  averageCost: number;
  inventoryValue: number;
  movements: InventoryMovement[];
  activeAction: InventoryAction;
  onAction: (action: InventoryAction) => void;
};

const actions: {
  label: string;
  value: InventoryAction;
  icon: typeof ShoppingBag;
  className: string;
}[] = [
  { label: "Compra", value: "PURCHASE", icon: ShoppingBag, className: "bg-emerald-50 text-emerald-700" },
  { label: "Venta", value: "SALE", icon: TrendingDown, className: "bg-rose-50 text-rose-700" },
  { label: "Dev. compra", value: "PURCHASE_RETURN", icon: RotateCcw, className: "bg-amber-50 text-amber-700" },
  { label: "Dev. venta", value: "SALE_RETURN", icon: TrendingUp, className: "bg-sky-50 text-sky-700" },
];

export function InventoryControlPanel({
  averageCost,
  inventoryValue,
  movements,
  activeAction,
  onAction,
}: Props) {
  return (
    <section className="h-full overflow-y-auto custom-scrollbar px-4 py-4 pb-44">
      <div className="mx-auto w-full max-w-md space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-neutral-900">Control de inventario</h2>
          <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700">
            Saldo
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-emerald-50 text-emerald-700">
              <Banknote className="h-4 w-4" />
            </div>
            <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-neutral-400">
              Costo promedio
            </p>
            <p className="mt-1 text-lg font-black text-neutral-900">${formatMoney(averageCost)}</p>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-sky-50 text-sky-700">
              <PackageCheck className="h-4 w-4" />
            </div>
            <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-neutral-400">
              Valor inventario
            </p>
            <p className="mt-1 text-lg font-black text-neutral-900">${formatMoney(inventoryValue)}</p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.value}
                type="button"
                onClick={() => onAction(action.value)}
                className={`flex min-h-[70px] flex-col items-center justify-center gap-2 rounded-2xl border text-[10px] font-black transition active:scale-95 ${
                  activeAction === action.value
                    ? "border-emerald-200 bg-white text-neutral-900 shadow-sm"
                    : "border-neutral-100 bg-white/70 text-neutral-500"
                }`}
              >
                <span className={`grid h-8 w-8 place-items-center rounded-full ${action.className}`}>
                  <Icon className="h-4 w-4" />
                </span>
                {action.label}
              </button>
            );
          })}
        </div>

        <div className="pt-1">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-neutral-900">Historial de movimiento</h3>
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
              Kardex
            </span>
          </div>
          <InventoryMovementFeed movements={movements} />
        </div>
      </div>
    </section>
  );
}
