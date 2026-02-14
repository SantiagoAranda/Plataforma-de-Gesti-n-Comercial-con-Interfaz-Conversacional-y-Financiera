export function buildWhatsAppUrl(phoneE164: string, message: string) {
  const clean = phoneE164.replace(/[^\d]/g, "");
  const text = encodeURIComponent(message);
  return `https://wa.me/${clean}?text=${text}`;
}

export function formatSaleMessage(opts: {
  businessName?: string;
  customerName: string;
  items: { qty: number; name: string; price: number }[];
  total: number;
}) {
  const lines = [
    `Pedido de: ${opts.customerName}`,
    ...(opts.businessName ? [`Negocio: ${opts.businessName}`] : []),
    "",
    "Detalle:",
    ...opts.items.map((i) => `- ${i.qty}x ${i.name}: $${i.price.toFixed(2)}`),
    "",
    `Total: $${opts.total.toFixed(2)}`,
  ];
  return lines.join("\n");
}
