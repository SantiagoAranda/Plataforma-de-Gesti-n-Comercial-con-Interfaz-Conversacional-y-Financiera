/**
 * Cache en memoria de módulo con deduplicación de requests en vuelo.
 *
 * - Si el dato existe y es fresco (dentro del TTL), lo devuelve.
 * - Si hay un fetch en vuelo para la misma key, reutiliza la promesa (no duplica).
 * - Si no hay nada, ejecuta el fetcher, guarda el resultado y lo devuelve.
 */

type CacheEntry<T> = {
  data: T;
  ts: number;
};

const store = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export async function getCached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const entry = store.get(key) as CacheEntry<T> | undefined;

  // Dato fresco en cache
  if (entry && now - entry.ts < ttlMs) {
    return entry.data;
  }

  // Request ya en vuelo — reutilizar promesa
  if (inflight.has(key)) {
    return inflight.get(key) as Promise<T>;
  }

  // Nuevo fetch
  const promise = fetcher()
    .then((data) => {
      store.set(key, { data, ts: Date.now() });
      inflight.delete(key);
      return data;
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });

  inflight.set(key, promise as Promise<unknown>);
  return promise;
}

export function invalidateCache(key: string) {
  store.delete(key);
  // No cancelamos el request en vuelo (no se puede), pero el resultado
  // no se re-guardará porque borramos la entry; la próxima llamada
  // creará un request nuevo.
}

export function clearCache() {
  store.clear();
}

/**
 * Lee del caché de forma síncrona sin devolver una Promesa.
 * Útil para inicializar estado en React en el primer render
 * y evitar skeletons si el dato ya está fresco.
 */
export function getInstantCache<T>(key: string, ttlMs: number): T | null {
  const now = Date.now();
  const entry = store.get(key) as CacheEntry<T> | undefined;

  if (entry && now - entry.ts < ttlMs) {
    return entry.data;
  }

  return null;
}
