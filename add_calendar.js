const fs = require('fs');
let content = fs.readFileSync('frontend/app/(app)/nomina/page.tsx', 'utf8');

// 1. Remove old PeriodSelector definition
content = content.replace(/function PeriodSelector.*?<div className="mb-4 flex justify-end">.*?<\/div>\s*\);\s*}/s, '');

// 1.1 Remove old PeriodSelector usage
content = content.replace(/<PeriodSelector periods={periods} selectedId={selectedPeriodId} onChange={setSelectedPeriodId} \/>/, '');

// 2. Add HeaderCalendar
const headerCalendar = `function HeaderCalendar({
  periods,
  selectedId,
  onChange,
  onCreateOrSelect
}: {
  periods: PayrollPeriod[];
  selectedId: string;
  onChange: (id: string) => void;
  onCreateOrSelect: (year: number, month: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const selectedPeriod = periods.find(p => p.id === selectedId);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  const monthNames = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50"
      >
        <CalendarDays className="h-4 w-4" />
        <span>
          {selectedPeriod ? \`\${monthNames[selectedPeriod.month - 1].substring(0, 3)} \${selectedPeriod.year}\` : "Mes"}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 rounded-2xl border border-black/5 bg-white p-3 shadow-xl">
          <div className="mb-3 flex items-center justify-between">
            <button onClick={() => setViewYear(y => y - 1)} className="p-1 text-neutral-500 hover:text-neutral-900"><ChevronLeft className="h-5 w-5"/></button>
            <span className="font-semibold text-neutral-800">{viewYear}</span>
            <button onClick={() => setViewYear(y => y + 1)} className="p-1 text-neutral-500 hover:text-neutral-900"><ChevronRight className="h-5 w-5"/></button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {monthNames.map((name, i) => {
              const month = i + 1;
              const periodExists = periods.find(p => p.year === viewYear && p.month === month);
              const isSelected = selectedPeriod?.year === viewYear && selectedPeriod?.month === month;
              
              return (
                <button
                  key={month}
                  onClick={() => {
                    if (periodExists) {
                      onChange(periodExists.id);
                    } else {
                      onCreateOrSelect(viewYear, month);
                    }
                    setOpen(false);
                  }}
                  className={cn(
                    "rounded-xl py-2 text-[13px] font-medium transition-colors",
                    isSelected 
                      ? "bg-[#0fb18f] text-white shadow-sm" 
                      : periodExists 
                        ? "bg-slate-100 text-slate-800 hover:bg-slate-200" 
                        : "text-slate-500 hover:bg-slate-100"
                  )}
                >
                  {name.substring(0, 3)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}`;
content = content.replace('function PayrollSummaryPanel', headerCalendar + '\n\nfunction PayrollSummaryPanel');

// 3. Add handleCreateOrSelectPeriod inside PayrollPage
const handleCreateOrSelectPeriod = `
  const handleCreateOrSelectPeriod = async (year: number, month: number) => {
    try {
      const existingPeriods = await payrollApi.findPeriods(year, month);
      const existingPeriod = existingPeriods.find(
        (period) =>
          period.paymentCycle === "MONTHLY" &&
          (period.installmentNumber ?? 1) === 1,
      );
      if (existingPeriod) {
        setSelectedPeriodId(existingPeriod.id);
        return;
      }
      
      const newPeriod = await payrollApi.createPeriod({ year, month, paymentCycle: "MONTHLY", installmentNumber: 1 }).catch(async (err) => {
        if (err instanceof AppApiError && err.status === 409) {
          const existingPeriods = await payrollApi.findPeriods(year, month);
          const existing = existingPeriods.find(
            (p) =>
              p.paymentCycle === "MONTHLY" &&
              (p.installmentNumber ?? 1) === 1,
          );
          if (existing) return existing;
        }
        throw err;
      });

      if (!newPeriod) return;
      setPeriods((prev) => (
        prev.some((p) => p.id === newPeriod.id)
          ? prev
          : [...prev, newPeriod]
      ));
      setSelectedPeriodId(newPeriod.id);
    } catch (err) {
      console.error(err);
    }
  };
`;
content = content.replace(/const handlePostPeriod =/, handleCreateOrSelectPeriod + '\n  const handlePostPeriod =');

// 4. Update AppHeader usage
content = content.replace(/<AppHeader title="Nomina" showBack hrefBack="\/home" \/>/, 
  `<AppHeader title="Nómina" showBack hrefBack="/home" rightContent={<HeaderCalendar periods={periods} selectedId={selectedPeriodId} onChange={setSelectedPeriodId} onCreateOrSelect={handleCreateOrSelectPeriod} />} />`);

fs.writeFileSync('frontend/app/(app)/nomina/page.tsx', content, 'utf8');
