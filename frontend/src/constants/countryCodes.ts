export interface CountryConfig {
  code: string;
  name: string;
  flag: string;
  minLength: number;
  maxLength: number;
  prefixes: string[];
  regionalCodes: string[];
  errorMessage: string;
}

export const COUNTRY_RULES: Record<string, CountryConfig> = {
  "57": {
    code: "57",
    name: "Colombia",
    flag: "co",
    minLength: 10,
    maxLength: 10,
    prefixes: ["3"],
    regionalCodes: [],
    errorMessage: "Revisá el número antes de guardar.",
  },
  "54": {
    code: "54",
    name: "Argentina",
    flag: "ar",
    minLength: 10,
    maxLength: 11,
    prefixes: [],
    regionalCodes: ["11", "221", "223", "261", "341", "342", "351", "381", "387"],
    errorMessage: "Revisá el número antes de guardar.",
  },
};

export function validatePhoneNumber(countryCode: string, localNumber: string): { isValid: boolean; error?: string } {
  const rule = COUNTRY_RULES[countryCode];
  if (!rule) {
    return { isValid: true }; // Permite otros países sin reglas estrictas
  }

  const cleaned = localNumber.replace(/\D/g, "");

  // Validación para Argentina (54)
  if (countryCode === "54") {
    if (cleaned.length !== 10 && cleaned.length !== 11) {
      return {
        isValid: false,
        error: "Revisá el número antes de guardar.",
      };
    }
    // Si tiene 11 dígitos, debe empezar con 9 (prefijo móvil internacional)
    if (cleaned.length === 11 && !cleaned.startsWith("9")) {
      return {
        isValid: false,
        error: "Revisá el número antes de guardar.",
      };
    }
    // Validar código regional (quitando el 9 si está presente)
    const withoutPrefix = cleaned.length === 11 ? cleaned.slice(1) : cleaned;
    const hasValidRegion = rule.regionalCodes.some(reg => withoutPrefix.startsWith(reg));
    if (!hasValidRegion) {
      return {
        isValid: false,
        error: "Revisá el número antes de guardar.",
      };
    }
    return { isValid: true };
  }

  // Validación para Colombia (57)
  if (countryCode === "57") {
    if (cleaned.length !== 10) {
      return {
        isValid: false,
        error: "Revisá el número antes de guardar.",
      };
    }
    const hasValidPrefix = rule.prefixes.some(pref => cleaned.startsWith(pref));
    if (!hasValidPrefix) {
      return {
        isValid: false,
        error: "Revisá el número antes de guardar.",
      };
    }
    return { isValid: true };
  }

  return { isValid: true };
}
