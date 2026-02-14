import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Sale } from "@/src/types/sales";

function money(n: number) {
    return n.toFixed(2);
}

function calcTotal(sale: Sale) {
    return sale.items.reduce((acc, it) => acc + it.price, 0);
}

function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleString([], {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function generateInvoicePdf(opts: {
    sale: Sale;
    businessName: string;
    businessPhone?: string;
    invoiceNumber?: string;
    currencySymbol?: string; // "$"
}) {
    const { sale, businessName, businessPhone, invoiceNumber, currencySymbol = "$" } = opts;

    const doc = new jsPDF({ unit: "pt", format: "a4" });

    const total = calcTotal(sale);
    const invoiceId = invoiceNumber ?? `#${sale.id}`;
    const createdAt = formatDate(sale.createdAt);

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("FACTURA / ORDEN", 40, 60);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Nro: ${invoiceId}`, 40, 80);
    doc.text(`Fecha: ${createdAt}`, 40, 95);

    doc.setFontSize(10);
    doc.text(`Negocio: ${businessName}`, 40, 120);
    if (businessPhone) doc.text(`Tel: ${businessPhone}`, 40, 135);

    doc.text(`Cliente: ${sale.customerName}`, 40, 160);
    doc.text(`Tipo: ${sale.type === "PRODUCTO" ? "Producto" : "Servicio"}`, 40, 175);
    doc.text(`Estado: ${sale.status}`, 40, 190);

    // Table
    const rows = sale.items.map((it) => [
        sale.type === "PRODUCTO" ? String(it.qty) : "1",
        it.name,
        `${currencySymbol}${money(it.price)}`,
    ]);

    autoTable(doc, {
        startY: 220,
        head: [["CANT.", "DESCRIPCIÓN", "PRECIO"]],
        body: rows,
        styles: { font: "helvetica", fontSize: 10, cellPadding: 6 },
        headStyles: { fillColor: [245, 245, 245], textColor: 20 },
        columnStyles: {
            0: { halign: "center", cellWidth: 60 },
            1: { cellWidth: 360 },
            2: { halign: "right", cellWidth: 100 },
        },
        theme: "grid",
    });

    const finalY = (doc as any).lastAutoTable?.finalY ?? 220;

    // Total
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("TOTAL", 40, finalY + 30);
    doc.text(`${currencySymbol}${money(total)}`, 500, finalY + 30, { align: "right" });

    // Nota: sin pago
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Nota: El pago se realiza fuera del sistema.", 40, finalY + 55);

    // Save
    const safeCustomer = sale.customerName.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_");
    doc.save(`Factura_${invoiceId}_${safeCustomer}.pdf`);
}
