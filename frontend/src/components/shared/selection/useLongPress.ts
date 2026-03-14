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

    const clearTimer = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const start = useCallback(() => {
        clearTimer();
        isLongPressActiveRef.current = false;

        timerRef.current = setTimeout(() => {
            isLongPressActiveRef.current = true;
            lastTriggeredTimeRef.current = Date.now();
            onLongPress();
            clearTimer();
        }, delay);
    }, [clearTimer, delay, onLongPress]);

    const cancel = useCallback(() => {
        clearTimer();
    }, [clearTimer]);

    const consumeLongPress = useCallback(() => {
        // Consumes if it was just triggered in the last 150ms
        const now = Date.now();
        const wasJustTriggered = now - lastTriggeredTimeRef.current < 150;
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
            onTouchStart: start,
            onTouchEnd: end,
            onTouchCancel: cancel,
        },
        consumeLongPress,
    };
}