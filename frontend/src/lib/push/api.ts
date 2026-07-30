import { api } from "@/src/lib/api";

export type PushPlatform =
  | "WEB_WINDOWS"
  | "WEB_ANDROID"
  | "WEB_IOS"
  | "WEB_MACOS"
  | "WEB_LINUX"
  | "WEB_DESKTOP"
  | "UNKNOWN";

export type PushStatusResponse = {
  configured: boolean;
  enabled: boolean;
  notifyOnAutomaticSale: boolean;
  registeredDeviceCount: number;
  subscriptionFingerprint: string | null;
};

export function registerPushSubscription(
  input: {
    deviceId: string;
    subscription: PushSubscriptionJSON;
    platform: PushPlatform;
    userAgent?: string;
  },
  signal?: AbortSignal,
) {
  return api<{ configured: true; enabled: true }>(
    "/notifications/push/register",
    {
      method: "POST",
      body: JSON.stringify(input),
      signal,
    },
  );
}

export function getPushStatus(deviceId: string, signal?: AbortSignal) {
  return api<PushStatusResponse>("/notifications/push/status", {
    method: "POST",
    body: JSON.stringify({ deviceId }),
    signal,
  });
}

export function unregisterPushSubscription(deviceId: string) {
  return api<{ configured: false; enabled: false }>(
    "/notifications/push/unregister",
    {
      method: "DELETE",
      body: JSON.stringify({ deviceId }),
    },
  );
}

export function sendTestPush(deviceId: string) {
  return api<{ sent: true }>("/notifications/push/test", {
    method: "POST",
    body: JSON.stringify({ deviceId }),
  });
}

export function updatePushPreference(notifyOnAutomaticSale: boolean) {
  return api<{ notifyOnAutomaticSale: boolean }>(
    "/notifications/push/preferences",
    {
      method: "PATCH",
      body: JSON.stringify({ notifyOnAutomaticSale }),
    },
  );
}
