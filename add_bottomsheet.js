const fs = require('fs');
let file = 'frontend/app/(app)/nomina/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const newComponent = `function EmployeeEditBottomSheet({
  isOpen,
  onClose,
  run,
  onEditEmployee,
  onEditContract,
  onOpenNews,
  onCreateContract,
  onInactivateContract,
  onInactivateEmployee,
  onHardDeleteEmployee,
}: {
  isOpen: boolean;
  onClose: () => void;
  run: PayrollRun;
  onEditEmployee?: (employee: Employee) => void;
  onEditContract?: (run: PayrollRun) => void;
  onOpenNews?: (run: PayrollRun) => void;
  onCreateContract?: (employee: Employee) => void;
  onInactivateContract?: (contract: Contract) => void;
  onInactivateEmployee?: (employee: Employee) => void;
  onHardDeleteEmployee?: (employee: Employee) => void;
}) {
  const [activeTab, setActiveTab] = useState<"horas" | "contrato" | "empleado">("horas");

  if (!isOpen) return null;

  const canCalculateNews = run.contract?.isActive !== false && !run.contract?.endDate;

  return (
    <>
      <div 
        className="fixed inset-0 z-[60] bg-black/20 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      <div className="fixed bottom-0 left-0 right-0 z-[70] mx-auto max-w-3xl rounded-t-[28px] bg-white p-5 shadow-2xl transition-transform animate-in slide-in-from-bottom">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{employeeName(run.employee)}</h2>
            <p className="text-xs font-medium text-slate-500">
              {run.employee.documentNumber ?? "Sin doc."} • {employeeRole(run.employee, run.contract)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 flex gap-1 rounded-xl bg-slate-100 p-1">
          <button
            onClick={() => setActiveTab("horas")}
            className={cn("flex-1 rounded-lg py-1.5 text-xs font-bold transition-colors", activeTab === "horas" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}
          >
            Horas/Ajustes
          </button>
          <button
            onClick={() => setActiveTab("contrato")}
            className={cn("flex-1 rounded-lg py-1.5 text-xs font-bold transition-colors", activeTab === "contrato" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}
          >
            Contrato
          </button>
          <button
            onClick={() => setActiveTab("empleado")}
            className={cn("flex-1 rounded-lg py-1.5 text-xs font-bold transition-colors", activeTab === "empleado" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}
          >
            Empleado
          </button>
        </div>

        <div className="min-h-[150px] pb-6">
          {activeTab === "horas" && (
            <div className="flex flex-col gap-2">
              <button 
                type="button" 
                disabled={!canCalculateNews} 
                onClick={() => { onClose(); if (canCalculateNews) onOpenNews?.(run); }} 
                className="flex w-full items-center justify-between rounded-2xl bg-emerald-50 px-4 py-4 text-left transition hover:bg-emerald-100 disabled:opacity-50"
              >
                <div>
                  <p className="text-sm font-bold text-emerald-900">Novedades</p>
                  <p className="text-xs font-medium text-emerald-700">Horas extras, comisiones, bonificaciones y deducciones.</p>
                </div>
                <ChevronRight className="h-5 w-5 text-emerald-600" />
              </button>
            </div>
          )}

          {activeTab === "contrato" && (
            <div className="flex flex-col gap-2">
              <button 
                type="button" 
                onClick={() => { onClose(); onEditContract?.(run); }} 
                className="flex w-full items-center justify-between rounded-2xl bg-slate-50 px-4 py-4 text-left transition hover:bg-slate-100"
              >
                <p className="text-sm font-bold text-slate-800">Editar contrato</p>
                <ChevronRight className="h-5 w-5 text-slate-400" />
              </button>
              
              <button 
                type="button" 
                onClick={() => { onClose(); onCreateContract?.(run.employee); }} 
                className="flex w-full items-center justify-between rounded-2xl bg-slate-50 px-4 py-4 text-left transition hover:bg-slate-100"
              >
                <p className="text-sm font-bold text-slate-800">Nuevo contrato</p>
                <ChevronRight className="h-5 w-5 text-slate-400" />
              </button>
              
              <button 
                type="button" 
                disabled={!run.contract || run.contract.isActive === false} 
                onClick={() => { onClose(); if (run.contract) onInactivateContract?.(run.contract); }} 
                className="flex w-full items-center justify-between rounded-2xl bg-amber-50 px-4 py-4 text-left transition hover:bg-amber-100 disabled:opacity-50"
              >
                <p className="text-sm font-bold text-amber-800">Inactivar contrato</p>
                <ChevronRight className="h-5 w-5 text-amber-600" />
              </button>
            </div>
          )}

          {activeTab === "empleado" && (
            <div className="flex flex-col gap-2">
              <button 
                type="button" 
                onClick={() => { onClose(); onEditEmployee?.(run.employee); }} 
                className="flex w-full items-center justify-between rounded-2xl bg-slate-50 px-4 py-4 text-left transition hover:bg-slate-100"
              >
                <p className="text-sm font-bold text-slate-800">Editar empleado</p>
                <ChevronRight className="h-5 w-5 text-slate-400" />
              </button>
              
              <button 
                type="button" 
                onClick={() => { onClose(); onInactivateEmployee?.(run.employee); }} 
                className="flex w-full items-center justify-between rounded-2xl bg-orange-50 px-4 py-4 text-left transition hover:bg-orange-100"
              >
                <p className="text-sm font-bold text-orange-800">Inactivar empleado</p>
                <ChevronRight className="h-5 w-5 text-orange-600" />
              </button>

              <button 
                type="button" 
                onClick={() => { onClose(); onHardDeleteEmployee?.(run.employee); }} 
                className="flex w-full items-center justify-between rounded-2xl bg-rose-50 px-4 py-4 text-left transition hover:bg-rose-100"
              >
                <p className="text-sm font-bold text-rose-800">Eliminar empleado</p>
                <ChevronRight className="h-5 w-5 text-rose-600" />
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function PayrollSummaryPanel`;

content = content.replace('function PayrollSummaryPanel', newComponent);

fs.writeFileSync(file, content);
