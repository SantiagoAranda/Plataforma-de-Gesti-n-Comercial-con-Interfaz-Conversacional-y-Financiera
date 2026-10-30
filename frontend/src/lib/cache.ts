import {
  assertCurrentSession,
  getSessionContext,
  StaleSessionError,
  subscribeSession,
} from "./auth/session";
type CacheEntry = { data: unknown; ts: number };
const store = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();
const versions = new Map<string, number>();
let epoch = 0;
function scoped(key: string) {
  return getSessionContext().key + ":" + key;
}
export async function getCached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const session = getSessionContext();
  const scopedKey = scoped(key);
  const entry = store.get(scopedKey);
  if (entry && Date.now() - entry.ts < ttlMs) return entry.data as T;
  const pending = inflight.get(scopedKey);
  if (pending) return pending as Promise<T>;
  const version = versions.get(scopedKey) || 0;
  const startEpoch = epoch;
  const promise = Promise.resolve()
    .then(() => {
      assertCurrentSession(session);
      return fetcher();
    })
    .then((data) => {
      assertCurrentSession(session);
      if (epoch !== startEpoch || (versions.get(scopedKey) || 0) !== version)
        throw new StaleSessionError();
      store.set(scopedKey, { data, ts: Date.now() });
      return data;
    })
    .finally(() => {
      if (inflight.get(scopedKey) === promise) inflight.delete(scopedKey);
    });
  inflight.set(scopedKey, promise);
  return promise;
}
export function invalidateCache(key: string) {
  const scopedKey = scoped(key);
  versions.set(scopedKey, (versions.get(scopedKey) || 0) + 1);
  store.delete(scopedKey);
  inflight.delete(scopedKey);
}
export function clearCache() {
  epoch++;
  store.clear();
  inflight.clear();
  versions.clear();
}
subscribeSession(clearCache);
export function getInstantCache<T>(key: string, ttlMs: number): T | null {
  const entry = store.get(scoped(key));
  return entry && Date.now() - entry.ts < ttlMs ? (entry.data as T) : null;
}
