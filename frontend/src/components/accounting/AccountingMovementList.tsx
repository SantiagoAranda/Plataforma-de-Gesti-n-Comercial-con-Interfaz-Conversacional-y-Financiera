"use client";

import type { AccountingMovement } from "@/src/services/accounting";
import { AccountingMovementCard } from "./AccountingMovementCard";
import {
  formatBusinessDateTime,
  getBusinessDayKey,
  getRelativeBusinessDayLabel,
} from "@/src/lib/businessDate";

type Props = {
  movements: AccountingMovement[];
  selectedId: string | null;
  onSelect: (movement: AccountingMovement) => void;
  onOpen?: (movement: AccountingMovement) => void;
};

function movementTimestamp(movement: AccountingMovement) {
  return new Date(movement.createdAt ?? movement.date).getTime();
}

function movementDayKey(movement: AccountingMovement) {
  return getBusinessDayKey(movement.createdAt ?? movement.date);
}

function groupLabel(dateISO: string) {
  const d = new Date(`${dateISO}T12:00:00Z`);
  const relativeLabel = getRelativeBusinessDayLabel(d, "es-AR");

  if (relativeLabel === "Hoy") return "HOY";
  if (relativeLabel === "Ayer") return "AYER";

  return formatBusinessDateTime(d, "es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function AccountingMovementList({
  movements,
  selectedId,
  onSelect,
  onOpen,
}: Props) {
  const sortedMovements = [...movements].sort((a, b) => {
    const timeDiff = movementTimestamp(a) - movementTimestamp(b);
    if (timeDiff !== 0) return timeDiff;
    return a.id.localeCompare(b.id);
  });

  const grouped = sortedMovements.reduce<Record<string, AccountingMovement[]>>(
    (acc, movement) => {
      const dateISO = movementDayKey(movement);
      acc[dateISO] ??= [];
      acc[dateISO].push(movement);
      return acc;
    },
    {}
  );

  const sortedDates = Object.keys(grouped).sort((a, b) => (a > b ? 1 : -1));

  return (
    <div className="space-y-4">
      {sortedDates.map((dateISO) => (
        <section key={dateISO} className="space-y-3">
          <div className="flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-emerald-700">
            <span className="h-px flex-1 rounded-full bg-emerald-200" />
            {groupLabel(dateISO)}
            <span className="h-px flex-1 rounded-full bg-emerald-200" />
          </div>

          <div className="space-y-3">
            {grouped[dateISO].map((movement) => (
              <AccountingMovementCard
                key={movement.id}
                movement={movement}
                selected={selectedId === movement.id}
                onSelect={() => onSelect(movement)}
                onOpen={onOpen ? () => onOpen(movement) : undefined}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
