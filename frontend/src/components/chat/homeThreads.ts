export type HomeThread = {
  id: string;
  title: string;
  preview: string;
  time: string;
  active?: boolean;
  icon: string;
  route: string;
};

export const HOME_THREADS: HomeThread[] = [
  {
    id: "mi-negocio",
    title: "Mi Negocio",
    preview: "Imagen de producto recibida...",
    time: "AHORA",
    active: true,
    icon: "📦",
    route: "/mi-negocio",
  },
  {
    id: "ventas",
    title: "Ventas",
    preview: "Orden #1024 generada exitosamente",
    time: "10:45 AM",
    icon: "📊",
    route: "/ventas",
  },
  {
    id: "contabilidad",
    title: "Contabilidad",
    preview: "Asiento contable registrado...",
    time: "Ayer",
    icon: "🧾",
    route: "/movimientos",
  },
];
