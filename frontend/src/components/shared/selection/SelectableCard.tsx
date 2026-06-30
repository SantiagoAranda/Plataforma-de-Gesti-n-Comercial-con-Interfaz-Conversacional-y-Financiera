"use client";

import type { MouseEvent, ReactNode } from "react";
import { useLongPress } from "./useLongPress";

type Props = {
  selected?: boolean;
  onSelect: () => void;
  onOpen?: () => void;
  children: ReactNode;
  className?: string;
  disableOpenOnClick?: boolean;
  disableLongPress?: boolean;
};

export function SelectableCard({
  selected = false,
  onSelect,
  onOpen,
  children,
  className = "",
  disableOpenOnClick = false,
  disableLongPress = false,
}: Props) {
  const { handlers, consumeLongPress } = useLongPress({
    onLongPress: disableLongPress ? () => {} : onSelect,
    delay: 450,
  });

  const handleClick = (e: React.MouseEvent) => {
    if (!disableLongPress && consumeLongPress()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (selected || disableOpenOnClick) return;
    onOpen?.();
  };

  const handleContextMenu = (e: MouseEvent<HTMLDivElement>) => {
    if (disableLongPress) return;
    e.preventDefault();
    if (consumeLongPress()) return;
    onSelect();
  };

  return (
    <div
      {...(disableLongPress ? {} : handlers)}
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