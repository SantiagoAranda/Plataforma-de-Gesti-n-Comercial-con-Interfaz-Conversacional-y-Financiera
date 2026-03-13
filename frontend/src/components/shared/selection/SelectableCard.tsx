"use client";

import type { MouseEvent, ReactNode } from "react";
import { useLongPress } from "./useLongPress";

type Props = {
  selected?: boolean;
  onSelect: () => void;
  onOpen?: () => void;
  children: ReactNode;
  className?: string;
};

export function SelectableCard({
  selected = false,
  onSelect,
  onOpen,
  children,
  className = "",
}: Props) {
  const { handlers, consumeLongPress } = useLongPress({
    onLongPress: onSelect,
    delay: 450,
  });

  const handleClick = () => {
    if (consumeLongPress()) return;

    if (selected) return;

    onOpen?.();
  };

  const handleContextMenu = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    onSelect();
  };

  return (
    <div
      {...handlers}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      className={[
        "cursor-pointer select-none rounded-3xl transition ring-1",
        selected
          ? "bg-emerald-50 ring-emerald-300 shadow-md"
          : "bg-white ring-black/5 shadow-sm",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}