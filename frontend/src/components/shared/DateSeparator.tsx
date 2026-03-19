"use client";

import { formatBusinessDateTime } from "@/src/lib/businessDate";

type Props = {
  dateISO: string;
  labelOverride?: string;
};

export function DateSeparator({ dateISO, labelOverride }: Props) {
  const label = labelOverride || groupLabel(dateISO);

  return (
    <div className="flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-emerald-700 my-4">
      <span className="h-px flex-1 rounded-full bg-emerald-200" />
      {label}
      <span className="h-px flex-1 rounded-full bg-emerald-200" />
    </div>
  );
}

function groupLabel(dateISO: string) {
  // Use a fixed time at noon to avoid timezone shift issues when parsing ISO dates
  const d = new Date(`${dateISO}T12:00:00`); 
  const now = new Date();
  
  // Calculate difference in calendar days
  const diffTime = Math.floor((now.getTime() - now.getTimezoneOffset() * 60000) / 86400000) - 
                   Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);

  if (diffTime === 0) return "HOY";
  if (diffTime === 1) return "AYER";

  return formatBusinessDateTime(d, "es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
