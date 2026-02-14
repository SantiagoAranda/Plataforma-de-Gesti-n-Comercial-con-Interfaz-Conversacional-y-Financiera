"use client";

import type { Sale } from "@/src/types/sales";
import { generateInvoicePdf } from "@/src/lib/invoicePdf";

function formatMoney(n: number) {
    return n.toFixed(2);
}

function calcTotal(sale: Sale) {
    return sale.items.reduce((acc, it) => acc + it.price, 0);
}

function formatDateTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleString([], {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function statusLabel(status: Sale["status"]) {
    switch (status) {
        case "CONFIRMADO":
            return "Confirmado";
        case "CERRADO":
            return "Cerrado";
        case "PENDIENTE":
            return "Pendiente";
        default:
            return status;
    }
}

function typeLabel(type: Sale["type"]) {
    return type === "PRODUCTO" ? "Producto" : "Servicio";
}

export default function SaleDetailsModal({
    open,
    sale,
    onClose,
}: {
    open: boolean;
    sale: Sale | null;
    onClose: () => void;
}) {
    if (!open || !sale) return null;

    const total = calcTotal(sale);

    return (
        <div className="fixed inset-0 z-[9998] bg-black/40 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between">
                    <div className="font-semibold text-neutral-900">Detalles</div>
                    <button
                        onClick={onClose}
                        className="w-9 h-9 rounded-full hover:bg-neutral-100"
                        aria-label="Cerrar"
                    >
                        ✕
                    </button>
                </div>

                <div className="p-4 space-y-3">
                    <div className="space-y-1">
                        <div className="text-sm text-neutral-500">Cliente</div>
                        <div className="text-base font-semibold text-neutral-900">
                            {sale.customerName}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <div className="text-sm text-neutral-500">Tipo</div>
                            <div className="text-sm font-medium text-neutral-900">
                                {typeLabel(sale.type)}
                            </div>
                        </div>
                        <div className="space-y-1">
                            <div className="text-sm text-neutral-500">Estado</div>
                            <div className="text-sm font-medium text-neutral-900">
                                {statusLabel(sale.status)}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <div className="text-sm text-neutral-500">Fecha</div>
                        <div className="text-sm text-neutral-900">
                            {formatDateTime(sale.createdAt)}
                        </div>
                    </div>

                    <div className="border-t border-neutral-200 pt-3">
                        <div className="text-sm font-semibold text-neutral-900 mb-2">
                            Ítems
                        </div>

                        <div className="space-y-2">
                            {sale.items.map((it, idx) => (
                                <div key={idx} className="flex justify-between text-sm">
                                    <span className="text-neutral-700">
                                        {sale.type === "PRODUCTO" ? `${it.qty}x ` : ""}
                                        {it.name}
                                    </span>
                                    <span className="text-neutral-900 font-medium">
                                        ${formatMoney(it.price)}
                                    </span>
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-between items-center mt-4 pt-3 border-t border-neutral-200">
                            <span className="text-sm text-neutral-500">Total</span>
                            <span className="text-lg font-bold text-neutral-900">
                                ${formatMoney(total)}
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={() =>
                            generateInvoicePdf({
                                sale,
                                businessName: "Mi Negocio",
                                businessPhone: "54911XXXXYYYY",
                                invoiceNumber: `#${sale.id}`,
                                currencySymbol: "$",
                            })
                        }
                        className="w-full bg-[#11d473] text-white rounded-xl py-3 font-semibold hover:brightness-95"
                    >
                        Descargar PDF
                    </button>


                    <button
                        onClick={onClose}
                        className="w-full bg-neutral-900 text-white rounded-xl py-3 font-semibold hover:brightness-95"
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}
