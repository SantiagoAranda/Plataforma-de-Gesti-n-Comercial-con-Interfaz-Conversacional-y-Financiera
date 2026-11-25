"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/src/lib/utils";

/** Marks an open modal so fixed page bars (e.g. PayrollChatActionBar) can hide themselves. */
export const MODAL_OPEN_ATTRIBUTE = { "data-modal-open": "" } as const;

/** Bottom sheet used by payroll modals. Same layer (z-[120]) as the other payroll dialogs. */
export function SheetShell({
  open,
  title,
  subtitle,
  accent = "text-[#0fb18f]",
  onClose,
  children,
  footer,
  maxWidth = "sm:max-w-lg",
}: {
  open: boolean;
  title: string;
  subtitle: string;
  accent?: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  maxWidth?: string;
}) {
  if (!open) return null;
  return (
    <div
      {...MODAL_OPEN_ATTRIBUTE}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 p-0 sm:p-4"
    >
      <div className={cn(
        "relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[32px] bg-white shadow-2xl sm:rounded-[32px]",
        maxWidth,
      )}>
        <div className="flex shrink-0 justify-center pt-3">
          <div className="h-1.5 w-12 rounded-full bg-neutral-200" />
        </div>
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-neutral-100 bg-white px-5 pb-4 pt-3">
          <div>
            <h2 className="text-lg font-medium text-neutral-900">{title}</h2>
            <p className={cn("mt-0.5 text-[10px] font-medium uppercase tracking-widest", accent)}>
              {subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-500 transition hover:bg-neutral-200"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-neutral-50/30 px-5 py-4">
          {children}
        </div>
        {/* In-flow footer: content scrolls above it instead of underneath. */}
        <div className="shrink-0 border-t border-neutral-100 bg-white/95 px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-12px_28px_rgba(15,23,42,0.08)] backdrop-blur">
          {footer}
        </div>
      </div>
    </div>
  );
}
