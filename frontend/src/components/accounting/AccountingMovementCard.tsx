"use client";

import {
  Banknote,
  Landmark,
  MoreVertical,
  PiggyBank,
  Wallet,
  WalletCards,
} from "lucide-react";
import type {
  AccountingMovement,
} from "@/src/services/accounting";
import { formatBusinessDateTime } from "@/src/lib/businessDate";

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

const categoryStyles: Record<
  MovementKind,
  { label: string; amount: string; badge: string }
> = {
  TODOS: {
    label: "General",
    amount: "text-neutral-900",
    badge: "bg-neutral-100 text-neutral-700 border border-neutral-200",
  },
  INGRESOS: {
    label: "Ingreso",
    amount: "text-emerald-700",
    badge: "bg-emerald-50 text-[#047857] border border-emerald-200",
  },
  GASTOS: {
    label: "Gasto/Costo",
    amount: "text-[#C80237]",
    badge: "bg-[#C80237]/12 text-[#C80237] border border-[#C80237]/20",
  },
  ACTIVOS: {
    label: "Activo",
    amount: "text-emerald-700",
    badge: "bg-emerald-50 text-[#047857] border border-emerald-200",
  },
  PASIVOS: {
    label: "Pasivo",
    amount: "text-[#C80237]",
    badge: "bg-[#C80237]/12 text-[#C80237] border border-[#C80237]/20",
  },
  PATRIMONIO: {
    label: "Patrimonio",
    amount: "text-emerald-700",
    badge: "bg-emerald-50 text-[#047857] border border-emerald-200",
  },
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

function getIconStyles(kind: MovementKind) {
  if (kind === "INGRESOS") {
    return {
      bgClass: "bg-emerald-50",
      iconClass: "text-[#047857]",
    };
  }
  if (kind === "GASTOS") {
    return {
      bgClass: "bg-[#C80237]/12",
      iconClass: "text-[#C80237]",
    };
  }
  return {
    bgClass: "bg-[#E6EFF5]",
    iconClass: "text-[#0B3F64]",
  };
}

function iconForCategory(kind: MovementKind, colorClass: string) {
  const cn = `h-5 w-5 ${colorClass}`;
  if (kind === "INGRESOS") {
    return <Banknote className={cn} />;
  }
  if (kind === "GASTOS") {
    return <Wallet className={cn} />;
  }
  if (kind === "ACTIVOS") {
    return <WalletCards className={cn} />;
  }
  if (kind === "PASIVOS") {
    return <Landmark className={cn} />;
  }
  if (kind === "PATRIMONIO") {
    return <PiggyBank className={cn} />;
  }

  return <Banknote className={cn} />;
}

function badgeForNature(nature?: "DEBIT" | "CREDIT") {
  if (nature === "DEBIT") {
    return (
      <span className="inline-flex h-6 w-fit items-center justify-center whitespace-nowrap rounded-full bg-[#E6EFF5] px-2.5 text-[10px] font-medium leading-none text-[#0B3F64] border border-[#CEE0EC] sm:px-3 sm:text-[11px]">
        Débito
      </span>
    );
  }
  if (nature === "CREDIT") {
    return (
      <span className="inline-flex h-6 w-fit items-center justify-center whitespace-nowrap rounded-full bg-[#E6EFF5] px-2.5 text-[10px] font-medium leading-none text-[#0B3F64] border border-[#CEE0EC] sm:px-3 sm:text-[11px]">
        Crédito
      </span>
    );
  }
  return null;
}

function getReadableDetail(detailStr: string | null | undefined, originType?: string): string {
  if (!detailStr) return "";
  const trimmed = detailStr.trim();
  
  const jsonStart = trimmed.indexOf("{");
  const prefix = jsonStart >= 0 ? trimmed.slice(0, jsonStart).trim() : "";
  const jsonCandidate = jsonStart >= 0 ? trimmed.slice(jsonStart).trim() : trimmed;

  if (jsonCandidate.startsWith("{") && jsonCandidate.endsWith("}")) {
    try {
      const data = JSON.parse(jsonCandidate);

      const isRegularization = data.type === "INITIAL_BENEFIT_REGULARIZATION" || originType === "PAYROLL_INITIAL_BALANCE";
      
      if (isRegularization && data.benefitType === "PRIMA") {
        const semesterText = data.semester === 2 ? "semestre II" : "semestre I";
        const yearText = data.year || "";
        const nameText = data.employeeName || data.employee || "";
        
        if (nameText) {
          return `Regularización inicial de prima ${semesterText} ${yearText} - ${nameText}`;
        }
        return `Regularización inicial de prima ${semesterText} ${yearText}`;
      }

      if (originType === "PAYROLL_BENEFIT_PAYMENT" || data.type === "PAYROLL_BENEFIT_PAYMENT" || data.type === "BENEFIT_PAYMENT") {
        const benefitType = data.benefitType || data.type || "PRIMA";
        const benefitLabel = benefitType === "PRIMA" ? "prima" : benefitType;
        const semesterText = data.semester === 2 ? "semestre II" : "semestre I";
        const yearText = data.year || "";
        const nameText = data.employeeName || data.employee || "";
        
        if (nameText) {
          return `Pago de prima ${semesterText} ${yearText} - ${nameText}`;
        }
        return `Pago de prima ${semesterText} ${yearText}`;
      }

      const parts: string[] = [];
      if (data.employee) {
        parts.push(`Empleado: ${data.employee}`);
      }
      if (data.benefitType || data.type) {
        const typeStr = data.benefitType || data.type;
        const typeLabel = typeStr === "PRIMA" ? "Prima de Servicios" : typeStr;
        
        let periodStr = "";
        if (data.year && data.semester) {
          periodStr = ` (${data.year}-S${data.semester})`;
        } else if (data.period) {
          periodStr = ` (${data.period})`;
        }
        parts.push(`Pago de ${typeLabel}${periodStr}`);
      }
      if (data.reason) {
        let reasonLabel = data.reason;
        if (data.reason === "INSUFFICIENT_HISTORICAL_PAYROLL_RUNS") {
          reasonLabel = "Insuficiencia de históricos de nómina";
        } else if (data.reason === "ROUNDING") {
          reasonLabel = "Ajuste por redondeo";
        } else if (data.reason === "INITIAL_BALANCE") {
          reasonLabel = "Saldo inicial de provisión";
        }
        parts.push(`Regularización (${reasonLabel})`);
      }
      
      if (parts.length > 0) {
        return parts.join(" - ");
      }
      
      return Object.entries(data)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
    } catch {
      // fallback
    }
  }
  return detailStr;
}

export function AccountingMovementCard({
  movement,
  selected = false,
  onSelect,
}: Props) {
  const kind = categoryFromPuc(movement.pucCode);
  const kindStyle = categoryStyles[kind];
  const amount = Number(movement.amount);
  const iconStyle = getIconStyles(kind);

  return (
    <div
      className={`rounded-3xl border px-4 py-3 select-none transition-all ${
        selected
          ? "bg-emerald-50 border-emerald-300 shadow-md"
          : "bg-white border-black/5 shadow-sm"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${iconStyle.bgClass}`}>
            {iconForCategory(kind, iconStyle.iconClass)}
          </div>
 
          <div className="min-w-0 space-y-1">
            <div className="text-sm font-semibold text-neutral-900 truncate">
              {movement.pucCode} - {movement.pucName}
            </div>
            <div className="text-xs text-neutral-500 leading-normal line-clamp-2">
              {getReadableDetail(movement.detail, movement.originType)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-base font-semibold ${kindStyle.amount}`}>
            {formatCurrency(amount)}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition duration-150"
            aria-label="Opciones de movimiento"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 border-t border-neutral-100 pt-3">
        <div className="flex flex-col gap-1 text-xs text-neutral-500 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid min-w-0 grid-cols-[56px_60px_auto] items-center gap-1 sm:grid-cols-[88px_88px_auto] sm:gap-2">
            <div className="w-[56px] sm:w-[88px]">
              {movement.nature === "DEBIT" ? badgeForNature(movement.nature) : null}
            </div>
            <div className="w-[60px] sm:w-[88px]">
              {movement.nature === "CREDIT" ? badgeForNature(movement.nature) : null}
            </div>
            <div className="min-w-0 overflow-visible">
              <span
                className={`inline-flex h-6 w-fit shrink-0 items-center justify-center whitespace-nowrap rounded-full px-2.5 text-[10px] font-semibold leading-none uppercase tracking-wide sm:px-3 sm:text-[11px] ${kindStyle.badge}`}
                title={kindStyle.label}
              >
                {kindStyle.label}
              </span>
            </div>
          </div>

          <span className="self-end whitespace-nowrap text-[10px] text-neutral-400 sm:self-auto sm:text-[11px]">
            {formatBusinessDateTime(movement.createdAt || movement.date, "es-AR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>
    </div>
  );
}
