"use client";

import { useMemo, useState } from "react";
import AppHeader from "@/src/components/layout/AppHeader";
import SalesList from "@/src/components/sales/SalesList";
import SalesSearchBar from "@/src/components/sales/SalesSearchBar";
import { Sale } from "@/src/types/sales";

export default function VentasPage() {
    const [q, setQ] = useState("");

    // MOCK: después lo reemplazás por fetch a backend
    const sales: Sale[] = useMemo(
        () => [
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
            {
                id: "3",
                customerName: "Carlos Ruiz",
                type: "PRODUCTO",
                status: "PENDIENTE",
                createdAt: new Date().toISOString(),
                items: [
                    { qty: 3, name: "Set de Medias Sport", price: 15 },
                    { qty: 1, name: "Zapatillas Run Pro", price: 85 },
                ],
            },
        ],
        [],
    );

    const filtered = useMemo(() => {
        const term = q.trim().toLowerCase();
        if (!term) return sales;
        return sales.filter((s) => {
            if (s.customerName.toLowerCase().includes(term)) return true;
            return s.items.some((i) => i.name.toLowerCase().includes(term));
        });
    }, [q, sales]);

    return (
        <div className="min-h-screen bg-gray-100">
            {/* Si AppHeader no soporta "back", podés dejarlo como está hoy */}
            <AppHeader title="Ventas" showBack />

            <SalesList
                sales={filtered}
                businessName="Mi Negocio"
                businessWhatsappE164="5493424353124"
            />

            <SalesSearchBar
                value={q}
                onChange={setQ}
                onAction={() => {
                    // acción libre: por ej abrir buscador/crear orden
                    // en MVP puede ser noop o navegar a “crear venta”
                }}
            />

        </div>
    );
}
