"use client";

import type { Sale } from "@/src/types/sales";
import SaleCard from "./SaleCard";

type Props = {
    sales: Sale[];
    onEdit?: (sale: Sale) => void;
    onDetails?: (sale: Sale) => void;
    onSendWhatsApp?: (sale: Sale) => void;
};

export default function SalesList({ sales, onEdit, onDetails, onSendWhatsApp }: Props) {
    return (
        <main className="flex flex-col p-4 gap-6 max-w-md mx-auto pb-24">
            <div className="flex justify-center my-2">
                <span className="bg-white/60 backdrop-blur-sm text-[11px] font-semibold text-gray-500 px-3 py-1 rounded-full uppercase tracking-wider">
                    Hoy
                </span>
            </div>

            {sales.map((s) => (
                <SaleCard
                    key={s.id}
                    sale={s}
                    onEdit={onEdit}
                    onDetails={onDetails}
                    onSendWhatsApp={onSendWhatsApp}
                />
            ))}
        </main>
    );
}
