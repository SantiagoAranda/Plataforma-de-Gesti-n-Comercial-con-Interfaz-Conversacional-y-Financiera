import type { BackendMovement } from "@/src/services/accounting";
import {
  formatBusinessDateTime,
  formatBusinessTime,
  getBusinessDayKey,
} from "@/src/lib/businessDate";
import type { Sale } from "@/src/types/sales";

export type ModuleActivitySummary = {
  module: "BUSINESS" | "SALES" | "ACCOUNTING" | "INVENTORY" | "PAYROLL";
  title: string;
  subtitle: string;
  lastActivityAt?: string | null;
  isRecent: boolean;
  href: string;
  accent: "blue" | "green" | "amber";
};

export type BusinessItem = {
  id: string;
  type: "PRODUCT" | "SERVICE";
  name: string;
  price?: number;
  createdAt?: string;
  updatedAt?: string;
};

const FALLBACK_NO_ACTIVITY = "Sin actividad registrada";

function parseDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatAbsoluteDateTime(date: Date) {
  return formatBusinessDateTime(date, "es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatActivityFallback(date?: string | null) {
  const parsed = parseDate(date);
  if (!parsed) return FALLBACK_NO_ACTIVITY;

  const sameDay = getBusinessDayKey(parsed) === getBusinessDayKey(new Date());

  if (sameDay) {
    return ` hoy ${formatBusinessTime(parsed, "es-AR")}`;
  }

  return ` ${formatAbsoluteDateTime(parsed)}`;
}

function buildSubtitle(activityText?: string | null, date?: string | null) {
  const normalized = activityText?.trim();
  if (normalized) return ` ${normalized}`;
  return formatActivityFallback(date);
}

function isUpdatedAfterCreate(createdAt?: string | null, updatedAt?: string | null) {
  const created = parseDate(createdAt);
  const updated = parseDate(updatedAt);
  if (!created || !updated) return false;
  return updated.getTime() > created.getTime() + 1000;
}

function getLatestTimestamp(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (parseDate(value)) return value ?? null;
  }
  return null;
}

export function isRecentActivity(date?: string | null) {
  const parsed = parseDate(date);
  if (!parsed) return false;
  const diffHours = (Date.now() - parsed.getTime()) / 36e5;
  return diffHours <= 24;
}

export function formatActivityTime(date?: string | null) {
  const d = parseDate(date);
  if (!d) return "Sin actividad";

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMinutes = Math.round(diffMs / 60000);
  const diffDays = diffMs / 86400000;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isSameDay = getBusinessDayKey(d) === getBusinessDayKey(now);
  const isYesterday = getBusinessDayKey(d) === getBusinessDayKey(yesterday);

  if (diffMinutes < 2) return "AHORA";
  if (diffMinutes < 60) return `hace ${diffMinutes} min`;
  if (isSameDay) return formatBusinessTime(d, "es-AR");
  if (isYesterday) return "Ayer";
  if (diffDays < 7) {
    return formatBusinessDateTime(d, "es-AR", { weekday: "short" }).replace(/\.$/, "");
  }

  return formatBusinessDateTime(d, "es-AR", {
    day: "2-digit",
    month: "short",
  });
}

function formatCurrency(amount: number) {
  return amount.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  });
}

const byDateDesc = <T,>(arr: T[], getDate: (item: T) => string | undefined | null) =>
  [...arr].sort((a, b) => {
    const ad = parseDate(getDate(a))?.getTime() ?? 0;
    const bd = parseDate(getDate(b))?.getTime() ?? 0;
    return bd - ad;
  });

export function mapBusinessActivity(latest: BusinessItem | null): ModuleActivitySummary {
  const lastActivityAt = latest ? getLatestTimestamp(latest.updatedAt, latest.createdAt) : null;

  let activityText: string | null = null;
  if (latest) {
    const itemType = latest.type === "SERVICE" ? "Servicio" : "Producto";
    const itemName = latest.name?.trim();
    const action = isUpdatedAfterCreate(latest.createdAt, latest.updatedAt)
      ? "actualizado"
      : "creado";

    activityText = itemName
      ? `${itemType} "${itemName}" ${action}`
      : `${itemType} ${action}`;
  }

  return {
    module: "BUSINESS",
    title: "Mi Negocio",
    subtitle: buildSubtitle(activityText, lastActivityAt),
    lastActivityAt,
    isRecent: isRecentActivity(lastActivityAt),
    href: "/mi-negocio",
    accent: "blue",
  };
}

export function mapSalesActivity(orders: Sale[]): ModuleActivitySummary {
  const sorted = byDateDesc(orders, (o) => o.createdAt);
  const latest = sorted[0];

  const lastActivityAt = latest?.createdAt ?? null;

  let activityText: string | null = null;
  if (latest) {
    const total = latest.total;
    const statusLabel: Record<Sale["status"], string> = {
      "PENDIENTE DE CIERRE": "Venta pendiente de cierre",
      PENDIENTE: "Venta pendiente",
      CERRADO: "Venta completada",
      CANCELADO: "Venta cancelada",
      CONFIRMADO: "Venta confirmada",
    };

    const base = statusLabel[latest.status] ?? "Venta registrada";
    const customer = latest.customerName?.trim();

    if (customer && total) {
      activityText = `${base} de ${customer} por ${formatCurrency(total)}`;
    } else if (customer) {
      activityText = `${base} de ${customer}`;
    } else if (total) {
      activityText = `${base} por ${formatCurrency(total)}`;
    } else {
      activityText = base;
    }
  }

  return {
    module: "SALES",
    title: "Ventas",
    subtitle: buildSubtitle(activityText, lastActivityAt),
    lastActivityAt,
    isRecent: isRecentActivity(lastActivityAt),
    href: "/venta",
    accent: "green",
  };
}

function getReadableDetail(detailStr: string | null | undefined): string {
  if (!detailStr) return "";
  const trimmed = detailStr.trim();
  
  const jsonStart = trimmed.indexOf("{");
  const prefix = jsonStart >= 0 ? trimmed.slice(0, jsonStart).trim() : "";
  const jsonCandidate = jsonStart >= 0 ? trimmed.slice(jsonStart).trim() : trimmed;

  if (jsonCandidate.startsWith("{") && jsonCandidate.endsWith("}")) {
    try {
      const data = JSON.parse(jsonCandidate);

      const isRegularization = data.type === "INITIAL_BENEFIT_REGULARIZATION";
      
      if (isRegularization && data.benefitType === "PRIMA") {
        const semesterText = data.semester === 2 ? "semestre II" : "semestre I";
        const yearText = data.year || "";
        const nameText = data.employeeName || data.employee || "";
        
        if (nameText) {
          return `Regularización inicial de prima ${semesterText} ${yearText} - ${nameText}`;
        }
        return `Regularización inicial de prima ${semesterText} ${yearText}`;
      }

      if (data.type === "PAYROLL_BENEFIT_PAYMENT" || data.type === "BENEFIT_PAYMENT") {
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

export function mapAccountingActivity(movements: BackendMovement[]): ModuleActivitySummary {
  const sorted = byDateDesc(movements, (m) => m.updatedAt ?? m.createdAt ?? m.date);
  const latest = sorted[0];

  const lastActivityAt = latest
    ? getLatestTimestamp(latest.updatedAt, latest.createdAt, latest.date)
    : null;

  let activityText: string | null = null;
  if (latest) {
    let detail = getReadableDetail(latest.detail);

    if (detail) {
      detail = detail
        .replace(/product/gi, "producto")
        .replace(/service/gi, "servicio");
    }

    const accountName = latest.pucName?.trim();
    const accountCode = latest.pucCode?.trim();
    const amount = Number.isFinite(latest.amount)
      ? formatCurrency(Math.abs(latest.amount))
      : "";

    if (detail) {
      activityText = detail;
    } else if (accountName && amount) {
      activityText = `${accountName} por ${amount}`;
    } else if (accountCode && amount) {
      activityText = `${accountCode} por ${amount}`;
    } else if (accountName) {
      activityText = accountName;
    } else if (accountCode) {
      activityText = accountCode;
    }
  }

  return {
    module: "ACCOUNTING",
    title: "Contabilidad",
    subtitle: buildSubtitle(activityText, lastActivityAt),
    lastActivityAt,
    isRecent: isRecentActivity(lastActivityAt),
    href: "/contabilidad",
    accent: "amber",
  };
}

export function mapInventoryActivity(latest: BusinessItem | null): ModuleActivitySummary {
  const lastActivityAt = latest ? getLatestTimestamp(latest.updatedAt, latest.createdAt) : null;
  const productName = latest?.type === "PRODUCT" ? latest.name?.trim() : "";

  return {
    module: "INVENTORY",
    title: "Inventario",
    subtitle: productName
      ? ` Control de stock para "${productName}"`
      : " Stock, costo promedio y kardex",
    lastActivityAt,
    isRecent: isRecentActivity(lastActivityAt),
    href: "/inventario",
    accent: "green",
  };
}

export function mapPayrollActivity(): ModuleActivitySummary {
  return {
    module: "PAYROLL",
    title: "Nómina",
    subtitle: " Planilla, pagos y liquidaciones",
    lastActivityAt: null,
    isRecent: false,
    href: "/nomina",
    accent: "blue",
  };
}