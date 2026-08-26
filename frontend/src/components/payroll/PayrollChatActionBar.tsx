import { WhatsappComposer } from "@/src/components/shared/WhatsappComposer";

type Props = {
  searchValue: string;
  onSearchChange: (value: string) => void;
  onCreateEmployee: () => void;
  isOpen?: boolean;
  onClose?: () => void;
  onSubmit?: () => void;
  isSubmitting?: boolean;
  submitLabel?: string;
};

export function PayrollChatActionBar({
  searchValue,
  onSearchChange,
  onCreateEmployee,
  isOpen = false,
  onClose,
  onSubmit,
  isSubmitting = false,
  submitLabel = "Crear empleado",
}: Props) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[80] px-3 py-3 lg:left-[408px] lg:right-0"
      style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto w-full max-w-3xl">
        <div className="relative">
          <WhatsappComposer
            value={searchValue}
            onChange={onSearchChange}
            leftAction={isOpen && onClose ? onClose : onCreateEmployee}
            onSubmit={isOpen ? onSubmit : undefined}
            isSubmitting={isSubmitting}
            placeholder={isOpen ? `${submitLabel}...` : "Buscar empleado..."}
            leftIconVariant={isOpen ? "x" : "plus"}
            rightIconVariant={isOpen ? "send" : "search"}
            rightButtonVariant="primary"
            plusAriaLabel={isOpen ? "Cancelar" : "Crear empleado"}
            submitAriaLabel={isOpen ? submitLabel : "Buscar empleado"}
            className="rounded-[24px] border border-slate-200 bg-white p-1 shadow-sm"
          />
        </div>
      </div>
    </div>
  );
}
