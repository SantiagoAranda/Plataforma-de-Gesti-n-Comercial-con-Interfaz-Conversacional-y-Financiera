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

export type ExpenseShortcutSearch = {
  endpointGroupId?: string;
  allowedPucPrefixes: readonly string[];
  nameIncludes?: readonly string[];
};

export type ExpenseShortcutGroup = {
  id: string;
  label: string;
  icon: ExpenseShortcutIcon;
  helperText?: string;
  search: ExpenseShortcutSearch;
  shortcuts: readonly ExpenseShortcut[];
};

export const TRANSPORT_FUEL_PUC_CODE = "519535" as const;

export const EXPENSE_SHORTCUT_GROUPS = [
  {
    id: "services",
    label: "Servicios",
    icon: "Zap",
    search: {
      endpointGroupId: "services",
      allowedPucPrefixes: ["5135", "5235"],
    },
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
    search: {
      endpointGroupId: "rent",
      allowedPucPrefixes: ["5120", "5220"],
    },
    shortcuts: [
      {
        id: "rent-general",
        label: "Alquiler / Arrendamientos",
        pucCode: "512095",
        pucName: "Otros",
        icon: "Building2",
      },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    icon: "Megaphone",
    search: {
      allowedPucPrefixes: ["5195", "5235", "5295"],
      nameIncludes: [
        "publicidad",
        "propaganda",
        "promocion",
        "representacion",
        "relaciones publicas",
      ],
    },
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
    search: {
      endpointGroupId: "honorarios",
      allowedPucPrefixes: ["5110", "5210"],
    },
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
    search: {
      allowedPucPrefixes: ["5195", "5295"],
      nameIncludes: ["alimentacion", "casino", "restaurante"],
    },
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
    search: {
      allowedPucPrefixes: [
        "5135",
        "5235",
        "5155",
        "5255",
        "5195",
        "5295",
      ],
      nameIncludes: [
        "transporte",
        "flete",
        "acarreo",
        "pasaje",
        "taxi",
        "bus",
        "combustible",
        "lubricante",
        "parqueadero",
        "peaje",
      ],
    },
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
    search: {
      endpointGroupId: "maintenance",
      allowedPucPrefixes: ["5145", "5245"],
    },
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
    search: {
      endpointGroupId: "other",
      allowedPucPrefixes: ["5195", "5295", "5305", "5315", "5395"],
    },
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

    if (group.search.allowedPucPrefixes.length === 0) {
      throw new Error(`El grupo ${group.id} no tiene familias PUC de búsqueda`);
    }
    for (const prefix of group.search.allowedPucPrefixes) {
      if (!/^\d{4}$/.test(prefix)) {
        throw new Error(`Familia PUC inválida en ${group.id}: ${prefix}`);
      }
    }

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
      if (
        !group.search.allowedPucPrefixes.some((prefix) =>
          shortcut.pucCode.startsWith(prefix),
        )
      ) {
        throw new Error(
          `El PUC ${shortcut.pucCode} no pertenece a las familias de ${group.id}`,
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

  const transportGroup = groups.find((group) => group.id === "transport");
  if (transportGroup?.search.allowedPucPrefixes.includes("5130")) {
    throw new Error("Transporte no puede incluir la familia PUC 5130");
  }

  const fuelShortcut = transportGroup?.shortcuts.find(
    (shortcut) => shortcut.id === "transport-fuel",
  );
  if (fuelShortcut?.pucCode !== TRANSPORT_FUEL_PUC_CODE) {
    throw new Error(
      `Transporte → Combustibles debe usar PUC ${TRANSPORT_FUEL_PUC_CODE}`,
    );
  }
}

assertValidExpenseShortcutGroups(EXPENSE_SHORTCUT_GROUPS);
