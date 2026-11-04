"use client";

import PasswordRequirements, { ValidCheck } from "./PasswordRequirements";
import { newPasswordError, NEW_PASSWORD_UNMET } from "../../lib/auth/new-password";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, AppApiError } from "../../lib/api";
import { useAuthRetry } from "../../hooks/useAuthRetry";

const field = "w-full rounded-xl border border-neutral-300 bg-neutral-50 px-4 py-3 text-gray-800 placeholder-gray-400 transition focus:border-[#0b3f64] focus:outline-none focus:ring-2 focus:ring-[#0b3f64]";
const button = "w-full rounded-xl bg-[#0b3f64] py-3.5 font-medium text-white shadow-md transition-all hover:bg-[#092f4a] hover:shadow-lg active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b3f64] focus-visible:ring-offset-2 disabled:opacity-50";
const card = "space-y-5 rounded-3xl bg-white px-8 py-8 shadow-lg";
const title = "text-center text-2xl font-semibold text-gray-900";
const footLink = "font-medium text-[#0b3f64] hover:text-[#092f4a] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b3f64] focus-visible:ring-offset-2";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);
  const { retrySeconds, setRetrySeconds } = useAuthRetry();
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current || retrySeconds) return;
    submitting.current = true; setLoading(true); setError("");
    try {
      const result = await api<{ message: string }>("/auth/forgot-password", { auth: false, method: "POST", body: JSON.stringify({ email }) });
      setMessage(result.message);
    } catch (err) {
      if (err instanceof AppApiError && err.status === 429) setRetrySeconds(Number(err.details?.retryAfterSeconds) || 1);
      setError(err instanceof AppApiError ? err.message : "No pudimos procesar la solicitud. Intentá nuevamente.");
    } finally { submitting.current = false; setLoading(false); }
  }
  return <form className={card} onSubmit={submit}>
    <h1 className={title}>Recuperar contraseña</h1>
    <p className="text-center text-sm text-gray-600">Ingresá el correo asociado a tu cuenta.</p>
    {message ? <p role="status">{message}</p> : <><label className="block text-sm font-medium text-gray-700" htmlFor="recovery-email">Correo electrónico</label><input id="recovery-email" className={field} type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required />
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button className={button} disabled={loading || retrySeconds > 0}>{loading ? "Enviando…" : retrySeconds ? `Reintentá en ${retrySeconds} s` : "Enviar instrucciones"}</button></>}
    <p className="text-center text-sm text-gray-600"><Link className={footLink} href="/login">Volver a iniciar sesión</Link></p>
  </form>;
}

export function ResetPasswordForm() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [confirmationError, setConfirmationError] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);
  const initialToken = useRef<string | null | undefined>(undefined);
  const { retrySeconds, setRetrySeconds } = useAuthRetry();
  useEffect(() => {
    if (initialToken.current === undefined) {
      const value = new URLSearchParams(window.location.hash.slice(1)).get("token");
      initialToken.current = value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
      window.history.replaceState(window.history.state, "", window.location.pathname);
    }
    setToken(initialToken.current);
    setReady(true);
  }, []);
  const passwordOk = newPasswordError(password) === undefined;
  const confirmOk = passwordOk && confirmation !== "" && confirmation === password;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!token || submitting.current || retrySeconds) return;
    setError("");
    const validation = newPasswordError(password);
    setPasswordError(validation);
    setConfirmationError(password !== confirmation ? "Las contraseñas no coinciden." : "");
    if (validation || password !== confirmation) return;
    submitting.current = true; setLoading(true); setError("");
    try {
      const result = await api<{ message: string }>("/auth/reset-password", { auth: false, method: "POST", body: JSON.stringify({ token, password }) });
      setToken(null); setPassword(""); setConfirmation(""); setMessage(result.message);
      window.setTimeout(() => router.push("/login"), 2000);
    } catch (err) {
      if (err instanceof AppApiError && err.status === 429) setRetrySeconds(Number(err.details?.retryAfterSeconds) || 1);
      if (err instanceof AppApiError && err.status === 400 && err.message.includes("enlace")) setToken(null);
      else setError(err instanceof AppApiError ? err.message : "No pudimos confirmar el cambio. Intentá iniciar sesión antes de volver a solicitar un enlace.");
    } finally { submitting.current = false; setLoading(false); }
  }
  return <form className={card} onSubmit={submit}>
    <h1 className={title}>Nueva contraseña</h1>
    {message ? <p role="status">{message}</p> : ready && !token ? <p role="alert">El enlace es inválido o venció. Solicitá uno nuevo.</p> : ready ? <>
      <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700" htmlFor="new-password">Nueva contraseña</label>
      <div className="relative"><input id="new-password" className={`${field} pr-11`} type={show ? "text" : "password"} autoComplete="new-password" value={password} aria-describedby={`new-password-help${passwordError && passwordError !== NEW_PASSWORD_UNMET ? " new-password-error" : ""}`} aria-invalid={Boolean(passwordError)} onChange={e => { setPassword(e.target.value); setPasswordError(undefined); setConfirmationError(""); }} required /><ValidCheck show={passwordOk} label="La contraseña cumple los requisitos de formato" className="right-3" /></div>
      <PasswordRequirements id="new-password-help" password={password} showErrors={passwordError === NEW_PASSWORD_UNMET} />
      {passwordError && passwordError !== NEW_PASSWORD_UNMET && <p id="new-password-error" role="alert" className="mt-1 text-xs text-red-600">{passwordError}</p>}
      </div>
      <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700" htmlFor="confirm-password">Confirmar contraseña</label>
      <div className="relative"><input id="confirm-password" className={`${field} pr-11`} type={show ? "text" : "password"} autoComplete="new-password" value={confirmation} aria-describedby={confirmationError ? "confirm-password-error" : undefined} aria-invalid={Boolean(confirmationError)} onChange={e => { setConfirmation(e.target.value); setConfirmationError(""); }} required /><ValidCheck show={confirmOk} label="Las contraseñas coinciden" className="right-3" /></div>
      {confirmationError && <p id="confirm-password-error" role="alert" className="mt-1 text-xs text-red-600">{confirmationError}</p>}
      </div>
      <button type="button" className={`${footLink} text-sm`} onClick={() => setShow(!show)}>{show ? "Ocultar contraseñas" : "Mostrar contraseñas"}</button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button className={button} disabled={loading || retrySeconds > 0}>{loading ? "Guardando…" : retrySeconds ? `Reintentá en ${retrySeconds} s` : "Cambiar contraseña"}</button>
    </> : <p>Cargando…</p>}
    <p className="text-center text-sm text-gray-600"><Link className={footLink} href={ready && !token && !message ? "/forgot-password" : "/login"}>{ready && !token && !message ? "Solicitar otro enlace" : "Volver a iniciar sesión"}</Link></p>
  </form>;
}
