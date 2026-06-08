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
    <div className="fixed inset-x-0 bottom-0 z-30 bg-[#f7f3ed] px-4 pb-3 pt-2 lg:left-[408px] lg:right-0">
      <div className="mx-auto w-full max-w-3xl">
        <div className="relative">
          <WhatsappComposer
            value={searchValue}
            onChange={onSearchChange}
            onPlusClick={onCreateEmployee}
            placeholder="Buscar empleado..."
            leftIconVariant="plus"
            rightIconVariant="search"
            rightButtonVariant="plain"
            submitDisabled
            plusAriaLabel="Crear empleado"
            submitAriaLabel="Buscar empleado"
          />
        </div>
      </div>
    </div>
  );
}
