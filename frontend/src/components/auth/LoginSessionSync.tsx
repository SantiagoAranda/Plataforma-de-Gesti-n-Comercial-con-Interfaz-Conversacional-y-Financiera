"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSessionContext, homePath, subscribeSession } from "../../lib/auth/session";

// Una pestaña en /login que recibe una sesión nueva (login en otra pestaña) navega a su destino.
export default function LoginSessionSync() {
  const router = useRouter();
  useEffect(() => {
    let seen = getSessionContext().key;
    return subscribeSession(() => {
      const next = getSessionContext();
      if (next.key === seen) return;
      seen = next.key;
      if (next.token) router.replace(homePath(next));
    });
  }, [router]);
  return null;
}
