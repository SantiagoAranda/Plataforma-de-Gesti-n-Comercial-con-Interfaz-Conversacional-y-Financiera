"use client";

import QuotationCard, { type QuotationCardProps } from "./QuotationCard";
import type { Quotation } from "@/src/types/quotations";

export default function QuotationList({ quotations, ...handlers }: { quotations: Quotation[] } & Omit<QuotationCardProps, "quotation">) {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-3 pb-4 sm:max-w-3xl sm:px-4">
      {quotations.map((q) => (
        <QuotationCard key={q.id} quotation={q} {...handlers} />
      ))}
    </main>
  );
}
