import { Home, LineChart, Store, type LucideIcon } from "lucide-react";

export type BottomNavKey = "home" | "movimientos" | "tienda";

export const BOTTOM_NAV_ITEMS: Array<{
  key: BottomNavKey;
  label: string;
  href: string;
  Icon: LucideIcon;
}> = [
  { key: "home", label: "Home", href: "/home", Icon: Home },
  {
    key: "movimientos",
    label: "Dashboard",
    href: "/movimientos",
    Icon: LineChart,
  },
  { key: "tienda", label: "Mi Tienda", href: "/tienda", Icon: Store },
];

