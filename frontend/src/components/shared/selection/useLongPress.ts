"use client";

import { useCallback, useRef } from "react";

type Options = {
    onLongPress: () => void;
    delay?: number;
};

export function useLongPress({ onLongPress, delay = 450 }: Options) {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isLongPressActiveRef = useRef(false);
    const lastTriggeredTimeRef = useRef(0);
    const startPointRef = useRef<{ x: number, y: number } | null>(null);
    const pointerTypeRef = useRef<"mouse" | "touch" | null>(null);
    const moveThresholdPx = 15;

    const clearTimer = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const start = useCallback((e: any) => {
        // Prevent duplicate triggers (prefer touch over mouse)
        if (pointerTypeRef.current === "touch" && e.type === "mousedown") return;
        
        if (e.type === "touchstart") {
            pointerTypeRef.current = "touch";
            const touch = e.touches[0];
            startPointRef.current = { x: touch.clientX, y: touch.clientY };
        } else {
            pointerTypeRef.current = "mouse";
            startPointRef.current = { x: e.clientX, y: e.clientY };
        }

        clearTimer();
        isLongPressActiveRef.current = false;

        timerRef.current = setTimeout(() => {
            isLongPressActiveRef.current = true;
            lastTriggeredTimeRef.current = Date.now();
            onLongPress();
            clearTimer();
        }, delay);
    }, [clearTimer, delay, onLongPress]);

    const handleMove = useCallback((e: any) => {
        if (!startPointRef.current || !timerRef.current) return;
        
        const currentX = e.type === "touchmove" ? e.touches[0].clientX : e.clientX;
        const currentY = e.type === "touchmove" ? e.touches[0].clientY : e.clientY;
        
        const dx = currentX - startPointRef.current.x;
        const dy = currentY - startPointRef.current.y;
        
        if (Math.hypot(dx, dy) > moveThresholdPx) {
            clearTimer();
            startPointRef.current = null;
        }
    }, [clearTimer]);

    const cancel = useCallback(() => {
        clearTimer();
        startPointRef.current = null;
    }, [clearTimer]);

    const consumeLongPress = useCallback(() => {
        const now = Date.now();
        const wasJustTriggered = now - lastTriggeredTimeRef.current < 200;
        return isLongPressActiveRef.current || wasJustTriggered;
    }, []);

    const end = useCallback(() => {
        cancel();
    }, [cancel]);

    return {
        handlers: {
            onMouseDown: start,
            onMouseUp: end,
            onMouseLeave: cancel,
            onMouseMove: handleMove,
            onTouchStart: start,
            onTouchEnd: end,
            onTouchCancel: cancel,
            onTouchMove: handleMove,
        },
        consumeLongPress,
    };
}