"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Building2, Calculator, ShoppingBag, WalletCards } from "lucide-react";
import { useRouter } from "next/navigation";

import AppHeader from "../../../src/components/layout/AppHeader";
import BottomNav from "../../../src/components/layout/BottomNav";
import ThreadItem from "../../../src/components/chat/ThreadItem";
import {
  type ModuleActivitySummary,
  formatActivityTime,
} from "../../../src/lib/home/moduleActivity";
import { useHomeModuleSummaries } from "../../../src/lib/home/useHomeModuleSummaries";
import { readBusinessProfile } from "../../../src/lib/businessProfile";
import HomeAgenda from "../../../src/components/home/HomeAgenda";

const MODULE_ICONS: Record<ModuleActivitySummary["module"], ReactNode> = {
  BUSINESS: <Building2 className="h-5 w-5" />,
  SALES: <ShoppingBag className="h-5 w-5" />,
  ACCOUNTING: <Calculator className="h-5 w-5" />,
  PAYROLL: <WalletCards className="h-5 w-5" />,
};

export default function HomePage() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("Mi Negocio");
  const [businessSubtitle, setBusinessSubtitle] = useState("");
  const { summaries, loading, error, orders } = useHomeModuleSummaries();

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

  useEffect(() => {
    if (typeof window === "undefined") return;

    const profile = readBusinessProfile();
    if (profile.name?.trim()) setBusinessName(profile.name.trim());
    if (profile.subtitle?.trim()) setBusinessSubtitle(profile.subtitle.trim());

    const storedUser = localStorage.getItem("user");
    if (!storedUser) return;

    try {
      const parsed = JSON.parse(storedUser) as
        | { businessName?: string; name?: string; business?: { name?: string } }
        | null;

      const nextName =
        parsed?.businessName ?? parsed?.business?.name ?? parsed?.name;
      if (nextName?.trim()) {
        setBusinessName(nextName.trim());
      }
    } catch {}
  }, []);

  return (
    <div className="flex h-screen flex-col bg-white">
      <AppHeader
        title={businessName}
        subtitle={businessSubtitle || ""}
        variant="flat"
      />

      <main className="flex-1 overflow-y-auto pb-24 lg:overflow-hidden lg:pb-0">
        <div className="hidden lg:flex h-full">
          <div className="flex h-full flex-1 items-center justify-center px-6 py-10">
            <div className="w-full max-w-xl rounded-3xl bg-white p-8">
              <h2 className="text-lg font-semibold text-neutral-900">
                Bienvenido
              </h2>
              <p className="mt-2 text-sm text-neutral-500">
                Elegí un módulo desde la columna central para comenzar.
              </p>
            </div>
          </div>
        </div>

        <div className="lg:hidden">
          <HomeAgenda sales={orders} />

          {loading && (
            <div>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-[74px] animate-pulse px-4 py-3">
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
                  divider={false}
                  onClick={() => router.push(summary.href)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <BottomNav active="home" />
    </div>
  );
}

