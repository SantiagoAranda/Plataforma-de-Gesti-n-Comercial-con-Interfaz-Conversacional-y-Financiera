import { notFound } from "next/navigation";
import CommercialDocumentViewer from "@/src/components/commercial-documents/CommercialDocumentViewer";
import { makeFixture } from "@/src/components/commercial-documents/fixtures";

// Vista previa de desarrollo de los documentos comerciales; no existe en producción.
export default function DevDocumentosPage({ searchParams }: { searchParams: Promise<{ lineas?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  return <Preview searchParams={searchParams} />;
}

async function Preview({ searchParams }: { searchParams: Promise<{ lineas?: string }> }) {
  const extra = Math.min(Number((await searchParams).lineas) || 0, 200);
  const data = makeFixture(extra);
  return (
    <main className="mx-auto max-w-4xl space-y-10 p-4">
      <h1 className="text-lg font-bold">Documentos comerciales (solo desarrollo) · ?lineas=N agrega N filas</h1>
      <section><h2 className="mb-2 font-semibold">Cotización</h2><CommercialDocumentViewer kind="quotation" data={data} /></section>
      <section><h2 className="mb-2 font-semibold">Orden de entrega</h2><CommercialDocumentViewer kind="delivery" data={{ ...data, number: "OE-1024" }} /></section>
    </main>
  );
}
