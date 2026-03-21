"use client";

import { X } from "lucide-react";

interface ItemPanelLayoutProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  open: boolean;
}

export function ItemPanelLayout({
  title,
  subtitle,
  onClose,
  children,
  footer,
  open,
}: ItemPanelLayoutProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-end justify-center bg-black/40 sm:items-center sm:p-4 backdrop-blur-sm transition-opacity">
      <div 
        className="w-full sm:max-w-md flex flex-col bg-white rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden h-full max-h-[92vh] sm:h-auto sm:max-h-[90vh] animate-in slide-in-from-bottom-full duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER (FIXED) */}
        <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between bg-white sticky top-0 z-20">
          <div className="flex flex-col">
            <h2 className="font-bold text-neutral-900 text-lg">
              {title}
            </h2>
            {subtitle && (
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest leading-none mt-1">
                {subtitle}
              </span>
            )}
          </div>

          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-neutral-100 transition text-neutral-500"
          >
            <X size={20} />
          </button>
        </div>

        {/* CONTENT (SCROLLABLE) */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-neutral-50/10">
          {children}
        </div>

        {/* FOOTER (OPTIONAL FIXED) */}
        {footer && (
          <div className="px-5 py-4 border-t border-neutral-100 bg-white sticky bottom-0 z-20">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
