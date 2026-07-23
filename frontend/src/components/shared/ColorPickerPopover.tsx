"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface ColorPickerPopoverProps {
  color: string;
  onChange: (newColor: string) => void;
  label?: string;
  fallbackColor?: string;
}

const PRESET_COLORS = [
  "#333333",
  "#94A3B8",
  "#FFFFFF",
  "#33CEFF",
  "#22C55E",
  "#A855F7",
  "#F97316",
  "#EF4444",
  "#064E3B",
  "#0B3F64",
];

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const cleanHex = hex.replace("#", "").trim();
  if (cleanHex.length === 3) {
    const r = parseInt(cleanHex[0] + cleanHex[0], 16);
    const g = parseInt(cleanHex[1] + cleanHex[1], 16);
    const b = parseInt(cleanHex[2] + cleanHex[2], 16);
    return { r, g, b };
  }
  if (cleanHex.length === 6) {
    const r = parseInt(cleanHex.slice(0, 2), 16);
    const g = parseInt(cleanHex.slice(2, 4), 16);
    const b = parseInt(cleanHex.slice(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return { r, g, b };
  }
  return null;
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function getHueRgb(x: number): { r: number; g: number; b: number } {
  const h = x * 6;
  const i = Math.floor(h);
  const f = h - i;
  const q = Math.round(255 * (1 - f));
  const t = Math.round(255 * f);

  switch (i % 6) {
    case 0:
      return { r: 255, g: t, b: 0 };
    case 1:
      return { r: q, g: 255, b: 0 };
    case 2:
      return { r: 0, g: 255, b: t };
    case 3:
      return { r: 0, g: q, b: 255 };
    case 4:
      return { r: t, g: 0, b: 255 };
    case 5:
      return { r: 255, g: 0, b: q };
    default:
      return { r: 255, g: 0, b: 0 };
  }
}

function getColorAt(x: number, y: number): string {
  const hueRgb = getHueRgb(x);
  let r: number, g: number, b: number;
  if (y <= 0.5) {
    const factor = y * 2;
    r = 255 + (hueRgb.r - 255) * factor;
    g = 255 + (hueRgb.g - 255) * factor;
    b = 255 + (hueRgb.b - 255) * factor;
  } else {
    const factor = (1 - y) * 2;
    r = hueRgb.r * factor;
    g = hueRgb.g * factor;
    b = hueRgb.b * factor;
  }
  return rgbToHex(r, g, b);
}

export default function ColorPickerPopover({
  color,
  onChange,
  fallbackColor = "#000000",
}: ColorPickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const [showSpectrum, setShowSpectrum] = useState(true);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number }>({
    x: 0.5,
    y: 0.5,
  });
  const [hexInput, setHexInput] = useState(color || fallbackColor);

  const popoverRef = useRef<HTMLDivElement>(null);
  const spectrumRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    setHexInput(color.toUpperCase());
  }, [color]);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleSpectrumMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!spectrumRef.current) return;
      const rect = spectrumRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

      setCursorPos({ x, y });
      const newHex = getColorAt(x, y);
      setHexInput(newHex);
      onChange(newHex);
    },
    [onChange]
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    handleSpectrumMove(e.clientX, e.clientY);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging.current) {
        handleSpectrumMove(e.clientX, e.clientY);
      }
    };
    const handleMouseUp = () => {
      isDragging.current = false;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleSpectrumMove]);

  const handleHexTextChange = (value: string) => {
    setHexInput(value);
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      onChange(value.toUpperCase());
    }
  };

  const currentColor = color || fallbackColor;

  return (
    <div className="relative w-full" ref={popoverRef}>
      {/* Trigger Button & Input */}
      <div className="flex items-center gap-2 w-full">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="h-11 w-14 shrink-0 rounded-2xl border border-neutral-200 p-1 shadow-sm transition hover:scale-105 active:scale-95 focus:outline-none cursor-pointer"
          style={{ backgroundColor: currentColor }}
          aria-label="Abrir selector de color"
        />
        <input
          value={hexInput}
          onChange={(e) => handleHexTextChange(e.target.value)}
          onFocus={() => setOpen(true)}
          className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-4 text-sm font-mono uppercase text-neutral-800 shadow-sm outline-none transition placeholder:text-neutral-400 focus:border-[#0B3F64] focus:ring-2 focus:ring-[#0B3F64]/10"
          placeholder="#000000"
        />
      </div>

      {/* Popover Dropdown */}
      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-[100] w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-[#18181B] p-3.5 shadow-2xl text-white backdrop-blur-md">
          {/* Spectrum Gradient Box */}
          {showSpectrum && (
            <div
              ref={spectrumRef}
              onMouseDown={handleMouseDown}
              className="relative h-36 w-full cursor-crosshair overflow-hidden rounded-xl select-none"
              style={{
                background:
                  "linear-gradient(to bottom, #ffffff 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,0) 50%, #000000 100%), linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)",
              }}
            >
              {/* Cursor Ring */}
              <div
                className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-md border-2 border-white shadow-lg"
                style={{
                  left: `${cursorPos.x * 100}%`,
                  top: `${cursorPos.y * 100}%`,
                  backgroundColor: currentColor,
                }}
              />
            </div>
          )}

          {/* Current Color Indicator + HEX Field */}
          <div className="mt-3 flex items-center gap-3 rounded-xl bg-[#27272A] px-3 py-2">
            <span
              className="h-5 w-5 shrink-0 rounded-full border border-white/20 shadow-sm"
              style={{ backgroundColor: currentColor }}
            />
            <input
              type="text"
              value={hexInput}
              onChange={(e) => handleHexTextChange(e.target.value)}
              className="w-full bg-transparent font-mono text-sm font-semibold uppercase text-white outline-none"
              placeholder="#FFFFFF"
            />
          </div>

          {/* Preset Swatches & Toggle */}
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {PRESET_COLORS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    onChange(preset);
                    setHexInput(preset);
                  }}
                  className={`h-5.5 w-5.5 rounded-full border border-white/20 transition-transform hover:scale-125 focus:outline-none ${
                    currentColor.toUpperCase() === preset.toUpperCase()
                      ? "ring-2 ring-white scale-110"
                      : ""
                  }`}
                  style={{ backgroundColor: preset }}
                  aria-label={`Seleccionar ${preset}`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowSpectrum((prev) => !prev)}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white transition"
              aria-label="Alternar espectro"
            >
              {showSpectrum ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
