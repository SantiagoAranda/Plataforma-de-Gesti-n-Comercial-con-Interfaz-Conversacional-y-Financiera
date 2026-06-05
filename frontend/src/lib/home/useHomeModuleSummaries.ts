import { useEffect, useMemo, useState } from "react";

import { api } from "@/src/lib/api";
import { getCached, getInstantCache } from "@/src/lib/cache";
import { type BackendMovement } from "@/src/services/accounting";
import type { Sale } from "@/src/types/sales";
import {
  type BusinessItem,
  mapAccountingActivity,
  mapBusinessActivity,
  mapPayrollActivity,
  mapSalesActivity,
} from "./moduleActivity";

const HOME_CACHE_TTL = 60_000; // 60 segundos

export function useHomeModuleSummaries() {
  const initialBusinessLatest = getInstantCache<{ item: BusinessItem | null }>(
    "home:businessActivity",
    HOME_CACHE_TTL,
  );
  const initialSales = getInstantCache<Sale[]>("home:sales", HOME_CACHE_TTL);
  const initialMovements = getInstantCache<BackendMovement[]>(
    "home:movements",
    HOME_CACHE_TTL,
  );
  const isAllCached = !!(
    initialBusinessLatest &&
    initialSales &&
    initialMovements
  );

  const [businessLatest, setBusinessLatest] = useState<{
    item: BusinessItem | null;
  }>(initialBusinessLatest ?? { item: null });
  const [orders, setOrders] = useState<Sale[]>(initialSales ?? []);
  const [movements, setMovements] = useState<BackendMovement[]>(
    initialMovements ?? [],
  );

  const [loading, setLoading] = useState(!isAllCached);
  const [error, setError] = useState<string | null>(null);

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
          getCached<{ item: BusinessItem | null }>(
            "home:businessActivity",
            HOME_CACHE_TTL,
            () => api<{ item: BusinessItem | null }>("/items/latest-activity"),
          ),
          getCached<Sale[]>("home:sales", HOME_CACHE_TTL, () =>
            api<Sale[]>("/sales"),
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

        if (
          itemsRes.status === "fulfilled" &&
          itemsRes.value &&
          typeof itemsRes.value === "object" &&
          !Array.isArray(itemsRes.value)
        ) {
          setBusinessLatest(itemsRes.value as { item: BusinessItem | null });
        }

        if (ordersRes.status === "fulfilled" && Array.isArray(ordersRes.value)) {
          setOrders(ordersRes.value);
        }

        if (
          movementsRes.status === "fulfilled" &&
          Array.isArray(movementsRes.value)
        ) {
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
      mapSalesActivity(orders),
      mapAccountingActivity(movements),
      mapPayrollActivity(),
    ],
    [businessLatest, orders, movements],
  );

  return { summaries, loading, error, orders };
}

