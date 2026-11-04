// Presentation-only validation for new passwords; never use this for login.
// Mirrors backend/src/auth/password-policy.ts; keep both in sync.
export const NEW_PASSWORD_UNMET = "La contraseña no cumple todos los requisitos";

export const PASSWORD_REQUIREMENTS = [
  { id: "length", label: "Mínimo 8 caracteres", test: (p: string) => Array.from(p).length >= 8 },
  { id: "upper", label: "Al menos una letra mayúscula", test: (p: string) => /\p{Lu}/u.test(p) },
  { id: "number", label: "Al menos un número", test: (p: string) => /\p{Nd}/u.test(p) },
  { id: "symbol", label: "Al menos un símbolo", test: (p: string) => /[^\p{L}\p{N}\p{M}\s]/u.test(p) },
] as const;

export function newPasswordError(password: string): string | undefined {
  if (Array.from(password).length > 1024) return "La contraseña no puede superar los 1024 caracteres";
  if (new TextEncoder().encode(password).length > 4096)
    return "La contraseña no puede superar los 4096 bytes UTF-8";
  if (!PASSWORD_REQUIREMENTS.every((r) => r.test(password))) return NEW_PASSWORD_UNMET;
  return undefined;
}
