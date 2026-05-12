"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

import { logoutAndRedirect } from "@/src/lib/auth/logout";

export default function LogoutButton() {
  const router = useRouter();

  const handleLogout = () => {
    logoutAndRedirect((href) => router.push(href));
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
