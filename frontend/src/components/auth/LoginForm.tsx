"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";

// ── SVG Eye Icons ──────────────────────────────────────────────
function EyeIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

function EyeSlashIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  );
}

// ── Helper: traducir errores de red a español ──────────────────
function translateError(err: unknown): string {
  if (!err || typeof err !== "object") {
    return "Ocurrió un error, intentá nuevamente";
  }

  const message =
    "message" in err && typeof (err as { message?: unknown }).message === "string"
      ? (err as { message: string }).message
      : "";

  const status =
    "status" in err && typeof (err as { status?: unknown }).status === "number"
      ? (err as { status: number }).status
      : 0;

  const lower = message.toLowerCase();

  // 🔐 PRIORIDAD 1 — credenciales (MUY IMPORTANTE)
  if (
    status === 401 ||
    lower.includes("invalid credentials") ||
    lower.includes("credenciales") ||
    lower.includes("incorrect")
  ) {
    return "Credenciales inválidas";
  }

  // 🌐 PRIORIDAD 2 — conexión REAL
  if (
    lower === "failed to fetch" || // exacto
    lower.includes("networkerror") ||
    lower.includes("network request failed")
  ) {
    return "Error de conexión. Verificá tu internet e intentá nuevamente.";
  }

  // 🔴 servidor
  if (status >= 500) {
    return "Error del servidor. Intentá nuevamente más tarde.";
  }

  // 🧼 evitar HTML
  if (lower.includes("<html") || lower.includes("<!doctype")) {
    return "Error del servidor";
  }

  // 🟡 mensaje válido del backend
  if (message && message.length < 120 && !lower.includes("exception")) {
    return message;
  }

  return "Ocurrió un error, intentá nuevamente";
}

// ── Component ──────────────────────────────────────────────────
export default function LoginForm() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});

  // ── Frontend validation ────────────────────────────
  const validate = (): boolean => {
    const errors: { email?: string; password?: string } = {};

    if (!email.trim()) {
      errors.email = "El email es obligatorio";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "Ingresá un email válido";
    }

    if (!password.trim()) {
      errors.password = "La contraseña es obligatoria";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ── Submit (lógica intacta) ────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!validate()) return;

    setLoading(true);

    try {
      // 🔹 limpiar cualquier sesión previa
      localStorage.removeItem("accessToken");
      localStorage.removeItem("businessName");
      localStorage.removeItem("user");

      const data = await api<{ accessToken: string; businessName?: string }>(
        "/auth/login",
        {
          method: "POST",
          body: JSON.stringify({
            email,
            password,
          }),
          auth: false,
        }
      );

      // 🔹 guardar token
      localStorage.setItem("accessToken", data.accessToken);

      if (data.businessName?.trim()) {
        localStorage.setItem("businessName", data.businessName.trim());
      }

      // 🔹 leer payload del JWT
      const payload = JSON.parse(atob(data.accessToken.split(".")[1]));

      const user = {
        role: payload.role,
        businessId: payload.businessId,
      };

      localStorage.setItem("user", JSON.stringify(user));

      // 🔹 redirección según tipo de usuario
      if (user.role === "ADMIN" && !user.businessId) {
        router.push("/admin");
      } else {
        router.push("/home");
      }
    } catch (err: unknown) {
      setError(translateError(err));
    } finally {
      setLoading(false);
    }
  };

  // ── Helpers de estilo ──────────────────────────────
  const inputBase = `
    w-full bg-neutral-50 border rounded-xl px-4 py-3
    text-gray-800 placeholder-gray-400
    focus:outline-none focus:ring-2 transition
  `;
  const inputOk = "border-neutral-300 focus:ring-emerald-600 focus:border-emerald-600";
  const inputErr = "border-red-400 focus:ring-red-400 focus:border-red-400";

  return (
    <form
      onSubmit={handleSubmit}
      className="
        w-full
        bg-white
        rounded-3xl
        px-8 py-8
        space-y-6
        shadow-md
      "
    >
      <h1 className="text-2xl font-semibold text-center text-gray-900">
        Iniciar sesión
      </h1>

      {error && (
        <p className="text-sm text-red-500 text-center font-medium">
          {error}
        </p>
      )}

      {/* Email */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Email
        </label>
        <input
          type="email"
          placeholder="correo@ejemplo.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }));
          }}
          className={`${inputBase} ${fieldErrors.email ? inputErr : inputOk}`}
        />
        {fieldErrors.email && (
          <p className="text-xs text-red-500 mt-1">{fieldErrors.email}</p>
        )}
      </div>

      {/* Password */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Contraseña
        </label>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            placeholder="********"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined }));
            }}
            className={`${inputBase} pr-12 ${fieldErrors.password ? inputErr : inputOk}`}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
          >
            {showPassword ? <EyeSlashIcon /> : <EyeIcon />}
          </button>
        </div>
        {fieldErrors.password && (
          <p className="text-xs text-red-500 mt-1">{fieldErrors.password}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="
          w-full
          bg-emerald-600
          text-white
          py-3.5
          rounded-xl
          font-medium
          shadow
          hover:bg-emerald-700
          active:scale-[0.98]
          disabled:opacity-50
          transition
        "
      >
        {loading ? "Ingresando..." : "Ingresar"}
      </button>

      <p className="text-sm text-center text-gray-600">
        ¿No tenés cuenta?{" "}
        <span
          onClick={() => router.push("/register")}
          className="text-emerald-600 font-medium cursor-pointer hover:underline"
        >
          Registrarse
        </span>
      </p>
    </form>
  );
}