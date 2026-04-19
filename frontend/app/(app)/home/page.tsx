"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Building2, Calculator, PackageSearch, ShoppingBag } from "lucide-react";
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
  mapInventoryActivity,
  mapSalesActivity,
} from "../../../src/lib/home/moduleActivity";
import { api } from "../../../src/lib/api";
import { type BackendMovement } from "../../../src/services/accounting";
import { getCached, getInstantCache } from "../../../src/lib/cache";

const HOME_CACHE_TTL = 60_000; // 60 segundos

const MODULE_ICONS: Record<ModuleActivitySummary["module"], ReactNode> = {
  BUSINESS: <Building2 className="h-5 w-5" />,
  SALES: <ShoppingBag className="h-5 w-5" />,
  ACCOUNTING: <Calculator className="h-5 w-5" />,
  INVENTORY: <PackageSearch className="h-5 w-5" />,
};

export default function HomePage() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("Mi Negocio");
  // Leer caché en memoria síncronamente para evitar parpadeo inicial
  const initialBusinessLatest = getInstantCache<{item: BusinessItem | null}>("home:businessActivity", HOME_CACHE_TTL);
  const initialSales = getInstantCache<ApiOrder[]>("home:sales", HOME_CACHE_TTL);
  const initialMovements = getInstantCache<BackendMovement[]>("home:movements", HOME_CACHE_TTL);
  const isAllCached = !!(initialBusinessLatest && initialSales && initialMovements);

  const [businessLatest, setBusinessLatest] = useState<{item: BusinessItem | null}>(initialBusinessLatest ?? {item: null});
  const [orders, setOrders] = useState<ApiOrder[]>(initialSales ?? []);
  const [movements, setMovements] = useState<BackendMovement[]>(initialMovements ?? []);
  
  // Si todo estaba fresco, loading arranca en false -> pinta UI al instante
  const [loading, setLoading] = useState(!isAllCached);
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
   * 🔹 Obtener nombre del negocio desde localStorage (sin request)
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
   * 🔹 Cargar actividad reciente con cache de 60 segundos
   * - Navegar Home → otra pantalla → Home dentro de 60s no re-fetcha.
   * - Requests simultáneas a la misma key reutilizan la misma promesa.
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
      if (!isAllCached) {
        setLoading(true);
      }
      setError(null);

      try {
        const [itemsRes, ordersRes, movementsRes] = await Promise.allSettled([
          getCached<{item: BusinessItem | null}>(
            "home:businessActivity",
            HOME_CACHE_TTL,
            () => api<{item: BusinessItem | null}>("/items/latest-activity"),
          ),
          getCached<ApiOrder[]>(
            "home:sales",
            HOME_CACHE_TTL,
            () => api<ApiOrder[]>("/sales"),
          ),
          getCached<BackendMovement[]>(
            "home:movements",
            HOME_CACHE_TTL,
            () => api<BackendMovement[]>("/accounting/movements"),
          ),
        ]);

        const allRejected =
          itemsRes.status === "rejected" &&
          ordersRes.status === "rejected" &&
          movementsRes.status === "rejected";

        if (allRejected) {
          setError("No pudimos cargar la actividad reciente");
          return;
        }

        if (itemsRes.status === "fulfilled" && itemsRes.value && typeof itemsRes.value === 'object' && !Array.isArray(itemsRes.value)) {
          setBusinessLatest(itemsRes.value as {item: BusinessItem | null});
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
        if (!isAllCached) {
          setLoading(false);
        }
      }
    })();
  }, [isAllCached]);

  const summaries = useMemo(
    () => [
      mapBusinessActivity(businessLatest.item),
      mapInventoryActivity(businessLatest.item),
      mapSalesActivity(orders),
      mapAccountingActivity(movements),
    ],
    [businessLatest, orders, movements],
  );

  return (
    <div className="flex h-screen flex-col bg-white">
      <AppHeader title={businessName} subtitle="" />

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
