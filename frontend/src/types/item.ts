export type ItemType = "PRODUCT" | "SERVICE";

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
  description?: string;
  durationMinutes?: number;
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
