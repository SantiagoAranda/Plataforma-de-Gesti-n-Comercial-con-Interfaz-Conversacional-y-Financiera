"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AccountingEntry } from "@/src/types/accounting";
import type { PucNode, PucKind } from "@/src/types/puc";
import { PucTypeahead } from "@/src/components/accounting/PucTypeahead";

type MovementType = "Activo" | "Pasivo" | "Patrimonio" | "Ingresos" | "Gastos";
type Nature = "DEBITO" | "CREDITO";

/** MVP demo data: reemplazar por tu datasource real (API / seed / etc.) */
const PUC_ITEMS: PucNode[] = [
    { code: "1105", name: "Caja", kind: "ASSET", breadcrumbs: ["Activo", "Disponible", "Caja"] },
    { code: "110505", name: "Caja general", kind: "ASSET", breadcrumbs: ["Activo", "Disponible", "Caja", "Caja general"] },
    { code: "1110", name: "Bancos", kind: "ASSET", breadcrumbs: ["Activo", "Disponible", "Bancos"] },
    { code: "1305", name: "Clientes", kind: "ASSET", breadcrumbs: ["Activo", "Deudores", "Clientes"] },
    { code: "2105", name: "Proveedores", kind: "LIABILITY", breadcrumbs: ["Pasivo", "Cuentas por pagar", "Proveedores"] },
    { code: "2365", name: "Retenciones", kind: "LIABILITY", breadcrumbs: ["Pasivo", "Impuestos", "Retenciones"] },
    { code: "3105", name: "Capital social", kind: "EQUITY", breadcrumbs: ["Patrimonio", "Capital", "Capital social"] },
    { code: "4135", name: "Ventas", kind: "INCOME", breadcrumbs: ["Ingresos", "Operacionales", "Ventas"] },
    { code: "4175", name: "Servicios", kind: "INCOME", breadcrumbs: ["Ingresos", "Operacionales", "Servicios"] },
    { code: "5105", name: "Gastos de personal", kind: "EXPENSE", breadcrumbs: ["Gastos", "Administración", "Personal"] },
    { code: "5205", name: "Arriendos", kind: "EXPENSE", breadcrumbs: ["Gastos", "Administración", "Arriendos"] },
];

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

function kindToMovement(kind: AccountingEntry["kind"]): MovementType {
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

function movementToKind(m: MovementType): AccountingEntry["kind"] {
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

/** filtro para PUC por “tipo de movimiento” */
function movementToKindFilter(m: MovementType): PucKind {
    return movementToKind(m);
}

/** -------- Opción B (Wizard 4 pasos con subcuenta) -------- */

type WizardStep = "KIND" | "GROUP" | "ACCOUNT" | "SUBACCOUNT";

function kindLabel(kind: PucKind) {
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

function uniqSorted(arr: string[]) {
    return Array.from(new Set(arr)).sort((a, b) => a.localeCompare(b));
}

function crumb(it: PucNode, idx: number) {
    return it.breadcrumbs[idx] ?? null;
}

function PucWizard({
    items,
    forcedKind,
    value,
    onChange,
    onClose,
}: {
    items: PucNode[];
    forcedKind?: PucKind;
    value: PucNode | null;
    onChange: (v: PucNode | null) => void;
    onClose: () => void;
}) {
    const [step, setStep] = useState<WizardStep>(forcedKind ? "GROUP" : "KIND");
    const [kind, setKind] = useState<PucKind | null>(forcedKind ?? null);

    const [group, setGroup] = useState<string | null>(null);
    const [account, setAccount] = useState<string | null>(null);

    useEffect(() => {
        setKind(forcedKind ?? null);
        setStep(forcedKind ? "GROUP" : "KIND");
        setGroup(null);
        setAccount(null);
    }, [forcedKind]);

    const base = useMemo(() => {
        const k = kind ?? forcedKind;
        return k ? items.filter((x) => x.kind === k) : items;
    }, [items, kind, forcedKind]);

    const groups = useMemo(() => {
        return uniqSorted(base.map((it) => crumb(it, 1)).filter(Boolean) as string[]);
    }, [base]);

    const accounts = useMemo(() => {
        if (!group) return [];
        const scoped = base.filter((it) => crumb(it, 1) === group);
        return uniqSorted(scoped.map((it) => crumb(it, 2)).filter(Boolean) as string[]);
    }, [base, group]);

    const leafCandidates = useMemo(() => {
        if (!group || !account) return [];
        return base.filter((it) => crumb(it, 1) === group && crumb(it, 2) === account);
    }, [base, group, account]);

    const subaccounts = useMemo(() => {
        if (!group || !account) return [];
        return uniqSorted(leafCandidates.map((it) => crumb(it, 3)).filter(Boolean) as string[]);
    }, [leafCandidates, group, account]);

    function pickBestLeaf(sub: string | null) {
        if (sub) {
            return leafCandidates.find((it) => crumb(it, 3) === sub) ?? leafCandidates[0] ?? null;
        }
        // cuenta sin subcuenta
        const noSub = leafCandidates.find((it) => !crumb(it, 3));
        return noSub ?? leafCandidates[0] ?? null;
    }

    return (
        <div className="mt-2 rounded-2xl border border-gray-200 bg-white/70 backdrop-blur p-3">
            <div className="flex items-center justify-between">
                <div className="text-xs font-semibold tracking-widest text-gray-500">SELECTOR PUC</div>
                <button
                    type="button"
                    onClick={onClose}
                    className="text-xs font-semibold text-gray-600 hover:text-gray-800"
                >
                    Cerrar
                </button>
            </div>

            <div className="mt-2 flex gap-2 text-xs">
                <span className={`px-2 py-1 rounded-full border ${step === "KIND" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white/70 border-gray-200 text-gray-600"}`}>
                    1. Tipo
                </span>
                <span className={`px-2 py-1 rounded-full border ${step === "GROUP" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white/70 border-gray-200 text-gray-600"}`}>
                    2. Grupo
                </span>
                <span className={`px-2 py-1 rounded-full border ${step === "ACCOUNT" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white/70 border-gray-200 text-gray-600"}`}>
                    3. Cuenta
                </span>
                <span className={`px-2 py-1 rounded-full border ${step === "SUBACCOUNT" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white/70 border-gray-200 text-gray-600"}`}>
                    4. Subcuenta
                </span>
            </div>

            {!forcedKind && step === "KIND" && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                    {(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"] as PucKind[]).map((k) => (
                        <button
                            key={k}
                            type="button"
                            onClick={() => {
                                setKind(k);
                                setStep("GROUP");
                                setGroup(null);
                                setAccount(null);
                            }}
                            className="rounded-xl border border-gray-200 bg-white/70 px-3 py-2 text-sm text-gray-800 hover:bg-white"
                        >
                            {kindLabel(k)}
                        </button>
                    ))}
                </div>
            )}

            {step === "GROUP" && (
                <div className="mt-3">
                    <div className="text-xs text-gray-500">Elegí un grupo</div>
                    <div className="mt-2 max-h-48 overflow-auto rounded-xl border border-gray-200 bg-white">
                        {groups.map((g) => (
                            <button
                                key={g}
                                type="button"
                                onClick={() => {
                                    setGroup(g);
                                    setAccount(null);
                                    setStep("ACCOUNT");
                                }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                            >
                                {g}
                            </button>
                        ))}
                        {groups.length === 0 && <div className="px-3 py-2 text-sm text-gray-500">Sin grupos.</div>}
                    </div>

                    <div className="mt-2 flex gap-2">
                        {!forcedKind && (
                            <button
                                type="button"
                                onClick={() => setStep("KIND")}
                                className="px-3 py-2 rounded-xl border border-gray-200 bg-white/70 text-sm text-gray-700 hover:bg-white"
                            >
                                Atrás
                            </button>
                        )}
                    </div>
                </div>
            )}

            {step === "ACCOUNT" && (
                <div className="mt-3">
                    <div className="text-xs text-gray-500">Elegí una cuenta</div>
                    <div className="mt-2 max-h-48 overflow-auto rounded-xl border border-gray-200 bg-white">
                        {accounts.map((a) => (
                            <button
                                key={a}
                                type="button"
                                onClick={() => {
                                    setAccount(a);
                                    setStep("SUBACCOUNT");
                                }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                            >
                                {a}
                            </button>
                        ))}
                        {accounts.length === 0 && <div className="px-3 py-2 text-sm text-gray-500">Sin cuentas.</div>}
                    </div>

                    <div className="mt-2 flex gap-2">
                        <button
                            type="button"
                            onClick={() => setStep("GROUP")}
                            className="px-3 py-2 rounded-xl border border-gray-200 bg-white/70 text-sm text-gray-700 hover:bg-white"
                        >
                            Atrás
                        </button>
                    </div>
                </div>
            )}

            {step === "SUBACCOUNT" && (
                <div className="mt-3">
                    <div className="text-xs text-gray-500">Elegí una subcuenta (si no hay, usás la cuenta)</div>

                    <div className="mt-2 max-h-48 overflow-auto rounded-xl border border-gray-200 bg-white">
                        {subaccounts.length === 0 && (
                            <button
                                type="button"
                                onClick={() => {
                                    const leaf = pickBestLeaf(null);
                                    if (leaf) onChange(leaf);
                                    onClose();
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-gray-50"
                            >
                                <div className="text-sm font-semibold text-gray-900">Usar cuenta: {account}</div>
                                <div className="text-xs text-gray-500 truncate">
                                    {kindLabel((kind ?? forcedKind) as PucKind)} &gt; {group} &gt; {account}
                                </div>
                            </button>
                        )}

                        {subaccounts.map((s) => (
                            <button
                                key={s}
                                type="button"
                                onClick={() => {
                                    const leaf = pickBestLeaf(s);
                                    if (leaf) onChange(leaf);
                                    onClose();
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-gray-50"
                            >
                                <div className="text-sm font-semibold text-gray-900">{s}</div>
                                <div className="text-xs text-gray-500 truncate">
                                    {kindLabel((kind ?? forcedKind) as PucKind)} &gt; {group} &gt; {account} &gt; {s}
                                </div>
                            </button>
                        ))}
                    </div>

                    <div className="mt-2 flex gap-2">
                        <button
                            type="button"
                            onClick={() => setStep("ACCOUNT")}
                            className="px-3 py-2 rounded-xl border border-gray-200 bg-white/70 text-sm text-gray-700 hover:bg-white"
                        >
                            Atrás
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                onChange(null);
                                onClose();
                            }}
                            className="ml-auto px-3 py-2 rounded-xl border border-gray-200 bg-white/70 text-sm text-gray-700 hover:bg-white"
                        >
                            Limpiar
                        </button>
                    </div>
                </div>
            )}

            {value && (
                <div className="mt-3 text-xs text-gray-600">
                    Seleccionado: <span className="font-semibold">{value.code}</span> — {value.name}
                </div>
            )}
        </div>
    );
}

/** -------- Composer -------- */

type Props = {
    searchValue: string;
    onSearchChange: (v: string) => void;

    editingEntry: AccountingEntry | null;
    onCancelEdit: () => void;

    onCreate: (entry: AccountingEntry) => void;
    onUpdate: (entry: AccountingEntry) => void;
};

export function AccountingComposer({
    searchValue,
    onSearchChange,
    editingEntry,
    onCancelEdit,
    onCreate,
    onUpdate,
}: Props) {
    const [expanded, setExpanded] = useState(false);

    const [movementType, setMovementType] = useState<MovementType>("Activo");
    const [value, setValue] = useState("");
    const [nature, setNature] = useState<Nature>("DEBITO");
    const [description, setDescription] = useState("");

    // PUC selection (A o B)
    const [selectedPuc, setSelectedPuc] = useState<PucNode | null>(null);
    const kindFilter = movementToKindFilter(movementType);

    // toggle A/B
    const [pucMode, setPucMode] = useState<"A" | "B">("A");
    const [wizardOpen, setWizardOpen] = useState(false);

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

    // signo automático
    const parsedValue = useMemo(() => parseMoneyLike(value), [value]);
    const signedAmount = useMemo(() => {
        if (parsedValue === null) return null;
        return nature === "DEBITO" ? parsedValue : -parsedValue;
    }, [parsedValue, nature]);

    function resetForm() {
        setMovementType("Activo");
        setValue("");
        setNature("DEBITO");
        setDescription("");
        setSelectedPuc(null);
        setPucMode("A");
        setWizardOpen(false);
    }

    // ✅ Si llega un entry para editar: abre + precarga
    useEffect(() => {
        if (!editingEntry) return;

        setExpanded(true);
        setMovementType(kindToMovement(editingEntry.kind));
        setNature(editingEntry.amount >= 0 ? "DEBITO" : "CREDITO");
        setValue(String(Math.abs(editingEntry.amount)));
        setDescription(editingEntry.description ?? "");

        // Intentar precargar PUC si existe en dataset
        if (editingEntry.pucCode) {
            const found = PUC_ITEMS.find((x) => x.code === editingEntry.pucCode) ?? null;
            setSelectedPuc(found);
        } else {
            setSelectedPuc(null);
        }

        requestAnimationFrame(() => descRef.current?.focus());
    }, [editingEntry]);

    // Si cambia movementType, y el PUC seleccionado no coincide con el kind, lo limpiamos
    useEffect(() => {
        if (!selectedPuc) return;
        if (selectedPuc.kind !== kindFilter) setSelectedPuc(null);
    }, [kindFilter, selectedPuc]);

    function toggleExpanded() {
        setExpanded((p) => {
            const next = !p;
            if (!next && editingEntry) onCancelEdit();
            if (next) requestAnimationFrame(() => descRef.current?.focus());
            return next;
        });
    }

    function handleSend() {
        if (!expanded) return;
        if (signedAmount === null) return;

        const kind = movementToKind(movementType);

        // MVP: requerir PUC seleccionado
        if (!selectedPuc) return;

        if (editingEntry) {
            const updated: AccountingEntry = {
                ...editingEntry,
                kind,
                pucCode: selectedPuc.code,
                accountName: selectedPuc.name,
                description: description.trim(),
                amount: signedAmount,
            };

            onUpdate(updated);
            setExpanded(false);
            resetForm();
            return;
        }

        const now = new Date();
        const dateISO = now.toISOString().slice(0, 10);
        const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

        const created: AccountingEntry = {
            id: crypto.randomUUID(),
            dateISO,
            time,
            pucCode: selectedPuc.code,
            accountName: selectedPuc.name,
            description: description.trim(),
            amount: signedAmount,
            source: "MANUAL",
            kind,
        };

        onCreate(created);
        setExpanded(false);
        resetForm();
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
                    {/* BLOQUE EXPANDIBLE */}
                    <div
                        className="overflow-hidden transition-[max-height,opacity] duration-300 ease-out"
                        style={{ maxHeight: expanded ? contentH : 0, opacity: expanded ? 1 : 0 }}
                    >
                        <div ref={expandableRef} className="px-5 pt-5 pb-4 space-y-4">
                            {/* TIPO DE MOVIMIENTO */}
                            <div>
                                <div className="text-xs font-semibold tracking-widest text-gray-500">
                                    TIPO DE MOVIMIENTO
                                </div>
                                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                                    {(["Activo", "Pasivo", "Patrimonio", "Ingresos", "Gastos"] as MovementType[]).map(
                                        (t) => (
                                            <button
                                                key={t}
                                                type="button"
                                                onClick={() => setMovementType(t)}
                                                className={`${chipBase} ${movementType === t ? chipOn : chipOff}`}
                                            >
                                                {t}
                                            </button>
                                        )
                                    )}
                                </div>
                            </div>

                            {/* PUC (Modo A o B) */}
                            <div>
                                <div className="flex items-center justify-between">
                                    <div className="text-xs font-semibold tracking-widest text-gray-500">
                                        CÓDIGO PUC
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setPucMode("A");
                                                setWizardOpen(false);
                                            }}
                                            className={`text-xs px-3 py-1 rounded-full border ${pucMode === "A"
                                                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                                    : "bg-white/70 border-gray-200 text-gray-600"
                                                }`}
                                        >
                                            Buscar
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => {
                                                setPucMode("B");
                                                setWizardOpen((v) => !v);
                                            }}
                                            className={`text-xs px-3 py-1 rounded-full border ${pucMode === "B"
                                                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                                    : "bg-white/70 border-gray-200 text-gray-600"
                                                }`}
                                        >
                                            Ver todo
                                        </button>
                                    </div>
                                </div>

                                {pucMode === "A" && (
                                    <PucTypeahead
                                        showLabel={false}
                                        kindFilter={kindFilter}
                                        items={PUC_ITEMS}
                                        value={selectedPuc}
                                        onChange={setSelectedPuc}
                                        placeholder="Ej. 1105 o “caja”, “clientes”…"
                                    />
                                )}

                                {pucMode === "B" && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => setWizardOpen((v) => !v)}
                                            className={`${inputBase} mt-2 text-left`}
                                        >
                                            {selectedPuc
                                                ? `${selectedPuc.code} — ${selectedPuc.name}`
                                                : "Abrir selector por pasos…"}
                                        </button>

                                        {wizardOpen && (
                                            <PucWizard
                                                items={PUC_ITEMS}
                                                forcedKind={kindFilter}
                                                value={selectedPuc}
                                                onChange={setSelectedPuc}
                                                onClose={() => setWizardOpen(false)}
                                            />
                                        )}
                                    </>
                                )}

                                {selectedPuc && (
                                    <div className="mt-2 text-xs text-gray-500">
                                        {selectedPuc.breadcrumbs.join(" > ")}
                                    </div>
                                )}
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
                                            className={`rounded-full px-4 py-2 text-xs font-semibold transition ${nature === "DEBITO"
                                                    ? "bg-emerald-400 text-emerald-950"
                                                    : "text-gray-600"
                                                }`}
                                        >
                                            DÉBITO
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setNature("CREDITO")}
                                            className={`rounded-full px-4 py-2 text-xs font-semibold transition ${nature === "CREDITO"
                                                    ? "bg-emerald-400 text-emerald-950"
                                                    : "text-gray-600"
                                                }`}
                                        >
                                            CRÉDITO
                                        </button>
                                    </div>
                                </div>

                                <div className="mt-2 text-xs text-gray-400">
                                    {signedAmount === null
                                        ? ""
                                        : signedAmount >= 0
                                            ? `Monto final: +$${Math.abs(signedAmount).toFixed(2)}`
                                            : `Monto final: -$${Math.abs(signedAmount).toFixed(2)}`}
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
                                className="
                  shrink-0 aspect-square h-12 min-h-12 w-12 min-w-12 rounded-full
                  bg-emerald-500 text-white grid place-items-center
                  shadow-[0_6px_14px_rgba(16,185,129,0.35)]
                  active:scale-95 transition
                  disabled:opacity-50
                "
                                disabled={!expanded}
                                title={!selectedPuc && expanded ? "Seleccioná un PUC" : undefined}
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    className="h-5 w-5 block"
                                    fill="currentColor"
                                    aria-hidden="true"
                                >
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