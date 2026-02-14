"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Sale } from "@/src/types/sales";

import AppHeader from "@/src/components/layout/AppHeader";
import SalesList from "@/src/components/sales/SalesList";
import SaleDetailsModal from "@/src/components/sales/SaleDetailsModal";
import SaleEditModal from "@/src/components/sales/SaleEditModal";
import { buildWhatsAppUrl, formatSaleMessage } from "@/src/lib/whatsapp";

export default function VentaPage() {
    const router = useRouter();

    const [q, setQ] = useState("");
    const [sales, setSales] = useState<Sale[]>([
        {
            id: "1",
            customerName: "Juan Pérez",
            type: "PRODUCTO",
            status: "CONFIRMADO",
            createdAt: new Date().toISOString(),
            items: [
                { qty: 2, name: "Camiseta básica", price: 40 },
                { qty: 1, name: "Gorra Pro", price: 25 },
            ],
        },
        {
            id: "2",
            customerName: "María García",
            type: "SERVICIO",
            status: "CERRADO",
            createdAt: new Date().toISOString(),
            items: [{ qty: 1, name: "Asesoría Técnica (1hr)", price: 120 }],
        },
    ]);

    const [detailsSale, setDetailsSale] = useState<Sale | null>(null);
    const [editingSale, setEditingSale] = useState<Sale | null>(null);

    const filtered = useMemo(() => {
        const term = q.trim().toLowerCase();
        if (!term) return sales;
        return sales.filter((s) => {
            if (s.customerName.toLowerCase().includes(term)) return true;
            return s.items.some((i) => i.name.toLowerCase().includes(term));
        });
    }, [q, sales]);

    // WhatsApp test (lo mantiene la page, no SaleCard)
    const businessWhatsappE164 = "5493424353124";
    const businessName = "Mi Negocio";

    const handleSendWhatsApp = (sale: Sale) => {
        const total = sale.items.reduce((acc, it) => acc + it.price, 0);
        const msg = formatSaleMessage({
            businessName,
            customerName: sale.customerName,
            items: sale.items,
            total,
        });
        const url = buildWhatsAppUrl(businessWhatsappE164, msg);
        window.open(url, "_blank");
    };

    const handleSaveEdit = (updated: Sale) => {
        setSales((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    };

    return (
        <div className="min-h-screen bg-[#F0F2F5]">
            <AppHeader title="Ventas" showBack />

            <SalesList
                sales={filtered}
                onEdit={(sale) => setEditingSale(sale)}
                onDetails={(sale) => setDetailsSale(sale)}   // ✅ detalles por modal
                onSendWhatsApp={handleSendWhatsApp}
            />

            <SaleDetailsModal
                open={!!detailsSale}
                sale={detailsSale}
                onClose={() => setDetailsSale(null)}
            />

            <SaleEditModal
                open={!!editingSale}
                sale={editingSale}
                onClose={() => setEditingSale(null)}
                onSave={handleSaveEdit}
            />
        </div>
    );
}
