export type ExpenseShortcutIcon =
  | "Building2"
  | "BriefcaseBusiness"
  | "Bus"
  | "Car"
  | "CircleDollarSign"
  | "Droplets"
  | "FileText"
  | "Flame"
  | "Fuel"
  | "Laptop"
  | "Megaphone"
  | "MoreHorizontal"
  | "Package"
  | "CircleParking"
  | "Phone"
  | "ReceiptText"
  | "ShieldCheck"
  | "Truck"
  | "Users"
  | "Utensils"
  | "Wrench"
  | "Zap";

export type ExpenseShortcut = {
  id: string;
  label: string;
  pucCode: string;
  pucName: string;
  icon?: ExpenseShortcutIcon;
};

export type ExpenseShortcutGroup = {
  id: string;
  label: string;
  icon: ExpenseShortcutIcon;
  helperText?: string;
  shortcuts: readonly ExpenseShortcut[];
};

export const TRANSPORT_FUEL_PUC_CODE = "519535" as const;

export const EXPENSE_SHORTCUT_GROUPS = [
  {
    id: "services",
    label: "Servicios",
    icon: "Zap",
    shortcuts: [
      {
        id: "services-security",
        label: "Aseo y vigilancia",
        pucCode: "513505",
        pucName: "Aseo y vigilancia",
        icon: "ShieldCheck",
      },
      {
        id: "services-water",
        label: "Acueducto",
        pucCode: "513525",
        pucName: "Acueducto y alcantarillado",
        icon: "Droplets",
      },
      {
        id: "services-energy",
        label: "Energía eléctrica",
        pucCode: "513530",
        pucName: "Energía eléctrica",
        icon: "Zap",
      },
      {
        id: "services-phone",
        label: "Teléfono / celular",
        pucCode: "513535",
        pucName: "Teléfono",
        icon: "Phone",
      },
      {
        id: "services-gas",
        label: "Gas",
        pucCode: "513555",
        pucName: "Gas",
        icon: "Flame",
      },
    ],
  },
  {
    id: "rent",
    label: "Alquiler",
    icon: "Building2",
    shortcuts: [
      {
        id: "rent-premises",
        label: "Alquiler de espacio",
        pucCode: "512010",
        pucName: "Construcciones y edificaciones",
        icon: "Building2",
      },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    icon: "Megaphone",
    shortcuts: [
      {
        id: "marketing-advertising",
        label: "Publicidad / promoción",
        pucCode: "523560",
        pucName: "Publicidad, propaganda y promoción",
        icon: "Megaphone",
      },
      {
        id: "marketing-pr",
        label: "Representación / RR. PP.",
        pucCode: "519520",
        pucName: "Gastos de representación y relaciones públicas",
        icon: "Users",
      },
    ],
  },
  {
    id: "honorarios",
    label: "Honorarios",
    icon: "BriefcaseBusiness",
    shortcuts: [
      {
        id: "honorarios-general",
        label: "Honorarios",
        pucCode: "511095",
        pucName: "Otros",
        icon: "BriefcaseBusiness",
      },
    ],
  },
  {
    id: "food",
    label: "Comida",
    icon: "Utensils",
    shortcuts: [
      {
        id: "food-restaurant",
        label: "Comida",
        pucCode: "519560",
        pucName: "Casino y restaurante",
        icon: "Utensils",
      },
    ],
  },
  {
    id: "transport",
    label: "Transporte",
    icon: "Truck",
    shortcuts: [
      {
        id: "transport-fuel",
        label: "Combustibles",
        pucCode: TRANSPORT_FUEL_PUC_CODE,
        pucName: "Combustibles y lubricantes",
        icon: "Fuel",
      },
      {
        id: "transport-taxis",
        label: "Taxis y buses",
        pucCode: "519545",
        pucName: "Taxis y buses",
        icon: "Car",
      },
      {
        id: "transport-freight",
        label: "Fletes / acarreos",
        pucCode: "513550",
        pucName: "Transporte, fletes y acarreos",
        icon: "Truck",
      },
      {
        id: "transport-tickets",
        label: "Pasajes terrestres",
        pucCode: "515520",
        pucName: "Pasajes terrestres",
        icon: "Bus",
      },
      {
        id: "transport-parking",
        label: "Parqueaderos",
        pucCode: "519565",
        pucName: "Parqueaderos",
        icon: "CircleParking",
      },
    ],
  },
  {
    id: "maintenance",
    label: "Mantenimiento",
    icon: "Wrench",
    shortcuts: [
      {
        id: "maintenance-premises",
        label: "Instalaciones locativas",
        pucCode: "514510",
        pucName: "Construcciones y edificaciones",
        icon: "Building2",
      },
      {
        id: "maintenance-machinery",
        label: "Maquinaria y equipo",
        pucCode: "514515",
        pucName: "Maquinaria y equipo",
        icon: "Wrench",
      },
      {
        id: "maintenance-office",
        label: "Equipo de oficina",
        pucCode: "514520",
        pucName: "Equipo de oficina",
        icon: "FileText",
      },
      {
        id: "maintenance-computers",
        label: "Equipo de cómputo",
        pucCode: "514525",
        pucName: "Equipo de computación y comunicación",
        icon: "Laptop",
      },
    ],
  },
  {
    id: "other",
    label: "Otros",
    icon: "MoreHorizontal",
    shortcuts: [
      {
        id: "other-subscriptions",
        label: "Libros / suscripciones",
        pucCode: "519510",
        pucName: "Libros, suscripciones, periódicos y revistas",
        icon: "FileText",
      },
      {
        id: "other-stationery",
        label: "Papelería / fotocopias",
        pucCode: "519530",
        pucName: "Útiles, papelería y fotocopias",
        icon: "FileText",
      },
      {
        id: "other-packaging",
        label: "Envases / empaques",
        pucCode: "519540",
        pucName: "Envases y empaques",
        icon: "Package",
      },
      {
        id: "other-expenses",
        label: "Otros gastos",
        pucCode: "519595",
        pucName: "Otros",
        icon: "MoreHorizontal",
      },
    ],
  },
] as const satisfies readonly ExpenseShortcutGroup[];

export function assertValidExpenseShortcutGroups(
  groups: readonly ExpenseShortcutGroup[],
): asserts groups is readonly ExpenseShortcutGroup[] {
  const groupIds = new Set<string>();
  const shortcutIds = new Set<string>();

  for (const group of groups) {
    if (groupIds.has(group.id)) {
      throw new Error(`Grupo de atajos de gasto duplicado: ${group.id}`);
    }
    groupIds.add(group.id);

    const groupPucCodes = new Set<string>();
    for (const shortcut of group.shortcuts) {
      if (shortcutIds.has(shortcut.id)) {
        throw new Error(`Atajo de gasto duplicado: ${shortcut.id}`);
      }
      shortcutIds.add(shortcut.id);

      if (!/^\d{6}$/.test(shortcut.pucCode)) {
        throw new Error(
          `Código PUC inválido para ${shortcut.id}: ${shortcut.pucCode}`,
        );
      }
      if (groupPucCodes.has(shortcut.pucCode)) {
        throw new Error(
          `Código PUC duplicado en ${group.id}: ${shortcut.pucCode}`,
        );
      }
      groupPucCodes.add(shortcut.pucCode);
    }
  }

  const fuelShortcut = groups
    .find((group) => group.id === "transport")
    ?.shortcuts.find((shortcut) => shortcut.id === "transport-fuel");
  if (fuelShortcut?.pucCode !== TRANSPORT_FUEL_PUC_CODE) {
    throw new Error(
      `Transporte → Combustibles debe usar PUC ${TRANSPORT_FUEL_PUC_CODE}`,
    );
  }
}

assertValidExpenseShortcutGroups(EXPENSE_SHORTCUT_GROUPS);
