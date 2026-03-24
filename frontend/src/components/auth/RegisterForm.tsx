"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
  if (!err || typeof err !== "object") return "Ocurrió un error, intentá nuevamente";

  const message =
    "message" in err && typeof (err as { message?: unknown }).message === "string"
      ? (err as { message: string }).message
      : "";

  // Network / fetch errors
  if (
    message.toLowerCase().includes("failed to fetch") ||
    message.toLowerCase().includes("networkerror") ||
    message.toLowerCase().includes("network request failed")
  ) {
    return "Error de conexión. Verificá tu internet e intentá nuevamente.";
  }

  // If backend sent a Spanish message, pass it through
  if (message && !message.toLowerCase().startsWith("http")) {
    return message;
  }

  return "Ocurrió un error, intentá nuevamente";
}

// ── Types ──────────────────────────────────────────────────────
interface FieldErrors {
  businessName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  taxId?: string;
  whatsapp?: string;
}

// ── Component ──────────────────────────────────────────────────
export default function RegisterForm() {
  const router = useRouter();

  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [taxId, setTaxId] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [ownerName, setOwnerName] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // ── Validaciones existentes (mantenidas) ───────────
  const isValidEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const isValidPassword = (value: string) =>
    value.length >= 6 && /[A-Z]/.test(value) && /\d/.test(value);

  // ── Validación inline por campo ────────────────────
  const validate = (): boolean => {
    const errors: FieldErrors = {};

    if (!businessName.trim()) {
      errors.businessName = "El nombre del negocio es obligatorio";
    }

    if (!email.trim()) {
      errors.email = "El email es obligatorio";
    } else if (!isValidEmail(email)) {
      errors.email = "Ingresá un email válido";
    }

    if (!password.trim()) {
      errors.password = "La contraseña es obligatoria";
    } else if (!isValidPassword(password)) {
      errors.password = "Mínimo 6 caracteres, una mayúscula y un número";
    }

    if (!confirmPassword.trim()) {
      errors.confirmPassword = "Confirmá la contraseña";
    } else if (password !== confirmPassword) {
      errors.confirmPassword = "Las contraseñas no coinciden";
    }

    if (!taxId.trim()) {
      errors.taxId = "El documento fiscal es obligatorio";
    } else if (!/^\d+$/.test(taxId)) {
      errors.taxId = "Solo se permiten números";
    }

    if (!whatsapp.trim()) {
      errors.whatsapp = "El WhatsApp es obligatorio";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ── Clear field error on change ────────────────────
  const clearFieldError = (field: keyof FieldErrors) => {
    if (fieldErrors[field]) {
      setFieldErrors((p) => ({ ...p, [field]: undefined }));
    }
  };

  // ── Submit (lógica intacta) ────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!validate()) return;

    setLoading(true);

    try {
      const API_URL =
        process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

      const res = await fetch(`${API_URL}/auth/register-business`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: businessName,
          fiscalId: taxId,
          phoneWhatsapp: whatsapp,
          email,
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Error al registrarse");
      }

      // Guardar sesión
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("businessName", businessName.trim());
      if (data.businessSlug) {
        localStorage.setItem("businessSlug", data.businessSlug);
      }

      // Redirigir a home privada
      router.push("/home");
    } catch (err: any) {
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
        space-y-5
        shadow-md
      "
    >
      <h1 className="text-2xl font-semibold text-center text-gray-900">
        Crear cuenta
      </h1>

      {error && (
        <p className="text-sm text-red-500 text-center font-medium">
          {error}
        </p>
      )}

      {/* Nombre del negocio */}
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">
          Nombre del negocio
        </label>
        <input
          value={businessName}
          onChange={(e) => {
            setBusinessName(e.target.value);
            clearFieldError("businessName");
          }}
          className={`${inputBase} ${fieldErrors.businessName ? inputErr : inputOk}`}
        />
        {fieldErrors.businessName && (
          <p className="text-xs text-red-500 mt-1">{fieldErrors.businessName}</p>
        )}
      </div>

      {/* Email */}
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">
          Email
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            clearFieldError("email");
          }}
          className={`${inputBase} ${fieldErrors.email ? inputErr : inputOk}`}
        />
        {fieldErrors.email && (
          <p className="text-xs text-red-500 mt-1">{fieldErrors.email}</p>
        )}
      </div>

      {/* Contraseña */}
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">
          Contraseña
        </label>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              clearFieldError("password");
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

      {/* Confirmar contraseña */}
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">
          Confirmar contraseña
        </label>
        <div className="relative">
          <input
            type={showConfirmPassword ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              clearFieldError("confirmPassword");
            }}
            className={`${inputBase} pr-12 ${fieldErrors.confirmPassword ? inputErr : inputOk}`}
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
            aria-label={showConfirmPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
          >
            {showConfirmPassword ? <EyeSlashIcon /> : <EyeIcon />}
          </button>
        </div>
        {fieldErrors.confirmPassword && (
          <p className="text-xs text-red-500 mt-1">{fieldErrors.confirmPassword}</p>
        )}
      </div>

      {/* Documento fiscal */}
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">
          Documento fiscal
        </label>
        <input
          inputMode="numeric"
          value={taxId}
          onChange={(e) => {
            setTaxId(e.target.value.replace(/\D/g, ""));
            clearFieldError("taxId");
          }}
          className={`${inputBase} ${fieldErrors.taxId ? inputErr : inputOk}`}
        />
        {fieldErrors.taxId && (
          <p className="text-xs text-red-500 mt-1">{fieldErrors.taxId}</p>
        )}
      </div>

      {/* WhatsApp */}
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">
          WhatsApp
        </label>
        <input
          value={whatsapp}
          onChange={(e) => {
            setWhatsapp(e.target.value);
            clearFieldError("whatsapp");
          }}
          className={`${inputBase} ${fieldErrors.whatsapp ? inputErr : inputOk}`}
        />
        {fieldErrors.whatsapp && (
          <p className="text-xs text-red-500 mt-1">{fieldErrors.whatsapp}</p>
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
        {loading ? "Creando cuenta..." : "Registrarse"}
      </button>

      <p className="text-sm text-center text-gray-600">
        ¿Ya tenés cuenta?{" "}
        <span
          onClick={() => router.push("/login")}
          className="text-emerald-600 font-medium cursor-pointer hover:underline"
        >
          Iniciar sesión
        </span>
      </p>
    </form>
  );
}