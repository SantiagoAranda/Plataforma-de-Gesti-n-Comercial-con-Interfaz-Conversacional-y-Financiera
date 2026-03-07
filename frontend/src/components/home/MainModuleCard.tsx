"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "@/src/lib/utils";
import { formatActivityTime } from "@/src/lib/home/moduleActivity";

type Props = {
  icon: ReactNode;
  title: string;
  subtitle: string;
  lastActivityAt?: string | null;
  isRecent: boolean;
  href: string;
  accent?: "blue" | "green" | "amber";
};

const accentStyles: Record<NonNullable<Props["accent"]>, { pill: string; icon: string; dot: string }> = {
  blue: {
    pill: "bg-sky-50 text-sky-700 border-sky-100",
    icon: "bg-sky-100 text-sky-700",
    dot: "bg-sky-500",
  },
  green: {
    pill: "bg-emerald-50 text-emerald-700 border-emerald-100",
    icon: "bg-emerald-100 text-emerald-700",
    dot: "bg-emerald-500",
  },
  amber: {
    pill: "bg-amber-50 text-amber-700 border-amber-100",
    icon: "bg-amber-100 text-amber-700",
    dot: "bg-amber-500",
  },
};

export function MainModuleCard({
  icon,
  title,
  subtitle,
  lastActivityAt,
  isRecent,
  href,
  accent = "blue",
}: Props) {
  const accentStyle = accentStyles[accent];

  return (
    <Link
      href={href}
      className={cn(
        "group relative block overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition",
        "hover:-translate-y-0.5 hover:shadow-md active:translate-y-0",
      )}
    >
      <div className="flex items-center gap-3 px-4 py-4 sm:px-5">
        <div
          className={cn(
            "grid h-12 w-12 shrink-0 place-items-center rounded-xl text-base font-semibold",
            accentStyle.icon,
          )}
        >
          {icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-base font-semibold text-neutral-900 truncate">{title}</p>
            {isRecent && (
              <span
                className={cn(
                  "text-[11px] font-semibold px-2 py-0.5 rounded-full border",
                  accentStyle.pill,
                )}
              >
                Nuevo
              </span>
            )}
          </div>

          <p className="mt-1 text-sm leading-5 text-neutral-600 overflow-hidden text-ellipsis">
            {subtitle}
          </p>
        </div>

        <div className="flex flex-col items-end justify-between gap-1 text-right text-[11px] text-neutral-500 pl-2">
          <span className="whitespace-nowrap font-semibold">
            {formatActivityTime(lastActivityAt)}
          </span>
          <div className="flex items-center gap-1">
            <span
              className={cn(
                "block h-2 w-2 rounded-full",
                isRecent ? accentStyle.dot : "bg-neutral-300",
                isRecent && "animate-pulse",
              )}
            />
            <ChevronRight className="h-4 w-4 text-neutral-400 transition group-hover:text-neutral-600" />
          </div>
        </div>
      </div>
    </Link>
  );
}
