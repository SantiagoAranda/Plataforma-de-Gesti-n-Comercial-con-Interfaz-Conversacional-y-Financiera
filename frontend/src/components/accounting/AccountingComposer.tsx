
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  getPuc,
  searchPuc,
  updateEntry,
  getEntry,
  postEntry,
  voidEntry,
  type AccountingEntryStatus,
  createEntry,
  type CreateLineDto,
  type AccountingEntryDto,
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
type ComposerMode = "create" | "edit" | "detail";
export type ComposerEditingEntry = { entryId: string; pucCode?: string } | null;

type PucKind = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
type PucNode = {
  code: string;
  name: string;
  kind: PucKind;
  breadcrumbs: string[];
  pucDbKind?: "CUENTA" | "SUBCUENTA";
};

type Props = {
  searchValue: string;
  onSearchChange: (v: string) => void;

  composerMode: ComposerMode | null;
  editingEntry: ComposerEditingEntry;
  onEnterCreate: () => void;
  onClose: () => void;

  onCreate: () => void | Promise<void>;
  onUpdate: () => void | Promise<void>;

  pucClases: PucClase[];
  selectedClase: string;
  onSelectClase: (code: string) => void;
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
  return "EXPENSE";
}

function formatARS(n: number) {
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object") {
    const details = (err as { details?: { message?: string } }).details;
    if (details && typeof details.message === "string") return details.message;
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return fallback;
}

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
  composerMode,
  editingEntry,
  onEnterCreate,
  onClose,
  onCreate,
  onUpdate,
  pucClases,
  selectedClase,
  onSelectClase,
}: Props) {
  const [mode, setMode] = useState<Mode>("RAPIDO");

  const [memo, setMemo] = useState("");
  const [dateISO, setDateISO] = useState<string>(todayISO());

  const [entryStatus, setEntryStatus] = useState<AccountingEntryStatus>("DRAFT");
  const [statusLoading, setStatusLoading] = useState(false);

  const [lines, setLines] = useState<CreateLineDto[]>([]);

  const [value, setValue] = useState("");
  const [nature, setNature] = useState<NatureUI>("DEBITO");
  const [lineDesc, setLineDesc] = useState("");

  const [pucQuery, setPucQuery] = useState("");
  const [pucItems, setPucItems] = useState<PucNode[]>([]);
  const [selectedPuc, setSelectedPuc] = useState<PucNode | null>(null);
  const [pucLoading, setPucLoading] = useState(false);
  const [pucOpen, setPucOpen] = useState(false);
  const pucWrapRef = useRef<HTMLDivElement | null>(null);

  const [grupos, setGrupos] = useState<PucGrupo[]>([]);
  const [selectedGrupo, setSelectedGrupo] = useState<string>("");

  const [cuentas, setCuentas] = useState<PucCuenta[]>([]);
  const [selectedCuenta, setSelectedCuenta] = useState<string>("");

  const [subcuentas, setSubcuentas] = useState<PucSubcuenta[]>([]);
  const [selectedSubcuenta, setSelectedSubcuenta] = useState<string>("");

  const [guidedLoading, setGuidedLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const expandableRef = useRef<HTMLDivElement | null>(null);
  const [contentH, setContentH] = useState(0);

  const MAX_SHEET = "calc(100dvh - 92px)";

  const isOpen = composerMode !== null;
  const isCreating = composerMode === "create";
  const isEditing = composerMode === "edit";
  const canEditFields = (isCreating || isEditing) && (isCreating || entryStatus === "DRAFT");

  useEffect(() => {
    if (!expandableRef.current) return;
    const el = expandableRef.current;
    const ro = new ResizeObserver(() => setContentH(el.scrollHeight));
    ro.observe(el);
    setContentH(el.scrollHeight);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const amount = useMemo(() => parseMoneyLike(value), [value]);

  const totals = useMemo(() => {
    const totalDebit = lines.reduce((s, l) => s + Number(l.debit ?? 0), 0);
    const totalCredit = lines.reduce((s, l) => s + Number(l.credit ?? 0), 0);
    const diff = totalDebit - totalCredit;
    return { totalDebit, totalCredit, diff };
  }, [lines]);

  const resetAll = useCallback(() => {
    setMemo("");
    setDateISO(todayISO());
    setEntryStatus("DRAFT");
    setLines([]);

    setValue("");
    setNature("DEBITO");
    setLineDesc("");

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
  }, []);

  const setClase = useCallback(
    (code: string) => {
      onSelectClase(code);
      setSelectedGrupo("");
      setSelectedCuenta("");
      setSelectedSubcuenta("");
      setGrupos([]);
      setCuentas([]);
      setSubcuentas([]);
      if (mode === "GUIADO") setSelectedPuc(null);
    },
    [mode, onSelectClase],
  );

  useEffect(() => {
    if (!pucOpen) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!pucWrapRef.current?.contains(target)) setPucOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [pucOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (!editingEntry || composerMode === "create") return;

    (async () => {
      try {
        setStatusLoading(true);
        const entry = await getEntry(editingEntry.entryId);

        setEntryStatus(entry.status);
        setMemo(entry.memo ?? "");
        const d = new Date(entry.date);
        setDateISO(d.toISOString().slice(0, 10));

        const mapped: CreateLineDto[] = (entry.lines ?? []).map((l: AccountingEntryDto["lines"][number]) => ({
          pucCuentaCode: l.pucCuentaCode ?? undefined,
          pucSubCode: l.pucSubCode ?? undefined,
          debit: Number(l.debit ?? 0),
          credit: Number(l.credit ?? 0),
          description: l.description ?? undefined,
        }));
        setLines(mapped);

        const firstCode = mapped[0]?.pucSubCode ?? mapped[0]?.pucCuentaCode ?? editingEntry.pucCode ?? "";
        const clase = String(firstCode).trim()[0];
        if (clase) setClase(clase);
      } catch {
        // noop
      } finally {
        setStatusLoading(false);
      }
    })();
  }, [editingEntry, composerMode, isOpen, setClase]);

  useEffect(() => {
    if (!isOpen) {
      resetAll();
      return;
    }
    if (composerMode === "create") {
      resetAll();
    }
  }, [isOpen, composerMode, resetAll]);

  useEffect(() => {
    if (!isOpen) return;
    if (composerMode === "detail") return;
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
  }, [pucQuery, selectedClase, isOpen, mode, composerMode]);

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
    } catch {
      // noop
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    if (composerMode === "detail") return;
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
  }, [selectedClase, isOpen, mode, composerMode]);

  useEffect(() => {
    if (!isOpen) return;
    if (composerMode === "detail") return;
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
  }, [selectedGrupo, isOpen, mode, composerMode]);

  useEffect(() => {
    if (!isOpen) return;
    if (composerMode === "detail") return;
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
  }, [selectedCuenta, isOpen, mode, composerMode]);

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

  const selectedLabel = selectedPuc
    ? `${selectedPuc.code} — ${selectedPuc.name} · ${selectedPuc.pucDbKind ?? "PUC"}`
    : "";

  function addLine() {
    if (!canEditFields) return;

    if (!selectedPuc?.code) return alert("Seleccioná una cuenta/subcuenta (PUC).");
    if (!amount || amount <= 0) return alert("Ingresá un valor válido.");

    const kind = selectedPuc.pucDbKind;
    if (kind !== "CUENTA" && kind !== "SUBCUENTA") return alert("El PUC seleccionado no tiene tipo (CUENTA/SUBCUENTA).");

    const debit = nature === "DEBITO" ? amount : 0;
    const credit = nature === "CREDITO" ? amount : 0;

    const line: CreateLineDto = {
      ...(kind === "SUBCUENTA" ? { pucSubCode: selectedPuc.code } : { pucCuentaCode: selectedPuc.code }),
      debit,
      credit,
      description: lineDesc.trim() || undefined,
    };

    setLines((prev) => [...prev, line]);

    setValue("");
    setNature("DEBITO");
    setLineDesc("");
    setSelectedPuc(null);
    setPucQuery("");
    setPucItems([]);
    setPucOpen(false);
  }

  function removeLine(idx: number) {
    if (!canEditFields) return;
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  const canSaveDraft = (isCreating || isEditing) && canEditFields && !sending && lines.length >= 1;
  const canPost = isEditing && entryStatus === "DRAFT" && lines.length >= 2 && totals.diff === 0;

  async function handleSaveDraft() {
    if (!canSaveDraft) return;

    setSending(true);
    try {
      if (!isEditing) {
        await createEntry({
          date: dateISO,
          memo: memo.trim() || undefined,
          lines,
        });

        await onCreate();
        onClose();
        resetAll();
        return;
      }

      await updateEntry(editingEntry!.entryId, {
        memo: memo.trim() || undefined,
        date: dateISO,
        lines,
      });

      await onUpdate();
      onClose();
      resetAll();
    } catch (err: unknown) {
      alert(extractErrorMessage(err, "No se pudo guardar el asiento"));
    } finally {
      setSending(false);
    }
  }

  async function handlePost() {
    if (!editingEntry) return;
    if (!canPost) return;

    setStatusLoading(true);
    try {
      const updated = await postEntry(editingEntry.entryId);
      setEntryStatus(updated.status);
      await onUpdate();
    } catch (err: unknown) {
      alert(extractErrorMessage(err, "No se pudo postear el asiento"));
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
      await onUpdate();
    } catch (err: unknown) {
      alert(extractErrorMessage(err, "No se pudo anular el asiento"));
    } finally {
      setStatusLoading(false);
    }
  }
  const inputBase =
    "w-full rounded-2xl border border-gray-200 bg-gray-50/70 px-4 py-3 text-sm outline-none focus:border-emerald-300 transition disabled:opacity-60 disabled:cursor-not-allowed";

  const miniToggleBase = "h-10 rounded-2xl border text-xs font-semibold px-3 whitespace-nowrap transition";
  const miniOn = "bg-emerald-50 border-emerald-200 text-emerald-700";
  const miniOff = "bg-white/70 border-gray-200 text-gray-700";

  const bottomSafe = "pb-[env(safe-area-inset-bottom)]";

  const modeLabel = isCreating ? "Creando" : isEditing ? "Editando" : "Detalle";

  const renderLines = () => (
    <div className="rounded-3xl border border-gray-200 bg-white/80 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold tracking-[0.14em] text-gray-500">LÍNEAS EN ESTE ASIENTO ({lines.length})</div>
          <div className="text-xs text-gray-500">{lines.length ? "Revisá cada línea antes de guardar" : "Agregá al menos 2 líneas para postear"}</div>
        </div>
      </div>

      {lines.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-500">
          Todavía no cargaste líneas.
        </div>
      ) : (
        <div className="space-y-2">
          {lines.map((l, idx) => {
            const code = l.pucSubCode ?? l.pucCuentaCode ?? "";
            const isDebit = Number(l.debit ?? 0) > 0;
            const amt = isDebit ? Number(l.debit ?? 0) : Number(l.credit ?? 0);
            return (
              <div
                key={`${code}-${idx}`}
                className="rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 px-3 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.03)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-zinc-900 truncate">{code || "Sin código"}</span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          isDebit ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
                        )}
                      >
                        {isDebit ? "DEB" : "CRE"}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5 truncate">{l.description || "Sin descripción"}</div>
                  </div>

                  <div className="text-right">
                    <div className="font-semibold tabular-nums text-sm text-neutral-900">{formatARS(amt)}</div>
                    <div className="text-[11px] text-neutral-400">Monto</div>
                  </div>
                </div>

                {canEditFields && (
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      className="h-9 rounded-full px-3 text-xs font-semibold border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 transition"
                    >
                      Quitar
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderAddLine = () => {
    if (!canEditFields) return null;

    return (
      <div className="rounded-3xl border border-gray-200 bg-white/90 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold tracking-[0.14em] text-gray-500">AGREGAR LÍNEA</div>
            <div className="text-xs text-gray-500">Elegí PUC, monto y naturaleza</div>
          </div>

          <div className="shrink-0 flex gap-2">
            <button type="button" onClick={() => setMode("RAPIDO")} className={cn(miniToggleBase, mode === "RAPIDO" ? miniOn : miniOff)}>
              Rápido
            </button>
            <button type="button" onClick={() => setMode("GUIADO")} className={cn(miniToggleBase, mode === "GUIADO" ? miniOn : miniOff)}>
              Guiado
            </button>
          </div>
        </div>

        <div>
          <div className="text-[11px] font-semibold tracking-[0.14em] text-gray-500">CLASE</div>
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
                  !canEditFields && "opacity-60 cursor-not-allowed",
                )}
              >
                {c.code} · {c.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[11px] font-semibold tracking-[0.14em] text-gray-500">CÓDIGO PUC</div>

          {mode === "RAPIDO" ? (
            <div className="relative mt-2" ref={pucWrapRef}>
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
                        <button type="button" className="text-emerald-700 font-semibold" onClick={() => setSelectedPuc(null)}>
                          Limpiar
                        </button>
                      ) : null}
                    </div>

                    {pucItems.length === 0 ? (
                      <div className="px-3 pb-3 text-sm text-gray-500">{pucQuery.trim() ? "Sin resultados" : "Escribí para buscar"}</div>
                    ) : (
                      <div className="max-h-48 sm:max-h-56 overflow-auto">
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
            </div>
          )}

          {selectedPuc ? (
            <div className="mt-2 text-xs text-zinc-600 truncate">{selectedLabel}</div>
          ) : (
            <div className="mt-2 text-xs text-zinc-500">Seleccioná una cuenta/subcuenta.</div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold tracking-[0.14em] text-gray-500">VALOR</div>
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
              <div className="text-[11px] font-semibold tracking-[0.14em] text-gray-500">NATURALEZA</div>
              <div className={cn("mt-2 flex items-center rounded-2xl border border-gray-200 bg-white/70 p-1", !canEditFields && "opacity-60")}>
                <button
                  type="button"
                  onClick={() => setNature("DEBITO")}
                  disabled={!canEditFields}
                  className={cn(
                    "rounded-2xl px-3 py-2 text-xs font-semibold transition",
                    nature === "DEBITO" ? "bg-emerald-400 text-emerald-950" : "text-gray-600",
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
                    nature === "CREDITO" ? "bg-emerald-400 text-emerald-950" : "text-gray-600",
                  )}
                >
                  Crédito
                </button>
              </div>
            </div>
          </div>

          <div className="sm:justify-self-end">
            <button
              type="button"
              onClick={addLine}
              disabled={!canEditFields}
              className={cn(
                "w-full sm:w-auto h-11 rounded-full px-4 text-sm font-semibold border transition",
                canEditFields ? "bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600" : "bg-zinc-50 border-zinc-200 text-zinc-500",
              )}
            >
              Agregar línea
            </button>
          </div>
        </div>
      </div>
    );
  };
  return (
    <div className={cn("fixed inset-x-0 bottom-0 z-50", bottomSafe)}>
      <div className="mx-auto w-full sm:max-w-2xl lg:max-w-3xl">
        <div className="w-full rounded-none border-t border-white/40 bg-white/80 backdrop-blur-xl shadow-[0_-10px_25px_rgba(0,0,0,0.10)]">
          <div
            className="transition-[max-height,opacity] duration-300 ease-out overflow-hidden"
            style={{
              maxHeight: isOpen ? `min(${contentH}px, ${MAX_SHEET})` : 0,
              opacity: isOpen ? 1 : 0,
            }}
          >
            <div
              ref={expandableRef}
              className="px-5 pt-5 pb-24 space-y-4 overflow-y-auto overscroll-contain"
              style={{ maxHeight: MAX_SHEET }}
            >
              {/* ASIENTO */}
              <div className="rounded-3xl border border-gray-200 bg-white shadow-sm px-4 py-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold tracking-[0.14em] text-gray-500">ASIENTO</div>
                    <div className="text-xs text-gray-500">{modeLabel}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {statusLoading ? <span className="text-xs text-zinc-500">…</span> : <StatusBadge status={entryStatus} />}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="text-[11px] font-semibold tracking-[0.14em] text-gray-500">FECHA</div>
                    <input
                      type="date"
                      value={dateISO}
                      onChange={(e) => setDateISO(e.target.value)}
                      className={cn(inputBase, "h-11 mt-2")}
                      disabled={!canEditFields}
                    />
                  </div>

                  <div>
                    <div className="text-[11px] font-semibold tracking-[0.14em] text-gray-500">MEMO</div>
                    <input
                      value={memo}
                      onChange={(e) => setMemo(e.target.value)}
                      placeholder="Detalle general del asiento…"
                      className={cn(inputBase, "h-11 mt-2")}
                      disabled={!canEditFields}
                    />
                  </div>
                </div>

                {isEditing && canEditFields && (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <button
                      type="button"
                      onClick={handlePost}
                      disabled={statusLoading || !canPost}
                      className={cn(
                        "flex-1 h-11 rounded-full text-sm font-semibold border transition",
                        canPost
                          ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                          : "bg-zinc-50 border-zinc-200 text-zinc-500",
                      )}
                      title={!canPost ? "Requiere mínimo 2 líneas y balance (Débito = Crédito)" : undefined}
                    >
                      Postear
                    </button>

                    <button
                      type="button"
                      onClick={handleVoid}
                      disabled={statusLoading || entryStatus === "VOID"}
                      className={cn(
                        "flex-1 h-11 rounded-full text-sm font-semibold border transition",
                        entryStatus !== "VOID"
                          ? "bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
                          : "bg-zinc-50 border-zinc-200 text-zinc-500",
                      )}
                    >
                      Anular
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2">
                    <div className="text-[11px] text-gray-500">Total Débito</div>
                    <div className="font-semibold tabular-nums text-neutral-900">{formatARS(totals.totalDebit)}</div>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2">
                    <div className="text-[11px] text-gray-500">Total Crédito</div>
                    <div className="font-semibold tabular-nums text-neutral-900">{formatARS(totals.totalCredit)}</div>
                  </div>
                  <div
                    className={cn(
                      "rounded-2xl border px-3 py-2",
                      totals.diff === 0 ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50",
                    )}
                  >
                    <div className="text-[11px] text-gray-500">Diferencia</div>
                    <div className={cn("font-semibold tabular-nums", totals.diff === 0 ? "text-emerald-700" : "text-red-700")}>{formatARS(totals.diff)}</div>
                  </div>
                </div>

                {(isCreating || isEditing) && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={handleSaveDraft}
                      disabled={!canSaveDraft}
                      className={cn(
                        "w-full h-11 rounded-full text-sm font-semibold transition",
                        canSaveDraft ? "bg-emerald-500 text-white hover:bg-emerald-600" : "bg-emerald-100 text-emerald-700/70",
                      )}
                      title={lines.length === 0 ? "Agregá al menos 1 línea para guardar borrador" : undefined}
                    >
                      {sending ? "Guardando..." : isEditing ? "Guardar cambios" : "Crear asiento (DRAFT)"}
                    </button>
                  </div>
                )}

                {!canEditFields && isEditing && (
                  <div className="text-xs text-zinc-500">
                    Este asiento no es editable porque está <span className="font-semibold">{entryStatus}</span>.
                  </div>
                )}
              </div>

              {renderLines()}

              {renderAddLine()}
            </div>
          </div>

          {/* BARRA INFERIOR */}
          <div className="px-5 py-4 border-t border-white/30 bg-white/85 backdrop-blur-xl">
            {isOpen ? (
              composerMode === "detail" ? (
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      resetAll();
                    }}
                    className="h-11 w-full rounded-full border border-gray-200 bg-white/80 text-sm font-semibold text-gray-800"
                  >
                    Cerrar detalle
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      resetAll();
                    }}
                    className="h-12 w-12 rounded-full border border-gray-200 bg-white/70 flex items-center justify-center text-xl text-gray-700"
                    aria-label="Cerrar"
                  >
                    ×
                  </button>

                  <div className="flex-1">
                    <input
                      type="text"
                      value={lineDesc}
                      onChange={(e) => setLineDesc(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addLine();
                        }
                      }}
                      placeholder="Descripción de la línea"
                      className="w-full h-12 px-4 rounded-full bg-gray-100 text-sm outline-none border border-gray-200 focus:border-emerald-300"
                      disabled={!canEditFields}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={addLine}
                    disabled={!canEditFields}
                    className={cn(
                      "h-12 w-12 rounded-full border flex items-center justify-center text-lg font-semibold",
                      canEditFields ? "bg-emerald-500 border-emerald-500 text-white hover:bg-emerald-600" : "bg-zinc-50 border-zinc-200 text-zinc-400",
                    )}
                    aria-label="Agregar línea"
                  >
                    ➤
                  </button>
                </div>
              )
            ) : (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    onEnterCreate();
                  }}
                  className="h-12 w-12 rounded-full border border-gray-200 bg-white/70 flex items-center justify-center text-xl text-gray-700"
                  aria-label="Abrir"
                >
                  +
                </button>

                <div className="flex-1">
                  <input
                    type="text"
                    value={searchValue}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Buscar movimiento..."
                    className="w-full h-12 px-4 rounded-full bg-gray-100 text-sm outline-none border border-gray-200"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
