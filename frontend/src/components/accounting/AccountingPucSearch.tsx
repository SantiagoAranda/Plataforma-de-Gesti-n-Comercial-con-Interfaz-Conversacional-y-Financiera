"use client";

import { SearchSelect, type SearchSelectOption } from "@/src/components/shared/SearchSelect";
import { searchPuc, type PucSearchResult } from "@/src/services/puc";
import type { AccountingFormState } from "@/src/types/accounting-form";

type PucSearchOption = SearchSelectOption & PucSearchResult;

type Props = {
  value: AccountingFormState;
  onChange: React.Dispatch<React.SetStateAction<AccountingFormState>>;
  error?: string;
};

export function AccountingPucSearch({ value, onChange, error }: Props) {
  const selectedValue: PucSearchOption | null = value.pucCode
    ? {
      id: `${value.pucKind}-${value.pucCode}`,
      code: value.pucCode,
      kind: value.pucKind,
      name: value.pucName,
      title: value.pucCode,
      subtitle: value.pucName,
      meta: value.pucKind,
    }
    : null;

  const handleSelect = (result: PucSearchOption) => {
    onChange((prev) => ({
      ...prev,
      selectedPuc:
        result.kind === "CUENTA"
          ? {
            level: "account",
            id: result.code,
            code: result.code,
            name: result.name,
          }
          : {
            level: "subaccount",
            id: result.code,
            code: result.code,
            name: result.name,
          },
      pucCuentaCode: result.kind === "CUENTA" ? result.code : "",
      pucSubcuentaId: result.kind === "SUBCUENTA" ? result.code : "",
      pucKind: result.kind,
      pucCode: result.code,
      pucName: result.name,
    }));
  };

  return (
    <SearchSelect<PucSearchOption>
      label={<>CÓDIGO PUC <span className="text-red-500">*</span></>}
      value={selectedValue}
      error={error}
      variant="encapsulated"
      labelClassName="text-[10px] font-bold text-slate-400/90 uppercase tracking-wider mb-1.5 block px-1"
      placeholder={value.pucCode ? "Buscar otro PUC..." : "Ej. 4235, 423595 o Servicios"}
      emptyText="No se encontraron cuentas o subcuentas para esa busqueda."
      search={async (query) => {
        const results = await searchPuc(query);
        return results.map((result) => ({
          ...result,
          id: `${result.kind}-${result.code}`,
          title: result.code,
          subtitle: result.name,
          meta: result.kind,
        }));
      }}
      onSelect={handleSelect}
      renderOption={(result) => (
        <>
          <span className="shrink-0 text-sm font-semibold text-neutral-800">
            {result.code}
          </span>
          <div className="min-w-0 flex-1">
            <div className="break-words text-sm leading-5 text-neutral-600">
              {result.name}
            </div>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
              {result.kind}
            </div>
          </div>
        </>
      )}
      renderSelected={(result) => (
        <>
          <div className="font-semibold text-emerald-800">
            {result.code} <span className="ml-1 text-[10px] text-emerald-600">{result.kind}</span>
          </div>
          <div className="break-words leading-5 text-emerald-700/90">{result.name}</div>
        </>
      )}
    />
  );
}
