"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getPushStatus as fetchPushStatus,
  registerPushSubscription,
  sendTestPush as requestTestPush,
  unregisterPushSubscription,
  updatePushPreference,
  type PushPlatform,
  type PushStatusResponse,
} from "@/src/lib/push/api";
import { getToken } from "@/src/lib/auth";

export type PushState =
  "unsupported" | "default" | "granted" | "denied" | "registered" | "error";

export type PushActivationStage =
  | "support"
  | "service_worker"
  | "permission"
  | "vapid_key"
  | "subscribe"
  | "serialize"
  | "backend_register"
  | "status";

export type ActivatePushResult =
  | { ok: true; deviceRegistered: true }
  | {
      ok: false;
      deviceRegistered: false;
      stage: PushActivationStage;
      message: string;
    };

type ActivationFailure = Extract<ActivatePushResult, { ok: false }>;
type TimeoutStage =
  "service_worker" | "subscribe" | "backend_register" | "status";

type ActivationCoordinatorEvent = {
  inFlight: boolean;
  result?: ActivatePushResult;
};

const ACTIVATION_MESSAGES: Record<PushActivationStage, string> = {
  support: "Este navegador o entorno no permite activar notificaciones.",
  service_worker:
    "No se pudo preparar el servicio de notificaciones del navegador.",
  permission: "El navegador no concedió permiso para enviar notificaciones.",
  vapid_key: "La configuración pública de notificaciones no es válida.",
  subscribe: "El navegador no pudo crear la suscripción de notificaciones.",
  serialize: "No se pudo preparar la suscripción de este dispositivo.",
  backend_register:
    "El navegador quedó suscrito, pero el servidor no pudo registrar el dispositivo.",
  status:
    "El servidor recibió el registro, pero no pudo confirmar que el dispositivo esté activo.",
};

const SERVICE_WORKER_READY_TIMEOUT_MS = 10_000;
const SERVICE_WORKER_UPDATE_WAIT_MS = 3_000;
const SUBSCRIBE_TIMEOUT_MS = 15_000;
const BACKEND_REGISTER_TIMEOUT_MS = 15_000;
const STATUS_TIMEOUT_MS = 10_000;
const ACTIVATION_EVENT = "push-activation-state";

let activationPromise: Promise<ActivatePushResult> | null = null;
let activationInFlightSnapshot = false;

class PushActivationTimeoutError extends Error {
  constructor(readonly stage: TimeoutStage) {
    super(`Push activation timed out at ${stage}`);
    this.name = "PushActivationTimeoutError";
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  stage: TimeoutStage,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new PushActivationTimeoutError(stage));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function withAbortableTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  stage: Extract<TimeoutStage, "backend_register" | "status">,
) {
  const controller = new AbortController();
  try {
    return await withTimeout(operation(controller.signal), timeoutMs, stage);
  } catch (error) {
    if (error instanceof PushActivationTimeoutError) controller.abort();
    throw error;
  }
}

function emitActivationState(detail: ActivationCoordinatorEvent) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ActivationCoordinatorEvent>(ACTIVATION_EVENT, { detail }),
  );
}

function debugActivationTimeout(stage: TimeoutStage, timeoutMs: number) {
  if (process.env.NODE_ENV === "production") return;
  console.debug("[Push activation timeout]", { stage, timeoutMs });
}

class PushFlowError extends Error {
  constructor(
    readonly stage: PushActivationStage,
    message = ACTIVATION_MESSAGES[stage],
  ) {
    super(message);
    this.name = "PushFlowError";
  }
}

function getUserId() {
  const token = getToken();
  if (!token) return null;
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(window.atob(base64)).sub as string | null;
  } catch {
    return null;
  }
}

function deviceIdForUser(userId: string) {
  const key = `push-device-id:v1:${userId}`;
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(key, created);
  return created;
}

function pendingUnregisterKey(userId: string) {
  return `push-unregister-pending:v1:${userId}`;
}

function pushEnabledForEnvironment() {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.NEXT_PUBLIC_ENABLE_PUSH_IN_DEV === "true"
  );
}

function toApplicationServerKey(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Invalid VAPID base64url");
  }
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const raw = window.atob(
    (value + padding).replace(/-/g, "+").replace(/_/g, "/"),
  );
  const key = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    key[index] = raw.charCodeAt(index);
  }
  return key.buffer;
}

function serializeSubscription(subscription: PushSubscription) {
  const serialized = subscription.toJSON();
  if (
    typeof serialized.endpoint !== "string" ||
    !serialized.endpoint ||
    typeof serialized.keys?.p256dh !== "string" ||
    !serialized.keys.p256dh ||
    typeof serialized.keys.auth !== "string" ||
    !serialized.keys.auth
  ) {
    throw new Error("Incomplete PushSubscription serialization");
  }
  return serialized;
}

async function subscriptionFingerprint(subscription: PushSubscription) {
  const json = serializeSubscription(subscription);
  const serialized = JSON.stringify({
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(serialized),
  );
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function platformFromBrowser(): PushPlatform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "WEB_IOS";
  if (/Android/i.test(ua)) return "WEB_ANDROID";
  if (/Windows/i.test(ua)) return "WEB_WINDOWS";
  if (/Macintosh|Mac OS X/i.test(ua)) return "WEB_MACOS";
  if (/Linux/i.test(ua)) return "WEB_LINUX";
  return "WEB_DESKTOP";
}

function isIosBrowser() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

function registrationIsValid(registration: ServiceWorkerRegistration) {
  try {
    const workerUrl = new URL(
      registration.active?.scriptURL ?? "",
      window.location.origin,
    );
    return (
      registration.scope === `${window.location.origin}/` &&
      workerUrl.pathname === "/push-sw.js"
    );
  } catch {
    return false;
  }
}

function waitForWorkerTransition(registration: ServiceWorkerRegistration) {
  return new Promise<void>((resolve) => {
    let completed = false;
    const watched = new Set<ServiceWorker>();
    const finish = () => {
      if (completed) return;
      completed = true;
      window.clearTimeout(timeout);
      registration.removeEventListener("updatefound", watchCurrentWorkers);
      for (const worker of watched) {
        worker.removeEventListener("statechange", checkWorkerState);
      }
      resolve();
    };
    const checkWorkerState = () => {
      if (
        registration.active?.state === "activated" ||
        registration.installing?.state === "activated" ||
        registration.waiting?.state === "activated"
      ) {
        finish();
      }
    };
    const watch = (worker: ServiceWorker | null) => {
      if (!worker || watched.has(worker)) return;
      watched.add(worker);
      worker.addEventListener("statechange", checkWorkerState);
    };
    function watchCurrentWorkers() {
      watch(registration.installing);
      watch(registration.waiting);
      watch(registration.active);
      checkWorkerState();
    }

    const timeout = window.setTimeout(finish, SERVICE_WORKER_UPDATE_WAIT_MS);
    registration.addEventListener("updatefound", watchCurrentWorkers);
    watchCurrentWorkers();
  });
}

async function getReadyPushRegistration(
  requestedRegistration: ServiceWorkerRegistration,
) {
  let readyRegistration = await withTimeout(
    navigator.serviceWorker.ready,
    SERVICE_WORKER_READY_TIMEOUT_MS,
    "service_worker",
  );
  if (registrationIsValid(readyRegistration)) return readyRegistration;

  await withTimeout(
    requestedRegistration.update(),
    SERVICE_WORKER_READY_TIMEOUT_MS,
    "service_worker",
  );
  await waitForWorkerTransition(requestedRegistration);
  readyRegistration = await withTimeout(
    navigator.serviceWorker.ready,
    SERVICE_WORKER_READY_TIMEOUT_MS,
    "service_worker",
  );

  if (registrationIsValid(readyRegistration)) return readyRegistration;
  if (registrationIsValid(requestedRegistration)) return requestedRegistration;
  throw new Error("The active service worker is not /push-sw.js at scope /");
}

function stateFromFacts(
  permission: NotificationPermission,
  browserSubscriptionExists: boolean,
  backendRegistrationEnabled: boolean,
): PushState {
  if (permission === "denied") return "denied";
  if (
    permission === "granted" &&
    browserSubscriptionExists &&
    backendRegistrationEnabled
  ) {
    return "registered";
  }
  return permission;
}

export function usePushNotifications() {
  const [state, setState] = useState<PushState>("default");
  const [status, setStatus] = useState<PushStatusResponse | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [browserSubscriptionExists, setBrowserSubscriptionExists] =
    useState(false);
  const [backendRegistrationEnabled, setBackendRegistrationEnabled] =
    useState(false);
  const [activationError, setActivationError] =
    useState<ActivationFailure | null>(null);
  const [activationInFlight, setActivationInFlight] = useState(
    activationInFlightSnapshot,
  );
  const [loadingAction, setLoadingAction] = useState<
    "activate" | "deactivate" | "test" | "preference" | null
  >(null);
  const [needsIosInstall, setNeedsIosInstall] = useState(false);

  const supported = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.isSecureContext &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window,
    [],
  );
  const checkSupport = useCallback(
    () => supported && pushEnabledForEnvironment(),
    [supported],
  );

  const currentDevice = useCallback(() => {
    const userId = getUserId();
    if (!userId) throw new Error("AUTH_REQUIRED");
    return { userId, deviceId: deviceIdForUser(userId) };
  }, []);

  const failActivation = useCallback(
    (stage: PushActivationStage, message = ACTIVATION_MESSAGES[stage]) => {
      const failure: ActivationFailure = {
        ok: false,
        deviceRegistered: false,
        stage,
        message,
      };
      setActivationError(failure);
      setBackendRegistrationEnabled(false);
      if (stage === "support") setState("unsupported");
      else if (stage === "permission") {
        setState(Notification.permission);
      } else {
        setState("error");
      }
      return failure;
    },
    [],
  );

  const getPushStatus = useCallback(async () => {
    if (!checkSupport()) {
      setState("unsupported");
      return null;
    }
    const permission = Notification.permission;
    setPermissionGranted(permission === "granted");
    const next = await fetchPushStatus(currentDevice().deviceId);
    const backendEnabled = next.configured && next.enabled;
    setStatus(next);
    setBackendRegistrationEnabled(backendEnabled);
    setState(
      stateFromFacts(permission, browserSubscriptionExists, backendEnabled),
    );
    return next;
  }, [browserSubscriptionExists, checkSupport, currentDevice]);

  const registerSubscriptionWithBackend = useCallback(
    async (
      subscription: PushSubscription,
      debugContext?: {
        permissionBefore: NotificationPermission;
        permissionResult: NotificationPermission;
        serviceWorkerReady: boolean;
        existingSubscription: boolean;
        subscriptionCreated: boolean;
      },
    ) => {
      let serialized: PushSubscriptionJSON;
      try {
        serialized = serializeSubscription(subscription);
      } catch {
        throw new PushFlowError("serialize");
      }

      let deviceId: string;
      try {
        deviceId = currentDevice().deviceId;
      } catch {
        throw new PushFlowError("backend_register");
      }

      if (process.env.NODE_ENV !== "production" && debugContext) {
        console.debug("[Push activation]", {
          ...debugContext,
          registerRequestStarted: true,
        });
        console.debug("[Push activation stage]", {
          stage: "backend_register_start",
        });
      }

      try {
        await withAbortableTimeout(
          (signal) =>
            registerPushSubscription(
              {
                deviceId,
                subscription: serialized,
                platform: platformFromBrowser(),
                userAgent: navigator.userAgent,
              },
              signal,
            ),
          BACKEND_REGISTER_TIMEOUT_MS,
          "backend_register",
        );
      } catch (error) {
        if (error instanceof PushActivationTimeoutError) {
          debugActivationTimeout(
            "backend_register",
            BACKEND_REGISTER_TIMEOUT_MS,
          );
        }
        throw new PushFlowError("backend_register");
      }

      let verified: PushStatusResponse;
      try {
        verified = await withAbortableTimeout(
          (signal) => fetchPushStatus(deviceId, signal),
          STATUS_TIMEOUT_MS,
          "status",
        );
      } catch (error) {
        if (error instanceof PushActivationTimeoutError) {
          debugActivationTimeout("status", STATUS_TIMEOUT_MS);
        }
        throw new PushFlowError("status");
      }
      setStatus(verified);
      const backendEnabled = verified.configured && verified.enabled;
      setBackendRegistrationEnabled(backendEnabled);
      if (!backendEnabled) throw new PushFlowError("status");
      return verified;
    },
    [currentDevice],
  );

  const reconcileSubscription = useCallback(async () => {
    if (!checkSupport()) {
      setState("unsupported");
      return;
    }
    const permission = Notification.permission;
    setPermissionGranted(permission === "granted");
    if (permission === "denied") {
      setBrowserSubscriptionExists(false);
      setState("denied");
      return;
    }

    try {
      const requestedRegistration = await navigator.serviceWorker.register(
        "/push-sw.js",
        { scope: "/" },
      );
      const registration = await getReadyPushRegistration(
        requestedRegistration,
      );
      const subscription = await registration.pushManager.getSubscription();
      const hasBrowserSubscription = Boolean(subscription);
      setBrowserSubscriptionExists(hasBrowserSubscription);

      const { userId, deviceId } = currentDevice();
      const backend = await fetchPushStatus(deviceId);
      setStatus(backend);
      let backendEnabled = backend.configured && backend.enabled;
      setBackendRegistrationEnabled(backendEnabled);

      if (localStorage.getItem(pendingUnregisterKey(userId)) === "true") {
        await unregisterPushSubscription(deviceId);
        if (!subscription || (await subscription.unsubscribe())) {
          localStorage.removeItem(pendingUnregisterKey(userId));
          setBrowserSubscriptionExists(false);
          setBackendRegistrationEnabled(false);
          setStatus({ ...backend, configured: false, enabled: false });
          setState(stateFromFacts(permission, false, false));
        } else {
          setState("error");
        }
        return;
      }

      if (subscription && permission === "granted") {
        let fingerprint: string;
        try {
          fingerprint = await subscriptionFingerprint(subscription);
        } catch {
          throw new PushFlowError("serialize");
        }
        if (
          !backend.configured ||
          !backend.enabled ||
          backend.subscriptionFingerprint !== fingerprint
        ) {
          await registerSubscriptionWithBackend(subscription);
          backendEnabled = true;
        }
      } else if (!subscription && backendEnabled) {
        await unregisterPushSubscription(deviceId);
        backendEnabled = false;
        setBackendRegistrationEnabled(false);
        setStatus({ ...backend, configured: false, enabled: false });
      }

      setActivationError(null);
      setState(
        stateFromFacts(permission, hasBrowserSubscription, backendEnabled),
      );
    } catch (error) {
      const stage =
        error instanceof PushFlowError ? error.stage : "service_worker";
      failActivation(stage);
    }
  }, [
    checkSupport,
    currentDevice,
    failActivation,
    registerSubscriptionWithBackend,
  ]);

  const runActivation = useCallback(async (): Promise<ActivatePushResult> => {
    setActivationError(null);
    if (!checkSupport()) return failActivation("support");
    if (isIosBrowser() && !isStandalone()) {
      setNeedsIosInstall(true);
      return failActivation(
        "support",
        "En iPhone debes abrir la plataforma como una aplicación instalada.",
      );
    }

    setNeedsIosInstall(false);
    const permissionBefore = Notification.permission;

    try {
      let requestedRegistration: ServiceWorkerRegistration;
      try {
        requestedRegistration = await withTimeout(
          navigator.serviceWorker.register("/push-sw.js", { scope: "/" }),
          SERVICE_WORKER_READY_TIMEOUT_MS,
          "service_worker",
        );
      } catch (error) {
        if (error instanceof PushActivationTimeoutError) {
          debugActivationTimeout(
            "service_worker",
            SERVICE_WORKER_READY_TIMEOUT_MS,
          );
        }
        return failActivation("service_worker");
      }

      let permissionResult: NotificationPermission;
      try {
        permissionResult =
          permissionBefore === "default"
            ? await Notification.requestPermission()
            : permissionBefore;
      } catch {
        return failActivation("permission");
      }
      setPermissionGranted(permissionResult === "granted");
      if (permissionResult !== "granted") {
        return failActivation("permission");
      }

      let registration: ServiceWorkerRegistration;
      try {
        registration = await getReadyPushRegistration(requestedRegistration);
        if (process.env.NODE_ENV !== "production") {
          console.debug("[Push activation stage]", {
            stage: "service_worker_ready",
          });
        }
      } catch (error) {
        if (error instanceof PushActivationTimeoutError) {
          debugActivationTimeout(
            "service_worker",
            SERVICE_WORKER_READY_TIMEOUT_MS,
          );
        }
        return failActivation("service_worker");
      }

      let existingSubscription: PushSubscription | null;
      try {
        existingSubscription = await withTimeout(
          registration.pushManager.getSubscription(),
          SUBSCRIBE_TIMEOUT_MS,
          "subscribe",
        );
      } catch (error) {
        if (error instanceof PushActivationTimeoutError) {
          debugActivationTimeout("subscribe", SUBSCRIBE_TIMEOUT_MS);
        }
        return failActivation("subscribe");
      }

      let subscription = existingSubscription;
      if (!subscription) {
        const rawVapidKey =
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";

        if (process.env.NODE_ENV !== "production") {
          console.debug("[Push VAPID runtime]", {
            present: rawVapidKey.length > 0,
            encodedLength: rawVapidKey.length,
            hasWhitespace: /\s/.test(rawVapidKey),
            startsWithQuote:
              rawVapidKey.startsWith('"') || rawVapidKey.startsWith("'"),
            endsWithQuote:
              rawVapidKey.endsWith('"') || rawVapidKey.endsWith("'"),
          });
        }

        let applicationServerKey: ArrayBuffer;
        try {
          applicationServerKey = toApplicationServerKey(rawVapidKey);
        } catch {
          return failActivation(
            "vapid_key",
            "La clave pública de notificaciones no tiene un formato válido.",
          );
        }

        const decodedVapidKey = new Uint8Array(applicationServerKey);
        if (process.env.NODE_ENV !== "production") {
          console.debug("[Push VAPID decoded]", {
            decodedLength: applicationServerKey.byteLength,
            firstByte: decodedVapidKey[0] ?? null,
          });
        }

        if (
          applicationServerKey.byteLength !== 65 ||
          decodedVapidKey[0] !== 0x04
        ) {
          return failActivation(
            "vapid_key",
            "La clave pública de notificaciones no tiene un formato válido.",
          );
        }

        try {
          if (process.env.NODE_ENV !== "production") {
            console.debug("[Push activation stage]", {
              stage: "subscribe_start",
            });
          }
          subscription = await withTimeout(
            registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey,
            }),
            SUBSCRIBE_TIMEOUT_MS,
            "subscribe",
          );
          if (process.env.NODE_ENV !== "production") {
            console.debug("[Push activation stage]", {
              stage: "subscribe_completed",
            });
          }
        } catch (error) {
          const errorName =
            error instanceof Error ? error.name : "UnknownError";
          const errorMessage =
            error instanceof Error ? error.message : String(error);

          if (process.env.NODE_ENV !== "production") {
            console.debug("[Push activation subscribe error]", {
              name: errorName,
              message: errorMessage,
            });
          }
          if (error instanceof PushActivationTimeoutError) {
            debugActivationTimeout("subscribe", SUBSCRIBE_TIMEOUT_MS);
            return failActivation(
              "subscribe",
              "El navegador no pudo conectarse al servicio de notificaciones. Revisa la red o vuelve a intentarlo.",
            );
          }
          if (
            errorName === "AbortError" ||
            /registration failed\s*-\s*push service error/i.test(errorMessage)
          ) {
            return failActivation(
              "subscribe",
              "El navegador no pudo conectarse al servicio de notificaciones. Prueba nuevamente o revisa la configuración de red del navegador.",
            );
          }
          return failActivation("subscribe");
        }
      }
      setBrowserSubscriptionExists(true);

      try {
        await registerSubscriptionWithBackend(subscription, {
          permissionBefore,
          permissionResult,
          serviceWorkerReady: Boolean(registration),
          existingSubscription: Boolean(existingSubscription),
          subscriptionCreated: Boolean(subscription),
        });
      } catch (error) {
        if (error instanceof PushFlowError) {
          return failActivation(error.stage, error.message);
        }
        return failActivation("backend_register");
      }

      localStorage.removeItem(pendingUnregisterKey(currentDevice().userId));
      setActivationError(null);
      setBackendRegistrationEnabled(true);
      setState("registered");
      return { ok: true, deviceRegistered: true };
    } catch {
      return failActivation("subscribe");
    }
  }, [
    checkSupport,
    currentDevice,
    failActivation,
    registerSubscriptionWithBackend,
  ]);

  const activatePush = useCallback((): Promise<ActivatePushResult> => {
    setLoadingAction("activate");
    setActivationInFlight(true);

    let sharedActivation = activationPromise;
    if (!sharedActivation) {
      activationInFlightSnapshot = true;
      emitActivationState({ inFlight: true });

      sharedActivation = runActivation().catch(() =>
        failActivation("subscribe"),
      );
      activationPromise = sharedActivation;
      const coordinatedActivation = sharedActivation;

      void (async () => {
        let result: ActivatePushResult | undefined;
        try {
          result = await coordinatedActivation;
        } finally {
          if (activationPromise !== coordinatedActivation) return;
          activationPromise = null;
          activationInFlightSnapshot = false;
          emitActivationState({
            inFlight: false,
            result: result ?? failActivation("subscribe"),
          });
        }
      })();
    }

    return sharedActivation.finally(() => {
      setLoadingAction((current) => (current === "activate" ? null : current));
      setActivationInFlight(false);
    });
  }, [failActivation, runActivation]);

  const deactivatePush = useCallback(async () => {
    setLoadingAction("deactivate");
    try {
      const { userId, deviceId } = currentDevice();
      await unregisterPushSubscription(deviceId);
      localStorage.setItem(pendingUnregisterKey(userId), "true");
      const requestedRegistration = await navigator.serviceWorker.register(
        "/push-sw.js",
        { scope: "/" },
      );
      const registration = await getReadyPushRegistration(
        requestedRegistration,
      );
      const subscription = await registration.pushManager.getSubscription();
      if (subscription && !(await subscription.unsubscribe())) {
        throw new Error("UNSUBSCRIBE_FAILED");
      }
      localStorage.removeItem(pendingUnregisterKey(userId));
      setBrowserSubscriptionExists(false);
      setBackendRegistrationEnabled(false);
      setActivationError(null);
      await getPushStatus();
      setState("default");
      return true;
    } catch {
      setState("error");
      return false;
    } finally {
      setLoadingAction(null);
    }
  }, [currentDevice, getPushStatus]);

  const sendTestPush = useCallback(async () => {
    setLoadingAction("test");
    try {
      await requestTestPush(currentDevice().deviceId);
      return true;
    } finally {
      setLoadingAction(null);
    }
  }, [currentDevice]);

  const setBusinessPreference = useCallback(async (enabled: boolean) => {
    setLoadingAction("preference");
    try {
      const preference = await updatePushPreference(enabled);
      setStatus((current) =>
        current
          ? {
              ...current,
              notifyOnAutomaticSale: preference.notifyOnAutomaticSale,
            }
          : current,
      );
      return true;
    } catch {
      return false;
    } finally {
      setLoadingAction(null);
    }
  }, []);

  useEffect(() => {
    const handleActivationState = (event: Event) => {
      const detail = (event as CustomEvent<ActivationCoordinatorEvent>).detail;
      setActivationInFlight(detail.inFlight);
      if (detail.inFlight) {
        setLoadingAction("activate");
        return;
      }

      setLoadingAction((current) => (current === "activate" ? null : current));
      if (!detail.result) return;

      if (detail.result.ok) {
        setActivationError(null);
        setPermissionGranted(true);
        setBrowserSubscriptionExists(true);
        setBackendRegistrationEnabled(true);
        setState("registered");
      } else {
        setActivationError(detail.result);
        setBackendRegistrationEnabled(false);
        if (detail.result.stage === "support") setState("unsupported");
        else if (detail.result.stage === "permission") {
          setState(Notification.permission);
        } else {
          setState("error");
        }
      }

      void (async () => {
        try {
          const verified = await withAbortableTimeout(
            (signal) => fetchPushStatus(currentDevice().deviceId, signal),
            STATUS_TIMEOUT_MS,
            "status",
          );
          setStatus(verified);
          const backendEnabled = verified.configured && verified.enabled;
          setBackendRegistrationEnabled(backendEnabled);
          if (detail.result?.ok && backendEnabled) {
            setState("registered");
          }
        } catch {
          // The activation result remains authoritative for this UI action.
        }
      })();
    };

    window.addEventListener(ACTIVATION_EVENT, handleActivationState);
    setActivationInFlight(activationInFlightSnapshot);
    if (activationInFlightSnapshot) setLoadingAction("activate");
    return () => {
      window.removeEventListener(ACTIVATION_EVENT, handleActivationState);
    };
  }, [currentDevice]);

  useEffect(() => {
    void reconcileSubscription();
  }, [reconcileSubscription]);

  return {
    state,
    status,
    supported,
    permissionGranted,
    browserSubscriptionExists,
    backendRegistrationEnabled,
    activationError,
    activationInFlight,
    loadingAction,
    needsIosInstall,
    checkSupport,
    activatePush,
    deactivatePush,
    sendTestPush,
    reconcileSubscription,
    getPushStatus,
    setBusinessPreference,
    getUserId,
  };
}
