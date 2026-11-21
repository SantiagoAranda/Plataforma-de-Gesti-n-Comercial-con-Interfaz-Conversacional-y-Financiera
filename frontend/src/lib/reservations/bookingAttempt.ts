import { generateCreationId } from "@/src/lib/itemHelpers";

export type BookingAttempt = { fingerprint: string; key: string } | null;

/**
 * Idempotency key for one public booking attempt. Same payload => same key, so an uncertain
 * network failure can be retried without a second reservation; a changed payload starts a new
 * attempt. Kept in memory only (never storage or URL) and discarded after success or 409.
 */
export function bookingAttemptKey(
  ref: { current: BookingAttempt },
  payload: Record<string, unknown>,
): string {
  const fingerprint = JSON.stringify(payload);
  if (ref.current?.fingerprint !== fingerprint) {
    ref.current = { fingerprint, key: generateCreationId() };
  }
  return ref.current.key;
}

/** Spanish message from a failed booking response, or a generic fallback. */
export async function bookingErrorMessage(res: Response, fallback: string) {
  try {
    const body = await res.json();
    const message = body?.message;
    if (typeof message === "string" && message.trim()) return message;
    if (Array.isArray(message) && typeof message[0] === "string") return message[0];
  } catch {
    // Non-JSON body: keep the fallback.
  }
  return fallback;
}
