import { api } from "@/src/lib/api";

export type TaxProfile = {
  id: string;
  businessId: string;
  personType: "NATURAL" | "JURIDICA";
  documentType: "CC" | "NIT" | "CE" | "PASAPORTE" | "TI";
  nit: string;
  dv: string | null;
  tradeName: string;
  email: string;
  phone: string;
  departmentCode: string;
  municipalityCode: string;
  address: string;
  mainCiiuCode: string | null;
  mainCiiuDescription: string | null;
  isIncomeTaxDeclarant: boolean;
  responsibilities: Array<{
    responsibility: {
      id: string;
      code: string;
      name: string;
      description: string | null;
    };
  }>;
};

export type TaxResponsibility = {
  id: string;
  code: string;
  name: string;
  description: string | null;
};

export type CiiuActivity = {
  id: string;
  code: string;
  description: string;
};

export type IcaRate = {
  id: string;
  municipalityCode: string;
  ciiuCode: string;
  activityName: string | null;
  icaRate: number | string;
  reteIcaRate: number | string;
  minBaseUvt: number | string;
};

export type IcaRateInput = {
  municipalityCode: string;
  ciiuCode: string;
  activityName: string | null;
  icaRatePerThousand: number;
  reteIcaRatePerThousand: number;
  minBaseUvt: number;
};

export type TaxRule = {
  id: string;
  taxType: "IVA" | "IMPOCONSUMO" | "RETEFUENTE" | "RETEIVA" | "RETEICA" | "AUTORRETENCION";
  direction: "CHARGE" | "WITHHOLD" | "SELF";
  ciiuCode: string | null;
  saleConcept: "GOODS" | "SERVICES" | "HONORARIOS" | "ARRENDAMIENTOS" | "FOOD_BEVERAGES" | "OTHER" | null;
  rate: number;
  minBaseUvt: number;
  pucAccountCode: string;
  postToAccounting: boolean;
};

export function getTaxProfile() {
  return api<TaxProfile>("/settings/tax-profile");
}

export function updateTaxProfile(data: any) {
  return api<TaxProfile>("/settings/tax-profile", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function listTaxResponsibilities() {
  return api<TaxResponsibility[]>("/settings/tax-responsibilities");
}

export function searchCiiu(search?: string) {
  const query = search ? `?search=${encodeURIComponent(search)}` : "";
  return api<CiiuActivity[]>(`/settings/economic-activities${query}`);
}

export function listIcaRates() {
  return api<IcaRate[]>("/settings/ica-rates");
}

export function createIcaRate(data: IcaRateInput) {
  return api<IcaRate>("/settings/ica-rates", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateIcaRate(id: string, data: Partial<IcaRateInput>) {
  return api<IcaRate>(`/settings/ica-rates/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteIcaRate(id: string) {
  return api<{ ok: boolean }>(`/settings/ica-rates/${id}`, {
    method: "DELETE",
  });
}

export function listTaxRules() {
  return api<TaxRule[]>("/settings/tax-rules");
}

export function createTaxRule(data: any) {
  return api<TaxRule>("/settings/tax-rules", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateTaxRule(id: string, data: any) {
  return api<TaxRule>(`/settings/tax-rules/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteTaxRule(id: string) {
  return api<{ ok: boolean }>(`/settings/tax-rules/${id}`, {
    method: "DELETE",
  });
}
