import { WhatsappComposer } from "@/src/components/shared/WhatsappComposer";

type Props = {
  searchValue: string;
  onSearchChange: (value: string) => void;
  onCreateEmployee: () => void;
};

export function PayrollChatActionBar({
  searchValue,
  onSearchChange,
  onCreateEmployee,
}: Props) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-100 bg-white/95 px-3 py-3 shadow-[0_-8px_30px_rgb(0,0,0,0.02)] backdrop-blur lg:left-[408px] lg:right-0"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto w-full max-w-3xl">
        <div className="relative">
          <WhatsappComposer
            value={searchValue}
            onChange={onSearchChange}
            onPlusClick={onCreateEmployee}
            placeholder="Buscar empleado..."
            leftIconVariant="plus"
            rightIconVariant="search"
            rightButtonVariant="primary"
            plusAriaLabel="Crear empleado"
            submitAriaLabel="Buscar empleado"
          />
        </div>
      </div>
    </div>
  );
}
