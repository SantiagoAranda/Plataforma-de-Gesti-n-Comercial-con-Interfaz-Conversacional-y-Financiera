import type { BackendMovement } from "@/src/services/accounting";
import {
  formatBusinessDateTime,
  formatBusinessTime,
  getBusinessDayKey,
} from "@/src/lib/businessDate";

export type ModuleActivitySummary = {
  module: "BUSINESS" | "SALES" | "ACCOUNTING" | "INVENTORY";
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

export type ApiOrderItem = {
  quantity: number;
  unitPrice: number;
  itemNameSnapshot: string;
  item: { type: "PRODUCT" | "SERVICE"; durationMinutes?: number | null };
};

export type ApiOrder = {
  id: string;
  customerName: string;
  customerWhatsapp?: string;
  status: "DRAFT" | "SENT" | "COMPLETED" | "CANCELLED";
  createdAt: string;
  total?: number;
  items: ApiOrderItem[];
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
  if (isSameDay) {
    return formatBusinessTime(d, "es-AR");
  }
  if (isYesterday) return "Ayer";
  if (diffDays < 7) {
    return formatBusinessDateTime(d, "es-AR", { weekday: "short" })
      .replace(/\.$/, "");
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
    const action = isUpdatedAfterCreate(latest.createdAt, latest.updatedAt) ? "actualizado" : "creado";
    activityText = itemName ? `${itemType} "${itemName}" ${action}` : `${itemType} ${action}`;
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

export function mapSalesActivity(orders: ApiOrder[]): ModuleActivitySummary {
  const sorted = byDateDesc(orders, (o) => o.createdAt);
  const latest = sorted[0];

  const lastActivityAt = latest?.createdAt ?? null;

  let activityText: string | null = null;
  if (latest) {
    const total = latest.total ?? latest.items.reduce((acc, it) => acc + it.unitPrice * it.quantity, 0);
    const statusLabel: Record<ApiOrder["status"], string> = {
      DRAFT: "Pedido en borrador",
      SENT: "Pedido pendiente de cierre",
      COMPLETED: "Venta completada",
      CANCELLED: "Venta cancelada",
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

export function mapAccountingActivity(movements: BackendMovement[]): ModuleActivitySummary {
  const sorted = byDateDesc(movements, (m) => m.updatedAt ?? m.createdAt ?? m.date);
  const latest = sorted[0];

  const lastActivityAt = latest ? getLatestTimestamp(latest.updatedAt, latest.createdAt, latest.date) : null;

  let activityText: string | null = null;
  if (latest) {
    let detail = latest.detail?.trim();

    if (detail) {
      detail = detail
        .replace(/product/gi, "producto")
        .replace(/service/gi, "servicio");
    }
    const accountName = latest.pucName?.trim();
    const accountCode = latest.pucCode?.trim();
    const amount = Number.isFinite(latest.amount) ? formatCurrency(Math.abs(latest.amount)) : "";

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
