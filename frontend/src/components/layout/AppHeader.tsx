"use client";

import { useRouter } from "next/navigation";

type Props = {
  title?: string;
  showBack?: boolean;
  onRightClick?: () => void;
  rightIcon?: React.ReactNode;
  rightAriaLabel?: string;
};

export default function AppHeader({
  title = "MVP",
  showBack = false,
  onRightClick,
  rightIcon,
  rightAriaLabel = "Opciones",
}: Props) {
  const router = useRouter();

  return (
    <header
      className="
  sticky
  top-0
  z-50
  flex
  items-center
  px-4
  py-3
  border-b
  border-neutral-200
  bg-white
"
    >
      {showBack ? (
        <button
          onClick={() => router.back()}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-neutral-100 transition"
          aria-label="Volver"
        >
          ←
        </button>
      ) : (
        <div className="w-9 h-9" />
      )}

      <h1 className="absolute left-1/2 -translate-x-1/2 text-sm font-semibold tracking-wide text-neutral-700">
        {title}
      </h1>

      <button
        className="ml-auto w-9 h-9 flex items-center justify-center rounded-full hover:bg-neutral-100 transition text-neutral-600"
        onClick={onRightClick}
        aria-label={rightAriaLabel}
        type="button"
      >
        {rightIcon ?? "⋮"}
      </button>
    </header>
  );
}
