function internalUrl(value, fallback) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return fallback;
  }
  try {
    const parsed = new URL(value, self.location.origin);
    return parsed.origin === self.location.origin
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let payload = {};
      try {
        payload = event.data ? event.data.json() : {};
      } catch {}

      const title =
        typeof payload.title === "string"
          ? payload.title
          : "Nueva notificación";
      const body = typeof payload.body === "string" ? payload.body : "";
      const data =
        payload.data && typeof payload.data === "object" ? payload.data : {};
      const safeData = {
        type: typeof data.type === "string" ? data.type : "WEB_PUSH",
        saleId: typeof data.saleId === "string" ? data.saleId : "",
        url: internalUrl(data.url, "/"),
      };
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const visible = windows.find(
        (client) => client.visibilityState === "visible",
      );

      if (visible) {
        visible.postMessage({
          type: "WEB_PUSH_FOREGROUND",
          title,
          body,
          data: safeData,
        });
        return;
      }

      await self.registration.showNotification(title, {
        body,
        icon: internalUrl(payload.icon, "/icons/icon-192x192.png"),
        badge: internalUrl(payload.badge, "/icons/badge-72x72.png"),
        tag: typeof payload.tag === "string" ? payload.tag : undefined,
        renotify: false,
        data: safeData,
        actions: [],
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const relativeUrl = internalUrl(event.notification.data?.url, "/");
      const targetUrl = new URL(relativeUrl, self.location.origin).href;
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      const sameOriginWindows = windows.filter((client) => {
        try {
          return new URL(client.url).origin === self.location.origin;
        } catch {
          return false;
        }
      });

      for (const client of sameOriginWindows) {
        try {
          const navigatedClient = await client.navigate(targetUrl);
          if (!navigatedClient) continue;
          await navigatedClient.focus();
          return;
        } catch {}
      }

      await self.clients.openWindow(targetUrl);
    })(),
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) =>
        windows.forEach((client) =>
          client.postMessage({ type: "PUSH_SUBSCRIPTION_CHANGED" }),
        ),
      ),
  );
});
