"use client";

import { Barcode, PackageSearch, PencilLine, Plus, RotateCcw, Search } from "lucide-react";
import { ItemCard } from "@/src/components/mi-negocio/ItemCard";
import type { Item } from "@/src/types/item";
import { formatMoney } from "@/src/lib/formatters";

type Props = {
  query: string;
  selectedItem: Item | null;
  hasSearched: boolean;
  currentStock: number;
  averageCost: number;
  onScan: () => void;
  onRetry: () => void;
  onCreate: () => void;
  onStockLoad: () => void;
  onStockAdjust: () => void;
  onSelectItem: (item: Item) => void;
};

function InfoBubble({
  title,
  value,
  tone = "neutral",
}: {
  title: string;
  value: string;
  tone?: "neutral" | "green";
}) {
  return (
    <div className="ml-auto max-w-[82%] rounded-2xl rounded-tr-none bg-white px-4 py-3 shadow-sm ring-1 ring-black/5">
      <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
        {title}
      </p>
      <p
        className={`mt-1 text-xl font-black leading-none ${
          tone === "green" ? "text-emerald-600" : "text-neutral-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export function InventoryQuickPanel({
  query,
  selectedItem,
  hasSearched,
  currentStock,
  averageCost,
  onScan,
  onRetry,
  onCreate,
  onStockLoad,
  onStockAdjust,
  onSelectItem,
}: Props) {
  return (
    <section className="flex min-h-full flex-col px-4 pb-12 pt-4">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4">
        <div className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                Busqueda rapida
              </p>
              <h2 className="mt-1 text-lg font-bold text-neutral-900">Buscar / escanear insumo</h2>
              <p className="mt-1 text-xs font-medium leading-relaxed text-neutral-500">
                Usa el codigo, nombre o identificador y completa el movimiento desde el chat.
              </p>
            </div>

            <button
              type="button"
              onClick={onScan}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700 active:scale-95"
              aria-label="Escanear codigo"
            >
              <Barcode className="h-5 w-5" />
            </button>
          </div>
        </div>

        {!hasSearched && !selectedItem && (
          <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-white/70 px-6 py-12 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-neutral-50 text-neutral-300">
              <PackageSearch className="h-7 w-7" />
            </div>
            <h3 className="mt-4 text-sm font-bold text-neutral-900">Listo para buscar</h3>
            <p className="mt-1 max-w-xs text-xs font-medium leading-relaxed text-neutral-400">
              Escribi abajo o toca el lector para iniciar la carga rapida.
            </p>
          </div>
        )}

        {hasSearched && !selectedItem && (
          <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-white px-6 py-10 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-neutral-50 text-neutral-300">
              <Search className="h-7 w-7" />
            </div>
            <h3 className="mt-4 text-sm font-bold text-neutral-900">No encontramos ese insumo</h3>
            <p className="mt-1 max-w-xs text-xs font-medium leading-relaxed text-neutral-400">
              {query ? `"${query}" no coincide con items activos.` : "Ingresa un codigo para buscar."}
            </p>
            <div className="mt-5 grid w-full grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onRetry}
                className="h-11 rounded-full bg-neutral-100 text-xs font-bold text-neutral-600 active:scale-95"
              >
                Corregir codigo
              </button>
              <button
                type="button"
                onClick={onCreate}
                className="h-11 rounded-full bg-emerald-500 text-xs font-bold text-white shadow-sm active:scale-95"
              >
                Crear insumo
              </button>
            </div>
          </div>
        )}

        {selectedItem && (
          <div className="space-y-4 pb-10">
            <ItemCard
              item={selectedItem}
              selected={false}
              onSelect={() => onSelectItem(selectedItem)}
            />

            <div className="space-y-2">
              <InfoBubble title="Stock" value={String(currentStock)} />
              <InfoBubble title="Costo promedio" value={`$${formatMoney(averageCost)}`} />
              <InfoBubble title="Precio" value={`$${formatMoney(selectedItem.price)}`} tone="green" />
            </div>

            <div className="rounded-[28px] bg-white p-2 shadow-sm ring-1 ring-black/5">
              <button
                type="button"
                onClick={onStockLoad}
                className="flex min-h-[56px] w-full items-center justify-between gap-3 rounded-[22px] px-4 text-left transition active:scale-[0.99]"
              >
                <span>
                  <span className="block text-sm font-black text-neutral-900">Cargar stock</span>
                  <span className="mt-0.5 block text-[11px] font-medium text-neutral-400">
                    Registrar entrada o compra
                  </span>
                </span>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-500 text-white">
                  <Plus className="h-4 w-4" />
                </span>
              </button>

              <div className="mx-4 h-px bg-neutral-100" />

              <button
                type="button"
                onClick={onStockAdjust}
                className="flex min-h-[56px] w-full items-center justify-between gap-3 rounded-[22px] px-4 text-left transition active:scale-[0.99]"
              >
                <span>
                  <span className="block text-sm font-black text-neutral-900">Modificar</span>
                  <span className="mt-0.5 block text-[11px] font-medium text-neutral-400">
                    Ajustar saldo contado
                  </span>
                </span>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-700">
                  <PencilLine className="h-4 w-4" />
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={onRetry}
              className="mx-auto flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-400"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Buscar otro insumo
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
