"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function IcaRatesPageRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/configuracion/rut-impuestos");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 text-center">
      <p className="text-sm text-neutral-500">
        Redirigiendo a RUT e Impuestos...
      </p>
    </div>
  );
}
