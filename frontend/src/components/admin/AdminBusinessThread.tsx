"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/src/lib/api";
import { useNotification } from "@/src/components/ui/NotificationProvider";
import { BusinessChatItem } from "./BusinessChatItem";
import AppHeader from "@/src/components/layout/AppHeader";
import ContextMenu from "@/src/components/common/ContextMenu";
import { useContextMenu } from "@/src/hooks/useContextMenu";

type Business = {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  phoneWhatsapp: string;
  status: "ACTIVE" | "INACTIVE";
};

type Props = {
  type: "active" | "inactive";
};

export function AdminBusinessThread({ type }: Props) {
  const router = useRouter();
  const { notify } = useNotification();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);

  const { open, pos, close, handlers } = useContextMenu();

  const title = type === "active" ? "Tiendas" : "Tiendas inactivas";
  const endpoint = type === "active" ? "/businesses/admin/active" : "/businesses/admin/inactive";

  const fetchBusinesses = async () => {
    setLoading(true);
    try {
      const data = await api<Business[]>(endpoint);
      setBusinesses(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("No se pudieron cargar los negocios");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBusinesses();
  }, [type]);

  const handleToggleStatus = async (business: Business) => {
    const patchUrl = business.status === "ACTIVE" 
      ? `/businesses/${business.id}/inactivate` 
      : `/businesses/${business.id}/activate`;

    try {
      await api(patchUrl, { method: "PATCH" });
      
      notify({
        type: "success",
        message: business.status === "ACTIVE" ? "Negocio inhabilitado correctamente" : "Negocio reactivado correctamente"
      });
      
      // Remove from current list
      setBusinesses(prev => prev.filter(b => b.id !== business.id));
    } catch (err) {
      console.error(err);
      notify({ type: "error", message: "No se pudo actualizar el estado del negocio" });
    }
  };

  const handleDetail = (id: string) => {
    // We'll implement a simple modal or use a sub-page
    // For now navigate to a detail page
    router.push(`/admin/negocio/${id}`);
  };

  return (
    <div className="flex h-screen flex-col bg-white">
      <AppHeader 
        title={title} 
        subtitle={type === "active" ? "Negocios habilitados" : "Negocios deshabilitados"} 
        showBack 
        hrefBack="/admin" 
      />

      <main className="flex-1 overflow-y-auto pb-24">
        {loading && (
          <div className="p-4 space-y-4">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="h-[74px] animate-pulse rounded-xl bg-neutral-50" />
            ))}
          </div>
        )}

        {error && !loading && (
          <div className="px-4 py-8 text-center text-neutral-500">
            <p>{error}</p>
            <button 
              onClick={fetchBusinesses}
              className="mt-4 text-blue-600 font-medium"
            >
              Reintentar
            </button>
          </div>
        )}

        {!loading && !error && businesses.length === 0 && (
          <div className="px-4 py-12 text-center text-neutral-500">
            <p>{type === "active" ? "No hay tiendas activas" : "No hay negocios inactivos"}</p>
          </div>
        )}

        {!loading && !error && businesses.length > 0 && (
          <div className="divide-y divide-neutral-100">
            {businesses.map(business => (
              <BusinessChatItem 
                key={business.id} 
                business={business} 
                onClick={handleDetail}
                contextMenuHandlers={handlers}
                onSelect={() => setSelectedBusiness(business)}
              />
            ))}
          </div>
        )}
      </main>

      {selectedBusiness && (
        <ContextMenu
          open={open}
          x={pos.x}
          y={pos.y}
          onClose={close}
          items={[
            {
              label: selectedBusiness.status === "ACTIVE" ? "Inhabilitar negocio" : "Reactivar negocio",
              onClick: () => handleToggleStatus(selectedBusiness)
            }
          ]}
        />
      )}
    </div>
  );
}
