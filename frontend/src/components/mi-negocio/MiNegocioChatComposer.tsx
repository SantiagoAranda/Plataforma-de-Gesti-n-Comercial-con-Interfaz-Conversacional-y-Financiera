"use client";

import { useEffect, useRef, useState } from "react";
import { ItemType } from "@/src/types/item";
import { WhatsappComposer } from "@/src/components/shared/WhatsappComposer";

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
  submitDisabled?: boolean;
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
  submitDisabled = false,
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
    PRODUCT: mode === "edit" ? "Editar descripción (opcional)..." : "Descripción (opcional)",
    SERVICE: mode === "edit" ? "Editar descripción (opcional)..." : "Descripción (opcional)",
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
    <div className="fixed inset-x-0 bottom-0 z-30 bg-white px-4 pb-3 pt-2 lg:left-[408px] lg:right-0">
      <div className="mx-auto w-full max-w-3xl">
        <div className="relative">
          {/* OVERLAY BACKDROP */}
          {isOpen && (
            <div
              className="fixed inset-0 -z-10 bg-black/40 transition-opacity duration-300"
              onClick={onToggle}
            />
          )}

          {/* EXPANDABLE CONTENT */}
          {isOpen && (
            <div className="pointer-events-auto absolute bottom-[calc(100%+8px)] left-0 right-0 z-10 rounded-[28px] overflow-hidden border border-neutral-400 bg-white shadow-[0_18px_40px_rgba(0,0,0,0.14)] animate-in slide-in-from-bottom-4 duration-300">
              <div className="max-h-[min(65vh,520px)] overflow-y-auto pt-4 pb-5 px-5 custom-scrollbar scrollbar-thin scrollbar-thumb-neutral-300 scrollbar-track-transparent">
                {children}
              </div>
            </div>
          )}

          {/* CHAT BAR */}
          <WhatsappComposer
            value={isOpen ? description : searchValue}
            onChange={isOpen ? handleDescriptionChange : onSearchChange}
            onPlusClick={onToggle}
            onSubmit={onSubmit}
            placeholder={isOpen ? placeholders[type] : "Buscar producto o servicio..."}
            isSubmitting={isSubmitting}
            submitDisabled={submitDisabled}
            leftIconVariant={isOpen ? "x" : "plus"}
            rightIconVariant={isOpen ? "send" : "search"}
            inputKind={isOpen ? "textarea" : "input"}
            textareaRef={textareaRef}
            textareaProps={{ rows: 1, maxLength: 250 }}
            plusAriaLabel={isOpen ? "Cancelar" : "Nuevo item"}
            submitAriaLabel={label}
            counter={
              isOpen && isExpanded ? (
                <span className="absolute -top-7 z-10 whitespace-nowrap text-[10px] font-medium text-neutral-400">
                  {description.length}/250
                </span>
              ) : null
            }
          />
        </div>
      </div>
    </div>
  );
}
