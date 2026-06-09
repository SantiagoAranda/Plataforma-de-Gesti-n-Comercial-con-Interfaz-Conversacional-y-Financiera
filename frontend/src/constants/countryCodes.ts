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
    errorMessage: "El número de Colombia debe tener 10 dígitos y comenzar con 3 (ej. 300...).",
  },
  "54": {
    code: "54",
    name: "Argentina",
    flag: "ar",
    minLength: 10,
    maxLength: 10,
    prefixes: [],
    regionalCodes: ["11", "221", "223", "261", "341", "342", "351", "381", "387"],
    errorMessage: "El número de Argentina debe tener 10 dígitos y comenzar con un código de área válido (ej. 342...).",
  },
};

export function validatePhoneNumber(countryCode: string, localNumber: string): { isValid: boolean; error?: string } {
  const rule = COUNTRY_RULES[countryCode];
  if (!rule) {
    return { isValid: true }; // Permite otros países sin reglas estrictas
  }

  const cleaned = localNumber.replace(/\D/g, "");

  // Validar prefijo si aplica
  if (rule.prefixes.length > 0) {
    const hasValidPrefix = rule.prefixes.some(pref => cleaned.startsWith(pref));
    if (!hasValidPrefix) {
      return {
        isValid: false,
        error: `Debe comenzar con el prefijo correcto: ${rule.prefixes.join(", ")}`,
      };
    }
  }

  // Validar código regional si aplica
  if (rule.regionalCodes.length > 0) {
    const prefix = rule.prefixes[0] || "";
    const withoutPrefix = prefix && cleaned.startsWith(prefix) ? cleaned.slice(prefix.length) : cleaned;
    const hasValidRegion = rule.regionalCodes.some(reg => withoutPrefix.startsWith(reg));
    if (!hasValidRegion) {
      const errorMsg = prefix
        ? `Debe incluir un código de área válido después de ${prefix} (ej: ${prefix}${rule.regionalCodes[0]}...)`
        : `Debe incluir un código de área válido (ej: ${rule.regionalCodes[0]}...)`;
      return {
        isValid: false,
        error: errorMsg,
      };
    }
  }

  // Validar longitud
  if (cleaned.length < rule.minLength || cleaned.length > rule.maxLength) {
    const lengthMessage = rule.minLength === rule.maxLength
      ? `El número debe tener exactamente ${rule.minLength} dígitos.`
      : `El número debe tener entre ${rule.minLength} y ${rule.maxLength} dígitos.`;

    return {
      isValid: false,
      error: lengthMessage,
    };
  }

  return { isValid: true };
}
