import SaleCard from "./SaleCard";
import { Sale } from "@/src/types/sales";

export default function SalesList({
    sales,
    businessName,
    businessWhatsappE164,
}: {
    sales: Sale[];
    businessName?: string;
    businessWhatsappE164: string;
}) {
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
                    businessName={businessName}
                    businessWhatsappE164={businessWhatsappE164}
                />
            ))}
        </main>
    );
}
