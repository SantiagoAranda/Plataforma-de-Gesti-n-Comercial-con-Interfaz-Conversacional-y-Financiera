"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "../../../src/lib/auth";

export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    const token = getToken();

    if (!token) {
      router.replace("/login");
    }
  }, [router]);

  return <>{children}</>;
}