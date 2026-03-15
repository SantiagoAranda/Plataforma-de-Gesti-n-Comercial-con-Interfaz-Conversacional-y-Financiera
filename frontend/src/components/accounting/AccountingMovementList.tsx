"use client";

import type { AccountingMovement } from "@/src/services/accounting";
import { AccountingMovementCard } from "./AccountingMovementCard";

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
  return (movement.createdAt ?? movement.date ?? "").slice(0, 10);
}

function groupLabel(dateISO: string) {
  const d = new Date(dateISO + "T00:00:00");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (dd.getTime() === today.getTime()) return "HOY";
  if (dd.getTime() === yesterday.getTime()) return "AYER";

  return d.toLocaleDateString("es-CO", {
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
