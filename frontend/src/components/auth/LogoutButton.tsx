"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();

  const handleLogout = () => {
    try {
      // limpiar token o sesión
      if (typeof window !== "undefined") {
        localStorage.removeItem("token");
        localStorage.removeItem("session");
        localStorage.removeItem("user");
        localStorage.removeItem("accessToken");
      }

      // opcional: limpiar cookies si existen
      document.cookie = "token=; Max-Age=0; path=/";

      // redirigir a login
      router.push("/login");
    } catch (error) {
      console.error("Error al cerrar sesión", error);
    }
  };

  return (
    <button
      onClick={handleLogout}
      aria-label="Cerrar sesión"
      className="flex items-center gap-2 rounded-full border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 active:scale-95"
    >
      <LogOut size={18} />
    </button>
  );
}
