"use client";

import { CustomSelect, type CustomSelectOption } from "@/src/components/ui/CustomSelect";
import { useFiscalMunicipalities } from "@/src/hooks/useFiscalMunicipalities";

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  publicSlug?: string;
};

export default function MunicipalitySelect({
  value,
  onChange,
  disabled = false,
  className,
  id,
  publicSlug,
}: Props) {
  const municipalities = useFiscalMunicipalities(!disabled, publicSlug);
  const options: CustomSelectOption[] = municipalities.map((municipality) => ({
    value: municipality.code,
    label: municipality.department.name
      ? `${municipality.name} (${municipality.department.name})`
      : municipality.name,
  }));
  return (
    <CustomSelect
      id={id}
      value={value}
      onChange={onChange}
      options={options}
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
