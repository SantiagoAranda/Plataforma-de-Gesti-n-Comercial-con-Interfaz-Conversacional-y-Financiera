"use client";

import { COLOMBIAN_MUNICIPALITIES } from "@/src/constants/colombianMunicipalities";
import { CustomSelect, type CustomSelectOption } from "@/src/components/ui/CustomSelect";

const MUNICIPALITY_OPTIONS: CustomSelectOption[] = COLOMBIAN_MUNICIPALITIES.map(
  (municipality) => ({
    value: municipality.code,
    label: municipality.name,
  }),
);

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
};

export default function MunicipalitySelect({
  value,
  onChange,
  disabled = false,
  className,
  id,
}: Props) {
  return (
    <CustomSelect
      id={id}
      value={value}
      onChange={onChange}
      options={MUNICIPALITY_OPTIONS}
      placeholder="Municipio ICA"
      searchable
      searchPlaceholder="Buscar municipio..."
      emptyText="No se encontraron municipios"
      dropdownPosition="auto"
      disabled={disabled}
      className={className}
    />
  );
}
