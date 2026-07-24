import { LogIn, Store } from "lucide-react";

export default function NavigationTransitionBackdrop({
  destination,
}: {
  destination: "store" | "login";
}) {
  const isStore = destination === "store";

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 flex items-center justify-center bg-neutral-100 text-[#0b3f64]"
    >
      <div className="flex flex-col items-center gap-3 opacity-75">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[#0b3f64]/15 bg-white/80 shadow-sm">
          {isStore ? <Store className="h-6 w-6" /> : <LogIn className="h-6 w-6" />}
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold">{isStore ? "sactec" : "Iniciar sesión"}</p>
          {isStore && <p className="text-sm text-slate-500">Ver tienda</p>}
        </div>
      </div>
    </div>
  );
}
