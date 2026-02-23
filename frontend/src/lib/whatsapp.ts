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
  const subtotal = opts.items.reduce(
    (acc, i) => acc + i.qty * i.price,
    0
  );

  const lines = [
    `🧾 *Nuevo Pedido*`,
    "",
    `👤 Cliente: ${opts.customerName}`,
    ...(opts.businessName ? [`🏪 Negocio: ${opts.businessName}`] : []),
    "",
    "📦 *Detalle:*",
    ...opts.items.map((i) => {
      const lineTotal = i.qty * i.price;
      return `• ${i.qty}x ${i.name} — $${i.price.toFixed(
        2
      )} c/u — *$${lineTotal.toFixed(2)}*`;
    }),
    "",
    `💰 *Total: $${subtotal.toFixed(2)}*`,
  ];

  return lines.join("\n");
}