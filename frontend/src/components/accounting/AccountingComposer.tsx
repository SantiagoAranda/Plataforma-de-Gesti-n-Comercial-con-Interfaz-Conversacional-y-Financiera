"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type MovementType = "Activo" | "Pasivo" | "Patrimonio" | "Ingresos" | "Gastos";
type Nature = "DEBITO" | "CREDITO";

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

type AccountingComposerProps = {
    searchValue: string;
    onSearchChange: (v: string) => void;
};

export function AccountingComposer({ searchValue, onSearchChange }: AccountingComposerProps) {
    const [expanded, setExpanded] = useState(false);

    // modo expandido (formulario)
    const [movementType, setMovementType] = useState<MovementType>("Activo");
    const [puc, setPuc] = useState("");
    const [value, setValue] = useState("");
    const [nature, setNature] = useState<Nature>("DEBITO");
    const [description, setDescription] = useState("");

    // focus en descripción al abrir
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
        setPuc("");
        setValue("");
        setNature("DEBITO");
        setDescription("");
    }

    function handleSend() {
        if (!expanded) return;

        const payload = {
            movementType,
            pucCode: puc.trim() || null,
            amount: signedAmount,
            nature,
            description: description.trim(),
        };

        console.log("SEND", payload);

        resetForm();
        setExpanded(false);
    }

    function toggleExpanded() {
        setExpanded((p) => {
            const next = !p;
            if (next) {
                requestAnimationFrame(() => descRef.current?.focus());
            } else {
                setDescription("");
            }
            return next;
        });
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
                                <div className="text-xs font-semibold tracking-widest text-gray-500">TIPO DE MOVIMIENTO</div>
                                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                                    {(["Activo", "Pasivo", "Patrimonio", "Ingresos", "Gastos"] as MovementType[]).map((t) => {
                                        const active = movementType === t;
                                        return (
                                            <button
                                                key={t}
                                                type="button"
                                                onClick={() => setMovementType(t)}
                                                className={`${chipBase} ${active ? chipOn : chipOff}`}
                                            >
                                                {t}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* CÓDIGO PUC / VALOR */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <div className="text-xs font-semibold tracking-widest text-gray-500">CÓDIGO PUC</div>
                                    <input
                                        value={puc}
                                        onChange={(e) => setPuc(e.target.value)}
                                        placeholder="Ej. 1105"
                                        className={`${inputBase} mt-2`}
                                    />
                                </div>

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
                            </div>

                            {/* NATURALEZA */}
                            <div>
                                <div className="rounded-2xl bg-gray-50/60 border border-gray-200 px-4 py-3 flex items-center gap-3">
                                    <div className="text-sm font-medium text-gray-800">Naturaleza</div>

                                    <div className="ml-auto flex items-center gap-2 rounded-full border border-gray-200 bg-white/70 p-1">
                                        <button
                                            type="button"
                                            onClick={() => setNature("DEBITO")}
                                            className={`rounded-full px-4 py-2 text-xs font-semibold transition ${nature === "DEBITO" ? "bg-emerald-400 text-emerald-950" : "text-gray-600"
                                                }`}
                                        >
                                            DÉBITO
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setNature("CREDITO")}
                                            className={`rounded-full px-4 py-2 text-xs font-semibold transition ${nature === "CREDITO" ? "bg-emerald-400 text-emerald-950" : "text-gray-600"
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
                                        placeholder="Descripción del movimiento"
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
                                aria-label="Enviar"
                                className="
                  shrink-0 aspect-square h-12 min-h-12 w-12 min-w-12 rounded-full
                  bg-emerald-500 text-white grid place-items-center
                  shadow-[0_6px_14px_rgba(16,185,129,0.35)]
                  active:scale-95 transition
                "
                                disabled={!expanded}
                            >
                                <svg viewBox="0 0 24 24" className="h-5 w-5 block" fill="currentColor" aria-hidden="true">
                                    <path d="M8 5v14l13-7-13-7z" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}