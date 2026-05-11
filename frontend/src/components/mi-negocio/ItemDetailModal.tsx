"use client";

import { useState, useEffect } from "react";
import { X, Edit, Trash2, Tag, Clock, Calendar, Info } from "lucide-react";
import { ItemImageViewer } from "@/src/components/ui/ItemImageViewer";
import { formatMoney } from "@/src/lib/formatters";
import { formatFullDate } from "@/src/lib/datetime";
import { api } from "@/src/lib/api";

import { groupScheduleByDay, formatActiveDaysCompact } from "@/src/lib/availability";

import { ItemPanelLayout } from "./ItemPanelLayout";

interface Item {
  id: string;
  name: string;
  price: number;
  description?: string;
  type?: "PRODUCT" | "SERVICE";
  durationMinutes?: number;
  schedule?: any[];
  createdAt?: string;
  images?: { id: string; url: string; order: number }[];
  status?: string;
}

interface ItemDetailModalProps {
  item: Item | null;
  open: boolean;
  onClose: () => void;
  onEdit: (item: any) => void;
  onDelete: (item: any) => void;
}

export default function ItemDetailModal({ item, open, onClose, onEdit, onDelete }: ItemDetailModalProps) {
  const [fullItem, setFullItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && item?.id && item.type === "SERVICE") {
      // Si no tiene schedule o duration, hidratamos
      if (!item.schedule || item.schedule.length === 0) {
        setLoading(true);
        api<Item>(`/items/${item.id}`)
          .then(res => setFullItem(res))
          .catch(() => {})
          .finally(() => setLoading(false));
      } else {
        setFullItem(null);
      }
    } else {
      setFullItem(null);
      setLoading(false);
    }
  }, [open, item?.id, item?.type, item?.schedule]);

  if (!open || !item) return null;

  const displayItem = fullItem ?? item;
  const images = displayItem.images ?? [];
  const imageCount = images.length;
  
  const activeDays = displayItem.type === "SERVICE" ? formatActiveDaysCompact(displayItem.schedule) : "";
  const groupedSchedule = displayItem.type === "SERVICE" ? groupScheduleByDay(displayItem.schedule) : [];

  return (
    <ItemPanelLayout
      open={open}
      onClose={onClose}
      title="Detalle"
      subtitle={`#${displayItem.id.slice(-6).toUpperCase()}`}
    >
      <div className="space-y-6">
          
          {/* IMAGE SECTION ... (omitting for brevity in TargetContent if possible, but I'll include the whole block for safety) */}
          {imageCount > 0 ? (
            <div className="rounded-2xl overflow-hidden border border-neutral-100 bg-white shadow-sm aspect-square w-full">
              <ItemImageViewer
                images={images}
                imageCount={imageCount}
                name={item.name}
                containerClassName="h-full w-full flex items-center justify-center"
                imageClassName="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 aspect-square w-full flex flex-col items-center justify-center text-neutral-400 gap-2">
              <Tag size={32} strokeWidth={1.5} />
              <p className="text-[10px] font-bold uppercase tracking-widest">Sin imágenes</p>
            </div>
          )}

          {/* MAIN INFO GRID */}
          <div className="p-4 rounded-2xl bg-white border border-neutral-100 shadow-sm space-y-4">
            <div className="space-y-1">
                Nombre
              <h3 className="text-base font-bold text-neutral-900 leading-tight">{item.name}</h3>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-neutral-50">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest block">Precio</span>
                <span className="text-lg font-black text-emerald-600">${formatMoney(item.price)}</span>
              </div>
            </div>

            {displayItem.type === "SERVICE" && (
              <div className="pt-3 border-t border-neutral-50 space-y-4">
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-neutral-400" />
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Duración estimada:</span>
                  <span className="text-sm font-semibold text-neutral-700">{displayItem.durationMinutes} min</span>
                </div>

                {activeDays && (
                  <div className="flex items-start gap-2 pt-3 border-t border-neutral-50">
                    <Calendar size={14} className="text-neutral-400 mt-0.5" />
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest block">Días disponibles:</span>
                      <span className="text-sm font-semibold text-neutral-700">{activeDays}</span>
                    </div>
                  </div>
                )}

                {groupedSchedule.length > 0 && (
                  <div className="space-y-3 pt-3 border-t border-neutral-50">
                    <div className="flex items-center gap-2">
                      <Info size={14} className="text-neutral-400" />
                      <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Horarios disponibles:</span>
                    </div>
                    
                    <div className="flex flex-col gap-2 pl-6">
                      {groupedSchedule.map((group) => (
                        <div key={group.day} className="flex flex-col bg-neutral-50/50 p-2 rounded-xl border border-neutral-100">
                          <span className="text-[11px] font-bold text-neutral-700">{group.label}</span>
                          <div className="flex flex-wrap gap-x-2">
                            {group.ranges.map((range, idx) => (
                              <span key={idx} className="text-xs text-neutral-500 font-medium">{range}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {loading && (
                    <div className="py-4 flex justify-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-500" />
                    </div>
                )}
              </div>
            )}
          </div>

          {/* DESCRIPTION */}
          {item.description && (
            <div className="space-y-2 px-1">
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest block">Descripción completa</span>
              <p className="text-sm text-neutral-600 leading-relaxed bg-white p-4 rounded-2xl border border-neutral-100 shadow-sm whitespace-pre-wrap">
                {item.description}
              </p>
            </div>
          )}

          {/* META INFO */}
          <div className="flex items-center gap-4 px-1 pt-2">
             <div className="flex flex-col">
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1">Creado el</span>
                <div className="flex items-center gap-1.5 text-neutral-500">
                  <Calendar size={12} />
                  <span className="text-xs font-medium">{formatFullDate(item.createdAt || new Date().toISOString())}</span>
                </div>
             </div>
          </div>
        </div>
    </ItemPanelLayout>
  );
}
