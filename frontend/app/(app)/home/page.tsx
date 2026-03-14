"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Building2, Calculator, ShoppingBag } from "lucide-react";
import { useRouter } from "next/navigation";

import AppHeader from "../../../src/components/layout/AppHeader";
import BottomNav from "../../../src/components/layout/BottomNav";
import ThreadItem from "../../../src/components/chat/ThreadItem";
import {
  type ApiOrder,
  type BusinessItem,
  type ModuleActivitySummary,
  formatActivityTime,
  mapAccountingActivity,
  mapBusinessActivity,
  mapSalesActivity,
} from "../../../src/lib/home/moduleActivity";
import { api } from "../../../src/lib/api";
import { listMovements, type BackendMovement } from "../../../src/services/accounting";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const MODULE_ICONS: Record<ModuleActivitySummary["module"], ReactNode> = {
  BUSINESS: <Building2 className="h-5 w-5" />,
  SALES: <ShoppingBag className="h-5 w-5" />,
  ACCOUNTING: <Calculator className="h-5 w-5" />,
};

export default function HomePage() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("Mi Negocio");
  const [items, setItems] = useState<BusinessItem[]>([]);
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [movements, setMovements] = useState<BackendMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 🔹 Detectar ADMIN global y redirigir al panel admin
   */
  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedUser = localStorage.getItem("user");
    if (!storedUser) return;

    try {
      const parsed = JSON.parse(storedUser);

      if (parsed?.role === "ADMIN" && !parsed?.businessId) {
        router.replace("/admin");
      }
    } catch {}
  }, [router]);

  /**
   * 🔹 Obtener nombre del negocio
   */
  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedBusinessName = localStorage.getItem("businessName");
    if (storedBusinessName?.trim()) {
      setBusinessName(storedBusinessName.trim());
      return;
    }

    const storedUser = localStorage.getItem("user");
    if (!storedUser) return;

    try {
      const parsed = JSON.parse(storedUser) as
        | { businessName?: string; name?: string; business?: { name?: string } }
        | null;

      const nextName = parsed?.businessName ?? parsed?.business?.name ?? parsed?.name;
      if (nextName?.trim()) {
        setBusinessName(nextName.trim());
      }
    } catch {}
  }, []);

  /**
   * 🔹 Cargar actividad reciente
   */
  useEffect(() => {
    const storedUser = localStorage.getItem("user");

    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        if (!parsed?.businessId) return;
      } catch {}
    }

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const token =
          typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;

        const [itemsRes, ordersRes, movementsRes] = await Promise.allSettled([
          api<BusinessItem[]>("/items"),
          fetch(`${API_URL}/sales`, {
            headers: token
              ? {
                  Authorization: `Bearer ${token}`,
                }
              : undefined,
          }).then((res) => {
            if (!res.ok) throw new Error("No se pudieron cargar las ventas");
            return res.json() as Promise<ApiOrder[]>;
          }),
          listMovements(),
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
    <div className="flex h-screen flex-col bg-white">
      <AppHeader title={businessName} subtitle="Resumen general" />

      <main className="flex-1 overflow-y-auto pb-24">
        {loading && (
          <div>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[74px] animate-pulse border-b border-neutral-100 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-full bg-neutral-100" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-4 w-32 rounded bg-neutral-100" />
                    <div className="h-3 w-48 rounded bg-neutral-100" />
                  </div>
                  <div className="h-3 w-12 rounded bg-neutral-100" />
                </div>
              </div>
            ))}
          </div>
        )}

        {error && !loading && (
          <div className="px-4 py-4">
            <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700 shadow-sm">
              {error}
            </div>
          </div>
        )}

        {!loading && !error && (
          <div>
            {summaries.map((summary) => (
              <ThreadItem
                key={summary.module}
                title={summary.title}
                preview={summary.subtitle}
                time={formatActivityTime(summary.lastActivityAt)}
                active={summary.isRecent}
                icon={MODULE_ICONS[summary.module]}
                accent={summary.accent}
                onClick={() => router.push(summary.href)}
              />
            ))}
          </div>
        )}
      </main>

      <BottomNav active="home" />
    </div>
  );
}