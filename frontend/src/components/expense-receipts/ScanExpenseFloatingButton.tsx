"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Camera,
  Check,
  FileImage,
  Loader2,
  ReceiptText,
  Search,
  X,
} from "lucide-react";
import {
  createManualExpenseReceipt,
  getExpenseReceipt,
  postExpenseReceipt,
  scanExpenseReceipt,
  updateExpenseReceipt,
  type ExpenseAccountingType,
  type ExpenseCategory,
  type ExpenseReceipt,
  type ExpenseReceiptPayload,
} from "@/src/services/expenseReceipts";
import { searchPuc, type PucSearchResult } from "@/src/services/puc";
import { cn } from "@/src/lib/utils";

const CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: "SERVICES", label: "Servicios" },
  { value: "RENT", label: "Alquiler" },
  { value: "MARKETING", label: "Marketing" },
  { value: "PROFESSIONAL_FEES", label: "Honorarios" },
  { value: "FOOD", label: "Comida" },
  { value: "TRANSPORT", label: "Transporte" },
  { value: "MAINTENANCE", label: "Mantenimiento" },
  { value: "OTHER", label: "Otros" },
];

const FIELD_INPUT =
  "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100 disabled:bg-neutral-100";

type FormState = {
  amount: string;
  paidAt: string;
  destinationName: string;
  destinationBank: string;
  destinationAccount: string;
  bankName: string;
  reference: string;
  description: string;
  accountingType: ExpenseAccountingType | "";
  category: ExpenseCategory | "";
  pucKind: "CUENTA" | "SUBCUENTA" | "";
  pucCode: string;
  pucLabel: string;
};

const emptyForm: FormState = {
  amount: "",
  paidAt: new Date().toISOString().slice(0, 10),
  destinationName: "",
  destinationBank: "",
  destinationAccount: "",
  bankName: "",
  reference: "",
  description: "",
  accountingType: "",
  category: "",
  pucKind: "",
  pucCode: "",
  pucLabel: "",
};

export default function ScanExpenseFloatingButton() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<"help" | "processing" | "review" | "done">("help");
  const [receipt, setReceipt] = useState<ExpenseReceipt | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [pucQuery, setPucQuery] = useState("");
  const [pucResults, setPucResults] = useState<PucSearchResult[]>([]);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const isBusinessUser = useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      const user = JSON.parse(localStorage.getItem("user") || "null");
      return user?.role === "BUSINESS" || Boolean(user?.businessId);
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (!receipt?.id || receipt.status !== "PROCESSING") return;

    const startedAt = Date.now();
    const interval = window.setInterval(async () => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(seconds);

      try {
        const next = await getExpenseReceipt(receipt.id);
        setReceipt(next);

        if (next.status === "READY_FOR_REVIEW" || next.status === "DRAFT") {
          setForm(formFromReceipt(next));
          setStep("review");
          window.clearInterval(interval);
        }

        if (next.status === "FAILED") {
          setError("No pudimos leer el comprobante automaticamente. Puedes registrar el gasto manualmente.");
          setForm(formFromReceipt(next));
          setStep("review");
          window.clearInterval(interval);
        }
      } catch (err) {
        setError(errorMessage(err));
      }
    }, 2000);

    return () => window.clearInterval(interval);
  }, [receipt?.id, receipt?.status]);

  useEffect(() => {
    if (!form.accountingType || pucQuery.trim().length < 2) {
      setPucResults([]);
      return;
    }

    const timeout = window.setTimeout(async () => {
      try {
        const type = form.accountingType || undefined;
        setPucResults(await searchPuc(pucQuery, type));
      } catch {
        setPucResults([]);
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [pucQuery, form.accountingType]);

  if (!isBusinessUser) return null;

  function openSheet() {
    setVisible(true);
    setStep("help");
    setError("");
  }

  async function handleFile(file?: File | null) {
    if (!file) {
      setError(cameraErrorMessage());
      return;
    }

    setUploading(true);
    setError("");
    setStep("processing");
    setElapsed(0);

    try {
      const compressed = await compressImage(file);
      const created = await scanExpenseReceipt(compressed);
      setReceipt({
        id: created.id,
        status: created.status,
        source: "OCR",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      setError(errorMessage(err));
      setStep("review");
      setReceipt(null);
      setForm(emptyForm);
    } finally {
      setUploading(false);
    }
  }

  function startManual() {
    setReceipt(null);
    setForm(emptyForm);
    setError("");
    setStep("review");
  }

  async function saveAndPost() {
    const payload = payloadFromForm(form);
    if (!payload.amount || !payload.paidAt || !payload.accountingType || !payload.category) {
      setError("Completa monto, fecha, tipo y categoria.");
      return;
    }
    if (!payload.pucCuentaCode && !payload.pucSubcuentaId) {
      setError("Selecciona una cuenta PUC real.");
      return;
    }

    setPosting(true);
    setError("");

    try {
      const current = receipt
        ? await updateExpenseReceipt(receipt.id, payload)
        : await createManualExpenseReceipt(payload);
      const posted = await postExpenseReceipt(current.id);
      setReceipt(posted);
      setStep("done");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPosting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        className="fixed bottom-24 right-4 z-40 flex items-center gap-2 rounded-full bg-neutral-950 px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(0,0,0,0.22)] lg:hidden"
      >
        <ReceiptText className="h-4 w-4" />
        Escanear gasto
      </button>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />

      {visible && (
        <div className="fixed inset-0 z-[70] flex items-end bg-black/30 lg:hidden">
          <div className="max-h-[88vh] w-full overflow-y-auto rounded-t-3xl bg-white px-4 pb-6 pt-3 shadow-2xl">
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-neutral-200" />
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-neutral-950">
                  {step === "help" ? "Escanea un comprobante" : "Escanear gasto"}
                </h2>
                {step !== "help" && (
                  <p className="text-xs text-neutral-500">
                    Informacion detectada automaticamente. Revisala antes de registrar.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setVisible(false)}
                className="rounded-full p-2 text-neutral-500 hover:bg-neutral-100"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {step === "help" && (
              <div className="space-y-4">
                <p className="text-sm leading-6 text-neutral-600">
                  Puedes tomar una foto o subir una imagen desde tu galeria. La imagen se usa solo para leer los datos del comprobante y no se guarda permanentemente.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex items-center justify-center gap-2 rounded-2xl bg-neutral-950 px-4 py-3 text-sm font-semibold text-white"
                  >
                    <Camera className="h-4 w-4" />
                    Tomar foto
                  </button>
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    className="flex items-center justify-center gap-2 rounded-2xl border border-neutral-200 px-4 py-3 text-sm font-semibold text-neutral-800"
                  >
                    <FileImage className="h-4 w-4" />
                    Subir imagen
                  </button>
                </div>
                <button
                  type="button"
                  onClick={startManual}
                  className="w-full rounded-2xl bg-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-700"
                >
                  Cargar manualmente
                </button>
              </div>
            )}

            {step === "processing" && (
              <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
                <div className="flex items-start gap-3">
                  <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-green-600" />
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">
                      {uploading ? "Subiendo comprobante..." : "Procesando comprobante..."}
                    </p>
                    <p className="mt-1 text-sm text-neutral-600">
                      Estamos leyendo monto, fecha y referencia.
                    </p>
                    {elapsed >= 10 && elapsed < 25 && (
                      <p className="mt-3 text-sm text-amber-700">
                        Esta tardando mas de lo normal. Puedes esperar o cargar los datos manualmente.
                      </p>
                    )}
                    {elapsed >= 10 && (
                      <button
                        type="button"
                        onClick={startManual}
                        className="mt-3 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-neutral-800 shadow-sm"
                      >
                        Cargar manualmente
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {step === "review" && (
              <div className="space-y-4">
                {receipt?.duplicateWarning && (
                  <div className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-800">
                    {receipt.duplicateWarning}
                  </div>
                )}
                {error && (
                  <div className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Monto">
                    <input
                      value={form.amount}
                      onChange={(event) => setFormValue("amount", event.target.value)}
                      inputMode="decimal"
                      className={FIELD_INPUT}
                      placeholder="0"
                    />
                  </Field>
                  <Field label="Fecha">
                    <input
                      value={form.paidAt}
                      onChange={(event) => setFormValue("paidAt", event.target.value)}
                      type="date"
                      className={FIELD_INPUT}
                    />
                  </Field>
                </div>

                <Field label="Para quien es">
                  <input value={form.destinationName} onChange={(event) => setFormValue("destinationName", event.target.value)} className={FIELD_INPUT} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Banco detectado">
                    <input value={form.bankName} onChange={(event) => setFormValue("bankName", event.target.value)} className={FIELD_INPUT} />
                  </Field>
                  <Field label="Banco destino">
                    <input value={form.destinationBank} onChange={(event) => setFormValue("destinationBank", event.target.value)} className={FIELD_INPUT} />
                  </Field>
                </div>
                <Field label="Cuenta destino">
                  <input value={form.destinationAccount} onChange={(event) => setFormValue("destinationAccount", event.target.value)} className={FIELD_INPUT} />
                </Field>
                <Field label="Referencia / comprobante">
                  <input value={form.reference} onChange={(event) => setFormValue("reference", event.target.value)} className={FIELD_INPUT} />
                </Field>
                <Field label="Descripcion">
                  <textarea value={form.description} onChange={(event) => setFormValue("description", event.target.value)} className={cn(FIELD_INPUT, "min-h-20 resize-none")} />
                </Field>

                <div>
                  <p className="mb-2 text-sm font-semibold text-neutral-900">Que quieres registrar?</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(["EXPENSE", "COST"] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          setForm((current) => ({
                            ...current,
                            accountingType: type,
                            pucCode: "",
                            pucKind: "",
                            pucLabel: "",
                          }));
                          setPucQuery("");
                        }}
                        className={cn(
                          "rounded-2xl border px-4 py-3 text-sm font-semibold",
                          form.accountingType === type
                            ? "border-green-600 bg-green-50 text-green-700"
                            : "border-neutral-200 text-neutral-700",
                        )}
                      >
                        {type === "EXPENSE" ? "Gasto" : "Costo"}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-semibold text-neutral-900">Selecciona una categoria</p>
                  <div className="grid grid-cols-2 gap-2">
                    {CATEGORIES.map((category) => (
                      <button
                        key={category.value}
                        type="button"
                        onClick={() => setFormValue("category", category.value)}
                        className={cn(
                          "rounded-xl border px-3 py-2 text-sm",
                          form.category === category.value
                            ? "border-green-600 bg-green-50 text-green-700"
                            : "border-neutral-200 text-neutral-700",
                        )}
                      >
                        {category.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-semibold text-neutral-900">Buscar cuenta PUC</p>
                  {form.pucLabel && (
                    <div className="mb-2 flex items-center justify-between rounded-xl bg-green-50 px-3 py-2 text-sm text-green-800">
                      <span>{form.pucLabel}</span>
                      <button type="button" onClick={() => setForm((current) => ({ ...current, pucCode: "", pucKind: "", pucLabel: "" }))}>
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-neutral-400" />
                    <input
                      value={pucQuery}
                      onChange={(event) => setPucQuery(event.target.value)}
                      disabled={!form.accountingType}
                      className={cn(FIELD_INPUT, "pl-9")}
                      placeholder="Codigo PUC o nombre"
                    />
                  </div>
                  {pucResults.length > 0 && (
                    <div className="mt-2 max-h-44 overflow-y-auto rounded-2xl border border-neutral-200">
                      {pucResults.map((result) => (
                        <button
                          key={`${result.kind}-${result.code}`}
                          type="button"
                          onClick={() => selectPuc(result)}
                          className="block w-full border-b border-neutral-100 px-3 py-2 text-left text-sm last:border-0"
                        >
                          <span className="font-semibold">{result.code}</span>
                          <span className="text-neutral-600"> - {result.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => void saveAndPost()}
                  disabled={posting}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-neutral-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {form.accountingType === "COST" ? "Registrar costo" : "Registrar gasto"}
                </button>
              </div>
            )}

            {step === "done" && (
              <div className="rounded-2xl bg-green-50 p-4 text-sm font-semibold text-green-800">
                Comprobante registrado en contabilidad.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );

  function setFormValue<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function selectPuc(result: PucSearchResult) {
    setForm((current) => ({
      ...current,
      pucKind: result.kind,
      pucCode: result.code,
      pucLabel: `${result.code} - ${result.name}`,
    }));
    setPucQuery("");
    setPucResults([]);
  }
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-500">{label}</span>
      {children}
    </label>
  );
}

function formFromReceipt(receipt: ExpenseReceipt): FormState {
  return {
    ...emptyForm,
    amount: receipt.amount ? String(receipt.amount) : "",
    paidAt: receipt.paidAt ? receipt.paidAt.slice(0, 10) : emptyForm.paidAt,
    destinationName: receipt.destinationName ?? "",
    destinationBank: receipt.destinationBank ?? "",
    destinationAccount: receipt.destinationAccount ?? "",
    bankName: receipt.bankName ?? "",
    reference: receipt.reference ?? "",
    description: receipt.description ?? "",
    accountingType: receipt.accountingType ?? "",
    category: receipt.category ?? "",
    pucKind: receipt.pucSubcuentaId ? "SUBCUENTA" : receipt.pucCuentaCode ? "CUENTA" : "",
    pucCode: receipt.pucSubcuentaId ?? receipt.pucCuentaCode ?? "",
    pucLabel: receipt.pucSubcuentaId ?? receipt.pucCuentaCode ?? "",
  };
}

function payloadFromForm(form: FormState): ExpenseReceiptPayload {
  return {
    amount: Number(form.amount.replace(/\./g, "").replace(",", ".")),
    paidAt: new Date(`${form.paidAt}T12:00:00`).toISOString(),
    destinationName: nullable(form.destinationName),
    destinationBank: nullable(form.destinationBank),
    destinationAccount: nullable(form.destinationAccount),
    bankName: nullable(form.bankName),
    reference: nullable(form.reference),
    description: nullable(form.description),
    accountingType: form.accountingType || undefined,
    category: form.category || undefined,
    pucCuentaCode: form.pucKind === "CUENTA" ? form.pucCode : null,
    pucSubcuentaId: form.pucKind === "SUBCUENTA" ? form.pucCode : null,
  };
}

function nullable(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function compressImage(file: File) {
  if (!file.type.startsWith("image/") || file.type === "image/heic" || file.type === "image/heif") {
    return file;
  }

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;

  const maxWidth = 1600;
  const scale = Math.min(1, maxWidth / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) return file;
  context.drawImage(bitmap, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.75);
  });

  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
    type: "image/jpeg",
  });
}

function cameraErrorMessage() {
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(userAgent)) {
    return "Si usas iPhone desde la pantalla de inicio y la camara falla, abre la plataforma desde Safari e intenta nuevamente.";
  }
  return "No se pudo abrir la camara. Permite el acceso cuando el navegador lo solicite o sube una imagen desde tu galeria.";
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Ocurrio un error inesperado.";
}
