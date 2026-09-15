import { api } from "@/src/lib/api";
import { getToken } from "@/src/lib/auth";
import type {
  FactusConfigurationView,
  FiscalDocument,
  FiscalMunicipality,
} from "@/src/types/fiscal-documents";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export const listFiscalDocuments = () =>
  api<FiscalDocument[]>("/fiscal-documents");

export const getFactusConfiguration = () =>
  api<FactusConfigurationView>("/fiscal-documents/configuration");

export const dispatchFiscalDocument = (id: string) =>
  api<FiscalDocument>(`/fiscal-documents/${encodeURIComponent(id)}/dispatch`, {
    method: "POST",
  });

export const retryFiscalDocument = (id: string) =>
  api<FiscalDocument>(`/fiscal-documents/${encodeURIComponent(id)}/retry`, {
    method: "POST",
  });

export const requestCreditNote = (id: string) =>
  api<FiscalDocument>(`/fiscal-documents/${encodeURIComponent(id)}/credit-note`, {
    method: "POST",
    body: JSON.stringify({ correctionConceptCode: "2" }),
  });

export const listFiscalMunicipalities = () =>
  api<FiscalMunicipality[]>("/settings/fiscal-municipalities");

export async function downloadFiscalArtifact(id: string, kind: "pdf" | "xml") {
  const token = getToken();
  const response = await fetch(
    `${API_URL}/fiscal-documents/${encodeURIComponent(id)}/artifacts/${kind}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
  );
  if (!response.ok) throw new Error("Documento fiscal o archivo no encontrado");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${id}.${kind}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
