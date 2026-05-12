"use client";

import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Settings, UserCircle } from "lucide-react";

import { cn } from "@/src/lib/utils";
import { logoutAndRedirect } from "@/src/lib/auth/logout";
import { BOTTOM_NAV_ITEMS, type BottomNavKey } from "./navItems";

function getActiveKey(pathname: string): BottomNavKey {
  if (pathname.startsWith("/movimientos")) return "movimientos";
  if (pathname.startsWith("/tienda")) return "tienda";
  return "home";
}

export default function DesktopSidebar() {
  const router = useRouter();
  const pathname = usePathname();

  const active = useMemo(() => getActiveKey(pathname ?? "/home"), [pathname]);
  const isProfile = !!pathname?.startsWith("/perfil");
  const isSettings = !!pathname?.startsWith("/configuracion");

  return (
    <aside className="hidden lg:flex h-screen w-[88px] flex-col items-center gap-3 border-r border-black/5 bg-white px-2 py-4">
      <div className="mt-1 flex flex-1 flex-col gap-2">
        {BOTTOM_NAV_ITEMS.map(({ key, href, label, Icon }) => {
          const isActive = active === key;
          return (
            <button
              key={key}
              aria-label={label}
              title={label}
              onClick={() => router.push(href)}
              className={cn(
                "grid h-12 w-12 place-items-center rounded-2xl text-neutral-600 transition",
                "hover:bg-black/5 active:scale-[0.98]",
                isActive && "bg-emerald-50 text-emerald-700",
              )}
            >
              <Icon className="h-5 w-5" />
            </button>
          );
        })}
      </div>

      <div className="mb-2 flex flex-col gap-2">
        <button
          aria-label="Configuración"
          title="Configuración"
          onClick={() => router.push("/configuracion")}
          className={cn(
            "grid h-12 w-12 place-items-center rounded-2xl text-neutral-600 transition",
            "hover:bg-black/5 active:scale-[0.98]",
            isSettings && "bg-emerald-50 text-emerald-700",
          )}
        >
          <Settings className="h-5 w-5" />
        </button>

        <button
          aria-label="Perfil"
          title="Perfil"
          onClick={() => router.push("/perfil")}
          className={cn(
            "grid h-12 w-12 place-items-center rounded-2xl text-neutral-600 transition",
            "hover:bg-black/5 active:scale-[0.98]",
            isProfile && "bg-emerald-50 text-emerald-700",
          )}
        >
          <UserCircle className="h-5 w-5" />
        </button>

        <button
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
          onClick={() => logoutAndRedirect((href) => router.push(href))}
          className={cn(
            "grid h-12 w-12 place-items-center rounded-2xl text-neutral-600 transition",
            "hover:bg-black/5 hover:text-rose-700 active:scale-[0.98]",
          )}
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </aside>
  );
}

