"use client";

import { memo, useState } from "react";

import { api } from "@/src/lib/api";
import { getCached } from "@/src/lib/cache";

import { SelectableCard } from "@/src/components/shared/selection/SelectableCard";
import { ItemImageViewer } from "@/src/components/ui/ItemImageViewer";

type Props = {
  item: any; 
  selected?: boolean;
  onSelect: () => void;
  onOpen?: () => void;
};

function ItemCardComponent({ item, selected, onSelect, onOpen }: Props) {
  const [hydratedImages, setHydratedImages] = useState<any[] | null>(null);
  const currentImages = hydratedImages ?? item.images ?? [];
  const imageCount = item._count?.images ?? currentImages.length;

  return (
    <SelectableCard
      selected={selected}
      onSelect={onSelect}
      onOpen={onOpen}
      className="ml-auto max-w-[85%] overflow-hidden"
    >
      {(currentImages.length > 0) && (
        <div className="aspect-[4/3] w-full overflow-hidden border-b border-neutral-100 bg-neutral-50">
          <ItemImageViewer
            images={currentImages}
            imageCount={imageCount}
            onLoadGallery={async () => {
              if (currentImages.length < imageCount) {
                try {
                  const res = await getCached(`item-detail:${item.id}`, 60000, () => api<any>(`/items/${item.id}`));
                  if (res?.images) setHydratedImages(res.images);
                } catch (e) {}
              }
            }}
            name={item.name}
            containerClassName="h-full w-full flex items-center justify-center"
            imageClassName="h-full w-full object-cover"
            lazy
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

export const ItemCard = memo(ItemCardComponent, (prev, next) => {
  return (
    prev.selected === next.selected &&
    prev.item.id === next.item.id &&
    prev.item.name === next.item.name &&
    prev.item.price === next.item.price &&
    prev.item.type === next.item.type &&
    prev.item.durationMinutes === next.item.durationMinutes &&
    prev.item.description === next.item.description &&
    prev.item._count?.images === next.item._count?.images &&
    prev.item.images?.[0]?.url === next.item.images?.[0]?.url
  );
});
