"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/src/lib/utils";

export function MovementProfitHero({
  amount,
  description,
  title = "Resultado del período",
}: {
  amount: number;
  description?: string;
  title?: string;
}) {
  const positive = amount > 0;
  const neutral = amount === 0;
  const tone = positive ? "text-emerald-700" : neutral ? "text-neutral-700" : "text-rose-700";

  return (
    <div className="rounded-[28px] border border-neutral-200 p-5 shadow-sm bg-white">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-neutral-600">{title}</div>
          <div className={cn("mt-2 text-4xl font-bold tracking-tight", tone, "whitespace-nowrap overflow-hidden text-ellipsis text-left")}>
            {amount.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })}
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            {description ?? "Ganancia neta"}
          </div>
        </div>
        <div
          className={cn(
            "grid h-14 w-14 place-items-center rounded-2xl text-white",
            positive ? "bg-emerald-600" : neutral ? "bg-neutral-400" : "bg-rose-600",
          )}
        >
          {positive ? <TrendingUp className="h-7 w-7" /> : neutral ? <TrendingUp className="h-7 w-7" /> : <TrendingDown className="h-7 w-7" />}
        </div>
      </div>
    </div>
  );
}
