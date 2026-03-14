"use client";

import { Building2, PowerOff } from "lucide-react";
import { useRouter } from "next/navigation";
import AppHeader from "@/src/components/layout/AppHeader";
import ThreadItem from "@/src/components/chat/ThreadItem";

export default function AdminHomePage() {
  const router = useRouter();

  return (
    <div className="flex h-screen flex-col bg-white">
      <AppHeader
        title="Consola de Administración"
        subtitle="Gestión de negocios"
      />

      <main className="flex-1 overflow-y-auto">
        <div>
          <ThreadItem
            title="Tiendas"
            preview="Gestión de negocios activos"
            time=""
            icon={<Building2 className="h-5 w-5" />}
            accent="blue"
            onClick={() => router.push("/admin/tiendas")}
          />

          <ThreadItem
            title="Tiendas inactivas"
            preview="Negocios deshabilitados"
            time=""
            icon={<PowerOff className="h-5 w-5" />}
            accent="amber"
            onClick={() => router.push("/admin/tiendas-inactivas")}
          />
        </div>
      </main>
    </div>
  );
}