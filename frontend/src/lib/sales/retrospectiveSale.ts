import { generateCreationId } from "@/src/lib/itemHelpers";

// The commercial agenda uses America/Bogota (UTC-05), independently of the operator's browser.
export function serviceHasEnded(scheduledAt?: string | null, durationMinutes?: number | null, now = Date.now()) {
  if (!scheduledAt || !Number.isInteger(durationMinutes) || durationMinutes! <= 0) return false;
  const instant = Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/.test(scheduledAt) ? scheduledAt : `${scheduledAt}-05:00`);
  return Number.isFinite(instant) && instant + durationMinutes! * 60000 <= now;
}

export type ManualServiceAttempt = {
  fingerprint: string;
  payload: Record<string, any>;
} | null;

/** Retain the exact request on uncertain responses; changed input starts a different operation. */
export async function saveManualService<T>(
  ref: { current: ManualServiceAttempt },
  data: Record<string, any>,
  create: (payload: any) => Promise<T>,
  confirm: () => Promise<boolean>,
  now = Date.now(),
): Promise<T | null> {
  const fingerprint = JSON.stringify(data);
  if (ref.current?.fingerprint !== fingerprint) {
    ref.current = null;
    const ended = serviceHasEnded(data.scheduledAt, data.durationMinutes, now);
    if (ended && !await confirm()) return null;
    ref.current = { fingerprint, payload: { ...data, ...(ended ? { serviceProvided: true } : {}), idempotencyKey: generateCreationId() } };
  }
  try {
    return await create(ref.current.payload);
  } catch (error: any) {
    if (error?.details?.code !== 'SERVICE_PROVIDED_CONFIRMATION_REQUIRED' || ref.current.payload.serviceProvided) throw error;
    // The server guarantees no writes for this response, including when the clock crossed the end during submit.
    if (!await confirm()) return null;
    ref.current = { fingerprint, payload: { ...data, serviceProvided: true, idempotencyKey: generateCreationId() } };
    return create(ref.current.payload);
  }
}
