// Decoding only partitions browser state; authorization remains on the server.
export type SessionContext = Readonly<{
  key: string;
  token: string | null;
  userId: string | null;
  businessId: string | null;
  role: string | null;
}>;
let generation = 0;
let snapshot: SessionContext = {
  key: "server",
  token: null,
  userId: null,
  businessId: null,
  role: null,
};
let initialized = false;
const listeners = new Set<() => void>();
const businessKeys = [
  "businessName",
  "businessSubtitle",
  "businessPhone",
  "businessSlug",
];

function identity(token: string | null) {
  try {
    const part = token!.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(part));
    return {
      userId: typeof payload.sub === "string" ? payload.sub : null,
      businessId:
        typeof payload.businessId === "string" ? payload.businessId : null,
      role: typeof payload.role === "string" ? payload.role : null,
    };
  } catch {
    return { userId: null, businessId: null, role: null };
  }
}

export function getSessionContext(): SessionContext {
  if (typeof window === "undefined") return snapshot;
  const token = localStorage.getItem("accessToken");
  if (!initialized || token !== snapshot.token) {
    initialized = true;
    const user = identity(token);
    const owner = JSON.stringify([user.userId, user.businessId]);
    try {
      if (localStorage.getItem("businessProfileOwner:v1") !== owner || !token) {
        for (const key of businessKeys) localStorage.removeItem(key);
      }
      if (token) {
        localStorage.setItem("businessProfileOwner:v1", owner);
        localStorage.setItem(
          "user",
          JSON.stringify({ role: user.role, businessId: user.businessId }),
        );
      } else {
        localStorage.removeItem("businessProfileOwner:v1");
        localStorage.removeItem("user");
      }
    } catch {
      /* Metadata storage failures must not invalidate a historical token. */
    }
    snapshot = { ...user, token, key: `${owner}:${++generation}` };
    for (const listener of listeners) listener();
  }
  return snapshot;
}

export function subscribeSession(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export class StaleSessionError extends Error {
  constructor() {
    super("La solicitud pertenece a una sesión anterior.");
    this.name = "StaleSessionError";
  }
}

export function assertCurrentSession(context: SessionContext) {
  if (getSessionContext().key !== context.key) throw new StaleSessionError();
}

export function establishSession(data: {
  accessToken: string;
  businessName?: string;
  businessSlug?: string;
}) {
  if (!data.accessToken) throw new Error("No se recibió una sesión válida.");
  const keys = [
    ...businessKeys,
    "accessToken",
    "user",
    "businessProfileOwner:v1",
  ];
  const previous = keys.map((key) => [key, localStorage.getItem(key)] as const);
  try {
    for (const key of businessKeys) localStorage.removeItem(key);
    if (data.businessName)
      localStorage.setItem("businessName", data.businessName.trim());
    if (data.businessSlug)
      localStorage.setItem("businessSlug", data.businessSlug);
    const user = identity(data.accessToken);
    localStorage.setItem(
      "businessProfileOwner:v1",
      JSON.stringify([user.userId, user.businessId]),
    );
    localStorage.setItem(
      "user",
      JSON.stringify({ role: user.role, businessId: user.businessId }),
    );
    localStorage.setItem("accessToken", data.accessToken);
  } catch (error) {
    for (const [key, value] of previous) {
      try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      } catch {}
    }
    throw error;
  }
  initialized = false;
  return getSessionContext();
}

export function clearSession() {
  for (const key of [
    ...businessKeys,
    "accessToken",
    "user",
    "token",
    "session",
    "businessProfileOwner:v1",
  ])
    localStorage.removeItem(key);
  initialized = false;
  getSessionContext();
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === "accessToken" || event.key === null) getSessionContext();
  });
}
