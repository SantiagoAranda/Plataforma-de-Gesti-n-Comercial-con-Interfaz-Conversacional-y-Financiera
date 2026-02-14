"use client";

import { useRouter } from "next/navigation";
import type { Sale } from "@/src/types/sales";

import { useContextMenu } from "@/src/hooks/useContextMenu";
import ContextMenu from "@/src/components/common/ContextMenu";
import { getStatusStyles } from "@/src/lib/statusStyles";


function statusBadge(status: Sale["status"]) {
    switch (status) {
        case "CONFIRMADO":
            return "bg-blue-100 text-blue-700";
        case "CERRADO":
            return "bg-green-100 text-green-700";
        case "PENDIENTE":
            return "bg-orange-100 text-orange-700";
        default:
            return "bg-gray-100 text-gray-700";
    }
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

function calcTotal(sale: Sale) {
    return sale.items.reduce((acc, it) => acc + it.price, 0);
}

function formatTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

type Props = {
    sale: Sale;
    onEdit?: (sale: Sale) => void;
    onDetails?: (sale: Sale) => void;
    onSendWhatsApp?: (sale: Sale) => void;
};

export default function SaleCard({
    sale,
    onEdit,
    onDetails,
    onSendWhatsApp,
}: Props) {
    const router = useRouter();
    const menu = useContextMenu(500);

    const total = calcTotal(sale);

    const styles = getStatusStyles(sale.status);

    const handleEdit = () => {
        if (onEdit) return onEdit(sale);
        router.push(`/ventas/${sale.id}/editar`);
    };

    const handleDetails = () => {
        if (onDetails) return onDetails(sale);
        router.push(`/ventas/${sale.id}`);
    };

    return (
        <>
            <div className="flex flex-col gap-1 items-start max-w-[90%]">
                <div
                    {...menu.handlers}
                    className={`bg-white rounded-xl rounded-tl-none p-4 shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] w-full select-none ${styles.border}`}
                    
                >
                    <div className="flex justify-between items-start mb-3">
                        <div>
                            <h3 className="font-bold text-gray-900 text-base">
                                {sale.customerName}
                            </h3>
                            <p className="text-xs text-gray-500">Tipo: {typeLabel(sale.type)}</p>
                        </div>

                        <span
                            className={[
                                "text-[11px] font-bold px-2 py-1 rounded-full uppercase",
                                statusBadge(sale.status),
                            ].join(" ")}
                        >
                            {statusLabel(sale.status)}
                        </span>
                    </div>

                    <div className="space-y-2 mb-4 border-t border-gray-100 pt-3">
                        {sale.items.map((it, idx) => (
                            <div
                                key={`${sale.id}-${idx}`}
                                className="flex justify-between text-sm text-gray-700"
                            >
                                <span>
                                    {it.qty}x {it.name}
                                </span>
                                <span>${it.price.toFixed(2)}</span>
                            </div>
                        ))}
                    </div>

                    <div className="flex justify-between items-center mb-4 pt-2">
                        <span className="text-sm font-medium text-gray-500">Total</span>
                        <span className="text-lg font-bold text-gray-900">
                            ${total.toFixed(2)}
                        </span>
                    </div>

                    {onSendWhatsApp && (
                        <button
                            type="button"
                            onClick={() => onSendWhatsApp(sale)}
                            className="w-full bg-[#11d473] hover:brightness-95 text-white font-bold py-3 rounded-full active:scale-95 transition-transform"
                        >
                            Enviar WhatsApp
                        </button>
                    )}

                    <div className="flex justify-end mt-2">
                        <span className="text-[10px] text-gray-400">
                            {formatTime(sale.createdAt)}
                        </span>
                    </div>
                </div>
            </div>

            <ContextMenu
                open={menu.open}
                x={menu.pos.x}
                y={menu.pos.y}
                onClose={menu.close}
                items={[
                    { label: "Editar", onClick: handleEdit },
                    { label: "Ver detalles", onClick: handleDetails },
                ]}
            />
        </>
    );
}
