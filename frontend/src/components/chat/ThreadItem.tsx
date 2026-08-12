import { type ReactNode, memo } from "react";

import { cn } from "@/src/lib/utils";

type Props = {
  title: string;
  preview: string;
  time: string;
  active?: boolean;
  selected?: boolean;
  icon: ReactNode;
  accent?: "blue" | "green" | "amber";
  onClick?: () => void;
  className?: string;
  divider?: boolean;
};

const accentStyles: Record<NonNullable<Props["accent"]>, string> = {
  blue: "bg-[#E6EFF5] text-[#0B3F64]",
  green: "bg-[#E6EFF5] text-[#0B3F64]",
  amber: "bg-[#C80237]/12 text-[#C80237]",
};

function ThreadItem({
  title,
  preview,
  time,
  active,
  selected,
  icon,
  accent = "blue",
  onClick,
  className,
  divider = true,
}: Props) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-neutral-50",
        divider && "border-b border-neutral-100",
        selected && "bg-emerald-50/70",
        className,
      )}
    >
      <div
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-full text-lg",
          accentStyles[accent],
        )}
      >
        {icon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex justify-between">
          <p className="font-medium truncate">{title}</p>
          {!!time?.trim() && (
            <span
              className={`text-xs font-medium ${
                active ? "text-green-500" : "text-neutral-400"
              }`}
            >
              {time}
            </span>
          )}
        </div>

        <p className="text-sm text-neutral-400 truncate leading-snug">
          {preview}
        </p>
      </div>
    </div>
  );
}

export default memo(ThreadItem);
