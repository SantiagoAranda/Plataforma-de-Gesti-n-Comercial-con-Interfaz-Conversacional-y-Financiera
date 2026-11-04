"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { PASSWORD_REQUIREMENTS } from "../../lib/auth/new-password";

// Local format check only: it neither rates strength nor replaces server validation or its errors.
export function ValidCheck({ show, label, className }: { show: boolean; label: string; className: string }) {
  return <>
    <CheckCircle2 aria-hidden="true" className={`pointer-events-none absolute top-1/2 h-5 w-5 -translate-y-1/2 text-emerald-600 transition-opacity duration-200 motion-reduce:transition-none ${show ? "opacity-100" : "opacity-0"} ${className}`} />
    <span role="status" className="sr-only">{show ? label : ""}</span>
  </>;
}

export default function PasswordRequirements({ id, password, showErrors = false }: { id: string; password: string; showErrors?: boolean }) {
  const valid = PASSWORD_REQUIREMENTS.every((r) => r.test(password));
  const [manualOpen, setManualOpen] = useState(false);
  const [wasValid, setWasValid] = useState(valid);
  // Derived reset during render (no effect): any validity change returns to the automatic state.
  if (valid !== wasValid) { setWasValid(valid); setManualOpen(false); }
  const open = !valid || manualOpen;
  return <div className="text-xs text-gray-600">
    <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
      <ul id={id} aria-hidden={!open} inert={!open} className="min-h-0 space-y-1 overflow-hidden pt-2">
        {PASSWORD_REQUIREMENTS.map((r) => {
          const met = r.test(password);
          return <li key={r.id} data-met={met} className={`flex items-center gap-2 ${met ? "text-emerald-700" : showErrors ? "text-red-600" : ""}`}>
            {met
              ? <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-600" />
              : <span aria-hidden="true" className={`h-4 w-4 shrink-0 rounded-full border ${showErrors ? "border-red-400 bg-red-100" : "border-gray-300 bg-gray-200"}`} />}
            <span>{r.label}<span className="sr-only">{met ? " (cumplido)" : " (pendiente)"}</span></span>
          </li>;
        })}
      </ul>
    </div>
    {valid && <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setManualOpen(!manualOpen)} className="mt-1 text-xs text-gray-500 hover:text-[#0b3f64] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b3f64]">{open ? "Ocultar requisitos" : "Ver requisitos"}</button>}
  </div>;
}
