// import * as React from "react";
// import type { AccountingEntry } from "../../types/accounting";

// function formatMoney(v: number) {
//     const abs = Math.abs(v);
//     return `$${abs.toLocaleString("en-US", {
//         minimumFractionDigits: 2,
//         maximumFractionDigits: 2,
//     })}`;
// }

// /**
//  * Impacto contable real
//  */
// function isPositiveImpact(entry: AccountingEntry) {
//     const a = entry.amount;

//     switch (entry.kind) {
//         case "INCOME":
//             return true;
//         case "EXPENSE":
//             return false;
//         case "ASSET":
//             return a >= 0;
//         case "LIABILITY":
//             return a < 0;
//         case "EQUITY":
//             return a >= 0;
//         default:
//             return a >= 0;
//     }
// }

// function amountClass(positive: boolean) {
//     return positive ? "text-emerald-600" : "text-red-500";
// }

// function badgeLabel(source: AccountingEntry["source"]) {
//     switch (source) {
//         case "AUTO_ORDER":
//             return "ORDEN AUTOMÁTICA";
//         case "MANUAL":
//             return "MANUAL";
//         case "SYSTEM":
//             return "SISTEMA";
//         case "RECURRENT":
//             return "RECURRENTE";
//     }
// }

// function badgeClass(positive: boolean) {
//     return positive
//         ? "bg-emerald-50 text-emerald-700 border-emerald-200"
//         : "bg-neutral-100 text-neutral-600 border-neutral-200";
// }

// export function AccountingCard({ entry }: { entry: AccountingEntry }) {
//     const positive = isPositiveImpact(entry);

//     return (
//         <div className="rounded-3xl bg-white border border-neutral-200 shadow-sm px-4 py-4">
//             <div className="flex justify-between">
//                 <div>
//                     <div className="font-semibold text-neutral-800">
//                         {entry.pucCode} - {entry.accountName}
//                     </div>
//                     <div className="text-sm text-neutral-500">{entry.description}</div>
//                 </div>

//                 <div
//                     className={`font-semibold flex items-center gap-1 ${amountClass(positive)}`}
//                 >
//                     <span>{positive ? "↑" : "↓"}</span>
//                     <span>{formatMoney(entry.amount)}</span>
//                 </div>
//             </div>

//             <div className="mt-3 flex justify-between items-center text-xs text-neutral-500">
//                 <span>{entry.time}</span>
//                 <span
//                     className={`px-3 py-1 rounded-full border ${badgeClass(positive)}`}
//                 >
//                     {badgeLabel(entry.source)}
//                 </span>
//             </div>
//         </div>
//     );
// }


// import * as React from "react";
// import type { AccountingEntry } from "../../types/accounting";

// function formatMoney(v: number) {
//     const abs = Math.abs(v);
//     return `$${abs.toLocaleString("en-US", {
//         minimumFractionDigits: 2,
//         maximumFractionDigits: 2,
//     })}`;
// }

// /**
//  * Impacto contable real
//  */
// function isPositiveImpact(entry: AccountingEntry) {
//     const a = entry.amount;

//     switch (entry.kind) {
//         case "INCOME":
//             return true;
//         case "EXPENSE":
//             return false;
//         case "ASSET":
//             return a >= 0;
//         case "LIABILITY":
//             return a < 0;
//         case "EQUITY":
//             return a >= 0;
//         default:
//             return a >= 0;
//     }
// }

// function amountClass(positive: boolean) {
//     return positive ? "text-emerald-600" : "text-red-500";
// }

// function badgeLabel(source: AccountingEntry["source"]) {
//     switch (source) {
//         case "AUTO_ORDER":
//             return "ORDEN AUTOMÁTICA";
//         case "MANUAL":
//             return "MANUAL";
//         case "SYSTEM":
//             return "SISTEMA";
//         case "RECURRENT":
//             return "RECURRENTE";
//     }
// }

// function badgeClass(positive: boolean) {
//     return positive
//         ? "bg-emerald-50 text-emerald-700 border-emerald-200"
//         : "bg-neutral-100 text-neutral-600 border-neutral-200";
// }

// export function AccountingCard({ entry }: { entry: AccountingEntry }) {
//     const positive = isPositiveImpact(entry);

//     return (
//         <div className="rounded-3xl bg-white border border-neutral-200 shadow-sm px-4 py-4">
//             <div className="flex gap-4">
//                 {/* Avatar circular tipo "foto" */}
//                 <div className="h-16 w-16 rounded-full flex items-center justify-center
//                         bg-neutral-100">
//                     <div
//                         className={`h-10 w-10 rounded-full flex items-center justify-center
//             ${positive
//                                 ? "bg-emerald-500 text-white"
//                                 : "bg-red-500 text-white"
//                             }`}
//                     >
//                         {positive ? "↑" : "↓"}
//                     </div>
//                 </div>

//                 <div className="flex-1">
//                     <div className="flex justify-between">
//                         <div>
//                             <div className="font-semibold text-neutral-800">
//                                 {entry.pucCode} - {entry.accountName}
//                             </div>
//                             <div className="text-sm text-neutral-500">
//                                 {entry.description}
//                             </div>
//                         </div>

//                         <div
//                             className={`font-semibold flex items-center gap-1 ${amountClass(
//                                 positive
//                             )}`}
//                         >
//                             {positive ? "+" : "-"}
//                             {formatMoney(entry.amount)}
//                         </div>
//                     </div>

//                     <div className="mt-3 flex justify-between items-center text-xs text-neutral-500">
//                         <span>{entry.time}</span>
//                         <span
//                             className={`px-3 py-1 rounded-full border ${badgeClass(
//                                 positive
//                             )}`}
//                         >
//                             {badgeLabel(entry.source)}
//                         </span>
//                     </div>
//                 </div>
//             </div>
//         </div>
//     );
// }

import * as React from "react";
import type { AccountingEntry } from "../../types/accounting";

import { useContextMenu } from "@/src/hooks/useContextMenu";
import { ContextMenu } from "@/src/hooks/ContextMenu";

function formatMoney(v: number) {
  const sign = v >= 0 ? "+" : "-";
  const abs = Math.abs(v);
  return `${sign}$${abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function amountClass(v: number) {
  return v >= 0 ? "text-green-600" : "text-red-500";
}

function badgeLabel(source: AccountingEntry["source"]) {
  switch (source) {
    case "AUTO_ORDER":
      return "ORDEN AUTOMÁTICA";
    case "MANUAL":
      return "MANUAL";
    case "SYSTEM":
      return "SISTEMA";
    case "RECURRENT":
      return "RECURRENTE";
  }
}

function iconBg(kind: AccountingEntry["kind"]) {
  switch (kind) {
    case "INCOME":
      return "bg-green-100 text-green-600";
    case "EXPENSE":
      return "bg-red-100 text-red-600";
    case "ASSET":
      return "bg-blue-100 text-blue-600";
    case "LIABILITY":
      return "bg-amber-100 text-amber-700";
    case "EQUITY":
      return "bg-purple-100 text-purple-700";
  }
}

export function AccountingCard({
  entry,
  onEdit,
  onDelete,
}: {
  entry: AccountingEntry;
  onEdit: (entry: AccountingEntry) => void;
  onDelete: (entry: AccountingEntry) => void;
}) {
  const { open, pos, close, handlers } = useContextMenu(500);

  return (
    <>
      <div
        className="rounded-3xl bg-white border border-neutral-200 shadow-sm px-4 py-4"
        {...handlers}
      >
        <div className="flex gap-3">
          <div
            className={`h-11 w-11 rounded-full flex items-center justify-center ${iconBg(
              entry.kind
            )}`}
          >
            💰
          </div>

          <div className="flex-1">
            <div className="flex justify-between">
              <div>
                <div className="font-semibold text-neutral-800">
                  {entry.pucCode} - {entry.accountName}
                </div>
                <div className="text-sm text-neutral-500">
                  {entry.description}
                </div>
              </div>

              <div className={`font-semibold ${amountClass(entry.amount)}`}>
                {formatMoney(entry.amount)}
              </div>
            </div>

            <div className="mt-3 flex justify-between items-center text-xs text-neutral-500">
              <span>{entry.time}</span>
              <span className="px-3 py-1 rounded-full bg-neutral-100 border border-neutral-200">
                {badgeLabel(entry.source)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <ContextMenu
        open={open}
        x={pos.x}
        y={pos.y}
        onClose={close}
        onEdit={() => onEdit(entry)}
        onDelete={() => onDelete(entry)}
      />
    </>
  );
}