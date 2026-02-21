export type PucKind = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";

export type PucNode = {
  code: string;
  name: string;
  kind: PucKind;
  breadcrumbs: string[]; // ["Activo", "Disponible", "Caja", "Caja general"]
};