export function buildWhatsAppUrl(phoneE164: string, message: string) {
  const clean = phoneE164.replace(/[^\d]/g, "");
  const text = encodeURIComponent(message);
  return `https://wa.me/${clean}?text=${text}`;
}

export function formatSaleMessage(opts: {
  businessName?: string;
  customerName: string;
  type?: "PRODUCTO" | "SERVICIO";
  scheduledAt?: string;
  items: { qty: number; name: string; price: number }[];
}) {
  const total = opts.items.reduce((acc, i) => acc + (i.price || 0), 0);
  const isService = opts.type === "SERVICIO";
  const scheduledLabel = opts.scheduledAt
    ? new Date(opts.scheduledAt).toLocaleString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const lines = isService
    ? [
        `Hola, *${opts.customerName}*. Te compartimos el detalle de tu reserva${opts.businessName ? ` en *${opts.businessName}*` : ""}:`,
        "",
        ...opts.items.map((i) => `- Servicio: ${i.name}`),
        ...(scheduledLabel ? ["", `*Turno:* ${scheduledLabel}`] : []),
        "",
        `*Total: $${total.toLocaleString("es-CO", { minimumFractionDigits: 0 })}*`,
        "",
        "Gracias. Te esperamos.",
      ]
    : [
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
