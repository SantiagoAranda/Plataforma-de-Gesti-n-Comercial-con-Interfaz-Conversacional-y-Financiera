const fs = require('fs');
let file = 'frontend/app/(app)/nomina/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const oldPill = `<span className={cn(
              "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider",
              allPaid ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500",
            )}>
              {allPaid ? "Pagado" : "Pendiente"}
            </span>`;

const newBtn = `<button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (salaryPayments.length === 1) {
                  onTogglePayment(salaryPayments[0]);
                } else if (!expanded) {
                  onToggleExpanded();
                }
              }}
              className={cn(
                "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors",
                allPaid ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-slate-100 text-slate-500 hover:bg-slate-200",
              )}
            >
              {allPaid ? "Pagado" : "Pendiente"}
            </button>`;

content = content.replace(oldPill, newBtn);

content = content.replace(/<div className="mt-3 grid grid-cols-4 gap-1\.5 border-t border-slate-100 pt-3">.*?<\/div>\s*<div className="mt-2 grid grid-cols-4 gap-1\.5">.*?<\/div>/s, '');

fs.writeFileSync(file, content);
