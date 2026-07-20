"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";

type Props = {
  countryCode: string;
  onCountryCodeChange: (val: string) => void;
  phoneNumber: string;
  onPhoneNumberChange: (val: string) => void;
  dark?: boolean;
  flat?: boolean;
  dropdownPosition?: "top" | "bottom";
  disabled?: boolean;
};

const COUNTRIES = [
  { code: "57", label: "Col.", flag: "co" },
  { code: "54", label: "Arg.", flag: "ar" },
  { code: "52", label: "Méx.", flag: "mx" },
  { code: "34", label: "Esp.", flag: "es" },
  { code: "56", label: "Chi.", flag: "cl" },
  { code: "51", label: "Per.", flag: "pe" },
];

export default function PhoneSelector({
  countryCode,
  onCountryCodeChange,
  phoneNumber,
  onPhoneNumberChange,
  dark = false,
  flat = false,
  dropdownPosition = "bottom",
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedCountry = COUNTRIES.find((c) => c.code === countryCode) || COUNTRIES[0];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  let buttonClasses = "flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-neutral-50 px-2 text-[13px] font-medium text-neutral-800 transition hover:bg-neutral-100 focus:outline-none focus:ring-1 focus:ring-[#0B3F64]";
  let inputClasses = "h-11 w-full min-w-0 max-w-full box-border rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[14px] font-medium text-[#0B3F64] outline-none transition placeholder:font-medium placeholder:text-neutral-400 focus:border-[#0B3F64] focus:bg-white focus:ring-1 focus:ring-[#0B3F64]";

  if (dark) {
    buttonClasses = "flex h-10 w-full items-center justify-center gap-1.5 transition focus:outline-none bg-transparent border-0 text-white px-1 text-sm font-normal";
    inputClasses = "h-10 w-full min-w-0 max-w-full box-border px-1 text-sm outline-none transition placeholder:text-neutral-500 focus:ring-0 border-0 border-b border-slate-800/60 rounded-none bg-transparent text-white placeholder:text-slate-500";
  } else if (flat) {
    buttonClasses = "flex h-10 w-full items-center justify-center gap-1.5 transition focus:outline-none bg-transparent border-0 border-b border-slate-100 rounded-none text-slate-800 px-0 text-sm font-normal focus:border-[#0B3F64] focus:ring-0";
    inputClasses = "h-10 w-full min-w-0 max-w-full box-border px-0 py-2 text-sm font-normal text-slate-800 placeholder:text-slate-400/70 outline-none focus:ring-0 border-0 border-b border-slate-100 rounded-none bg-transparent focus:border-[#0B3F64] transition-colors";
  }

  return (
    <div className="grid w-full max-w-full grid-cols-[96px_minmax(0,1fr)] gap-2 overflow-visible box-border">
      <div className="relative min-w-0 overflow-visible" ref={containerRef}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(!open)}
          className={buttonClasses}
        >
          <img
            src={`https://flagcdn.com/w20/${selectedCountry.flag}.png`}
            alt={selectedCountry.label}
            className="w-4 h-3 object-cover rounded-sm shrink-0 mr-1"
          />
          <span>+{selectedCountry.code}</span>
          <ChevronDown size={14} className="text-neutral-400 shrink-0 ml-1.5" />
        </button>

        {open && (
          <div className={`absolute left-0 ${dropdownPosition === "top" ? "bottom-[calc(100%+8px)] origin-bottom animate-in fade-in slide-in-from-bottom-2" : "top-[calc(100%+8px)] origin-top animate-in fade-in slide-in-from-top-2"} z-[80] w-36 flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl`}>
            <div className="flex max-h-56 flex-col overflow-y-auto p-1">
              {COUNTRIES.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => {
                    onCountryCodeChange(c.code);
                    setOpen(false);
                  }}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] font-medium transition hover:bg-neutral-50 ${
                    countryCode === c.code ? "bg-[#E6EFF5] text-[#0B3F64]" : "text-neutral-700"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <img
                      src={`https://flagcdn.com/w20/${c.flag}.png`}
                      alt={c.label}
                      className="w-4 h-3 object-cover rounded-sm shrink-0"
                    />
                    <span>+{c.code}</span>
                  </span>
                  {countryCode === c.code && <Check size={14} className="text-[#0B3F64]" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <input
        type="tel"
        disabled={disabled}
        value={phoneNumber}
        onChange={(e) => onPhoneNumberChange(e.target.value.replace(/\D/g, ""))}
        placeholder="Ingrese número"
        className={inputClasses}
      />
    </div>
  );
}
