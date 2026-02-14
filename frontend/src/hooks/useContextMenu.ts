"use client";

import { useCallback, useRef, useState } from "react";

export function useContextMenu(longPressMs = 500) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState({ x: 0, y: 0 });

    const pressTimer = useRef<number | null>(null);
    const lastPointer = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    const close = useCallback(() => setOpen(false), []);

    const openAt = useCallback((x: number, y: number) => {
        setPos({ x, y });
        setOpen(true);
    }, []);

    const onContextMenu = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            openAt(e.clientX, e.clientY);
        },
        [openAt],
    );

    const clearTimer = useCallback(() => {
        if (pressTimer.current) {
            window.clearTimeout(pressTimer.current);
            pressTimer.current = null;
        }
    }, []);

    const onPointerDown = useCallback(
        (e: React.PointerEvent) => {
            // Guardamos última posición para abrir menú ahí
            lastPointer.current = { x: e.clientX, y: e.clientY };

            // Long press solo en touch / pen (en mouse ya tenés click derecho)
            if (e.pointerType === "touch" || e.pointerType === "pen") {
                clearTimer();
                pressTimer.current = window.setTimeout(() => {
                    openAt(lastPointer.current.x, lastPointer.current.y);
                }, longPressMs);
            }
        },
        [clearTimer, longPressMs, openAt],
    );

    const onPointerMove = useCallback(() => {
        // si el usuario arrastra, cancelamos long press
        clearTimer();
    }, [clearTimer]);

    const onPointerUp = useCallback(() => {
        clearTimer();
    }, [clearTimer]);

    const onPointerCancel = useCallback(() => {
        clearTimer();
    }, [clearTimer]);

    return {
        open,
        pos,
        close,
        handlers: {
            onContextMenu,
            onPointerDown,
            onPointerMove,
            onPointerUp,
            onPointerCancel,
        },
    };
}
