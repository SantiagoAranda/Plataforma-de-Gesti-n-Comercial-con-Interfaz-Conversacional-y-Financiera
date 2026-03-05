"use client";

import * as React from "react";

type Options = {
    ms?: number; // 450–600ms
    moveThresholdPx?: number; // cancelar si mueve más de X px
};

type Handlers = {
    onTouchStart: React.TouchEventHandler;
    onTouchMove: React.TouchEventHandler;
    onTouchEnd: React.TouchEventHandler;
    onTouchCancel: React.TouchEventHandler;

    onMouseDown: React.MouseEventHandler;
    onMouseUp: React.MouseEventHandler;
    onMouseLeave: React.MouseEventHandler;
};

export function useLongPress(
    onLongPress: () => void,
    opts: Options = {},
): { handlers: Handlers } {
    const { ms = 520, moveThresholdPx = 12 } = opts;

    const timerRef = React.useRef<number | null>(null);
    const startRef = React.useRef<{ x: number; y: number } | null>(null);
    const firedRef = React.useRef(false);

    const clear = React.useCallback(() => {
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = null;
        startRef.current = null;
        firedRef.current = false;
    }, []);

    const arm = React.useCallback((x: number, y: number) => {
        clear();
        startRef.current = { x, y };
        timerRef.current = window.setTimeout(() => {
            firedRef.current = true;
            onLongPress();
        }, ms);
    }, [clear, ms, onLongPress]);

    const movedTooMuch = React.useCallback((x: number, y: number) => {
        if (!startRef.current) return false;
        const dx = x - startRef.current.x;
        const dy = y - startRef.current.y;
        return Math.hypot(dx, dy) > moveThresholdPx;
    }, [moveThresholdPx]);

    // Touch
    const onTouchStart: React.TouchEventHandler = (e) => {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        arm(t.clientX, t.clientY);
    };

    const onTouchMove: React.TouchEventHandler = (e) => {
        if (!timerRef.current) return;
        const t = e.touches[0];
        if (movedTooMuch(t.clientX, t.clientY)) clear();
    };

    const onTouchEnd: React.TouchEventHandler = () => clear();
    const onTouchCancel: React.TouchEventHandler = () => clear();

    // Mouse
    const onMouseDown: React.MouseEventHandler = (e) => {
        if (e.button !== 0) return; // solo click izq
        arm(e.clientX, e.clientY);
    };

    const onMouseUp: React.MouseEventHandler = () => clear();
    const onMouseLeave: React.MouseEventHandler = () => clear();

    return {
        handlers: {
            onTouchStart,
            onTouchMove,
            onTouchEnd,
            onTouchCancel,
            onMouseDown,
            onMouseUp,
            onMouseLeave,
        },
    };
}