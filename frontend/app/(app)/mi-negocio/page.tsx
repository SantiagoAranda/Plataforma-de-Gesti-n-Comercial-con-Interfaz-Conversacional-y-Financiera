"use client";

import { useState, useEffect, useCallback } from "react";
import { Trash2, X, Clock } from "lucide-react";
import AppHeader from "@/src/components/layout/AppHeader";
import { api } from "@/src/lib/api";
import { getCached, getInstantCache, invalidateCache } from "@/src/lib/cache";
import { SelectionActionBar } from "@/src/components/shared/selection/SelectionActionBar";
import { ItemCard } from "@/src/components/mi-negocio/ItemCard";
import ItemDetailModal from "@/src/components/mi-negocio/ItemDetailModal";
import ItemFormModal from "@/src/components/mi-negocio/ItemFormModal";
import { Item } from "@/src/types/item";


export default function MiNegocioPage() {

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [itemForDetail, setItemForDetail] = useState<Item | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(12);

  const fetchItems = useCallback(async (isInitial = false) => {
    try {
      const dbStatus = 'ACTIVE';
      const key = `mi-negocio:items:${dbStatus}`;
      const hasInstant = !!getInstantCache<Item[]>(key, 60_000);
      
      if (!hasInstant && isInitial) {
        setLoading(true);
      }

      const data = await getCached(key, 60_000, () => 
        api<Item[]>(`/items?status=ACTIVE&lightweight=true`)
      );
      setItems(data);
    } catch (err) {
      console.error(err);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setVisibleCount(12); // Reset count on filter change
    fetchItems(true);
  }, [fetchItems]);

  const handleStartEdit = (item: Item | null) => {
    setEditingItem(item);
    setIsOpen(true);
    setSelectedItem(null);
  };

  const handleDelete = async (item: Item) => {
    try {
      await api(`/items/${item.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "INACTIVE" }),
      });
      setItems(prev => prev.filter(i => i.id !== item.id));
      setSelectedItem(null);
      invalidateCache("mi-negocio:items:ACTIVE");
      invalidateCache("home:businessActivity");
      setToast({ message: "Item eliminado", type: "success" });
    } catch (err) {
      console.error(err);
      setToast({ message: "Error al eliminar", type: "error" });
    }
    setTimeout(() => setToast(null), 2500);
  };

  return (
    <div className="flex flex-col h-screen bg-neutral-100">
      {selectedItem ? (
        <SelectionActionBar
          visible
          title="Item seleccionado"
          onClose={() => setSelectedItem(null)}
          onView={() => setItemForDetail(selectedItem)}
          onEdit={() => handleStartEdit(selectedItem)}
          editLabel="Editar"
          onDelete={() => setDeleteId(selectedItem.id)}
          deleteLabel="Eliminar"
          deleteIcon={Trash2}
        />
      ) : (
        <AppHeader title="Mi negocio" showBack={true} hrefBack="/home" />
      )}

      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-28">
        {loading && <div className="text-center py-20 text-neutral-400 font-bold text-[10px] uppercase tracking-widest animate-pulse">Cargando...</div>}
        {!loading && items.length === 0 && (
          <div className="text-center py-20 text-neutral-400 font-bold text-[10px] uppercase tracking-widest">No hay items creados</div>
        )}
        
        <div className="grid grid-cols-1 gap-4">
          {items.slice(0, visibleCount).map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              selected={selectedItem?.id === item.id}
              onSelect={() => setSelectedItem(prev => prev?.id === item.id ? null : item)}
            />
          ))}
        </div>

        {items.length > visibleCount && (
          <div className="flex justify-center pb-8 pt-2">
            <button
              onClick={() => setVisibleCount((prev) => prev + 12)}
              className="px-6 py-2.5 bg-white border border-neutral-100 text-neutral-500 font-bold rounded-full shadow-sm active:scale-95 transition text-[10px] uppercase tracking-widest"
            >
              Cargar más
            </button>
          </div>
        )}
      </main>

      {/* PANEL INFERIOR FIJO */}
      <div className="fixed bottom-0 left-0 right-0 z-20">
        {!isOpen && (
          <div className="bg-white border-t border-neutral-100 px-4 py-3 flex items-center gap-3 shadow-[0_-4px_20px_rgba(0,0,0,0.03)] backdrop-blur-sm bg-white/90">
            <button
              onClick={() => handleStartEdit(null)}
              className="w-12 h-12 rounded-full bg-green-600 text-white flex items-center justify-center text-2xl shadow-lg active:scale-95 transition"
            >
              +
            </button>
            <div className="flex-1 bg-neutral-50 rounded-full px-4 py-2 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
              Crear nuevo item...
            </div>
          </div>
        )}
      </div>

      {/* MODAL DE FORMULARIO (NUEVO / EDITAR) */}
      <ItemFormModal
        open={isOpen}
        editingItem={editingItem}
        onClose={() => { setIsOpen(false); setEditingItem(null); }}
        onSaved={(savedItem) => {
          setItems(prev => {
            const exists = prev.find(i => i.id === savedItem.id);
            if (exists) return prev.map(i => i.id === savedItem.id ? savedItem : i);
            return [savedItem, ...prev];
          });
          if (selectedItem?.id === savedItem.id) setSelectedItem(savedItem);
        }}
        setToast={setToast}
      />

      {/* MODAL DE DETALLES */}
      <ItemDetailModal 
        item={itemForDetail}
        open={!!itemForDetail}
        onClose={() => setItemForDetail(null)}
        onEdit={(i) => { setItemForDetail(null); handleStartEdit(i); }}
        onDelete={(i) => { setItemForDetail(null); setDeleteId(i.id); }}
      />

      {/* MODAL ELIMINAR (CONFIRMACION) */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[10000] backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-xs shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-neutral-900 mb-2">¿Eliminar item?</h3>
            <p className="text-xs text-neutral-500 mb-6 font-medium leading-relaxed">
              Esta acción ocultará el item de tu catálogo activo. Podrás recuperarlo luego si es necesario.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  const target = items.find(i => i.id === deleteId);
                  if (target) handleDelete(target);
                  setDeleteId(null);
                }}
                className="w-full py-3 rounded-xl bg-red-500 text-white text-xs font-bold shadow-lg shadow-red-100 active:scale-95 transition"
              >
                Eliminar definitivamente
              </button>
              <button
                onClick={() => setDeleteId(null)}
                className="w-full py-3 rounded-xl bg-neutral-100 text-neutral-500 text-xs font-bold active:scale-95 transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST DE NOTIFICACIÓN */}
      {toast && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 text-white text-[10px] font-bold uppercase tracking-widest px-6 py-3 rounded-full shadow-2xl animate-in slide-in-from-bottom-4 duration-300 z-[10001] ${toast.type === "success" ? "bg-green-600 shadow-green-100" : "bg-red-600 shadow-red-100"}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
