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
    maxLength: 11,
    prefixes: ["9"],
    regionalCodes: ["11", "221", "223", "261", "341", "342", "351", "381", "387"],
    errorMessage: "El número de Argentina debe tener 10 u 11 dígitos, comenzar con 9 y tener un código de área válido (ej. 911...).",
  },
};

export function validatePhoneNumber(countryCode: string, localNumber: string): { isValid: boolean; error?: string } {
  const rule = COUNTRY_RULES[countryCode];
  if (!rule) {
    return { isValid: true }; // Permite otros países sin reglas estrictas
  }

  const cleaned = localNumber.replace(/\D/g, "");

  // Validar prefijo
  const hasValidPrefix = rule.prefixes.some(pref => cleaned.startsWith(pref));
  if (!hasValidPrefix) {
    return {
      isValid: false,
      error: `Debe comenzar con el prefijo correcto: ${rule.prefixes.join(", ")}`,
    };
  }

  // Validar código regional si aplica
  if (rule.regionalCodes.length > 0) {
    // Para Argentina, remover el "9" y chequear el código de área
    const prefix = rule.prefixes[0];
    const withoutPrefix = cleaned.slice(prefix.length);
    const hasValidRegion = rule.regionalCodes.some(reg => withoutPrefix.startsWith(reg));
    if (!hasValidRegion) {
      return {
        isValid: false,
        error: `Debe incluir un código de área válido después de ${prefix} (ej: ${prefix}${rule.regionalCodes[0]}...)`,
      };
    }
  }

  // Validar longitud
  if (cleaned.length < rule.minLength || cleaned.length > rule.maxLength) {
    return {
      isValid: false,
      error: `El número debe tener entre ${rule.minLength} y ${rule.maxLength} dígitos.`,
    };
  }

  return { isValid: true };
}
