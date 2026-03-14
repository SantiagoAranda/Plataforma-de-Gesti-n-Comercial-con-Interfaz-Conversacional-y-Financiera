"use client";

import React from "react";
import { cn } from "@/src/lib/utils";

type Business = {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  phoneWhatsapp: string;
  status: "ACTIVE" | "INACTIVE";
};

type Props = {
  business: Business;
  onClick: (id: string) => void;
  contextMenuHandlers: any;
  onSelect: () => void;
};

export function BusinessChatItem({ business, onClick, contextMenuHandlers, onSelect }: Props) {
  return (
    <div
      {...contextMenuHandlers}
      onPointerDown={(e) => {
        onSelect();
        contextMenuHandlers.onPointerDown(e);
      }}
      onContextMenu={(e) => {
        onSelect();
        contextMenuHandlers.onContextMenu(e);
      }}
      onClick={() => onClick(business.id)}
      className="flex cursor-pointer items-center gap-3 border-b border-neutral-100 px-4 py-3 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
    >
      <div className="relative">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-neutral-100 overflow-hidden border border-neutral-200">
          {business.logoUrl ? (
            <img src={business.logoUrl} alt={business.name} className="h-full w-full object-cover" />
          ) : (
            <span className="text-xl font-semibold text-neutral-400">
              {business.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className={cn(
          "absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white",
          business.status === "ACTIVE" ? "bg-emerald-500" : "bg-neutral-400"
        )} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start">
          <p className="font-semibold text-neutral-900 truncate text-[16px]">{business.name}</p>
        </div>
        <p className="text-[14px] text-neutral-500 truncate leading-snug">
          {business.name} · {business.phoneWhatsapp}
        </p>
      </div>
    </div>
  );
}
