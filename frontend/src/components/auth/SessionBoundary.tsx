"use client";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { getSessionContext, subscribeSession } from "../../lib/auth/session";

export default function SessionBoundary({ children }: { children: ReactNode }) {
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => {
    const update = () => setKey(getSessionContext().key);
    const unsubscribe = subscribeSession(update);
    update();
    return unsubscribe;
  }, []);
  if (key === null) return null;
  return <Fragment key={key}>{children}</Fragment>;
}
