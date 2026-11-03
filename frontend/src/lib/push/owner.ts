// Propietario de sesión visible para el service worker (no tiene localStorage).
// Solo reduce el riesgo de mostrar datos privados; la seguridad real sigue en el backend.
export type PushOwner = {
  userId: string | null;
  businessId: string | null;
  at: number;
};

const DB_NAME = "push-identity";
const STORE = "owner";
const KEY = "current";

// Una escritura (o borrado) de una sesión anterior lleva un `at` menor y nunca pisa a la vigente.
export function shouldWriteOwner(current: PushOwner | undefined, next: PushOwner) {
  return !current || next.at >= current.at;
}

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function writeOwner(next: PushOwner) {
  if (typeof indexedDB === "undefined") return false;
  const db = await openDb();
  try {
    return await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const read = store.get(KEY);
      let written = false;
      read.onsuccess = () => {
        if (shouldWriteOwner(read.result as PushOwner | undefined, next)) {
          store.put(next, KEY);
          written = true;
        }
      };
      tx.oncomplete = () => resolve(written);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function syncPushOwner(owner: PushOwner) {
  // Si IndexedDB no responde el service worker falla cerrado (notificación genérica).
  writeOwner(owner).catch(() => {});
}
