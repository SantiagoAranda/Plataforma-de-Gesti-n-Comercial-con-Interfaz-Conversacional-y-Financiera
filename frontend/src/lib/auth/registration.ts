import { api, AppApiError } from "../api";
import {
  assertCurrentSession,
  establishSession,
  getSessionContext,
  StaleSessionError,
} from "./session";

export const CREATED_LOGIN_REQUIRED =
  "Tu cuenta fue creada, pero no pudimos iniciar sesión automáticamente. Iniciá sesión con tus credenciales.";
export const REGISTRATION_UNCONFIRMED =
  "No pudimos confirmar el resultado. Es posible que tu cuenta se haya creado. Intentá iniciar sesión antes de volver a registrarte.";
type Registration = {
  name: string;
  phoneWhatsapp: string;
  email: string;
  password: string;
};
type Result = {
  accessToken?: string;
  businessName?: string;
  businessSlug?: string;
  accountCreated?: boolean;
  code?: string;
};

export async function registerAccount(
  input: Registration,
): Promise<"signed-in" | "login-required" | "unconfirmed"> {
  const session = getSessionContext();
  let result: Result;
  try {
    result = await api<Result>("/auth/register-business", {
      auth: false,
      method: "POST",
      body: JSON.stringify(input),
    });
  } catch (error) {
    if (error instanceof StaleSessionError) throw error;
    if (
      error instanceof AppApiError &&
      error.status >= 400 &&
      error.status < 500
    )
      throw error;
    return "unconfirmed";
  }
  if (
    result?.accountCreated === true ||
    result?.code === "ACCOUNT_CREATED_LOGIN_REQUIRED"
  )
    return "login-required";
  if (!result?.accessToken) return "unconfirmed";
  assertCurrentSession(session);
  try {
    establishSession({ ...result, accessToken: result.accessToken });
    return "signed-in";
  } catch {
    return "login-required";
  }
}
