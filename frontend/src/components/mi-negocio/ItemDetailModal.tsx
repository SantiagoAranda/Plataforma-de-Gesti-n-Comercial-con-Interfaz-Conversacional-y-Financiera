"use client";

import { X, Edit, Trash2, Tag, Clock, Calendar, Info } from "lucide-react";
import { ItemImageViewer } from "@/src/components/ui/ItemImageViewer";
import { formatMoney } from "@/src/lib/formatters";
import { formatFullDate } from "@/src/lib/datetime";

interface Item {
  id: string;
  name: string;
  price: number;
  description?: string;
  type?: "PRODUCT" | "SERVICE";
  durationMinutes?: number;
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
  if (!open || !item) return null;

  const images = item.images ?? [];
  const imageCount = images.length;

  return (
    <div className="fixed inset-0 z-[9998] flex items-end justify-center bg-black/40 sm:items-center sm:p-4 backdrop-blur-sm transition-opacity">
      <div 
        className="w-full sm:max-w-md flex flex-col bg-white rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden max-h-[90vh] sm:h-auto animate-in slide-in-from-bottom-full duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between bg-white sticky top-0 z-20">
          <div className="flex flex-col">
            <h2 className="font-bold text-neutral-900 text-lg">Detalle del ítem</h2>
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
              #{item.id.slice(-6).toUpperCase()}
            </span>
          </div>

          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-neutral-100 transition text-neutral-500"
          >
            <X size={20} />
          </button>
        </div>

        {/* CONTENT */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-neutral-50/30">
          
          {/* IMAGE SECTION */}
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
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest block">Nombre</span>
              <h3 className="text-base font-bold text-neutral-900 leading-tight">{item.name}</h3>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-neutral-50">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest block">Precio</span>
                <span className="text-lg font-black text-emerald-600">${formatMoney(item.price)}</span>
              </div>
              <div className="space-y-1 text-right">
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest block">Tipo</span>
                <div className="flex items-center justify-end gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${item.type === 'SERVICE' ? 'bg-blue-500' : 'bg-orange-500'}`} />
                  <span className="text-sm font-semibold text-neutral-700">
                    {item.type === "SERVICE" ? "Servicio" : "Producto"}
                  </span>
                </div>
              </div>
            </div>

            {item.type === "SERVICE" && item.durationMinutes && (
              <div className="pt-3 border-t border-neutral-50 flex items-center gap-2">
                <Clock size={14} className="text-neutral-400" />
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Duración estimada:</span>
                <span className="text-sm font-semibold text-neutral-700">{item.durationMinutes} min</span>
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
      </div>
    </div>
  );
}
