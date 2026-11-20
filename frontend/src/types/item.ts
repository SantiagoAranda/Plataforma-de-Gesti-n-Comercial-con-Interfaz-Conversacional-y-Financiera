export type ItemType = "PRODUCT" | "SERVICE";

export type ItemInventoryMode = "NONE" | "SIMPLE" | "RECIPE_BASED";
export type ItemSellabilityStatus =
  | "SELLABLE"
  | "NO_STOCK"
  | "LOW_STOCK"
  | "MISSING_INITIAL_STOCK"
  | "MISSING_RECIPE"
  | "EMPTY_RECIPE"
  | "INSUFFICIENT_RECIPE_STOCK"
  | "RECIPE_REQUIRES_REVIEW"
  | "SERVICE_REQUIRES_REVIEW"
  | "ITEM_OPTION_REQUIRES_REVIEW"
  | "INACTIVE";

export type ItemSellability = {
  sellable: boolean;
  status: ItemSellabilityStatus;
  message?: string;
  currentStock?: number | string;
  averageCost?: number | string;
  missingItems?: Array<{
    id: string;
    name: string;
    required: number | string;
    available: number | string;
    unit?: string | null;
  }>;
  inactiveIngredients?: Array<{ id: string; name: string }>;
};

export type Schedule = {
  weekday: string;
  startMinute: number;
  endMinute: number;
};

export type ItemOptionTargetType = "NONE" | "INGREDIENT" | "ITEM";

export type ItemOptionQuantityMode =
  "FIXED_PER_OPTION" | "SHARED_TOTAL" | "NO_QUANTITY";

export type PublicItemOption = {
  id: string;
  groupId: string;
  name: string;
  description?: string | null;
  targetType: ItemOptionTargetType;
  ingredientId?: string | null;
  itemId?: string | null;
  quantity?: number | null;
  unitId?: string | null;
  priceDelta: number;
  selectedByDefault: boolean;
  removable: boolean;
  sortOrder: number;
  isActive?: boolean;
  hasStock?: boolean;
  availabilityStatus?: "AVAILABLE" | "OUT_OF_STOCK" | "UNAVAILABLE";
  ingredient?: {
    id: string;
    name: string;
    status?: "ACTIVE" | "INACTIVE";
    currentStock?: number | string;
    averageCost?: number | string;
  } | null;
  item?: {
    id: string;
    name: string;
    type: ItemType;
    inventoryMode?: ItemInventoryMode | null;
    status?: "ACTIVE" | "INACTIVE";
    currentStock?: number | string;
  } | null;
  unit?: { id: string; code?: string; name?: string; symbol?: string } | null;
};

export type PublicItemOptionGroup = {
  id: string;
  title: string;
  description?: string | null;
  required: boolean;
  minSelections: number;
  maxSelections?: number | null;
  quantityMode: ItemOptionQuantityMode;
  totalQuantityLimit?: number | null;
  totalQuantityUnitId?: string | null;
  totalQuantityUnit?: {
    id: string;
    code?: string;
    name?: string;
    symbol?: string;
  } | null;
  sortOrder: number;
  isActive?: boolean;
  options: PublicItemOption[];
};

export type Item = {
  id: string;
  type: ItemType;
  name: string;
  price: number;
  appliesImpoconsumo?: boolean;
  impoconsumoRate?: number | string | null;
  badges?: Array<{ text: string; color: string }> | null;
  badgeText?: string | null;
  badgeColor?: string | null;
  description?: string;
  durationMinutes?: number;
  inventoryMode?: ItemInventoryMode | null;
  minStock?: number | string;
  sellability?: ItemSellability;
  currentStock?: number | string;
  averageCost?: number | string;
  schedule?: Schedule[];
  images?: { id: string; url: string; order: number }[];
  optionGroups?: PublicItemOptionGroup[];
  status: "ACTIVE" | "INACTIVE";
  saleConcept?:
    | "GOODS"
    | "SERVICES"
    | "HONORARIOS"
    | "ARRENDAMIENTOS"
    | "FOOD_BEVERAGES"
    | "OTHER"
    | null;
  createdAt?: string;
  updatedAt?: string;
  _count?: { images: number };
} & ItemCatalogAttributes;

/**
 * F1.1 catalog attributes (backend contract). Internal endpoints return all of
 * them; public endpoints omit barcode/quotation fields/visibleInCatalog and send
 * `price: null` when publishWithoutPrice is true (see PublicCatalogItem).
 */
export type ItemCatalogAttributes = {
  visibleInCatalog?: boolean;
  publishWithoutPrice?: boolean;
  includeInQuotation?: boolean;
  quotationDescription?: string | null;
  brand?: string | null;
  barcode?: string | null;
  categoryId?: string | null;
  subcategoryId?: string | null;
  customCategoryName?: string | null;
  customSubcategoryName?: string | null;
};

/** Item as returned by /public/:slug/items: the internal price may be hidden. */
export type PublicCatalogItem = Omit<
  Item,
  "price" | "barcode" | "quotationDescription" | "includeInQuotation" | "visibleInCatalog" | "optionGroups"
> & {
  price: number | null;
  optionGroups?: Array<Omit<PublicItemOptionGroup, "options"> & {
    options: Array<Omit<PublicItemOption, "priceDelta"> & { priceDelta: number | null }>;
  }>;
};

export type TimeRange = {
  start: string;
  end: string;
};

export type WeeklySchedule = {
  day: string;
  active: boolean;
  ranges: TimeRange[];
};

export type FormErrors = {
  name?: string;
  price?: string;
  duration?: string;
  schedule?: string;
  inventory?: string;
  impoconsumoRate?: string;
};

export type ItemImage = {
  id: string;
  url: string;
  order: number;
};

export type PendingImage = {
  id: string;
  file: File;
  previewUrl: string;
};
