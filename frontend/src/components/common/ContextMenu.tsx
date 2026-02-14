"use client";

import { useEffect, useRef } from "react";

export type ContextMenuItem = {
    label: string;
    onClick: () => void;
};

type Props = {
    open: boolean;
    x: number;
    y: number;
    onClose: () => void;
    items: ContextMenuItem[];
};

export default function ContextMenu({ open, x, y, onClose, items }: Props) {
    const ref = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };

        const onPointerDown = (e: PointerEvent) => {
            const el = ref.current;
            if (!el) return;
            if (!el.contains(e.target as Node)) onClose();
        };

        const onScroll = () => onClose();

        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("pointerdown", onPointerDown, { capture: true });
        window.addEventListener("scroll", onScroll, { passive: true });

        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("pointerdown", onPointerDown, true as any);
            window.removeEventListener("scroll", onScroll);
        };
    }, [open, onClose]);

    if (!open) return null;

    // Clamp simple para que no se vaya fuera de pantalla (aprox)
    const maxW = 220;
    const maxH = items.length * 44;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1000;
    const vh = typeof window !== "undefined" ? window.innerHeight : 1000;

    const left = Math.max(8, Math.min(x, vw - maxW - 8));
    const top = Math.max(8, Math.min(y, vh - maxH - 8));

    return (
        <div
            ref={ref}
            className="fixed z-[9999] w-[220px] rounded-xl border border-neutral-200 bg-white shadow-lg overflow-hidden"
            style={{ left, top }}
            role="menu"
        >
            {items.map((it, idx) => (
                <button
                    key={idx}
                    onClick={() => {
                        it.onClick();
                        onClose();
                    }}
                    className="w-full text-left px-4 py-3 text-sm text-neutral-700 hover:bg-neutral-100 active:bg-neutral-200"
                    role="menuitem"
                >
                    {it.label}
                </button>
            ))}
        </div>
    );
}
