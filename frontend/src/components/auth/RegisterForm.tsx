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

    // ⛔ MOCK
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
        w-full max-w-md
        bg-white
        border border-gray-200
        rounded-2xl
        px-5 py-6
        space-y-5
        shadow-lg
      "
    >
      <h1 className="text-xl font-semibold text-center text-gray-900">
        Crear cuenta
      </h1>

      {error && (
        <p className="text-sm text-red-600 text-center">
          {error}
        </p>
      )}

      {/* Nombre del negocio */}
      <div>
        <label className="block text-sm font-medium mb-1 text-gray-700">
          Nombre del negocio
        </label>
        <input
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          required
          className="
            w-full
            border border-gray-300
            rounded-lg
            px-3 py-2.5
            text-gray-800
            focus:outline-none focus:ring-2 focus:ring-black/70
            transition
          "
        />
      </div>

      {/* Email */}
      <div>
        <label className="block text-sm font-medium mb-1 text-gray-700">
          Email
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="
            w-full
            border border-gray-300
            rounded-lg
            px-3 py-2.5
            text-gray-800
            focus:outline-none focus:ring-2 focus:ring-black/70
            transition
          "
        />
      </div>

      {/* Contraseña */}
      <div>
        <label className="block text-sm font-medium mb-1 text-gray-700">
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
              border border-gray-300
              rounded-lg
              px-3 py-2.5 pr-10
              text-gray-800
              focus:outline-none focus:ring-2 focus:ring-black/70
              transition
            "
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2 top-2 text-sm text-gray-600"
          >
            {showPassword ? "Ocultar" : "Ver"}
          </button>
        </div>
      </div>

      {/* Confirmar contraseña */}
      <div>
        <label className="block text-sm font-medium mb-1 text-gray-700">
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
              border border-gray-300
              rounded-lg
              px-3 py-2.5 pr-10
              text-gray-800
              focus:outline-none focus:ring-2 focus:ring-black/70
              transition
            "
          />
          <button
            type="button"
            onClick={() =>
              setShowConfirmPassword(!showConfirmPassword)
            }
            className="absolute right-2 top-2 text-sm text-gray-600"
          >
            {showConfirmPassword ? "Ocultar" : "Ver"}
          </button>
        </div>
      </div>

      {/* Documento fiscal */}
      <div>
        <label className="block text-sm font-medium mb-1 text-gray-700">
          Documento fiscal
        </label>
        <input
          value={taxId}
          onChange={(e) => setTaxId(e.target.value)}
          required
          className="
            w-full
            border border-gray-300
            rounded-lg
            px-3 py-2.5
            text-gray-800
            focus:outline-none focus:ring-2 focus:ring-black/70
            transition
          "
        />
      </div>

      {/* WhatsApp */}
      <div>
        <label className="block text-sm font-medium mb-1 text-gray-700">
          WhatsApp
        </label>
        <input
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          required
          className="
            w-full
            border border-gray-300
            rounded-lg
            px-3 py-2.5
            text-gray-800
            focus:outline-none focus:ring-2 focus:ring-black/70
            transition
          "
        />
      </div>

      {/* Nombre del propietario */}
      <div>
        <label className="block text-sm font-medium mb-1 text-gray-700">
          Nombre del propietario
        </label>
        <input
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
          required
          className="
            w-full
            border border-gray-300
            rounded-lg
            px-3 py-2.5
            text-gray-800
            focus:outline-none focus:ring-2 focus:ring-black/70
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
          bg-gradient-to-b from-black to-gray-800
          text-white
          py-3
          rounded-xl
          font-medium
          shadow-md
          hover:from-gray-900 hover:to-black
          active:scale-[0.98]
          disabled:opacity-50
          transition
        "
      >
        {loading ? "Creando cuenta..." : "Registrarse"}
      </button>

      {/* Link a login */}
      <p className="text-sm text-center text-gray-500">
        ¿Ya tenés cuenta?{" "}
        <span
          onClick={() => router.push("/login")}
          className="text-black underline underline-offset-2 cursor-pointer"
        >
          Iniciar sesión
        </span>
      </p>
    </form>
  );
}
