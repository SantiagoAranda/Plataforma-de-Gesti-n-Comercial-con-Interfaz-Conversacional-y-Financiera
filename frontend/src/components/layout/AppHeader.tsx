"use client";

import dynamic from "next/dynamic";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

const LogoutButton = dynamic(
  () => import("@/src/components/auth/LogoutButton"),
  { ssr: false },
);

type Props = {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  hrefBack?: string;
  rightIcon?: ReactNode;
  rightAriaLabel?: string;
  onRightClick?: () => void;
};

export default function AppHeader({
  title,
  subtitle,
  showBack = false,
  onBack,
  hrefBack = "/home",
  rightIcon,
  rightAriaLabel = "Accion",
  onRightClick,
}: Props) {
  const router = useRouter();
  const isMainView = !showBack;

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }

    router.push(hrefBack);
  };

  return (
    <header
      className="sticky top-0 z-30 w-full border-b border-black/5 bg-white"
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

          <div className="min-w-0 leading-tight text-left">
            <h1 className="truncate text-[20px] font-semibold text-neutral-900">{title}</h1>
            {subtitle && (
              <p className="mt-0.5 truncate text-[13px] font-medium text-neutral-500">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2">
          {rightIcon && (
            <button
              aria-label={rightAriaLabel}
              onClick={onRightClick}
              className="grid h-10 w-10 place-items-center rounded-full text-neutral-700 transition hover:bg-black/5 active:scale-95"
            >
              {rightIcon}
            </button>
          )}
          {isMainView && <LogoutButton />}
        </div>
      </div>
    </header>
  );
}
