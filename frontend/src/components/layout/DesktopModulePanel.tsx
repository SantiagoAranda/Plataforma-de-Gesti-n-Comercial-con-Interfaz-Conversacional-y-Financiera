"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Building2, Calculator, ShoppingBag } from "lucide-react";

import ThreadItem from "@/src/components/chat/ThreadItem";
import { formatActivityTime, type ModuleActivitySummary } from "@/src/lib/home/moduleActivity";
import { useHomeModuleSummaries } from "@/src/lib/home/useHomeModuleSummaries";

type ModuleItem = {
  key: ModuleActivitySummary["module"];
  href: string;
  title: string;
  subtitle: string;
  lastActivityAt?: string | null;
  isRecent: boolean;
  accent: "blue" | "green" | "amber";
  icon: ReactNode;
};

const MODULE_ICONS: Record<ModuleActivitySummary["module"], ReactNode> = {
  BUSINESS: <Building2 className="h-5 w-5" />,
  SALES: <ShoppingBag className="h-5 w-5" />,
  ACCOUNTING: <Calculator className="h-5 w-5" />,
};

export default function DesktopModulePanel() {
  const router = useRouter();
  const pathname = usePathname();
  const [businessName, setBusinessName] = useState("Mi Negocio");
  const { summaries, loading } = useHomeModuleSummaries();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedBusinessName = localStorage.getItem("businessName");
    if (storedBusinessName?.trim()) {
      setBusinessName(storedBusinessName.trim());
      return;
    }
  }, []);

  const modules: ModuleItem[] = useMemo(
    () =>
      summaries.map((summary) => ({
        key: summary.module,
        href: summary.href,
        title: summary.title,
        subtitle: summary.subtitle,
        lastActivityAt: summary.lastActivityAt,
        isRecent: summary.isRecent,
        accent: summary.accent,
        icon: MODULE_ICONS[summary.module],
      })),
    [summaries],
  );

  return (
    <aside className="hidden lg:flex h-screen w-[320px] flex-col border-r border-black/5 bg-white">
      <div className="border-b border-black/5 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-neutral-900">
            {businessName}
          </p>
          <p className="truncate text-[12px] font-medium text-neutral-500">
            Módulos
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && modules.length === 0 && (
          <div>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-[74px] animate-pulse border-b border-neutral-100 px-4 py-3"
              >
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

        {modules.map((mod) => {
          const isSelected = !!pathname?.startsWith(mod.href);
          return (
            <div key={mod.key}>
              <ThreadItem
                title={mod.title}
                preview={mod.subtitle}
                time={formatActivityTime(mod.lastActivityAt)}
                active={mod.isRecent}
                selected={isSelected}
                icon={mod.icon}
                accent={mod.accent}
                onClick={() => router.push(mod.href)}
                className={isSelected ? "hover:bg-emerald-50/70" : undefined}
              />
            </div>
          );
        })}
      </div>
    </aside>
  );
}
