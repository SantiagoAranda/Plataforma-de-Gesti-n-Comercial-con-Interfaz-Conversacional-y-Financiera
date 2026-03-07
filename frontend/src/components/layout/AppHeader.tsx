"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import LogoutButton from "@/src/components/auth/LogoutButton";

type Props = {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  rightIcon?: ReactNode;
  rightAriaLabel?: string;
  onRightClick?: () => void;
};

export default function AppHeader({
  title,
  subtitle,
  showBack = false,
  rightIcon,
  rightAriaLabel = "Acción",
  onRightClick,
}: Props) {
  const router = useRouter();
  const [hasSession, setHasSession] = useState(false);
  const isMainView = !showBack;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("token");
    const session = localStorage.getItem("session");
    const user = localStorage.getItem("user");
    const accessToken = localStorage.getItem("accessToken");
    setHasSession(Boolean(token || session || user || accessToken));
  }, []);

  return (
    <header
      className="sticky top-0 z-30 w-full bg-white"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="grid h-[64px] grid-cols-3 items-center px-4">
        {/* Left (back button) */}
        <div className="flex items-center">
          {showBack && (
            <button
              onClick={() => router.back()}
              aria-label="Volver"
              className="grid place-items-center h-8 w-8 rounded-full hover:bg-black/5 active:scale-95 transition"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Title block */}
        <div className="px-2 text-center leading-tight">
          <h1 className="text-[20px] font-semibold truncate">{title}</h1>
          {subtitle && (
            <p className="text-[13px] text-emerald-600 font-medium truncate">
              {subtitle}
            </p>
          )}
        </div>

        {/* Right */}
        <div className="flex items-center justify-end gap-2">
          {rightIcon && (
            <button
              aria-label={rightAriaLabel}
              onClick={onRightClick}
              className="grid place-items-center h-8 w-8 rounded-full hover:bg-black/5 active:scale-95 transition"
            >
              {rightIcon}
            </button>
          )}
          {hasSession && isMainView && <LogoutButton />}
        </div>
      </div>
    </header>
  );
}
