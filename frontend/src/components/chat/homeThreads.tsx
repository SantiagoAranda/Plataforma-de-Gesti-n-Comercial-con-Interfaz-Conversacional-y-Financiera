import { ReactNode } from "react";
import {
  Boxes,
  BarChart3,
  ReceiptText,
} from "lucide-react";

export type HomeThread = {
  id: string;
  title: string;
  preview: string;
  time: string;
  active?: boolean;
  icon: ReactNode;
  route: string;
};

export const HOME_THREADS: HomeThread[] = [
  {
    id: "mi-negocio",
    title: "Mi Negocio",
    preview: "Imagen de producto recibida...",
    time: "AHORA",
    active: true,
    icon: <Boxes className="h-5 w-5" />,
    route: "/mi-negocio",
  },
  {
    id: "venta",
    title: "Venta",
    preview: "Orden #1024 generada exitosamente",
    time: "10:45 AM",
    icon: <BarChart3 className="h-5 w-5" />,
    route: "/venta",
  },
  {
    id: "contabilidad",
    title: "Contabilidad",
    preview: "Asiento contable registrado...",
    time: "Ayer",
    icon: <ReceiptText className="h-5 w-5" />,
    route: "/contabilidad",
  },
];