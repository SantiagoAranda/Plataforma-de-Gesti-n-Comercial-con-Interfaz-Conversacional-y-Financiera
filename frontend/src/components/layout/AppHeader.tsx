"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

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

  return (
    <header
      className="sticky top-0 z-30 w-full bg-white"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="flex items-center justify-between px-4 h-[64px]">
        {/* Left */}
        <div className="w-10">
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
        <div className="flex-1 px-2 text-center leading-tight">
          <h1 className="text-[20px] font-semibold truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[13px] text-emerald-600 font-medium truncate">
              {subtitle}
            </p>
          )}
        </div>

        {/* Right */}
        <div className="w-10 flex justify-end">
          {rightIcon && (
            <button
              aria-label={rightAriaLabel}
              onClick={onRightClick}
              className="grid place-items-center h-8 w-8 rounded-full hover:bg-black/5 active:scale-95 transition"
            >
              {rightIcon}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}