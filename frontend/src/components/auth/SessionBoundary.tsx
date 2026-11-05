"use client";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getSessionContext, subscribeSession, type SessionContext } from "../../lib/auth/session";

// `require` bloquea el montaje (y sus peticiones) hasta que la sesión lo cumpla; solo mejora UX, la autorización real es del backend.
export default function SessionBoundary({ children, require }: { children: ReactNode; require?: "auth" | "ADMIN" }) {
  const router = useRouter();
  const [session, setSession] = useState<SessionContext | null>(null);
  useEffect(() => {
    const update = () => setSession(getSessionContext());
    const unsubscribe = subscribeSession(update);
    update();
    return unsubscribe;
  }, []);
  const redirectTo = !require || !session ? null
    : !session.token ? "/login"
    : require === "ADMIN" && session.role !== "ADMIN" ? "/home" : null;
  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);
  if (session === null || redirectTo) return null;
  return <Fragment key={session.key}>{children}</Fragment>;
}
