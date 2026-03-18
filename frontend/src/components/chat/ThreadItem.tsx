import { type ReactNode, memo } from "react";

import { cn } from "@/src/lib/utils";

type Props = {
  title: string;
  preview: string;
  time: string;
  active?: boolean;
  icon: ReactNode;
  accent?: "blue" | "green" | "amber";
  onClick?: () => void;
};

const accentStyles: Record<NonNullable<Props["accent"]>, string> = {
  blue: "bg-sky-100 text-sky-700",
  green: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-700",
};

function ThreadItem({
  title,
  preview,
  time,
  active,
  icon,
  accent = "blue",
  onClick,
}: Props) {
  return (
    <div
      onClick={onClick}
      className="flex cursor-pointer items-center gap-3 border-b border-neutral-100 px-4 py-3 hover:bg-neutral-50"
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
                  <span
                      className={`text-xs font-medium ${active ? "text-green-500" : "text-neutral-400"
                          }`}
                  >
            {time}
          </span>
        </div>

        <p className="text-sm text-neutral-400 truncate leading-snug">
          {preview}
        </p>
      </div>
    </div>
  );
}

export default memo(ThreadItem);
