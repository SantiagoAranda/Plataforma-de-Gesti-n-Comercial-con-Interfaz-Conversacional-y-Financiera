"use client";

import { useRouter } from "next/navigation";
import { Home, LineChart, Store } from "lucide-react";

type BottomNavProps = {
  active: "home" | "movimientos" | "tienda";
};

export default function BottomNav({ active }: BottomNavProps) {
  const router = useRouter();

  const baseItem =
    "flex flex-col items-center text-xs cursor-pointer transition-colors select-none";
  const activeItem = "text-green-600 font-medium";
  const inactiveItem = "text-neutral-400";

  return (
    <nav
      className="
        fixed inset-x-0 bottom-0 z-50
        pointer-events-none
      "
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
          {/* HOME */}
          <div
            className={`${baseItem} ${active === "home" ? activeItem : inactiveItem}`}
            onClick={() => router.push("/home")}
          >
            <Home className="h-5 w-5" />
            <span>Home</span>
          </div>

          {/* MOVIMIENTOS */}
          <div
            className={`${baseItem} ${active === "movimientos" ? activeItem : inactiveItem}`}
            onClick={() => router.push("/movimientos")}
          >
            <LineChart className="h-5 w-5" />
            <span>Movimientos</span>
          </div>

          {/* TIENDA */}
          <div
            className={`${baseItem} ${active === "tienda" ? activeItem : inactiveItem}`}
            onClick={() => router.push("/tienda")}
          >
            <Store className="h-5 w-5" />
            <span>Mi Tienda</span>
          </div>
        </div>
      </div>
    </nav>
  );
}