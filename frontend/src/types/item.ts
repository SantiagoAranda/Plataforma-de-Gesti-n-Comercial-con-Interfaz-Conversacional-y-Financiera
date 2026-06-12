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
};

export type Schedule = {
  weekday: string;
  startMinute: number;
  endMinute: number;
};

export type Item = {
  id: string;
  type: ItemType;
  name: string;
  price: number;
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
  status: "ACTIVE" | "INACTIVE";
  createdAt?: string;
  updatedAt?: string;
  _count?: { images: number };
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
