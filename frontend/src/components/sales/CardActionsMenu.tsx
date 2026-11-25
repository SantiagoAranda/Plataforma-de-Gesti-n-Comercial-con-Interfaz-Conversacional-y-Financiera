"use client";

import { useEffect, useLayoutEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

export const cardMenuActionClass = 'flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 disabled:opacity-40';

export function menuPosition(anchor: { left: number; right: number; top: number; bottom: number }, width: number, height: number, viewportWidth: number, viewportHeight: number) {
  const margin = 8;
  return {
    left: Math.max(margin, Math.min(anchor.right - width, viewportWidth - width - margin)),
    top: Math.max(margin, Math.min(anchor.bottom + margin, viewportHeight - height - margin)),
  };
}

/** Same card menu styling, portaled so card overflow and fixed bars cannot clip it. */
export default function CardActionsMenu({ open, onOpenChange, children, triggerLabel = 'Opciones de venta', menuLabel = 'Acciones de venta' }: {
  open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode; triggerLabel?: string; menuLabel?: string;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const [position, setPosition] = useState({ left: 8, top: 8 });
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      const rect = panel.current?.getBoundingClientRect();
      if (!anchor || !rect) return;
      if (anchor.bottom < 0 || anchor.top > window.innerHeight) { onOpenChange(false); return; }
      setPosition(menuPosition(anchor, rect.width, rect.height, window.innerWidth, window.innerHeight));
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    if (panel.current) observer?.observe(panel.current);
    return () => { window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); observer?.disconnect(); };
  }, [open, onOpenChange, children]);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const outside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) onOpenChange(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open, onOpenChange]);
  return <>
    <button ref={trigger} type="button" aria-label={triggerLabel} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={event => { event.stopPropagation(); onOpenChange(!open); }} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-50 focus-visible:outline-sky-600">
      <MoreVertical className="h-4 w-4" />
    </button>
    {open && createPortal(<div ref={panel} id={id} role="dialog" aria-label={menuLabel} style={position}
      className="fixed z-[80] w-64 max-w-[calc(100vw-16px)] max-h-[calc(100dvh-16px)] overflow-y-auto rounded-xl border border-slate-100 bg-white p-1.5 shadow-xl"
      onClick={event => event.stopPropagation()}
      onKeyDown={event => {
        const buttons = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onOpenChange(false); trigger.current?.focus(); }
        if (event.key === 'Tab') { onOpenChange(false); trigger.current?.focus(); }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && buttons.length) {
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next]?.focus();
        }
      }}>{children}</div>, document.body)}
  </>;
}
