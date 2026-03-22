"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Send, X, Search } from "lucide-react";
import { ItemType } from "@/src/types/item";

interface MiNegocioChatComposerProps {
  mode: "closed" | "create" | "edit";
  onToggle: () => void;
  searchValue: string;
  onSearchChange: (val: string) => void;
  description: string;
  onDescriptionChange: (val: string) => void;
  onSubmit: () => void;
  isSubmitting?: boolean;
  children: React.ReactNode;
  type: ItemType;
}

export function MiNegocioChatComposer({
  mode,
  onToggle,
  searchValue,
  onSearchChange,
  description,
  onDescriptionChange,
  onSubmit,
  isSubmitting = false,
  children,
  type,
}: MiNegocioChatComposerProps) {
  const isOpen = mode !== "closed";
  const label = mode === "edit" ? "Editar" : "Crear";
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  
  const handleDescriptionChange = (val: string) => {
    if (val.length <= 250) {
      onDescriptionChange(val);
    } else {
      onDescriptionChange(val.slice(0, 250));
    }
  };

  const placeholders = {
    PRODUCT: mode === "edit" ? "Editar descripción del producto..." : "Describre el producto...",
    SERVICE: mode === "edit" ? "Editar descripción del servicio..." : "Describre el servicio...",
  };

  // Autosize effect
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea && isOpen) {
      textarea.style.height = "auto";
      const scrollHeight = textarea.scrollHeight;
      
      // text-sm leading-relaxed gives ~22.75px per line. 2 lines is ~45.5px.
      // 50px is a safe threshold for > 2 lines (i.e. 3 lines or more).
      setIsExpanded(scrollHeight > 50);

      // Approximate 6 lines height (20px per line + padding)
      const maxRowsHeight = 20 * 6 + 12; 
      if (scrollHeight > maxRowsHeight) {
        textarea.style.height = `${maxRowsHeight}px`;
        textarea.style.overflowY = "auto";
      } else {
        textarea.style.height = `${scrollHeight}px`;
        textarea.style.overflowY = "hidden";
      }
    } else {
      setIsExpanded(false);
    }
  }, [description, isOpen]);

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 px-3 pb-4 pt-2 sm:px-4">
      <div className="mx-auto w-full max-w-3xl">
        <div className="relative">
          {/* EXPANDABLE CONTENT */}
          {isOpen && (
            <div className="pointer-events-auto absolute bottom-[calc(100%+8px)] left-0 right-0 z-10">
              <div className="max-h-[min(65vh,520px)] overflow-y-auto custom-scrollbar rounded-[28px] border border-black/5 bg-white p-5 shadow-[0_18px_40px_rgba(0,0,0,0.14)] animate-in slide-in-from-bottom-4 duration-300">
                {children}
              </div>
            </div>
          )}

          {/* CHAT BAR */}
          <div className="relative z-20 rounded-[28px] bg-white p-2 shadow-[0_-6px_24px_rgba(0,0,0,0.08)] ring-1 ring-black/5">
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={onToggle}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 transition hover:bg-neutral-200"
                aria-label={isOpen ? "Cancelar" : "Nuevo item"}
              >
                {isOpen ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
              </button>

              <div className="min-h-11 flex-1 rounded-[22px] bg-neutral-50 px-4 py-3 ring-1 ring-neutral-200">
                {isOpen ? (
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    maxLength={250}
                    value={description}
                    onChange={(e) => handleDescriptionChange(e.target.value)}
                    placeholder={placeholders[type]}
                    className="w-full border-none bg-transparent text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none resize-none leading-relaxed overflow-hidden py-0"
                  />
                ) : (
                  <input
                    type="text"
                    value={searchValue}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Buscar producto o servicio..."
                    className="w-full border-none bg-transparent text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none"
                  />
                )}
              </div>

              <div className="relative flex shrink-0 items-center justify-center">
                {isOpen && isExpanded && (
                  <span className="absolute -top-7 text-[10px] font-medium text-neutral-400 z-10 whitespace-nowrap">
                    {description.length}/250
                  </span>
                )}
                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={isSubmitting || (isOpen && !description.trim())}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition active:scale-95 ${
                    isSubmitting || (isOpen && !description.trim()) ? "bg-neutral-200 text-neutral-400 pointer-events-none" : "bg-emerald-500 hover:bg-emerald-600"
                  }`}
                  aria-label={label}
                >
                  {isOpen ? <Send className="h-4 w-4" /> : <Search className="h-4 w-4 text-white" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
