import { assertCurrentSession, type SessionContext } from "../auth/session";
import { unregisterPushSubscription } from "./api";

// Orden de adquisición (nunca invertir): activationPromise (por pestaña) -> lock "push-lifecycle".
// Reconcile y deactivate toman solo el lock. Nada dentro del lock vuelve a pedirlo, y el logout
// espera el lock como máximo LOGOUT_LOCK_WAIT_MS y sigue sin él: nunca queda bloqueado.
const LOCK_NAME = "push-lifecycle";
const LOCK_WAIT_MS = 20_000;
const LOGOUT_LOCK_WAIT_MS = 1_000;
const LOGOUT_TOTAL_TIMEOUT_MS = 3_500;
const LOGOUT_STEP_TIMEOUT_MS = 2_500;

export class PushLockTimeoutError extends Error {
  constructor() {
    super("Another tab is updating push notifications");
    this.name = "PushLockTimeoutError";
  }
}

export const deviceIdKey = (userId: string) => `push-device-id:v1:${userId}`;
export const pendingUnregisterKey = (userId: string) =>
  `push-unregister-pending:v1:${userId}`;
export const intentKey = (userId: string) => `push-intent:v1:${userId}`;

/**
 * Serializa register/unregister/rotación entre pestañas. Sin Web Locks `canRotate` es false:
 * se permite el registro simple pero nunca la rotación automática de suscripciones.
 */
export async function withPushLock<T>(
  fn: (canRotate: boolean) => Promise<T>,
  waitMs = LOCK_WAIT_MS,
): Promise<T> {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  if (!locks) return fn(false);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), waitMs);
  try {
    return await locks.request(
      LOCK_NAME,
      { signal: controller.signal },
      async () => {
        clearTimeout(timer);
        return fn(true);
      },
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new PushLockTimeoutError();
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function withDeadline<T>(promise: Promise<T>, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("PUSH_STEP_TIMEOUT")), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Baja de push al cerrar sesión, ANTES de invalidar el contexto local. Nunca lanza ni bloquea
 * el logout: si algo falla deja `push-unregister-pending` para reintentar en el próximo login
 * de ese usuario. unsubscribe() reduce el riesgo pero no es una garantía de revocación.
 * No se invoca en la expiración del JWT: el dueño conserva sus notificaciones.
 */
export async function pushLogoutCleanup(ctx: SessionContext) {
  try {
    if (!ctx.userId || !ctx.businessId) return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const deviceId = localStorage.getItem(deviceIdKey(ctx.userId));
    if (!deviceId) return; // este usuario nunca registró push aquí
    const userId = ctx.userId;
    let backendDone = false;
    let browserDone = false;

    const cleanup = async () => {
      try {
        assertCurrentSession(ctx);
        await withDeadline(unregisterPushSubscription(deviceId), LOGOUT_STEP_TIMEOUT_MS);
        backendDone = true;
      } catch {}
      try {
        assertCurrentSession(ctx);
        const registration = await withDeadline(
          navigator.serviceWorker.getRegistration("/"),
          LOGOUT_STEP_TIMEOUT_MS,
        );
        const subscription = await withDeadline(
          Promise.resolve(registration?.pushManager.getSubscription() ?? null),
          LOGOUT_STEP_TIMEOUT_MS,
        );
        browserDone = subscription ? await subscription.unsubscribe() : true;
      } catch {}
    };

    try {
      await withDeadline(
        withPushLock(cleanup, LOGOUT_LOCK_WAIT_MS).catch(() => cleanup()),
        LOGOUT_TOTAL_TIMEOUT_MS,
      );
    } catch {}
    if (!backendDone || !browserDone) {
      localStorage.setItem(pendingUnregisterKey(userId), "true");
    }
  } catch {}
}
