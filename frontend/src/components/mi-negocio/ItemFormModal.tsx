"use client";
import { useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { Item } from "@/src/types/item";
import { useItemForm } from "@/src/hooks/useItemForm";
import { ItemPanelLayout } from "./ItemPanelLayout";
import { ItemFormContent } from "./ItemFormContent";

const notify = (notice: { message: string; type: "success" | "error" }) => toast[notice.type](notice.message);

export default function ItemFormModal({ open, onClose, onSaved, editingItem }: {
  open: boolean; onClose: () => void; onSaved: (item: Item) => void; editingItem: Item | null;
}) {
  const form = useItemForm(onSaved, notify);
  const { handleStartEdit, resetForm, composerMode } = form;
  const started = useRef(false);
  useEffect(() => {
    if (!open) { started.current = false; resetForm(); return; }
    started.current = false;
    void handleStartEdit(editingItem);
  }, [open, editingItem, handleStartEdit, resetForm]);
  useEffect(() => {
    if (composerMode !== "closed") started.current = true;
    else if (open && started.current) onClose();
  }, [composerMode, open, onClose]);
  return <ItemPanelLayout open={open} onClose={() => { if (!form.isSubmitting) onClose(); }}
    title={editingItem ? "Editar ítem" : "Nuevo ítem"}
    footer={<button type="button" className="w-full rounded-xl bg-[#0B3F64] p-3 text-white disabled:opacity-50"
      disabled={form.isSubmitting || form.isLoadingDetail} onClick={form.handleSend}>
      {form.isSubmitting ? "Guardando..." : "Guardar"}
    </button>}>
    {form.isLoadingDetail ? <p role="status">Cargando detalle...</p> : <fieldset disabled={form.isSubmitting}><ItemFormContent {...form.contentProps} /></fieldset>}
    <label className="text-sm">Descripción
      <textarea disabled={form.isSubmitting || form.isLoadingDetail} value={form.description} onChange={(e) => form.setDescription(e.target.value)} maxLength={Math.max(300, form.description.length)}
        className="mt-2 w-full rounded-xl border border-neutral-200 p-3" />
    </label>
  </ItemPanelLayout>;
}
