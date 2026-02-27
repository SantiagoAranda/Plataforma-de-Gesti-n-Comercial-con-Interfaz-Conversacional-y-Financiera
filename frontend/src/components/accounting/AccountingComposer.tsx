"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { UiAccountingEntry } from "@/src/types/accounting-ui";
import {
  createMovement,
  getPuc,
  searchPuc,
  updateEntry,
  type MovementNature,
  getEntry,
  postEntry,
  voidEntry,
  type AccountingEntryStatus,
} from "@/src/services/accounting";
import {
  getPucGrupos,
  getPucCuentas,
  getPucSubcuentas,
  type PucClase,
  type PucGrupo,
  type PucCuenta,
  type PucSubcuenta,
} from "@/src/services/puc";

type NatureUI = "DEBITO" | "CREDITO";
type Mode = "RAPIDO" | "GUIADO";

type PucKind = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
type PucNode = {
  code: string;
  name: string;
  kind: PucKind;
  breadcrumbs: string[];
  pucDbKind?: "CUENTA" | "SUBCUENTA";
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function parseMoneyLike(input: string): number | null {
  const raw = input.trim();
  if (!raw) return null;

  const cleaned = raw.replace(/[^\d.,-]/g, "");
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  const decSep = Math.max(lastComma, lastDot);

  let normalized = cleaned;
  if (decSep !== -1) {
    const intPart = cleaned.slice(0, decSep).replace(/[.,]/g, "");
    const decPart = cleaned.slice(decSep + 1).replace(/[.,]/g, "");
    normalized = `${intPart}.${decPart}`;
  } else {
    normalized = cleaned.replace(/[.,]/g, "");
  }

  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function kindFromPucCode(code: string): PucKind {
  const first = (code ?? "").trim()[0];
  if (first === "1") return "ASSET";
  if (first === "2") return "LIABILITY";
  if (first === "3") return "EQUITY";
  if (first === "4") return "INCOME";
  return "EXPENSE"; // 5/6/7
}

function formatMoneySigned(n: number) {
  const sign = n >= 0 ? "+" : "−";
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}${formatted}`;
}

type Props = {
  searchValue: string;
  onSearchChange: (v: string) => void;

  editingEntry: UiAccountingEntry | null;
  onCancelEdit: () => void;

  onCreate: () => void | Promise<void>;
  onUpdate: () => void | Promise<void>;

  pucClases: PucClase[];
  pucGrupos: Array<{ code: string; name: string; claseCode: string }>;
  selectedClase: string;
  onSelectClase: (code: string) => void;
};

function StatusBadge({ status }: { status: AccountingEntryStatus }) {
  const cls =
    status === "DRAFT"
      ? "bg-zinc-100 text-zinc-700 border-zinc-200"
      : status === "POSTED"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : "bg-red-50 text-red-700 border-red-200";

  const label = status === "DRAFT" ? "Borrador" : status === "POSTED" ? "Publicado" : "Anulado";

  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold", cls)}>
      {label}
    </span>
  );
}

export function AccountingComposer({
  searchValue,
  onSearchChange,
  editingEntry,
  onCancelEdit,
  onCreate,
  onUpdate,
  pucClases,
  selectedClase,
  onSelectClase,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<Mode>("RAPIDO");

  const [value, setValue] = useState("");
  const [nature, setNature] = useState<NatureUI>("DEBITO");
  const [description, setDescription] = useState("");

  // Estado del asiento (real desde backend)
  const [entryStatus, setEntryStatus] = useState<AccountingEntryStatus>("DRAFT");
  const [statusLoading, setStatusLoading] = useState(false);

  // ---------- PUC (RÁPIDO) ----------
  const [pucQuery, setPucQuery] = useState("");
  const [pucItems, setPucItems] = useState<PucNode[]>([]);
  const [selectedPuc, setSelectedPuc] = useState<PucNode | null>(null);
  const [pucLoading, setPucLoading] = useState(false);
  const [pucOpen, setPucOpen] = useState(false);

  // ---------- GUIADO ----------
  const [grupos, setGrupos] = useState<PucGrupo[]>([]);
  const [selectedGrupo, setSelectedGrupo] = useState<string>("");

  const [cuentas, setCuentas] = useState<PucCuenta[]>([]);
  const [selectedCuenta, setSelectedCuenta] = useState<string>("");

  const [subcuentas, setSubcuentas] = useState<PucSubcuenta[]>([]);
  const [selectedSubcuenta, setSelectedSubcuenta] = useState<string>("");

  const [guidedLoading, setGuidedLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const descRef = useRef<HTMLInputElement | null>(null);
  const expandableRef = useRef<HTMLDivElement | null>(null);
  const [contentH, setContentH] = useState(0);
  const pucWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!expandableRef.current) return;
    const el = expandableRef.current;
    const ro = new ResizeObserver(() => setContentH(el.scrollHeight));
    ro.observe(el);
    setContentH(el.scrollHeight);
    return () => ro.disconnect();
  }, []);

  const amount = useMemo(() => parseMoneyLike(value), [value]);

  const previewSigned = useMemo(() => {
    if (!amount || amount <= 0) return null;
    return nature === "DEBITO" ? +amount : -amount;
  }, [amount, nature]);

  function setClase(code: string) {
    onSelectClase(code);
    setSelectedGrupo("");
    setSelectedCuenta("");
    setSelectedSubcuenta("");
    setGrupos([]);
    setCuentas([]);
    setSubcuentas([]);
    if (mode === "GUIADO") setSelectedPuc(null);
  }

  function resetForm() {
    setValue("");
    setNature("DEBITO");
    setDescription("");

    setSelectedPuc(null);
    setPucQuery("");
    setPucItems([]);
    setPucOpen(false);

    setSelectedGrupo("");
    setSelectedCuenta("");
    setSelectedSubcuenta("");
    setGrupos([]);
    setCuentas([]);
    setSubcuentas([]);

    setEntryStatus("DRAFT");
  }

  // cerrar dropdown PUC al click afuera
  useEffect(() => {
    if (!pucOpen) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!pucWrapRef.current?.contains(target)) setPucOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [pucOpen]);

  // ---------- EDIT: abre + carga asiento real (status) ----------
  useEffect(() => {
    if (!editingEntry) return;

    setExpanded(true);

    // precarga campos (como ya tenías)
    setNature(editingEntry.amount >= 0 ? "DEBITO" : "CREDITO");
    setValue(String(Math.abs(editingEntry.amount)));
    setDescription(editingEntry.description ?? "");

    const clase = (editingEntry.pucCode ?? "").trim()[0];
    if (clase) setClase(clase);

    if (editingEntry.pucCode) {
      const node: PucNode = {
        code: editingEntry.pucCode,
        name: editingEntry.accountName,
        kind: kindFromPucCode(editingEntry.pucCode),
        breadcrumbs: [],
      };
      setSelectedPuc(node);

      getPuc(editingEntry.pucCode)
        .then((info) =>
          setSelectedPuc((prev) => (prev ? { ...prev, pucDbKind: info.kind } : prev))
        )
        .catch(() => {});
    }

    // ✅ traer estado real del asiento
    (async () => {
      try {
        setStatusLoading(true);
        const entry = await getEntry(editingEntry.entryId);
        setEntryStatus(entry.status);
      } catch {
        // si falla, no rompas UI
      } finally {
        setStatusLoading(false);
      }
    })();

    requestAnimationFrame(() => descRef.current?.focus());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingEntry]);

  function toggleExpanded() {
    setExpanded((p) => {
      const next = !p;
      if (!next && editingEntry) onCancelEdit();
      if (next) requestAnimationFrame(() => descRef.current?.focus());
      return next;
    });
  }

  // ---------- RÁPIDO: search ----------
  useEffect(() => {
    if (!expanded) return;
    if (mode !== "RAPIDO") return;

    const q = pucQuery.trim();
    if (!q) {
      setPucItems([]);
      setPucLoading(false);
      return;
    }

    const t = setTimeout(() => {
      (async () => {
        try {
          setPucLoading(true);
          const found = await searchPuc(q);

          const filtered = selectedClase
            ? found.filter((x) => String(x.code ?? "").trim().startsWith(selectedClase))
            : found;

          const mapped: PucNode[] = filtered.map((x) => ({
            code: x.code,
            name: x.name,
            kind: kindFromPucCode(x.code),
            breadcrumbs: [],
            pucDbKind: x.kind,
          }));

          setPucItems(mapped);
          setPucOpen(true);
        } catch {
          setPucItems([]);
        } finally {
          setPucLoading(false);
        }
      })();
    }, 120);

    return () => clearTimeout(t);
  }, [pucQuery, selectedClase, expanded, mode]);

  async function handlePickPuc(node: PucNode) {
    setSelectedPuc(node);
    setPucOpen(false);

    if (!selectedClase) {
      const clase = (node.code ?? "").trim()[0];
      if (clase) setClase(clase);
    }

    if (node.pucDbKind) return;
    try {
      const info = await getPuc(node.code);
      setSelectedPuc((prev) => (prev ? { ...prev, pucDbKind: info.kind } : prev));
    } catch {}
  }

  // ---------- GUIADO: cascada ----------
  useEffect(() => {
    if (!expanded) return;
    if (mode !== "GUIADO") return;

    if (!selectedClase) {
      setGrupos([]);
      setSelectedGrupo("");
      setCuentas([]);
      setSelectedCuenta("");
      setSubcuentas([]);
      setSelectedSubcuenta("");
      setSelectedPuc(null);
      return;
    }

    (async () => {
      try {
        setGuidedLoading(true);
        const data = await getPucGrupos(selectedClase);
        setGrupos(data);
      } catch {
        setGrupos([]);
      } finally {
        setGuidedLoading(false);
      }
    })();
  }, [selectedClase, expanded, mode]);

  useEffect(() => {
    if (!expanded) return;
    if (mode !== "GUIADO") return;

    if (!selectedGrupo) {
      setCuentas([]);
      setSelectedCuenta("");
      setSubcuentas([]);
      setSelectedSubcuenta("");
      setSelectedPuc(null);
      return;
    }

    (async () => {
      try {
        setGuidedLoading(true);
        const data = await getPucCuentas(selectedGrupo);
        setCuentas(data);
      } catch {
        setCuentas([]);
      } finally {
        setGuidedLoading(false);
      }
    })();
  }, [selectedGrupo, expanded, mode]);

  useEffect(() => {
    if (!expanded) return;
    if (mode !== "GUIADO") return;

    if (!selectedCuenta) {
      setSubcuentas([]);
      setSelectedSubcuenta("");
      setSelectedPuc(null);
      return;
    }

    (async () => {
      try {
        setGuidedLoading(true);
        const data = await getPucSubcuentas(selectedCuenta);
        setSubcuentas(data);
      } catch {
        setSubcuentas([]);
      } finally {
        setGuidedLoading(false);
      }
    })();
  }, [selectedCuenta, expanded, mode]);

  // armar selectedPuc desde guiado
  useEffect(() => {
    if (mode !== "GUIADO") return;

    const code = selectedSubcuenta || selectedCuenta || "";
    if (!code) return;

    const name =
      (selectedSubcuenta && subcuentas.find((s) => s.code === selectedSubcuenta)?.name) ||
      (selectedCuenta && cuentas.find((c) => c.code === selectedCuenta)?.name) ||
      "";

    setSelectedPuc({
      code,
      name: name || "(sin nombre)",
      kind: kindFromPucCode(code),
      breadcrumbs: [],
      pucDbKind: selectedSubcuenta ? "SUBCUENTA" : "CUENTA",
    });
  }, [mode, selectedSubcuenta, selectedCuenta, subcuentas, cuentas]);

  const isEditing = !!editingEntry;

  // En tu backend, updateEntry solo si DRAFT
  const canEditFields = !isEditing || entryStatus === "DRAFT";

  const canSend =
    expanded &&
    !sending &&
    amount !== null &&
    amount > 0 &&
    !!selectedPuc?.code &&
    canEditFields;

  async function handleSend() {
    if (!canSend) return;
    if (!amount || !selectedPuc) return;

    setSending(true);
    try {
      const natureApi: MovementNature = nature === "DEBITO" ? "DEBIT" : "CREDIT";

      let resolvedKind = selectedPuc.pucDbKind;
      if (!resolvedKind) {
        const info = await getPuc(selectedPuc.code);
        resolvedKind = info.kind;
        setSelectedPuc((prev) => (prev ? { ...prev, pucDbKind: info.kind } : prev));
      }

      if (!editingEntry) {
        await createMovement({
          nature: natureApi,
          amount,
          description: description.trim() || undefined,
          ...(resolvedKind === "SUBCUENTA"
            ? { pucSubCode: selectedPuc.code }
            : { pucCuentaCode: selectedPuc.code }),
        });

        await onCreate();
        setExpanded(false);
        resetForm();
        return;
      }

      const debit = nature === "DEBITO" ? amount : 0;
      const credit = nature === "CREDITO" ? amount : 0;

      await updateEntry(editingEntry.entryId, {
        lines: [
          {
            ...(resolvedKind === "SUBCUENTA"
              ? { pucSubCode: selectedPuc.code }
              : { pucCuentaCode: selectedPuc.code }),
            description: description.trim() || undefined,
            debit,
            credit,
          },
        ],
      });

      await onUpdate();
      setExpanded(false);
      resetForm();
    } catch (err: any) {
      alert(err?.details?.message ?? err?.message ?? "No se pudo guardar el movimiento");
    } finally {
      setSending(false);
    }
  }

  async function handlePost() {
    if (!editingEntry) return;
    if (entryStatus !== "DRAFT") return;

    setStatusLoading(true);
    try {
      const updated = await postEntry(editingEntry.entryId);
      setEntryStatus(updated.status);
      await onUpdate(); // refrescar lista
    } catch (err: any) {
      alert(err?.details?.message ?? err?.message ?? "No se pudo postear el asiento");
    } finally {
      setStatusLoading(false);
    }
  }

  async function handleVoid() {
    if (!editingEntry) return;
    if (entryStatus === "VOID") return;

    setStatusLoading(true);
    try {
      const updated = await voidEntry(editingEntry.entryId);
      setEntryStatus(updated.status);
      await onUpdate(); // refrescar lista
    } catch (err: any) {
      alert(err?.details?.message ?? err?.message ?? "No se pudo anular el asiento");
    } finally {
      setStatusLoading(false);
    }
  }

  const inputBase =
    "w-full rounded-2xl border border-gray-200 bg-gray-50/70 px-4 py-3 text-sm outline-none focus:border-emerald-300 transition disabled:opacity-60 disabled:cursor-not-allowed";

  const miniToggleBase =
    "h-10 rounded-2xl border text-xs font-semibold px-3 whitespace-nowrap transition";
  const miniOn = "bg-emerald-50 border-emerald-200 text-emerald-700";
  const miniOff = "bg-white/70 border-gray-200 text-gray-700";

  const selectedLabel = selectedPuc
    ? `${selectedPuc.code} — ${selectedPuc.name} · ${selectedPuc.pucDbKind ?? "PUC"}`
    : "";

  return (
    <div className="fixed left-0 right-0 bottom-0 z-50 pb-[env(safe-area-inset-bottom)]">
      <div className="w-full">
        <div className="w-full rounded-none border-t border-white/40 bg-white/70 backdrop-blur-xl shadow-[0_-10px_25px_rgba(0,0,0,0.10)]">
          {/* EXPANDIBLE */}
          <div
            className="overflow-hidden transition-[max-height,opacity] duration-300 ease-out"
            style={{ maxHeight: expanded ? contentH : 0, opacity: expanded ? 1 : 0 }}
          >
            <div ref={expandableRef} className="px-5 pt-4 pb-4 space-y-3">
              {/* ASIENTO (solo en edición) */}
              {isEditing && (
                <div className="rounded-2xl border border-gray-200 bg-white/60 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[11px] font-semibold tracking-widest text-gray-500">
                      ASIENTO
                    </div>
                    <div className="flex items-center gap-2">
                      {statusLoading ? (
                        <span className="text-xs text-zinc-500">…</span>
                      ) : (
                        <StatusBadge status={entryStatus} />
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handlePost}
                      disabled={statusLoading || entryStatus !== "DRAFT"}
                      className={cn(
                        "flex-1 h-10 rounded-2xl text-xs font-semibold border transition",
                        entryStatus === "DRAFT"
                          ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                          : "bg-zinc-50 border-zinc-200 text-zinc-500"
                      )}
                    >
                      Postear
                    </button>

                    <button
                      type="button"
                      onClick={handleVoid}
                      disabled={statusLoading || entryStatus === "VOID"}
                      className={cn(
                        "flex-1 h-10 rounded-2xl text-xs font-semibold border transition",
                        entryStatus !== "VOID"
                          ? "bg-red-50 border-red-200 text-red-700"
                          : "bg-zinc-50 border-zinc-200 text-zinc-500"
                      )}
                    >
                      Anular
                    </button>
                  </div>

                  {entryStatus !== "DRAFT" && (
                    <div className="mt-2 text-xs text-zinc-500">
                      Este asiento no es editable porque está{" "}
                      <span className="font-semibold">{entryStatus}</span>.
                    </div>
                  )}
                </div>
              )}

              {/* CLASE */}
              <div>
                <div className="text-[11px] font-semibold tracking-widest text-gray-500">
                  CLASE
                </div>
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  {(pucClases ?? []).map((c) => (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => setClase(c.code)}
                      disabled={!canEditFields}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-xs border transition whitespace-nowrap",
                        selectedClase === c.code
                          ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                          : "bg-white/70 border-gray-200 text-gray-700",
                        !canEditFields && "opacity-60 cursor-not-allowed"
                      )}
                    >
                      {c.code} · {c.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* FILA: PUC + MODE */}
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0" ref={pucWrapRef}>
                  <div className="text-[11px] font-semibold tracking-widest text-gray-500">
                    CÓDIGO PUC
                  </div>

                  {mode === "RAPIDO" ? (
                    <div className="relative mt-2">
                      <input
                        value={pucQuery}
                        onChange={(e) => {
                          setPucQuery(e.target.value);
                          if (!pucOpen) setPucOpen(true);
                        }}
                        onFocus={() => {
                          if (pucQuery.trim()) setPucOpen(true);
                        }}
                        placeholder="Buscar (código o nombre)…"
                        className={cn(inputBase, "h-11")}
                        disabled={!canEditFields}
                      />

                      {pucOpen && canEditFields && (
                        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50">
                          <div className="rounded-2xl border border-gray-200 bg-white shadow-lg overflow-hidden">
                            <div className="px-3 py-2 text-xs text-gray-500 flex items-center justify-between">
                              <span>{pucLoading ? "Buscando..." : "Resultados"}</span>
                              {selectedPuc ? (
                                <button
                                  type="button"
                                  className="text-emerald-700 font-semibold"
                                  onClick={() => setSelectedPuc(null)}
                                >
                                  Limpiar
                                </button>
                              ) : null}
                            </div>

                            {pucItems.length === 0 ? (
                              <div className="px-3 pb-3 text-sm text-gray-500">
                                {pucQuery.trim() ? "Sin resultados" : "Escribí para buscar"}
                              </div>
                            ) : (
                              <div className="max-h-56 overflow-auto">
                                {pucItems.slice(0, 12).map((x) => (
                                  <button
                                    key={x.code}
                                    type="button"
                                    className="w-full text-left px-3 py-3 border-t border-gray-100 hover:bg-gray-50"
                                    onClick={() => handlePickPuc(x)}
                                  >
                                    <div className="text-sm font-semibold text-zinc-900">
                                      {x.code} — {x.name}
                                    </div>
                                    <div className="text-xs text-zinc-500">
                                      {(x.pucDbKind ?? "PUC")} · {x.kind}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-2 space-y-2">
                      <select
                        className={cn(inputBase, "h-11")}
                        value={selectedGrupo}
                        onChange={(e) => setSelectedGrupo(e.target.value)}
                        disabled={!selectedClase || guidedLoading || !canEditFields}
                      >
                        <option value="">{selectedClase ? "Grupo..." : "Elegí clase primero"}</option>
                        {grupos.map((g) => (
                          <option key={g.code} value={g.code}>
                            {g.code} — {g.name}
                          </option>
                        ))}
                      </select>

                      <select
                        className={cn(inputBase, "h-11")}
                        value={selectedCuenta}
                        onChange={(e) => setSelectedCuenta(e.target.value)}
                        disabled={!selectedGrupo || guidedLoading || !canEditFields}
                      >
                        <option value="">{selectedGrupo ? "Cuenta..." : "Elegí grupo primero"}</option>
                        {cuentas.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.code} — {c.name}
                          </option>
                        ))}
                      </select>

                      <select
                        className={cn(inputBase, "h-11")}
                        value={selectedSubcuenta}
                        onChange={(e) => setSelectedSubcuenta(e.target.value)}
                        disabled={!selectedCuenta || guidedLoading || subcuentas.length === 0 || !canEditFields}
                      >
                        <option value="">
                          {selectedCuenta
                            ? subcuentas.length
                              ? "Subcuenta (opcional)..."
                              : "Sin subcuentas (usa cuenta)"
                            : "Elegí cuenta primero"}
                        </option>
                        {subcuentas.map((s) => (
                          <option key={s.code} value={s.code}>
                            {s.code} — {s.name}
                          </option>
                        ))}
                      </select>

                      {guidedLoading ? (
                        <div className="text-xs text-zinc-500">Cargando opciones…</div>
                      ) : null}
                    </div>
                  )}

                  {selectedPuc ? (
                    <div className="mt-2 text-xs text-zinc-600 truncate">{selectedLabel}</div>
                  ) : (
                    <div className="mt-2 text-xs text-zinc-500">Seleccioná una cuenta/subcuenta.</div>
                  )}
                </div>

                <div className="shrink-0 pt-[18px] flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setMode("RAPIDO")}
                    className={cn(miniToggleBase, mode === "RAPIDO" ? miniOn : miniOff)}
                  >
                    Rápido
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("GUIADO")}
                    className={cn(miniToggleBase, mode === "GUIADO" ? miniOn : miniOff)}
                  >
                    Guiado
                  </button>
                </div>
              </div>

              {/* FILA: VALOR + NATURALEZA */}
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold tracking-widest text-gray-500">
                    VALOR
                  </div>
                  <input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="0,00"
                    inputMode="decimal"
                    className={cn(inputBase, "h-11 mt-2")}
                    disabled={!canEditFields}
                  />
                </div>

                <div className="shrink-0">
                  <div className="text-[11px] font-semibold tracking-widest text-gray-500">
                    NAT.
                  </div>
                  <div className={cn("mt-2 flex items-center rounded-2xl border border-gray-200 bg-white/70 p-1", !canEditFields && "opacity-60")}>
                    <button
                      type="button"
                      onClick={() => setNature("DEBITO")}
                      disabled={!canEditFields}
                      className={cn(
                        "rounded-2xl px-3 py-2 text-xs font-semibold transition",
                        nature === "DEBITO" ? "bg-emerald-400 text-emerald-950" : "text-gray-600"
                      )}
                    >
                      Débito
                    </button>
                    <button
                      type="button"
                      onClick={() => setNature("CREDITO")}
                      disabled={!canEditFields}
                      className={cn(
                        "rounded-2xl px-3 py-2 text-xs font-semibold transition",
                        nature === "CREDITO" ? "bg-emerald-400 text-emerald-950" : "text-gray-600"
                      )}
                    >
                      Crédito
                    </button>
                  </div>
                </div>
              </div>

              {/* subtítulo discreto */}
              <div className="text-xs text-zinc-500">
                {previewSigned === null ? (
                  "Elegí débito/crédito. El signo se verá al listar el movimiento."
                ) : (
                  <>
                    Resultado:{" "}
                    <span
                      className={cn(
                        "font-semibold tabular-nums",
                        previewSigned >= 0 ? "text-emerald-600" : "text-red-600"
                      )}
                    >
                      {formatMoneySigned(previewSigned)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* BARRA INFERIOR */}
          <div className="px-5 py-4 border-t border-white/30">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={toggleExpanded}
                className="h-12 w-12 rounded-full border border-gray-200 bg-white/70 flex items-center justify-center text-xl text-gray-700"
                aria-label={expanded ? "Cerrar" : "Abrir"}
              >
                {expanded ? "×" : "+"}
              </button>

              <div className="flex-1">
                {expanded ? (
                  <input
                    ref={descRef}
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={editingEntry ? "Editar descripción..." : "Descripción del movimiento"}
                    className="w-full h-11 px-4 rounded-full bg-white border border-gray-300 text-sm outline-none disabled:opacity-60"
                    disabled={!canEditFields}
                  />
                ) : (
                  <input
                    type="text"
                    value={searchValue}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Buscar movimiento..."
                    className="w-full h-11 px-4 rounded-full bg-gray-100 text-sm outline-none"
                  />
                )}
              </div>

              <button
                type="button"
                onClick={handleSend}
                aria-label={editingEntry ? "Guardar" : "Enviar"}
                className="shrink-0 aspect-square h-12 w-12 rounded-full bg-emerald-500 text-white grid place-items-center active:scale-95 transition disabled:opacity-50"
                disabled={!canSend}
                title={
                  !canEditFields && isEditing
                    ? "El asiento no es editable (solo DRAFT)"
                    : !selectedPuc && expanded
                    ? "Seleccioná un PUC"
                    : undefined
                }
              >
                {sending ? (
                  <span className="text-xs font-semibold">...</span>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-5 w-5 block" fill="currentColor" aria-hidden="true">
                    <path d="M8 5v14l13-7-13-7z" />
                  </svg>
                )}
              </button>
            </div>

            {editingEntry && (
              <div className="mt-2 px-1 text-xs text-neutral-500">
                Editando: <span className="font-medium">{editingEntry.pucCode}</span>
                <button
                  type="button"
                  className="ml-3 text-red-600 font-semibold"
                  onClick={() => {
                    onCancelEdit();
                    setExpanded(false);
                    resetForm();
                  }}
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}