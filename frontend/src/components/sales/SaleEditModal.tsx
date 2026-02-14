"use client";

import { useEffect, useMemo, useState } from "react";
import type { Sale } from "@/src/types/sales";

type EditableItem = {
    qty: number;
    name: string;
    price: number;
};

function calcTotal(items: EditableItem[]) {
    return items.reduce((acc, it) => acc + (Number.isFinite(it.price) ? it.price : 0), 0);
}

function normalizeQty(type: Sale["type"], qty: number) {
    if (type === "SERVICIO") return 1;
    return Math.max(1, Math.floor(qty || 1));
}

export default function SaleEditModal({
    open,
    sale,
    onClose,
    onSave,
}: {
    open: boolean;
    sale: Sale | null;
    onClose: () => void;
    onSave: (updated: Sale) => void;
}) {
    const [customerName, setCustomerName] = useState("");
    const [type, setType] = useState<Sale["type"]>("PRODUCTO");
    const [status, setStatus] = useState<Sale["status"]>("PENDIENTE");
    const [items, setItems] = useState<EditableItem[]>([]);

    useEffect(() => {
        if (!open || !sale) return;

        setCustomerName(sale.customerName);
        setType(sale.type);
        setStatus(sale.status);
        setItems(
            sale.items.map((it) => ({
                qty: sale.type === "SERVICIO" ? 1 : it.qty,
                name: it.name,
                price: it.price,
            })),
        );
    }, [open, sale]);

    const total = useMemo(() => calcTotal(items), [items]);

    if (!open || !sale) return null;

    const setItem = (idx: number, patch: Partial<EditableItem>) => {
        setItems((prev) =>
            prev.map((it, i) => {
                if (i !== idx) return it;
                const next = { ...it, ...patch };
                next.qty = normalizeQty(type, next.qty);
                next.price = Number.isFinite(next.price) ? next.price : 0;
                return next;
            }),
        );
    };

    const addItem = () => {
        setItems((prev) => [...prev, { qty: type === "SERVICIO" ? 1 : 1, name: "", price: 0 }]);
    };

    const removeItem = (idx: number) => {
        setItems((prev) => prev.filter((_, i) => i !== idx));
    };

    const handleChangeType = (nextType: Sale["type"]) => {
        setType(nextType);
        setItems((prev) =>
            prev.map((it) => ({
                ...it,
                qty: normalizeQty(nextType, it.qty),
            })),
        );
    };

    const handleSave = () => {
        const cleanedName = customerName.trim();
        if (!cleanedName) return;

        const cleanedItems = items
            .map((it) => ({
                qty: normalizeQty(type, it.qty),
                name: it.name.trim(),
                price: Number(it.price) || 0,
            }))
            .filter((it) => it.name.length > 0);

        if (cleanedItems.length === 0) return;

        const updated: Sale = {
            ...sale,
            customerName: cleanedName,
            type,
            status,
            items: cleanedItems,
        };

        onSave(updated);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[9998] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden max-h-[85vh] flex flex-col">
                <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between shrink-0">
                    <div className="font-semibold text-neutral-900">Editar</div>
                    <button
                        onClick={onClose}
                        className="w-9 h-9 rounded-full hover:bg-neutral-100"
                        aria-label="Cerrar"
                    >
                        ✕
                    </button>
                </div>

                <div className="p-4 space-y-4 overflow-y-auto">
                    <div>
                        <label className="text-sm text-neutral-600">Cliente</label>
                        <input
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                            placeholder="Nombre del cliente"
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="text-sm text-neutral-600">Tipo</label>
                            <select
                                value={type}
                                onChange={(e) => handleChangeType(e.target.value as Sale["type"])}
                                className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                            >
                                <option value="PRODUCTO">Producto</option>
                                <option value="SERVICIO">Servicio</option>
                            </select>
                        </div>

                        <div>
                            <label className="text-sm text-neutral-600">Estado</label>
                            <select
                                value={status}
                                onChange={(e) => setStatus(e.target.value as Sale["status"])}
                                className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                            >
                                <option value="PENDIENTE">Pendiente</option>
                                <option value="CONFIRMADO">Confirmado</option>
                                <option value="CERRADO">Cerrado</option>
                            </select>
                        </div>
                    </div>

                    <div className="border-t border-neutral-200 pt-3">
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-sm font-semibold text-neutral-900">Ítems</div>
                            <button
                                type="button"
                                onClick={addItem}
                                className="text-sm font-semibold text-emerald-700 hover:underline"
                            >
                                + Agregar {type === "SERVICIO" ? "servicio" : "producto"}
                            </button>
                        </div>

                        <div className="space-y-3">
                            {items.map((it, idx) => (
                                <div key={idx} className="rounded-xl border border-neutral-200 p-3">
                                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                                        <div className="col-span-1 sm:col-span-12">
                                            <label className="text-xs text-neutral-600">
                                                {type === "SERVICIO" ? "Servicio" : "Producto"}
                                            </label>
                                            <input
                                                value={it.name}
                                                onChange={(e) => setItem(idx, { name: e.target.value })}
                                                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                                                placeholder={type === "SERVICIO" ? "Nombre del servicio" : "Nombre del producto"}
                                            />
                                        </div>

                                        <div className="col-span-1 sm:col-span-4">
                                            <label className="text-xs text-neutral-600">Cantidad</label>
                                            <input
                                                type="number"
                                                value={type === "SERVICIO" ? 1 : it.qty}
                                                disabled={type === "SERVICIO"}
                                                onChange={(e) => setItem(idx, { qty: Number(e.target.value) })}
                                                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-100"
                                                min={1}
                                            />
                                        </div>

                                        <div className="col-span-1 sm:col-span-6">
                                            <label className="text-xs text-neutral-600">Precio</label>
                                            <input
                                                type="number"
                                                value={it.price}
                                                onChange={(e) => setItem(idx, { price: Number(e.target.value) })}
                                                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                                                min={0}
                                                step="0.01"
                                            />
                                        </div>

                                        <div className="col-span-1 sm:col-span-2 flex justify-end">
                                            <button
                                                type="button"
                                                onClick={() => removeItem(idx)}
                                                className="w-9 h-9 rounded-full hover:bg-neutral-100"
                                                aria-label="Eliminar ítem"
                                            >
                                                🗑
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-between items-center mt-4 pt-3 border-t border-neutral-200">
                            <span className="text-sm text-neutral-600">Total</span>
                            <span className="text-lg font-bold text-neutral-900">${total.toFixed(2)}</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                            onClick={onClose}
                            className="w-full rounded-xl py-3 font-semibold border border-neutral-300 hover:bg-neutral-50"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            className="w-full rounded-xl py-3 font-semibold bg-neutral-900 text-white hover:brightness-95"
                        >
                            Guardar
                        </button>
                    </div>

                    <div className="text-xs text-neutral-500">
                        Nota: en <b>Servicio</b> la cantidad queda fija en 1.
                    </div>
                </div>
            </div>
        </div>
    );
}
