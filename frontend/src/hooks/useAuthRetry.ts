"use client";
import { useEffect, useState } from "react";
export function useAuthRetry() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (seconds <= 0) return;
    const timer = window.setTimeout(
      () => setSeconds((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [seconds]);
  return {
    retrySeconds: seconds,
    setRetrySeconds: (value: number) =>
      setSeconds(Math.max(1, Math.ceil(value || 1))),
  };
}
