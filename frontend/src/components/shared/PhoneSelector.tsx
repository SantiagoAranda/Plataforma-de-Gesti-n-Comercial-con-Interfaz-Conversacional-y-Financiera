"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";

type Props = {
  countryCode: string;
  onCountryCodeChange: (val: string) => void;
  phoneNumber: string;
  onPhoneNumberChange: (val: string) => void;
};

const COUNTRIES = [
  { code: "57", label: "Col.", flag: "🇨🇴" },
  { code: "54", label: "Arg.", flag: "🇦🇷" },
  { code: "52", label: "Méx.", flag: "🇲🇽" },
  { code: "34", label: "Esp.", flag: "🇪🇸" },
  { code: "56", label: "Chi.", flag: "🇨🇱" },
  { code: "51", label: "Per.", flag: "🇵🇪" },
];

export default function PhoneSelector({ countryCode, onCountryCodeChange, phoneNumber, onPhoneNumberChange }: Props) {
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

  return (
    <div className="flex gap-2">
      <div className="relative" ref={containerRef}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex h-11 items-center gap-1.5 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[13px] font-bold text-neutral-800 transition hover:bg-neutral-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          <span>{selectedCountry.flag}</span>
          <span>+{selectedCountry.code}</span>
          <ChevronDown size={14} className="text-neutral-400 shrink-0" />
        </button>

        {open && (
          <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-36 flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl animate-in fade-in slide-in-from-top-2">
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
                    <span>{c.flag}</span>
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
        className="flex-1 h-11 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[14px] font-bold text-emerald-700 outline-none transition placeholder:font-medium placeholder:text-neutral-400 focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500"
      />
    </div>
  );
}
