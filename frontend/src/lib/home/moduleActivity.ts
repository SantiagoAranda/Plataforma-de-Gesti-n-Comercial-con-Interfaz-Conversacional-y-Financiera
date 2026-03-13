import type { BackendMovement } from "@/src/services/accounting";

export type ModuleActivitySummary = {
  module: "BUSINESS" | "SALES" | "ACCOUNTING";
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
  items: ApiOrderItem[];
};

export function isRecentActivity(date?: string | null) {
  if (!date) return false;
  const ts = new Date(date).getTime();
  if (Number.isNaN(ts)) return false;
  const diffHours = (Date.now() - ts) / 36e5;
  return diffHours <= 24;
}

export function formatActivityTime(date?: string | null) {
  if (!date) return "Sin actividad";

  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "Sin actividad";

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMinutes = Math.round(diffMs / 60000);
  const diffDays = diffMs / 86400000;

  const isSameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();

  if (diffMinutes < 2) return "AHORA";
  if (diffMinutes < 60) return `hace ${diffMinutes} min`;
  if (isSameDay) {
    return d.toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (isYesterday) return "Ayer";
  if (diffDays < 7) {
    return d
      .toLocaleDateString("es-AR", { weekday: "short" })
      .replace(/\.$/, "");
  }
  return d.toLocaleDateString("es-AR", {
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
    const ad = new Date(getDate(a) ?? 0).getTime();
    const bd = new Date(getDate(b) ?? 0).getTime();
    return bd - ad;
  });

export function mapBusinessActivity(items: BusinessItem[]): ModuleActivitySummary {
  const sorted = byDateDesc(items, (i) => i.updatedAt ?? i.createdAt ?? undefined);
  const latest = sorted[0];

  const productCount = items.filter((i) => i.type === "PRODUCT").length;
  const serviceCount = items.filter((i) => i.type === "SERVICE").length;

  let subtitle = "Todavia no cargaste productos o servicios";
  let lastActivityAt: string | null | undefined = null;

  if (latest) {
    lastActivityAt = latest.updatedAt ?? latest.createdAt ?? null;
    const action = latest.updatedAt ? "actualizado" : "creado";
    subtitle = `${latest.type === "SERVICE" ? "Servicio" : "Producto"} "${latest.name}" ${action}`;
  } else if (productCount || serviceCount) {
    const parts = [];
    if (productCount) parts.push(`${productCount} producto${productCount === 1 ? "" : "s"}`);
    if (serviceCount) parts.push(`${serviceCount} servicio${serviceCount === 1 ? "" : "s"}`);
    subtitle = parts.join(" • ");
  }

  return {
    module: "BUSINESS",
    title: "Mi Negocio",
    subtitle,
    lastActivityAt,
    isRecent: isRecentActivity(lastActivityAt),
    href: "/mi-negocio",
    accent: "blue",
  };
}

export function mapSalesActivity(orders: ApiOrder[]): ModuleActivitySummary {
  const sorted = byDateDesc(orders, (o) => o.createdAt);
  const latest = sorted[0];

  let subtitle = "Todavia no registraste ventas";
  let lastActivityAt: string | null | undefined = null;

  if (latest) {
    const today = new Date();
    const todayCount = sorted.filter((o) => {
      const d = new Date(o.createdAt);
      return (
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate()
      );
    }).length;

    const total = latest.items.reduce((acc, it) => acc + it.unitPrice * it.quantity, 0);
    const statusLabel: Record<ApiOrder["status"], string> = {
      DRAFT: "Orden en borrador",
      SENT: "Venta confirmada",
      COMPLETED: "Venta cerrada",
      CANCELLED: "Venta cancelada",
    };

    subtitle = `${statusLabel[latest.status] ?? "Venta"}${total ? ` por ${formatCurrency(total)}` : ""}`;

    if (todayCount > 1) {
      subtitle = `${todayCount} ventas hoy`;
    }

    lastActivityAt = latest.createdAt;
  }

  return {
    module: "SALES",
    title: "Ventas",
    subtitle,
    lastActivityAt,
    isRecent: isRecentActivity(lastActivityAt),
    href: "/venta",
    accent: "green",
  };
}

export function mapAccountingActivity(movements: BackendMovement[]): ModuleActivitySummary {
  const sorted = byDateDesc(movements, (m) => m.date);
  const latest = sorted[0];

  let subtitle = "Sin movimientos contables";
  let lastActivityAt: string | null | undefined = null;

  if (latest) {
    const amount = latest.amount ?? 0;
    const memo = latest.detail ?? latest.pucName ?? "";
    const details = memo ? ` • ${memo}` : "";
    const amountLabel = Number.isFinite(amount) ? ` por ${formatCurrency(Math.abs(amount))}` : "";

    subtitle = `${latest.pucCode}${amountLabel}${details}`;
    lastActivityAt = latest.date;
  } else {
    subtitle = "Sin movimientos • pendiente de registro";
  }

  return {
    module: "ACCOUNTING",
    title: "Contabilidad",
    subtitle,
    lastActivityAt,
    isRecent: isRecentActivity(lastActivityAt),
    href: "/contabilidad",
    accent: "amber",
  };
}
