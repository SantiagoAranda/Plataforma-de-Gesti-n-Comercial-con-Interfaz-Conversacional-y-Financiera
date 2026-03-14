"use client";

import { use } from "react";
import { BusinessDetailPage } from "@/src/components/admin/BusinessDetailPage";

export default function BusinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <BusinessDetailPage businessId={id} />;
}
