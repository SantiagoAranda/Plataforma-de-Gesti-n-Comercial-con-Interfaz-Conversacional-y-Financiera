"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

type PushMessage = {
  type?: string;
  title?: string;
  body?: string;
  data?: { type?: string; saleId?: string; url?: string };
};

function getInternalSaleUrl(data: PushMessage["data"]) {
  if (
    data?.type !== "SALE_CREATED" ||
    typeof data.saleId !== "string" ||
    !data.saleId ||
    typeof data.url !== "string" ||
    !data.url.startsWith("/") ||
    data.url.startsWith("//")
  ) {
    return null;
  }

  try {
    const parsed = new URL(data.url, window.location.origin);
    if (
      parsed.origin !== window.location.origin ||
      parsed.pathname !== "/venta" ||
      parsed.searchParams.get("saleId") !== data.saleId
    ) {
      return null;
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

export default function PushForegroundListener() {
  const router = useRouter();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent<PushMessage>) => {
      if (event.data?.type !== "WEB_PUSH_FOREGROUND") return;
      const url = getInternalSaleUrl(event.data.data);
      toast(
        (instance) => (
          <button
            type="button"
            className="block w-full text-left"
            onClick={() => {
              toast.dismiss(instance.id);
              if (url) router.push(url);
            }}
          >
            <span className="block font-semibold text-[#121A28]">
              {event.data.title ?? "Nueva notificación"}
            </span>
            <span className="mt-1 block text-xs text-[#62748E]">
              {event.data.body}
            </span>
          </button>
        ),
        { duration: 6000 },
      );
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);

  return null;
}
