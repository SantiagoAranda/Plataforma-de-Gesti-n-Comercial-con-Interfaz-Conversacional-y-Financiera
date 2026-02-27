"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { UiAccountingEntry } from "@/src/types/accounting-ui";
import { PucTypeahead } from "@/src/components/accounting/PucTypeahead";
import { createMovement, getPuc, searchPuc, updateEntry } from "@/src/types/accounting";

type MovementType = "Activo" | "Pasivo" | "Patrimonio" | "Ingresos" | "Gastos";
type NatureUI = "DEBITO" | "CREDITO";

type PucKind = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
type PucNode = { code: string; name: string; kind: PucKind; breadcrumbs: string[]; pucDbKind?: "CUENTA" | "SUBCUENTA" };

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
  const c = (code ?? "").trim();
  const first = c[0];
  if (first === "1") return "ASSET";
  if (first === "2") return "LIABILITY";
  if (first === "3") return "EQUITY";
  if (first === "4") return "INCOME";
  return "EXPENSE"; // 5/6/7
}

function kindToMovement(kind: UiAccountingEntry["kind"]): MovementType {
  switch (kind) {
    case "ASSET":
      return "Activo";
    case "LIABILITY":
      return "Pasivo";
    case "EQUITY":
      return "Patrimonio";
    case "INCOME":
      return "Ingresos";
    case "EXPENSE":
      return "Gastos";
  }
}

function movementToKind(m: MovementType): UiAccountingEntry["kind"] {
  switch (m) {
    case "Activo":
      return "ASSET";
    case "Pasivo":
      return "LIABILITY";
    case "Patrimonio":
      return "EQUITY";
    case "Ingresos":
      return "INCOME";
    case "Gastos":
      return "EXPENSE";
  }
}

type Props = {
  searchValue: string;
  onSearchChange: (v: string) => void;

  editingEntry: UiAccountingEntry | null;
  onCancelEdit: () => void;

  onCreate: (entry: UiAccountingEntry) => void;
  onUpdate: (entry: UiAccountingEntry) => void;

  // PUC (para tu selector por clase/grupo en el futuro)
  pucClases: { code: string; name: string }[];
  pucGrupos: { code: string; name: string; claseCode: string }[];
  selectedClase: string;
  onSelectClase: (code: string) => void;
};

export function AccountingComposer({
  searchValue,
  onSearchChange,
  editingEntry,
  onCancelEdit,
  onCreate,
  onUpdate,
  pucClases,
  pucGrupos,
  selectedClase,
  onSelectClase,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const [movementType, setMovementType] = useState<MovementType>("Activo");
  const [value, setValue] = useState("");
  const [nature, setNature] = useState<NatureUI>("DEBITO");
  const [description, setDescription] = useState("");

  // PUC (remoto)
  const [pucItems, setPucItems] = useState<PucNode[]>([]);
  const [selectedPuc, setSelectedPuc] = useState<PucNode | null>(null);

  const descRef = useRef<HTMLInputElement | null>(null);

  // altura animada real
  const expandableRef = useRef<HTMLDivElement | null>(null);
  const [contentH, setContentH] = useState(0);

  useEffect(() => {
    if (!expandableRef.current) return;
    const el = expandableRef.current;

    const ro = new ResizeObserver(() => setContentH(el.scrollHeight));
    ro.observe(el);
    setContentH(el.scrollHeight);

    return () => ro.disconnect();
  }, []);

  const parsedValue = useMemo(() => parseMoneyLike(value), [value]);
  const amount = useMemo(() => (parsedValue === null ? null : parsedValue), [parsedValue]);

  function resetForm() {
    setMovementType("Activo");
    setValue("");
    setNature("DEBITO");
    setDescription("");
    setSelectedPuc(null);
    setPucItems([]);
  }

  // precarga edición
  useEffect(() => {
    if (!editingEntry) return;

    setExpanded(true);
    setMovementType(kindToMovement(editingEntry.kind));
    setNature(editingEntry.amount >= 0 ? "DEBITO" : "CREDITO");
    setValue(String(Math.abs(editingEntry.amount)));
    setDescription(editingEntry.description ?? "");

    // para editar, seteo un PUC “mínimo”
    if (editingEntry.pucCode) {
      setSelectedPuc({
        code: editingEntry.pucCode,
        name: editingEntry.accountName,
        kind: kindFromPucCode(editingEntry.pucCode),
        breadcrumbs: [],
      });
    } else {
      setSelectedPuc(null);
    }

    requestAnimationFrame(() => descRef.current?.focus());
  }, [editingEntry]);

  function toggleExpanded() {
    setExpanded((p) => {
      const next = !p;
      if (!next && editingEntry) onCancelEdit();
      if (next) requestAnimationFrame(() => descRef.current?.focus());
      return next;
    });
  }

  async function handlePickPuc(node: PucNode | null) {
    setSelectedPuc(node);
    if (!node) return;

    // saber si es CUENTA o SUBCUENTA (para enviar correctamente)
    try {
      const info = await getPuc(node.code);
      setSelectedPuc((prev) => (prev ? { ...prev, pucDbKind: info.kind } : prev));
    } catch {
      // si falla, seguimos (pero al enviar va a fallar si el code no existe)
    }
  }

  // Search remoto PUC: usa tu input de búsqueda del typeahead (hack simple: escuchamos changes en items)
  // Como PucTypeahead no es async, lo mínimo es: cuando el usuario escribe, le damos items ya “server-searched”.
  // Para eso, reutilizamos searchValue? No: mejor un estado local de query para PUC.
  const [pucQuery, setPucQuery] = useState("");
  useEffect(() => {
    const q = pucQuery.trim();
    const t = setTimeout(() => {
      (async () => {
        if (!q) {
          setPucItems([]);
          return;
        }
        const found = await searchPuc(q);
        const mapped: PucNode[] = found.map((x) => ({
          code: x.code,
          name: x.name,
          kind: kindFromPucCode(x.code),
          breadcrumbs: [],
          pucDbKind: x.kind,
        }));
        setPucItems(mapped);
      })().catch(() => setPucItems([]));
    }, 250);

    return () => clearTimeout(t);
  }, [pucQuery]);

  async function handleSend() {
    if (!expanded) return;
    if (amount === null) return;
    if (!selectedPuc) return;

    const kind = movementToKind(movementType);
    const natureApi = nature === "DEBITO" ? "DEBIT" : "CREDIT";

    // CREATE
    if (!editingEntry) {
      try {
        await createMovement({
          nature: natureApi,
          amount,
          description: description.trim(),
          ...(selectedPuc.pucDbKind === "SUBCUENTA"
            ? { pucSubCode: selectedPuc.code }
            : { pucCuentaCode: selectedPuc.code }),
        });

        // UI: armamos un item “optimista”
        const now = new Date();
        const dateISO = now.toISOString().slice(0, 10);
        const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const signed = nature === "DEBITO" ? amount : -amount;

        onCreate({
          id: crypto.randomUUID(), // placeholder (ideal: refrescar listMovements)
          entryId: crypto.randomUUID(), // placeholder
          dateISO,
          time,
          pucCode: selectedPuc.code,
          accountName: selectedPuc.name,
          description: description.trim(),
          amount: signed,
          source: "MANUAL",
          kind,
          status: "DRAFT",
        });

        setExpanded(false);
        resetForm();
      } catch (err: any) {
        alert(err?.details?.message ?? err?.message ?? "No se pudo crear el movimiento");
      }
      return;
    }

    // UPDATE (solo DRAFT en backend)
    try {
      const debit = nature === "DEBITO" ? amount : 0;
      const credit = nature === "CREDITO" ? amount : 0;

      await updateEntry(editingEntry.entryId, {
        lines: [
          {
            ...(selectedPuc.pucDbKind === "SUBCUENTA"
              ? { pucSubCode: selectedPuc.code }
              : { pucCuentaCode: selectedPuc.code }),
            description: description.trim(),
            debit,
            credit,
          },
        ],
      });

      onUpdate({
        ...editingEntry,
        kind,
        pucCode: selectedPuc.code,
        accountName: selectedPuc.name,
        description: description.trim(),
        amount: debit - credit,
      });

      setExpanded(false);
      resetForm();
    } catch (err: any) {
      alert(err?.details?.message ?? err?.message ?? "No se pudo actualizar (solo DRAFT)");
    }
  }

  const chipBase = "rounded-full px-4 py-2 text-sm border transition whitespace-nowrap";
  const chipOn = "bg-emerald-50 border-emerald-200 text-emerald-700";
  const chipOff = "bg-white/70 border-gray-200 text-gray-700 hover:bg-white";

  const inputBase =
    "w-full rounded-2xl border border-gray-200 bg-gray-50/70 px-4 py-3 text-sm outline-none focus:border-emerald-300 transition";

  return (
    <div className="fixed left-0 right-0 bottom-0 z-50 pb-[env(safe-area-inset-bottom)]">
      <div className="w-full">
        <div className="w-full rounded-none border-t border-white/40 bg-white/70 backdrop-blur-xl shadow-[0_-10px_25px_rgba(0,0,0,0.10)]">
          {/* EXPANDIBLE */}
          <div
            className="overflow-hidden transition-[max-height,opacity] duration-300 ease-out"
            style={{ maxHeight: expanded ? contentH : 0, opacity: expanded ? 1 : 0 }}
          >
            <div ref={expandableRef} className="px-5 pt-5 pb-4 space-y-4">
              {/* TIPO */}
              <div>
                <div className="text-xs font-semibold tracking-widest text-gray-500">TIPO DE MOVIMIENTO</div>
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  {(["Activo", "Pasivo", "Patrimonio", "Ingresos", "Gastos"] as MovementType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setMovementType(t)}
                      className={`${chipBase} ${movementType === t ? chipOn : chipOff}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* PUC REMOTO */}
              <div>
                <div className="text-xs font-semibold tracking-widest text-gray-500">CÓDIGO PUC</div>

                {/* si querés mantener tus selects de clase/grupo, están disponibles: pucClases/pucGrupos */}
                {/* por ahora: buscador remoto */}
                <div className="mt-2">
                  {/* input “puente” para disparar búsqueda remota */}
                  <input
                    value={pucQuery}
                    onChange={(e) => setPucQuery(e.target.value)}
                    placeholder="Buscar PUC (código o nombre)..."
                    className={inputBase}
                  />

                  <div className="mt-2">
                    <PucTypeahead
                      showLabel={false}
                      kindFilter={movementToKind(movementType) as any}
                      items={pucItems as any}
                      value={selectedPuc as any}
                      onChange={(v) => handlePickPuc(v as any)}
                      placeholder="Elegí un resultado..."
                    />
                  </div>
                </div>
              </div>

              {/* VALOR */}
              <div>
                <div className="text-xs font-semibold tracking-widest text-gray-500">VALOR</div>
                <input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="0.00"
                  inputMode="decimal"
                  className={`${inputBase} mt-2`}
                />
              </div>

              {/* NATURALEZA */}
              <div>
                <div className="rounded-2xl bg-gray-50/60 border border-gray-200 px-4 py-3 flex items-center gap-3">
                  <div className="text-sm font-medium text-gray-800">Naturaleza</div>

                  <div className="ml-auto flex items-center gap-2 rounded-full border border-gray-200 bg-white/70 p-1">
                    <button
                      type="button"
                      onClick={() => setNature("DEBITO")}
                      className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                        nature === "DEBITO" ? "bg-emerald-400 text-emerald-950" : "text-gray-600"
                      }`}
                    >
                      DÉBITO
                    </button>

                    <button
                      type="button"
                      onClick={() => setNature("CREDITO")}
                      className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                        nature === "CREDITO" ? "bg-emerald-400 text-emerald-950" : "text-gray-600"
                      }`}
                    >
                      CRÉDITO
                    </button>
                  </div>
                </div>
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
                    className="w-full h-11 px-4 rounded-full bg-white border border-gray-300 text-sm outline-none"
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
                disabled={!expanded}
                title={!selectedPuc && expanded ? "Seleccioná un PUC" : undefined}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5 block" fill="currentColor" aria-hidden="true">
                  <path d="M8 5v14l13-7-13-7z" />
                </svg>
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