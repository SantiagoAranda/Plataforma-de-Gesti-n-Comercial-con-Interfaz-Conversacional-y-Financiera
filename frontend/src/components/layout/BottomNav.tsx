"use client";

import { useRouter } from "next/navigation";
import { ReceiptText } from "lucide-react";

import { cn } from "@/src/lib/utils";
import { BOTTOM_NAV_ITEMS, type BottomNavKey } from "./navItems";
import { useManualPaidOutflow } from "./ManualPaidOutflowProvider";

type BottomNavProps = {
  active: BottomNavKey;
};

export default function BottomNav({ active }: BottomNavProps) {
  const router = useRouter();
  const { openManualPaidOutflow } = useManualPaidOutflow();

  const baseItem =
    "flex min-w-0 flex-1 flex-col items-center text-center text-[11px] leading-tight cursor-pointer transition-colors select-none";
  const activeItem = "text-[#0B3F64] font-medium";
  const inactiveItem = "text-neutral-400";

  return (
    <div
      className={cn(
        "lg:hidden",
        `
        fixed inset-x-0 bottom-0 z-50
        pointer-events-none
      `,
      )}
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="mx-auto max-w-md px-4 pb-3 pointer-events-auto">
        <div className="flex items-stretch gap-3">
          <nav
            aria-label="Navegación principal"
            className="flex min-w-0 flex-1 justify-between rounded-2xl border border-neutral-200 bg-white/90 px-3 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.12)] backdrop-blur"
          >
            {BOTTOM_NAV_ITEMS.map(({ key, href, label, Icon }) => (
              <div
                key={key}
                className={cn(
                  baseItem,
                  active === key ? activeItem : inactiveItem,
                )}
                onClick={() => router.push(href)}
              >
                <Icon className="h-5 w-5" />
                <span>{label}</span>
              </div>
            ))}
          </nav>
          <button
            type="button"
            aria-label="Registrar gasto"
            onClick={openManualPaidOutflow}
            className="flex w-[60px] shrink-0 items-center justify-center rounded-2xl border border-[#CEE0EC] bg-[#EAF2F8] text-[#0B3F64] shadow-[0_8px_24px_rgba(11,63,100,0.14)] transition active:scale-[0.98]"
          >
            <ReceiptText className="h-6 w-6" />
          </button>
        </div>
      </div>
    </div>
  );
}
