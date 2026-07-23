"use client";

import {
  formatBusinessDateTime,
  getRelativeBusinessDayLabel,
} from "@/src/lib/businessDate";

type Props = {
  dateISO?: string;
  labelOverride?: string;
};

export function DateSeparator({ dateISO, labelOverride }: Props) {
  const label = labelOverride || (dateISO ? groupLabel(dateISO) : "");

  return (
    <div className="flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-[#0B3F64] py-2">
      <span className="h-px flex-1 rounded-full bg-[#CEE0EC]" />
      {label}
      <span className="h-px flex-1 rounded-full bg-[#CEE0EC]" />
    </div>
  );
}

function groupLabel(dateISO: string) {
  const dateStr = dateISO.includes("T") ? dateISO : `${dateISO}T12:00:00Z`;
  const d = new Date(dateStr);
  const relativeLabel = getRelativeBusinessDayLabel(d, "es-AR");

  if (relativeLabel === "Hoy") return "HOY";
  if (relativeLabel === "Ayer") return "AYER";

  return formatBusinessDateTime(d, "es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
    .replace(/\./g, "")
    .toUpperCase();
}
