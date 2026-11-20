import { api } from "@/src/lib/api";
import { getToken } from "@/src/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export type SignedDelivery =
  | { attached: false }
  | { attached: true; mimeType: string; sizeBytes: number; originalName: string | null; updatedAt: string };

export type SignedDeliveryApi = {
  get: (orderId: string) => Promise<SignedDelivery>;
  upload: (orderId: string, file: File) => Promise<SignedDelivery>;
  remove: (orderId: string) => Promise<SignedDelivery>;
  /** Archivo guardado como blob (la API es privada: no hay URL pública que abrir). */
  file: (orderId: string) => Promise<Blob>;
};

const path = (orderId: string) => `/sales/${orderId}/signed-delivery`;

export const signedDeliveryApi: SignedDeliveryApi = {
  get: (orderId) => api<SignedDelivery>(path(orderId)),
  upload: (orderId, file) => {
    const body = new FormData();
    body.append("file", file);
    return api<SignedDelivery>(path(orderId), { method: "POST", body });
  },
  remove: (orderId) => api<SignedDelivery>(path(orderId), { method: "DELETE" }),
  file: async (orderId) => {
    const token = getToken();
    const res = await fetch(`${API_URL}${path(orderId)}/file`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) throw new Error("No se pudo abrir la copia firmada");
    return res.blob();
  },
};
