"use client";

import { useRef, useState } from "react";

type Direction = "left" | "right";

interface InteractiveNavigationOptions {
  direction: Direction;
  disabled?: boolean;
  edgeStart?: number;
  distanceRatio?: number;
  velocityThreshold?: number;
  onOffsetChange: (offset: number) => void;
  onComplete: (velocity: number) => void;
  onCancel: () => void;
}

const AXIS_LOCK_THRESHOLD = 8;
const INTERACTIVE_SELECTOR = [
  "input",
  "textarea",
  "select",
  "button",
  "a",
  "[role='button']",
  "[contenteditable='true']",
  "[data-swipe-ignore='true']",
].join(",");

export function useInteractiveHorizontalNavigation({
  direction,
  disabled = false,
  edgeStart,
  distanceRatio = 0.3,
  velocityThreshold = 0.45,
  onOffsetChange,
  onComplete,
  onCancel,
}: InteractiveNavigationOptions) {
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const lastX = useRef(0);
  const lastTimestamp = useRef(0);
  const lastVelocity = useRef(0);
  const pointerId = useRef<number | null>(null);
  const axis = useRef<"pending" | "horizontal" | "vertical">("pending");
  const [isDragging, setIsDragging] = useState(false);

  const reset = () => {
    startX.current = null;
    startY.current = null;
    lastX.current = 0;
    lastTimestamp.current = 0;
    lastVelocity.current = 0;
    pointerId.current = null;
    axis.current = "pending";
    setIsDragging(false);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (disabled || (event.pointerType === "mouse" && event.button !== 0)) return;

    const target = event.target as HTMLElement;
    if (target.closest(INTERACTIVE_SELECTOR)) return;
    if (typeof edgeStart === "number" && event.clientX > edgeStart) return;

    const now = performance.now();
    startX.current = event.clientX;
    startY.current = event.clientY;
    lastX.current = event.clientX;
    lastTimestamp.current = now;
    pointerId.current = event.pointerId;
    axis.current = "pending";
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (
      disabled ||
      startX.current === null ||
      startY.current === null ||
      pointerId.current !== event.pointerId
    ) {
      return;
    }

    const deltaX = event.clientX - startX.current;
    const deltaY = event.clientY - startY.current;

    if (axis.current === "pending") {
      if (Math.abs(deltaX) < AXIS_LOCK_THRESHOLD && Math.abs(deltaY) < AXIS_LOCK_THRESHOLD) return;

      if (Math.abs(deltaX) <= Math.abs(deltaY) * 1.1) {
        axis.current = "vertical";
        reset();
        onCancel();
        return;
      }

      axis.current = "horizontal";
      setIsDragging(true);
    }

    if (axis.current !== "horizontal") return;

    const now = performance.now();
    const elapsed = Math.max(now - lastTimestamp.current, 1);
    lastVelocity.current = (event.clientX - lastX.current) / elapsed;
    lastX.current = event.clientX;
    lastTimestamp.current = now;

    const viewportWidth = event.currentTarget.clientWidth || window.innerWidth;
    const rawOffset = deltaX;
    const offset =
      direction === "left"
        ? Math.max(-viewportWidth, Math.min(0, rawOffset))
        : Math.max(0, Math.min(viewportWidth, rawOffset));

    onOffsetChange(offset);
  };

  const finish = (event: React.PointerEvent<HTMLElement>) => {
    if (
      disabled ||
      startX.current === null ||
      startY.current === null ||
      pointerId.current !== event.pointerId ||
      axis.current !== "horizontal"
    ) {
      reset();
      return;
    }

    const viewportWidth = event.currentTarget.clientWidth || window.innerWidth;
    const deltaX = event.clientX - startX.current;
    const offset =
      direction === "left"
        ? Math.max(-viewportWidth, Math.min(0, deltaX))
        : Math.max(0, Math.min(viewportWidth, deltaX));
    const progress = Math.abs(offset) / Math.max(viewportWidth, 1);
    const now = performance.now();
    const tailElapsed = Math.max(now - lastTimestamp.current, 1);
    const tailDelta = event.clientX - lastX.current;
    const velocity =
      Math.abs(tailDelta) >= 0.5
        ? tailDelta / tailElapsed
        : tailElapsed > 80
          ? 0
          : lastVelocity.current;
    const matchesVelocity =
      direction === "left" ? velocity <= -velocityThreshold : velocity >= velocityThreshold;

    reset();
    if (progress >= distanceRatio || matchesVelocity) onComplete(velocity);
    else onCancel();
  };

  const onPointerCancel = () => {
    const wasHorizontal = axis.current === "horizontal";
    reset();
    if (wasHorizontal) onCancel();
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: finish,
    onPointerCancel,
    isDragging,
  };
}
