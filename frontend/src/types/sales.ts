export type SaleStatus =
  | "PENDIENTE DE CIERRE"
  | "CERRADO"
  | "PENDIENTE"
  | "CANCELADO";

export type SaleType = "PRODUCTO" | "SERVICIO";
export type SourceType = "ORDER" | "RESERVATION";
export type PaymentMethod = "CASH" | "BANK_TRANSFER";

export type SaleFiscalSummary = {
  subtotal: number;
  iva: number;
  impoconsumo: number;
  reteFuente: number;
  reteIva: number;
  reteIca: number;
  totalCollected: number;
  totalCharged: number;
  totalWithheld: number;
  netReceived: number;
};

export interface SaleItem {
  orderItemId?: string;
  itemId?: string;
  qty: number;
  name: string;

  // Precio unitario
  unitPrice: number;

  // precio TOTAL de este item (qty * precio unitario)
  price: number;

  // solo para servicios
  durationMin?: number | null;

  itemInventoryMode?: "NONE" | "SIMPLE" | "RECIPE_BASED" | string | null;
  excludedOptionalIngredientIds?: string[];
  optionSelections?: Array<{
    groupId: string;
    optionId: string;
    action: "SELECT" | "ADD" | "REMOVE";
  }>;
  options?: Array<{
    groupId?: string | null;
    optionId?: string | null;
    action?: "SELECT" | "ADD" | "REMOVE";
    groupTitle: string;
    optionName: string;
    priceDelta: number;
    quantityPerUnit?: number | null;
    totalQuantity?: number | null;
    unitLabel?: string | null;
  }>;
  recipe?: Array<{
    ingredientId: string;
    isOptional: boolean;
    quantityRequired: number;
    ingredient: {
      id: string;
      name: string;
      consumptionUnit?: string | null;
    };
  }>;
}

export interface Sale {
  id: string;
  sourceType: SourceType; // ORIGEN EXPLÍCITO

  customerName: string | null;
  customerWhatsapp: string | null;
  paymentMethod?: PaymentMethod;

  type: SaleType;
  status: SaleStatus;
  inventoryPostedAt?: string | null;
  accountingPostedAt?: string | null;
  hasInvalidOptionSnapshot?: boolean;
  fiscalSummary?: SaleFiscalSummary | null;

  items: SaleItem[];

  // Total de la orden calculado en backend
  total: number;

  createdAt: string; // ISO

  // solo servicios
  scheduledAt?: string;

  origin: "MANUAL" | "PUBLIC_STORE";

  // fallback temporal
  businessWhatsapp?: string;
}
