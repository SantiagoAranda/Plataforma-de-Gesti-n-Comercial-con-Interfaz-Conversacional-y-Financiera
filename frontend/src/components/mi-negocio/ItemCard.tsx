"use client";

import { SelectableCard } from "@/src/components/shared/selection/SelectableCard";
type Props = {
  item: any; 
  selected?: boolean;
  onSelect: () => void;
  onOpen?: () => void;
};

export function ItemCard({ item, selected, onSelect, onOpen }: Props) {
  return (
    <SelectableCard
      selected={selected}
      onSelect={onSelect}
      onOpen={onOpen}
      className="ml-auto max-w-[85%] overflow-hidden"
    >
      {(item.images?.length ?? 0) > 0 && (
        <div className="bg-neutral-50 aspect-[4/3] flex items-center justify-center border-b border-neutral-100 overflow-hidden">
          <img
            src={item.images?.[0]?.url}
            alt={item.name}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className="px-4 py-3 space-y-2">
        <div className="flex justify-between items-start">
          <p className="text-sm font-semibold text-neutral-900">
            {item.name}
          </p>
          <p className="text-emerald-600 font-semibold text-sm">
            ${item.price}
          </p>
        </div>

        {item.type === "SERVICE" && (
          <div className="flex items-center gap-2 text-neutral-500 text-xs text-left">
            <span>🕒</span>
            <span>{item.durationMinutes} min</span>
          </div>
        )}

        {item.description && (
          <p className="text-xs text-neutral-500 leading-relaxed text-left">
            {item.description}
          </p>
        )}
      </div>
    </SelectableCard>
  );
}
