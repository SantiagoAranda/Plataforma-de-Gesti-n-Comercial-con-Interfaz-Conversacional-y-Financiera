"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Building2, Calculator, ShoppingBag } from "lucide-react";

import AppHeader from "@/src/components/layout/AppHeader";
import BottomNav from "@/src/components/layout/BottomNav";
import { MainModuleCard } from "@/src/components/home/MainModuleCard";
import {
  type ApiOrder,
  type BusinessItem,
  type ModuleActivitySummary,
  mapAccountingActivity,
  mapBusinessActivity,
  mapSalesActivity,
} from "@/src/lib/home/moduleActivity";
import { api } from "@/src/lib/api";
import { listMovements, type BackendMovement } from "@/src/services/accounting";

const MODULE_ICONS: Record<ModuleActivitySummary["module"], ReactNode> = {
  BUSINESS: <Building2 className="h-5 w-5" />,
  SALES: <ShoppingBag className="h-5 w-5" />,
  ACCOUNTING: <Calculator className="h-5 w-5" />,
};

export default function HomePage() {
  const [items, setItems] = useState<BusinessItem[]>([]);
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [movements, setMovements] = useState<BackendMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);

      try {
        const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;

        const [itemsRes, ordersRes, movementsRes] = await Promise.allSettled([
          api<BusinessItem[]>("/items"),
          fetch("http://localhost:3001/sales", {
            headers: token
              ? {
                  Authorization: `Bearer ${token}`,
                }
              : undefined,
          }).then((res) => {
            if (!res.ok) throw new Error("No se pudieron cargar las ventas");
            return res.json() as Promise<ApiOrder[]>;
          }),
          listMovements({ onlyPosted: "false" }),
        ]);

        const allRejected =
          itemsRes.status === "rejected" &&
          ordersRes.status === "rejected" &&
          movementsRes.status === "rejected";

        if (allRejected) {
          setError("No pudimos cargar la actividad reciente");
          return;
        }

        if (itemsRes.status === "fulfilled" && Array.isArray(itemsRes.value)) {
          setItems(itemsRes.value);
        }

        if (ordersRes.status === "fulfilled" && Array.isArray(ordersRes.value)) {
          setOrders(ordersRes.value);
        }

        if (movementsRes.status === "fulfilled" && Array.isArray(movementsRes.value)) {
          setMovements(movementsRes.value);
        }
      } catch (err) {
        console.error(err);
        setError("No pudimos cargar la actividad reciente");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const summaries = useMemo(
    () => [
      mapBusinessActivity(items),
      mapSalesActivity(orders),
      mapAccountingActivity(movements),
    ],
    [items, orders, movements],
  );

  return (
    <div className="min-h-dvh bg-zinc-50">
      <AppHeader title="MVP" subtitle="Inicio" />

      <main className="mx-auto w-full max-w-3xl px-3 pb-28 pt-3 space-y-4 sm:px-4">
        {loading && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-20 rounded-2xl border border-neutral-200 bg-white shadow-sm animate-pulse"
              />
            ))}
          </div>
        )}

        {error && !loading && (
          <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700 shadow-sm">
            {error}
          </div>
        )}

        {!loading && !error && (
          <section className="space-y-3">
            {summaries.map((summary) => (
              <MainModuleCard
                key={summary.module}
                icon={MODULE_ICONS[summary.module]}
                title={summary.title}
                subtitle={summary.subtitle}
                lastActivityAt={summary.lastActivityAt}
                isRecent={summary.isRecent}
                href={summary.href}
                accent={summary.accent}
              />
            ))}
          </section>
        )}
      </main>

      <BottomNav active="home" />
    </div>
  );
}
