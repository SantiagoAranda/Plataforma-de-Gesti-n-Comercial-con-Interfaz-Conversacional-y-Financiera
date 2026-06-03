const fs = require('fs');
let file = 'frontend/app/(app)/nomina/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add state to PayrollSummaryPanel
content = content.replace(/const isBiweekly = run.contract\?\.paymentCycle === "BIWEEKLY";/,
  `const [editPanelOpen, setEditPanelOpen] = useState(false);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);

  const startPress = () => {
    pressTimer.current = setTimeout(() => {
      setEditPanelOpen(true);
    }, 600);
  };

  const endPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  const isBiweekly = run.contract?.paymentCycle === "BIWEEKLY";`
);

// 2. Add pointer events to <article>
content = content.replace(/<article className="overflow-hidden rounded-\[24px\] border border-slate-100 bg-white p-4 shadow-sm transition hover:shadow-md">/,
  `<article 
        className="overflow-hidden rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm transition hover:shadow-md cursor-pointer select-none"
        onPointerDown={startPress}
        onPointerUp={endPress}
        onPointerLeave={endPress}
        onContextMenu={(e) => {
          // On mobile, long press usually opens context menu. Prevent it.
          // But only if we want to suppress it entirely on this element
        }}
      >`
);

// 3. Add Editar button next to ChevronDown
const oldChevronArea = `<div className="flex items-center gap-2">
            <ChevronDown className={cn("h-4 w-4 transition", expanded && "rotate-180")} />
            <button
              type="button"`;

const newChevronArea = `<div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setEditPanelOpen(true); }}
              className="rounded-full bg-slate-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-800"
            >
              Editar
            </button>
            <ChevronDown className={cn("h-4 w-4 transition", expanded && "rotate-180")} />
            <button
              type="button"`;

content = content.replace(oldChevronArea, newChevronArea);

// 4. Render EmployeeEditBottomSheet before </article>
const oldArticleEnd = `          </div>
        </div>
      </article>
    </div>
  );
}`;

const newArticleEnd = `          </div>
        </div>

        <EmployeeEditBottomSheet
          isOpen={editPanelOpen}
          onClose={() => setEditPanelOpen(false)}
          run={run}
          onEditEmployee={onEditEmployee}
          onEditContract={onEditContract}
          onOpenNews={onOpenNews}
          onCreateContract={onCreateContract}
          onInactivateContract={onInactivateContract}
          onInactivateEmployee={onInactivateEmployee}
          onHardDeleteEmployee={onHardDeleteEmployee}
        />
      </article>
    </div>
  );
}`;

content = content.replace(oldArticleEnd, newArticleEnd);

fs.writeFileSync(file, content);
