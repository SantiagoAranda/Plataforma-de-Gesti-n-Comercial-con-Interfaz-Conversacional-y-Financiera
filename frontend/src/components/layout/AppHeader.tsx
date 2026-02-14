"use client";

import { useRouter } from "next/navigation";

type Props = {
  title?: string;
  showBack?: boolean;
};

export default function AppHeader({ title = "MVP", showBack = false }: Props) {
  const router = useRouter();

  return (
    <header className="relative flex items-center px-4 py-3 border-b border-neutral-200 bg-white">
      
      {/* Botón Back */}
      {showBack ? (
        <button
          onClick={() => router.back()}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-neutral-100 transition"
        >
          ←
        </button>
      ) : (
        <div className="w-9 h-9" />
      )}

      {/* Título centrado real */}
      <h1 className="absolute left-1/2 -translate-x-1/2 text-sm font-semibold tracking-wide text-neutral-700">
        {title}
      </h1>

      {/* Botón menú derecha */}
      <button className="ml-auto text-xl text-neutral-500">⋮</button>
    </header>
  );
}
