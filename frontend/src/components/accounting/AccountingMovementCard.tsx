"use client";

import {
  Banknote,
  Landmark,
  PiggyBank,
  Wallet,
  WalletCards,
} from "lucide-react";
import type {
  AccountingMovement,
  AccountingMovementOriginType,
} from "@/src/services/accounting";
import { SelectableCard } from "@/src/components/shared/selection/SelectableCard";

type MovementKind =
  | "TODOS"
  | "INGRESOS"
  | "GASTOS"
  | "ACTIVOS"
  | "PASIVOS"
  | "PATRIMONIO";

type Props = {
  movement: AccountingMovement;
  selected?: boolean;
  onSelect: () => void;
  onOpen?: () => void;
};

const originBadgeColor: Record<
  AccountingMovementOriginType | "RECURRENTE" | "SISTEMA",
  string
> = {
  MANUAL: "bg-neutral-100 text-neutral-700",
  ORDER: "bg-emerald-50 text-emerald-700",
  RECURRENTE: "bg-emerald-50 text-emerald-700",
  SISTEMA: "bg-sky-50 text-sky-700",
};

function categoryFromPuc(code?: string): MovementKind {
  const c = (code ?? "").trim();
  const first = c[0];

  if (first === "1") return "ACTIVOS";
  if (first === "2") return "PASIVOS";
  if (first === "3") return "PATRIMONIO";
  if (first === "4") return "INGRESOS";
  if (first === "5" || first === "6" || first === "7") return "GASTOS";

  return "TODOS";
}

function formatCurrency(n: number) {
  return n.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
  });
}

function iconForCategory(kind: MovementKind) {
  if (kind === "INGRESOS") {
    return <Banknote className="h-5 w-5 text-emerald-600" />;
  }
  if (kind === "GASTOS") {
    return <Wallet className="h-5 w-5 text-rose-500" />;
  }
  if (kind === "ACTIVOS") {
    return <WalletCards className="h-5 w-5 text-sky-600" />;
  }
  if (kind === "PASIVOS") {
    return <Landmark className="h-5 w-5 text-amber-600" />;
  }
  if (kind === "PATRIMONIO") {
    return <PiggyBank className="h-5 w-5 text-indigo-600" />;
  }

  return <Banknote className="h-5 w-5 text-neutral-500" />;
}

function badgeForOrigin(
  origin?: AccountingMovementOriginType | "RECURRENTE" | "SISTEMA"
) {
  const label = origin ?? "MANUAL";
  const cls = originBadgeColor[label] ?? "bg-neutral-100 text-neutral-700";

  return (
    <span
      className={`rounded-full px-3 py-1 text-[11px] font-semibold ${cls}`}
    >
      {label}
    </span>
  );
}

function badgeForNature(nature?: "DEBIT" | "CREDIT") {
  if (nature === "DEBIT") {
    return (
      <span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-semibold text-blue-700">
        Débito
      </span>
    );
  }
  if (nature === "CREDIT") {
    return (
      <span className="rounded-full bg-purple-50 px-3 py-1 text-[11px] font-semibold text-purple-700">
        Crédito
      </span>
    );
  }
  return null;
}

export function AccountingMovementCard({
  movement,
  selected = false,
  onSelect,
  onOpen,
}: Props) {
  const kind = categoryFromPuc(movement.pucCode);
  const amount = Number(movement.amount);
  const isNegative = amount < 0;

  return (
    <SelectableCard
      selected={selected}
      onSelect={onSelect}
      onOpen={onOpen}
      className="px-4 py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50">
            {iconForCategory(kind)}
          </div>

          <div className="min-w-0 space-y-1">
            <div className="text-sm font-semibold text-neutral-900">
              {movement.pucCode} - {movement.pucName}
            </div>
            <div className="text-sm text-neutral-600">
              {movement.detail || "Sin descripción"}
            </div>
          </div>
        </div>

        <div
          className={`shrink-0 text-base font-bold ${
            movement.nature === "DEBIT" ? "text-emerald-700" : "text-rose-600"
          }`}
        >
          {formatCurrency(amount)}
        </div>
      </div>

      <div className="mt-3 border-t border-neutral-100 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-2 w-2 rounded-full bg-neutral-400" />
            {new Date(movement.createdAt || movement.date).toLocaleString("es-CO", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>

          <div className="flex items-center gap-2">
            {badgeForOrigin(movement.originType)}
            {badgeForNature(movement.nature)}
          </div>
        </div>
      </div>
    </SelectableCard>
  );
}