"use client";

import {
  Mic,
  Plus,
  Search,
  Send,
  Smile,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  type ChangeEvent,
  type ReactNode,
  type RefObject,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/src/lib/utils";

type RightIconVariant = "send" | "search" | "mic" | "plus";
type LeftIconVariant = "plus" | "x" | "search";
type InputKind = "input" | "textarea";
type ButtonVariant = "plain" | "primary";

const rightIcons: Record<RightIconVariant, LucideIcon> = {
  send: Send,
  search: Search,
  mic: Mic,
  plus: Plus,
};

const leftIcons: Record<LeftIconVariant, LucideIcon> = {
  plus: Plus,
  x: X,
  search: Search,
};

type Props = {
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: () => void;
  onPlusClick?: () => void;
  leftAction?: () => void;
  rightAction?: () => void;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  isSubmitting?: boolean;
  rightIconVariant?: RightIconVariant;
  leftIconVariant?: LeftIconVariant;
  leftButtonVariant?: ButtonVariant;
  rightButtonVariant?: ButtonVariant;
  className?: string;
  inputClassName?: string;
  showEmojiIcon?: boolean;
  leadingIcon?: ReactNode;
  trailingContent?: ReactNode;
  centerContent?: ReactNode;
  inputKind?: InputKind;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  textareaProps?: Omit<
    TextareaHTMLAttributes<HTMLTextAreaElement>,
    "value" | "onChange" | "placeholder" | "className"
  >;
  hasError?: boolean;
  submitDisabled?: boolean;
  plusAriaLabel?: string;
  submitAriaLabel?: string;
  counter?: ReactNode;
  rightButtonClassName?: string;
};

export function WhatsappComposer({
  value = "",
  onChange,
  onSubmit,
  onPlusClick,
  leftAction,
  rightAction,
  leftIcon,
  rightIcon,
  placeholder,
  disabled = false,
  isSubmitting = false,
  rightIconVariant = "send",
  leftIconVariant = "plus",
  leftButtonVariant = "plain",
  rightButtonVariant = "primary",
  className,
  inputClassName,
  showEmojiIcon = false,
  leadingIcon,
  trailingContent,
  centerContent,
  inputKind = "input",
  textareaRef,
  textareaProps,
  hasError = false,
  submitDisabled = false,
  plusAriaLabel = "Agregar",
  submitAriaLabel = "Enviar",
  counter,
  rightButtonClassName,
}: Props) {
  const RightIcon = rightIcons[rightIconVariant];
  const LeftIcon = leftIcons[leftIconVariant];
  const resolvedLeftAction = leftAction ?? onPlusClick;
  const resolvedRightAction = rightAction ?? onSubmit;
  const isSubmitDisabled = disabled || isSubmitting || submitDisabled;

  const handleInputChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    onChange?.(event.target.value);
  };

  return (
    <div
      className={cn(
        "relative z-20 rounded-[28px] border border-slate-200/70 bg-white/90 px-2 py-2 shadow-sm",
        className,
      )}
    >
      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={resolvedLeftAction}
          disabled={disabled || isSubmitting}
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center self-center rounded-full bg-transparent transition focus:outline-none focus:ring-2 focus:ring-emerald-400/30 active:scale-95 disabled:pointer-events-none disabled:opacity-50",
            leftButtonVariant === "primary"
              ? "bg-[#25D366] text-white hover:bg-emerald-600"
              : "text-slate-500 hover:bg-slate-100/70 hover:text-slate-700",
          )}
          aria-label={plusAriaLabel}
        >
          {leftIcon ?? <LeftIcon className="h-5 w-5" />}
        </button>

        <div
          className={cn(
            "min-h-11 flex-1 rounded-[24px] bg-transparent px-3 py-3 ring-1 ring-transparent transition-colors",
            hasError ? "ring-red-300" : "focus-within:ring-emerald-300/70",
          )}
        >
          {centerContent ?? (
            <div className="flex items-center gap-2">
              {showEmojiIcon && (
                <Smile className="h-4 w-4 shrink-0 text-slate-400" />
              )}
              {leadingIcon}
              {inputKind === "textarea" ? (
                <textarea
                  ref={textareaRef}
                  value={value}
                  onChange={handleInputChange}
                  placeholder={placeholder}
                  disabled={disabled || isSubmitting}
                  className={cn(
                    "w-full resize-none border-none bg-transparent py-0 text-sm leading-relaxed text-slate-800 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed disabled:text-slate-400",
                    inputClassName,
                  )}
                  {...textareaProps}
                />
              ) : (
                <input
                  type="text"
                  value={value}
                  onChange={handleInputChange}
                  placeholder={placeholder}
                  disabled={disabled || isSubmitting}
                  className={cn(
                    "w-full border-none bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed disabled:text-slate-400",
                    inputClassName,
                  )}
                />
              )}
              {trailingContent}
            </div>
          )}
        </div>

        <div className="relative flex shrink-0 items-center justify-center self-center">
          {counter}
          <button
            type="button"
            onClick={resolvedRightAction}
            disabled={isSubmitDisabled}
            className={rightButtonClassName || cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition focus:outline-none focus:ring-2 focus:ring-emerald-400/35 active:scale-95",
              isSubmitDisabled && "cursor-not-allowed bg-slate-200 text-slate-400",
              !isSubmitDisabled && rightButtonVariant === "primary" && "bg-[#25D366] text-white hover:bg-emerald-600",
              !isSubmitDisabled && rightButtonVariant === "plain" && "bg-transparent text-slate-500 hover:bg-slate-100/70 hover:text-slate-700",
            )}
            aria-label={submitAriaLabel}
          >
            {rightIcon ?? <RightIcon className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
