"use client";

import { useRouter } from "next/navigation";

type BottomNavProps = {
  active: "home" | "movimientos" | "tienda";
};

export default function BottomNav({ active }: BottomNavProps) {
  const router = useRouter();

  const baseItem =
    "flex flex-col items-center text-xs cursor-pointer transition-colors";
  const activeItem = "text-green-600 font-medium";
  const inactiveItem = "text-neutral-400";

  return (
    <nav className="
  fixed
  bottom-4
  left-4
  right-4
  z-50
  flex
  justify-between
  px-6
  py-3
  bg-white
  rounded-2xl
  shadow-[0_8px_24px_rgba(0,0,0,0.12)]
  border
  border-neutral-200
">


      {/* HOME */}
      <div
        className={`${baseItem} ${
          active === "home" ? activeItem : inactiveItem
        }`}
        onClick={() => router.push("/home")}
      >
        <span className="text-lg">🏠</span>
        <span>Home</span>
      </div>

      {/* MOVIMIENTOS */}
      <div
        className={`${baseItem} ${
          active === "movimientos" ? activeItem : inactiveItem
        }`}
        onClick={() => router.push("/movimientos")}
      >
        <span className="text-lg">📈</span>
        <span>Movimientos</span>
      </div>

      {/* TIENDA */}
      <div
        className={`${baseItem} ${
          active === "tienda" ? activeItem : inactiveItem
        }`}
        onClick={() => router.push("/tienda")}
      >
        <span className="text-lg">🏪</span>
        <span>Mi Tienda</span>
      </div>
    </nav>
  );
}
