"use client";

import { useCallback, useRef } from "react";

type Options = {
    onLongPress: () => void;
    delay?: number;
};

export function useLongPress({ onLongPress, delay = 450 }: Options) {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const longPressTriggeredRef = useRef(false);

    const clearTimer = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const start = useCallback(() => {
        clearTimer();
        longPressTriggeredRef.current = false;

        timerRef.current = setTimeout(() => {
            longPressTriggeredRef.current = true;
            onLongPress();
            clearTimer();
        }, delay);
    }, [clearTimer, delay, onLongPress]);

    const cancel = useCallback(() => {
        clearTimer();
    }, [clearTimer]);

    const consumeLongPress = useCallback(() => {
        const wasTriggered = longPressTriggeredRef.current;
        if (wasTriggered) {
            longPressTriggeredRef.current = false;
        }
        return wasTriggered;
    }, []);

    return {
        handlers: {
            onMouseDown: start,
            onMouseUp: cancel,
            onMouseLeave: cancel,
            onTouchStart: start,
            onTouchEnd: cancel,
            onTouchCancel: cancel,
        },
        consumeLongPress,
    };
}