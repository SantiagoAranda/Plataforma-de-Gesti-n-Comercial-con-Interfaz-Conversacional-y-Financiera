export type SelectedPucOption = {
  code: string;
  name: string;
  kind: "CUENTA" | "SUBCUENTA";
};

export type SalesTemplateFormState = {
  cashAccount: SelectedPucOption | null;
  receivableAccount: SelectedPucOption | null;
  incomeAccount: SelectedPucOption | null;
  vatAccount: SelectedPucOption | null;
  costAccount: SelectedPucOption | null;
  inventoryAccount: SelectedPucOption | null;
  vatRatePct: number;
  pricesIncludeVat: boolean;
};
