"use client";

import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";

type Props = {
  icon: LucideIcon;
  title: string;
  description: string | ReactNode;
  actionLabel?: string;
  actionIcon?: LucideIcon;
  onAction?: () => void;
  className?: string;
};

export function EmptyStateCard({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionIcon: ActionIcon,
  onAction,
  className = "",
}: Props) {
  return (
    <div
      className={`rounded-[28px] bg-white p-8 text-center shadow-sm ring-1 ring-black/5 flex flex-col items-center justify-center ${className}`}
    >
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#E6EFF5] text-[#0B3F64]">
        <Icon className="h-7 w-7" />
      </div>

      <h3 className="mt-4 text-base sm:text-lg font-bold text-neutral-900">
        {title}
      </h3>

      <p className="mx-auto mt-2 max-w-xs text-xs sm:text-sm leading-relaxed text-neutral-500">
        {description}
      </p>

      {onAction && actionLabel ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#0B3F64] px-5 py-2.5 text-xs sm:text-sm font-semibold text-white transition hover:bg-[#0B3F64]/90 active:scale-95 shadow-sm"
        >
          {ActionIcon && <ActionIcon className="h-4 w-4" />}
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
