"use client";

import { useRouter } from "next/navigation";

import { cn } from "@/src/lib/utils";
import { BOTTOM_NAV_ITEMS, type BottomNavKey } from "./navItems";

type BottomNavProps = {
  active: BottomNavKey;
};

export default function BottomNav({ active }: BottomNavProps) {
  const router = useRouter();

  const baseItem =
    "flex flex-col items-center text-xs cursor-pointer transition-colors select-none";
  const activeItem = "text-[#0B3F64] font-medium";
  const inactiveItem = "text-neutral-400";

  return (
    <nav
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
        <div
          className="
            flex justify-between
            px-6 py-3
            bg-white/90 backdrop-blur
            rounded-2xl
            shadow-[0_8px_24px_rgba(0,0,0,0.12)]
            border border-neutral-200
          "
        >
          {BOTTOM_NAV_ITEMS.map(({ key, href, label, Icon }) => (
            <div
              key={key}
              className={cn(baseItem, active === key ? activeItem : inactiveItem)}
              onClick={() => router.push(href)}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </nav>
  );
}
