import { AppApiError } from "@/src/lib/api";

export function getErrorMessage(error: unknown, fallback = "Ocurrió un error") {
  if (!error) return fallback;
  if (error instanceof AppApiError) {
    const code = error.details?.code;
    if (
      code === "RECIPE_REQUIRES_REVIEW" ||
      code === "SERVICE_REQUIRES_REVIEW" ||
      code === "ITEM_OPTION_REQUIRES_REVIEW"
    ) {
      const affectedItems = Array.isArray(error.details?.affectedItems)
        ? error.details.affectedItems.filter(Boolean)
        : [];
      const inactiveIngredients = Array.isArray(
        error.details?.inactiveIngredients,
      )
        ? error.details.inactiveIngredients
            .map((ingredient: { name?: unknown }) => ingredient?.name)
            .filter(Boolean)
        : [];
      const subject =
        code === "RECIPE_REQUIRES_REVIEW"
          ? "una receta"
          : code === "SERVICE_REQUIRES_REVIEW"
            ? "un servicio"
            : "una opción";
      const itemText = affectedItems.length
        ? ` (${affectedItems.join(", ")})`
        : "";
      const ingredientText = inactiveIngredients.length
        ? ` Ingredientes inactivos: ${inactiveIngredients.join(", ")}.`
        : "";
      return `No se puede confirmar esta venta: ${subject}${itemText} requiere revisión.${ingredientText}`;
    }
    return error.message || fallback;
  }
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}
