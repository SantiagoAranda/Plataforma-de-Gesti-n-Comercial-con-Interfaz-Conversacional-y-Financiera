import { redirect } from "next/navigation";

export default function IngredientesPage() {
  redirect("/inventario?tab=insumos");
}
