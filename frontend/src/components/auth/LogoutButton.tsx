"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();

  const handleLogout = () => {
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("session");
      localStorage.removeItem("user");
      localStorage.removeItem("accessToken");
      localStorage.removeItem("businessName");

      document.cookie = "token=; Max-Age=0; path=/";
      router.push("/login");
    } catch (error) {
      console.error("Error al cerrar sesion", error);
    }
  };

  return (
    <button
      onClick={handleLogout}
      aria-label="Cerrar sesion"
      className="inline-flex items-center justify-center text-black transition hover:opacity-70"
      type="button"
    >
      <LogOut size={18} />
    </button>
  );
}
