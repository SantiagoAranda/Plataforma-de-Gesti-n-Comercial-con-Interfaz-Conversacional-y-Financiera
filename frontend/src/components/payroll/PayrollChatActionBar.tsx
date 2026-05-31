"use client";

import { ClipboardPlus, ReceiptText, UserPlus, FileSignature } from "lucide-react";
import { WhatsappComposer } from "@/src/components/shared/WhatsappComposer";

type PayrollAction = "employees" | "contracts" | "new-record" | "settlement";

type Props = {
  open: boolean;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onToggle: () => void;
  onAction: (action: PayrollAction) => void;
};

export function PayrollChatActionBar({
  open,
  searchValue,
  onSearchChange,
  onToggle,
  onAction,
}: Props) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 bg-[#f7f3ed] px-4 pb-3 pt-2 lg:left-[408px] lg:right-0">
      <div className="mx-auto w-full max-w-3xl">
        <div className="relative">
          {open && (
            <div className="pointer-events-auto absolute bottom-[calc(100%+8px)] left-0 right-0 z-10">
              <div className="rounded-[28px] border border-black/5 bg-white p-3 shadow-[0_18px_40px_rgba(0,0,0,0.14)] animate-in slide-in-from-bottom-4 duration-300">
                <button
                  type="button"
                  onClick={() => onAction("employees")}
                  className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-slate-50 px-3 py-2 text-left text-[13px] font-medium text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-800 active:scale-[0.98]"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-[#0fb18f] shadow-sm">
                    <UserPlus className="h-4 w-4" />
                  </span>
                  <span>Empleados</span>
                </button>
                <button
                  type="button"
                  onClick={() => onAction("contracts")}
                  className="mt-2 flex min-h-14 w-full items-center gap-3 rounded-2xl bg-slate-50 px-3 py-2 text-left text-[13px] font-medium text-slate-700 transition hover:bg-blue-50 hover:text-blue-800 active:scale-[0.98]"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-blue-500 shadow-sm">
                    <FileSignature className="h-4 w-4" />
                  </span>
                  <span>Contratos</span>
                </button>
                <button
                  type="button"
                  onClick={() => onAction("new-record")}
                  className="mt-2 flex min-h-14 w-full items-center gap-3 rounded-2xl bg-slate-50 px-3 py-2 text-left text-[13px] font-medium text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-800 active:scale-[0.98]"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-[#0fb18f] shadow-sm">
                    <ClipboardPlus className="h-4 w-4" />
                  </span>
                  <span>Nuevo registro de nomina</span>
                </button>
                <button
                  type="button"
                  onClick={() => onAction("settlement")}
                  className="mt-2 flex min-h-14 w-full items-center gap-3 rounded-2xl bg-slate-50 px-3 py-2 text-left text-[13px] font-medium text-slate-700 transition hover:bg-violet-50 hover:text-violet-800 active:scale-[0.98]"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-violet-500 shadow-sm">
                    <ReceiptText className="h-4 w-4" />
                  </span>
                  <span>Simular liquidacion de contrato</span>
                </button>
              </div>
            </div>
          )}

          <WhatsappComposer
            value={open ? "" : searchValue}
            onChange={open ? undefined : onSearchChange}
            onPlusClick={onToggle}
            placeholder={open ? "Selecciona una accion..." : "Buscar empleado..."}
            leftIconVariant={open ? "x" : "plus"}
            rightIconVariant={open ? "send" : "search"}
            rightButtonVariant="plain"
            submitDisabled
            plusAriaLabel={open ? "Cerrar acciones" : "Abrir acciones de nomina"}
            submitAriaLabel="Buscar empleado"
          />
        </div>
      </div>
    </div>
  );
}
