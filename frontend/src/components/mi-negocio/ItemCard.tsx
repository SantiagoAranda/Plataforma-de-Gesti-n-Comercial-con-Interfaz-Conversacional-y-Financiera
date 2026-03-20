import { memo, useState } from "react";
import { api } from "@/src/lib/api";
import { getCached } from "@/src/lib/cache";

import { SelectableCard } from "@/src/components/shared/selection/SelectableCard";
import { ItemImageViewer } from "@/src/components/ui/ItemImageViewer";
import { formatMoney, truncateText } from "@/src/lib/formatters";
import { formatCompactDate } from "@/src/lib/datetime";
import { useLongPress } from "@/src/hooks/useLongPress";

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
    <div className="relative group">
      <SelectableCard
        selected={selected}
        onSelect={onSelect}
        onOpen={onOpen}
        disableOpenOnClick={true}
        className="ml-auto max-w-[85%] overflow-hidden flex flex-col min-h-[140px]"
      >
        {(currentImages.length > 0) && (
          <div className="aspect-[4/3] w-full overflow-hidden border-b border-neutral-100 bg-neutral-50 shrink-0">
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

        <div className="px-4 py-3 flex-1 flex flex-col gap-1.5">
          {/* HEADER: NOMBRE + PRECIO */}
          <div className="flex justify-between items-start gap-2">
            <p className="text-sm font-semibold text-neutral-900 flex-1 line-clamp-1">
              {item.name}
            </p>
            <p className="text-emerald-600 font-bold text-sm whitespace-nowrap">
              ${formatMoney(item.price)}
            </p>
          </div>

          {/* DURATION (IF SERVICE) */}
          {item.type === "SERVICE" && (
            <div className="flex items-center gap-1.5 text-neutral-500 text-[10px] font-medium">
              <span>🕒</span>
              <span>{item.durationMinutes} min</span>
            </div>
          )}

          {/* DESCRIPTION */}
          <div className="flex-1">
            {item.description && (
              <p className="text-[11px] text-neutral-500 leading-snug line-clamp-2">
                {truncateText(item.description, 90)}
              </p>
            )}
          </div>

          {/* FOOTER: PILL LEFT, DATE RIGHT */}
          <div className="mt-auto pt-2 flex items-center justify-between gap-4">
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider shrink-0 ${
              item.type === 'SERVICE' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'
            }`}>
              {item.type === 'SERVICE' ? 'Servicio' : 'Producto'}
            </span>

            <span className="text-[9px] text-neutral-400 font-medium tabular-nums lowercase italic whitespace-nowrap">
              {formatCompactDate(item.createdAt)}
            </span>
          </div>
        </div>
      </SelectableCard>
    </div>
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
