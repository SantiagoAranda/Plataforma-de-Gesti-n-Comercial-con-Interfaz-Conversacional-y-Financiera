"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

type PushMessage = {
  type?: string;
  title?: string;
  body?: string;
  data?: { url?: string };
};

export default function PushForegroundListener() {
  const router = useRouter();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent<PushMessage>) => {
      if (event.data?.type !== "WEB_PUSH_FOREGROUND") return;
      const url = event.data.data?.url;
      toast(
        (instance) => (
          <button
            type="button"
            className="block w-full text-left"
            onClick={() => {
              toast.dismiss(instance.id);
              if (url?.startsWith("/") && !url.startsWith("//"))
                router.push(url);
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
