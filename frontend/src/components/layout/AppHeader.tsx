"use client";

import { ArrowLeft, LogOut, MoreVertical, Settings, UserCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { logoutAndRedirect } from "@/src/lib/auth/logout";

type Props = {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  hrefBack?: string;
  rightIcon?: ReactNode;
  rightContent?: ReactNode;
  rightAriaLabel?: string;
  onRightClick?: () => void;
  showLogout?: boolean;
  variant?: "default" | "flat";
};

export default function AppHeader({
  title,
  subtitle,
  showBack = false,
  onBack,
  hrefBack = "/home",
  rightIcon,
  rightContent,
  rightAriaLabel = "Accion",
  onRightClick,
  showLogout = true,
  variant = "default",
}: Props) {
  const router = useRouter();
  const isMainView = !showBack;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const onClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }

    router.push(hrefBack);
  };

  return (
    <header
      className={
        variant === "flat"
          ? "sticky top-0 z-30 w-full bg-white"
          : "sticky top-0 z-30 w-full border-b border-black/5 bg-white"
      }
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="flex min-h-[72px] items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {showBack && (
            <button
              onClick={handleBack}
              aria-label="Volver al inicio"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-neutral-700 transition hover:bg-black/5 active:scale-95"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}

          <div className="min-w-0 flex flex-row items-baseline leading-tight text-left">
            <h1 className="truncate text-[20px] font-semibold text-neutral-900">{title}</h1>
            {subtitle && (
              <p className="shrink-0 text-[13px] font-medium text-slate-500 ml-2">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2">
          {rightContent}
          
          {rightIcon && !rightContent && (
            <button
              aria-label={rightAriaLabel}
              onClick={onRightClick}
              className="grid h-10 w-10 place-items-center rounded-full text-neutral-700 transition hover:bg-black/5 active:scale-95"
            >
              {rightIcon}
            </button>
          )}

          {isMainView && showLogout && (
            <div className="relative lg:hidden" ref={menuRef}>
              <button
                type="button"
                aria-label="Menú"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
                className="grid h-10 w-10 place-items-center rounded-full text-neutral-700 transition hover:bg-black/5 active:scale-95"
              >
                <MoreVertical className="h-5 w-5" />
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-56 overflow-hidden rounded-2xl border border-black/5 bg-white shadow-[0_16px_40px_rgba(0,0,0,0.12)]">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      router.push("/perfil");
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-sm text-neutral-800 hover:bg-neutral-50"
                  >
                    <UserCircle className="h-4 w-4 text-neutral-600" />
                    Perfil
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      router.push("/configuracion");
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-sm text-neutral-800 hover:bg-neutral-50"
                  >
                    <Settings className="h-4 w-4 text-neutral-600" />
                    Configuración
                  </button>
                  <div className="h-px w-full bg-black/5" />
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      logoutAndRedirect((href) => router.push(href));
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-sm text-rose-700 hover:bg-rose-50"
                  >
                    <LogOut className="h-4 w-4" />
                    Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Desktop logout lives in the left sidebar */}
        </div>
      </div>
    </header>
  );
}
