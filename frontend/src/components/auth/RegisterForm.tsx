"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

  const isValidEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const isValidPassword = (value: string) =>
    value.length >= 6 && /[A-Z]/.test(value) && /\d/.test(value);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!isValidEmail(email)) {
      setError("El correo no tiene un formato válido");
      return;
    }

    if (!isValidPassword(password)) {
      setError(
        "La contraseña debe tener al menos 6 caracteres, una mayúscula y un número"
      );
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }

    setLoading(true);

    setTimeout(() => {
      console.log({
        businessName,
        email,
        password,
        taxId,
        whatsapp,
        ownerName,
      });

      setLoading(false);
      router.push("/login");
    }, 1000);
  };

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
        Crear cuenta
      </h1>

      {error && (
        <p className="text-sm text-red-500 text-center font-medium">
          {error}
        </p>
      )}

      {/* Nombre del negocio */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Nombre del negocio
        </label>
        <input
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          required
          className="
            w-full
            bg-neutral-50
            border border-neutral-300
            rounded-xl
            px-4 py-3
            text-gray-800
            focus:outline-none
            focus:ring-2 focus:ring-emerald-600
            focus:border-emerald-600
            transition
          "
        />
      </div>

      {/* Email */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Email
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="
            w-full
            bg-neutral-50
            border border-neutral-300
            rounded-xl
            px-4 py-3
            text-gray-800
            focus:outline-none
            focus:ring-2 focus:ring-emerald-600
            focus:border-emerald-600
            transition
          "
        />
      </div>

      {/* Contraseña */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Contraseña
        </label>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="
              w-full
              bg-neutral-50
              border border-neutral-300
              rounded-xl
              px-4 py-3 pr-16
              text-gray-800
              focus:outline-none
              focus:ring-2 focus:ring-emerald-600
              focus:border-emerald-600
              transition
            "
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-4 top-3 text-sm text-gray-500 hover:text-gray-700"
          >
            {showPassword ? "Ocultar" : "Ver"}
          </button>
        </div>
      </div>

      {/* Confirmar contraseña */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Confirmar contraseña
        </label>
        <div className="relative">
          <input
            type={showConfirmPassword ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="
              w-full
              bg-neutral-50
              border border-neutral-300
              rounded-xl
              px-4 py-3 pr-16
              text-gray-800
              focus:outline-none
              focus:ring-2 focus:ring-emerald-600
              focus:border-emerald-600
              transition
            "
          />
          <button
            type="button"
            onClick={() =>
              setShowConfirmPassword(!showConfirmPassword)
            }
            className="absolute right-4 top-3 text-sm text-gray-500 hover:text-gray-700"
          >
            {showConfirmPassword ? "Ocultar" : "Ver"}
          </button>
        </div>
      </div>

      {/* Documento fiscal */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Documento fiscal
        </label>
        <input
          value={taxId}
          onChange={(e) => setTaxId(e.target.value)}
          required
          className="
            w-full
            bg-neutral-50
            border border-neutral-300
            rounded-xl
            px-4 py-3
            text-gray-800
            focus:outline-none
            focus:ring-2 focus:ring-emerald-600
            focus:border-emerald-600
            transition
          "
        />
      </div>

      {/* WhatsApp */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          WhatsApp
        </label>
        <input
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          required
          className="
            w-full
            bg-neutral-50
            border border-neutral-300
            rounded-xl
            px-4 py-3
            text-gray-800
            focus:outline-none
            focus:ring-2 focus:ring-emerald-600
            focus:border-emerald-600
            transition
          "
        />
      </div>

      {/* Nombre del propietario */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Nombre del propietario
        </label>
        <input
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
          required
          className="
            w-full
            bg-neutral-50
            border border-neutral-300
            rounded-xl
            px-4 py-3
            text-gray-800
            focus:outline-none
            focus:ring-2 focus:ring-emerald-600
            focus:border-emerald-600
            transition
          "
        />
      </div>

      {/* Botón */}
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

      {/* Link login */}
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
