export function buildWhatsAppUrl(phoneE164: string, message: string) {
  const clean = phoneE164.replace(/[^\d]/g, "");
  const text = encodeURIComponent(message);
  return `https://wa.me/${clean}?text=${text}`;
}

export function formatSaleMessage(opts: {
  businessName?: string;
  customerName: string;
  items: { qty: number; name: string; price: number }[];
}) {
  // La propiedad 'price' ya representa el total de la línea (unitPrice * qty) según el mapeo en VentaPage.
  const total = opts.items.reduce((acc, i) => acc + (i.price || 0), 0);

  const lines = [
    `Hola, *${opts.customerName}*. Te compartimos el detalle de tu pedido${opts.businessName ? ` en *${opts.businessName}*` : ""}:`,
    "",
    ...opts.items.map((i) => `- ${i.name} x${i.qty}`),
    "",
    `*Total: $${total.toLocaleString("es-CO", { minimumFractionDigits: 0 })}*`,
    "",
    "Gracias por tu compra.",
  ];

  return lines.join("\n");
}