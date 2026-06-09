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

  let buttonClasses = "flex h-11 items-center gap-1.5 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[13px] font-bold text-neutral-800 transition hover:bg-neutral-100 focus:outline-none focus:ring-1 focus:ring-emerald-500";
  let inputClasses = "flex-1 h-11 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[14px] font-bold text-emerald-700 outline-none transition placeholder:font-medium placeholder:text-neutral-400 focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500";

  if (dark) {
    buttonClasses = "flex h-10 items-center gap-1.5 transition focus:outline-none bg-transparent border-0 text-white pl-1 pr-2 text-sm font-normal";
    inputClasses = "flex-1 h-10 px-1 text-sm outline-none transition placeholder:text-neutral-500 focus:ring-0 border-0 border-b border-slate-800/60 rounded-none bg-transparent text-white placeholder:text-slate-500";
  } else if (flat) {
    buttonClasses = "flex h-10 items-center gap-1.5 transition focus:outline-none bg-transparent border-0 border-b border-slate-100 rounded-none text-slate-800 pl-0 pr-2 text-sm font-normal focus:border-emerald-500 focus:ring-0";
    inputClasses = "flex-1 h-10 px-0 py-2 text-sm font-normal text-slate-800 placeholder:text-slate-400/70 outline-none focus:ring-0 border-0 border-b border-slate-100 rounded-none bg-transparent focus:border-emerald-500 transition-colors";
  }

  return (
    <div className="flex gap-2 w-full">
      <div className="relative" ref={containerRef}>
        <button
          type="button"
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
          <div className={`absolute left-0 ${dropdownPosition === "top" ? "bottom-[calc(100%+8px)] origin-bottom animate-in fade-in slide-in-from-bottom-2" : "top-[calc(100%+8px)] origin-top animate-in fade-in slide-in-from-top-2"} z-50 w-36 flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl`}>
            <div className="flex max-h-56 flex-col overflow-y-auto p-1">
              {COUNTRIES.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => {
                    onCountryCodeChange(c.code);
                    setOpen(false);
                  }}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] font-bold transition hover:bg-neutral-50 ${
                    countryCode === c.code ? "bg-emerald-50/50 text-emerald-700" : "text-neutral-700"
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
                  {countryCode === c.code && <Check size={14} className="text-emerald-500" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <input
        type="tel"
        value={phoneNumber}
        onChange={(e) => onPhoneNumberChange(e.target.value.replace(/\D/g, ""))}
        placeholder="Ingrese número"
        className={inputClasses}
      />
    </div>
  );
}
