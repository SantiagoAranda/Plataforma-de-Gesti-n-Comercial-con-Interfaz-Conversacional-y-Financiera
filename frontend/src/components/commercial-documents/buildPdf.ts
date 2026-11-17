import type { DocumentFormat, TicketWidth } from "./types";

// Tope de píxeles por captura: evita superar el límite de canvas del móvil y dispara menos memoria.
const MAX_PX = 8e6;

/**
 * Convierte la vista ya renderizada (`.sheet-carta` o `.sheet-ticket`) en PDF.
 * Carta: una página letter por hoja. Ticket: una página del alto exacto del contenido.
 */
export async function buildPdfBlob(source: HTMLElement, format: DocumentFormat, width: TicketWidth): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);

  // Se captura una copia fuera de pantalla: la vista puede estar escalada con `transform`.
  const stage = document.createElement("div");
  stage.style.cssText = "position:fixed;left:-10000px;top:0;background:#fff";
  const copy = source.cloneNode(true) as HTMLElement;
  copy.style.transform = "none";
  copy.querySelector(".cd-measure")?.remove(); // contiene una hoja oculta que no debe salir como página
  stage.appendChild(copy);
  document.body.appendChild(stage);

  try {
    await document.fonts?.ready;
    const grab = (el: HTMLElement) =>
      html2canvas(el, {
        scale: Math.max(1, Math.min(3, Math.sqrt(MAX_PX / (el.offsetWidth * el.offsetHeight)))),
        backgroundColor: "#ffffff",
        logging: false,
        onclone: (doc) => doc.querySelectorAll<HTMLElement>(".sheet-carta").forEach((e) => (e.style.boxShadow = "none")),
      });

    if (format === "carta") {
      const sheets = copy.querySelectorAll<HTMLElement>(".sheet-carta");
      if (!sheets.length) throw new Error("El documento todavía no está listo");
      const pdf = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait", compress: true });
      for (let i = 0; i < sheets.length; i++) {
        const canvas = await grab(sheets[i]);
        if (i > 0) pdf.addPage("letter", "portrait");
        pdf.addImage(canvas, "PNG", 0, 0, 612, 792, undefined, "FAST");
      }
      return pdf.output("blob");
    }

    const ticket = copy.querySelector<HTMLElement>(".sheet-ticket");
    if (!ticket) throw new Error("El documento todavía no está listo");
    const canvas = await grab(ticket);
    const heightMm = (width * canvas.height) / canvas.width;
    const pdf = new jsPDF({ unit: "mm", format: [width, heightMm], orientation: "portrait", compress: true });
    pdf.addImage(canvas, "PNG", 0, 0, width, heightMm, undefined, "FAST");
    return pdf.output("blob");
  } finally {
    stage.remove();
  }
}

/** Comparte el PDF si el dispositivo lo permite; si no, lo descarga. */
export async function shareOrDownload(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: "application/pdf" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
  }
  downloadBlob(blob, filename);
}

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
