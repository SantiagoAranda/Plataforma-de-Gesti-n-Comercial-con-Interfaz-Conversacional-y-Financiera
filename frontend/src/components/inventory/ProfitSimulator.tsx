"use client";

import { useState } from "react";

import { formatMoney, formatQuantityCompact } from "@/src/lib/formatters";

const MIN_MARGIN = 0;
const MAX_MARGIN = 95;

export function normalizeDesiredMargin(value: number): number {
  if (!Number.isFinite(value)) return MIN_MARGIN;
  return Math.min(MAX_MARGIN, Math.max(MIN_MARGIN, value));
}

export function calculateSuggestedPrice(cost: number, desiredMargin: number): number {
  if (!Number.isFinite(cost) || cost <= 0) return 0;

  const normalizedMargin = normalizeDesiredMargin(desiredMargin);
  return cost / (1 - normalizedMargin / 100);
}

type ProfitSimulatorProps = {
  cost: number | null;
  initialMargin?: number;
};

export function ProfitSimulator({ cost, initialMargin = 30 }: ProfitSimulatorProps) {
  const [margin, setMargin] = useState(() => normalizeDesiredMargin(initialMargin));
  const [inputValue, setInputValue] = useState(() => formatQuantityCompact(normalizeDesiredMargin(initialMargin), 2));
  const safeCost = Number.isFinite(cost) ? Number(cost) : 0;
  const typedMargin = Number(inputValue.trim().replace(",", "."));
  const activeMargin = inputValue.trim() !== "" && Number.isFinite(typedMargin)
    ? normalizeDesiredMargin(typedMargin)
    : margin;
  const suggestedPrice = calculateSuggestedPrice(safeCost, activeMargin);

  const updateMargin = (next: number) => {
    const normalized = normalizeDesiredMargin(next);
    setMargin(normalized);
    setInputValue(formatQuantityCompact(normalized, 2));
  };

  const commitInput = () => {
    const parsed = Number(inputValue.trim().replace(",", "."));
    updateMargin(Number.isFinite(parsed) ? parsed : margin);
  };

  return (
    <section className="rounded-xl border border-indigo-200 bg-indigo-50/70 px-4 py-3" aria-label="Simulación temporal de rentabilidad">
      <div className="grid grid-cols-2 items-start gap-4">
        <div className="flex min-w-0 flex-col items-start">
          <span className="block text-[9px] font-medium uppercase leading-none tracking-wider text-indigo-600">Precio sugerido</span>
          <span className="mt-1 flex h-7 items-center truncate whitespace-nowrap text-sm font-semibold leading-none tracking-tight text-indigo-700 tabular-nums sm:text-base">
            ${formatMoney(suggestedPrice)}
          </span>
        </div>

        <div className="flex min-w-0 flex-col items-center">
          <span className="block text-[9px] font-medium uppercase leading-none tracking-wider text-indigo-600">% Utilidad</span>
          <div className="mt-1 flex h-7 items-center justify-center gap-1">
            <button
              type="button"
              onClick={() => updateMargin(margin - 1)}
              disabled={margin <= MIN_MARGIN}
              aria-label="Disminuir utilidad"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-sm font-normal leading-none text-indigo-700 transition hover:bg-indigo-100 disabled:pointer-events-none disabled:opacity-30"
            >
              −
            </button>
            <input
              type="text"
              inputMode="decimal"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onBlur={commitInput}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              aria-label="Utilidad deseada"
              className="h-7 w-9 min-w-0 bg-transparent px-0 text-center text-sm font-semibold leading-none text-indigo-700 outline-none transition focus:border-b focus:border-indigo-400"
            />
            <span className="grid h-7 w-3 shrink-0 place-items-center text-sm font-semibold leading-none text-indigo-700">%</span>
            <button
              type="button"
              onClick={() => updateMargin(margin + 1)}
              disabled={margin >= MAX_MARGIN}
              aria-label="Aumentar utilidad"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-sm font-normal leading-none text-indigo-700 transition hover:bg-indigo-100 disabled:pointer-events-none disabled:opacity-30"
            >
              +
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
