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

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isValidEmail = (email: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const isValidPassword = (password: string) =>
    password.length >= 6 &&
    /[A-Z]/.test(password) &&
    /\d/.test(password);

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

    // ⛔ MOCK TEMPORAL
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
      className="w-full max-w-sm bg-white border border-gray-200 rounded-xl p-6 space-y-4 shadow-md"
    >
      <h1 className="text-2xl font-semibold text-center text-gray-800">
        Crear cuenta
      </h1>

      {error && (
        <p className="text-sm text-red-600 text-center">
          {error}
        </p>
      )}

      <Input
        label="Nombre del negocio"
        value={businessName}
        onChange={setBusinessName}
        placeholder="Mi negocio"
      />

      <Input
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        placeholder="correo@ejemplo.com"
      />

      {/* Contraseña */}
      <PasswordInput
        label="Contraseña"
        value={password}
        onChange={setPassword}
        show={showPassword}
        setShow={setShowPassword}
      />

      {/* Confirmar contraseña */}
      <PasswordInput
        label="Confirmar contraseña"
        value={confirmPassword}
        onChange={setConfirmPassword}
        show={showConfirmPassword}
        setShow={setShowConfirmPassword}
      />

      <Input
        label="Documento fiscal"
        value={taxId}
        onChange={setTaxId}
        placeholder="CUIT / RUC / NIF"
      />

      <Input
        label="Número de WhatsApp"
        type="tel"
        value={whatsapp}
        onChange={setWhatsapp}
        placeholder="+54 9 11 1234 5678"
      />

      <Input
        label="Nombre del propietario"
        value={ownerName}
        onChange={setOwnerName}
        placeholder="Nombre completo"
      />

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-black text-white py-2 rounded-lg font-medium disabled:opacity-50"
      >
        {loading ? "Creando cuenta..." : "Registrarse"}
      </button>

      <p className="text-sm text-center text-gray-500">
        ¿Ya tenés cuenta?{" "}
        <span
          onClick={() => router.push("/login")}
          className="text-black underline cursor-pointer"
        >
          Iniciar sesión
        </span>
      </p>
    </form>
  );
}

/* ---------- COMPONENTES AUXILIARES ---------- */

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1 text-gray-700">
        {label}
      </label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        required
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-800
        placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-black"
      />
    </div>
  );
}

function PasswordInput({
  label,
  value,
  onChange,
  show,
  setShow,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  setShow: (v: boolean) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1 text-gray-700">
        {label}
      </label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="••••••••"
          required
          className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 text-gray-800
          placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-black"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-2 top-2 text-sm text-gray-600"
        >
          {show ? "Ocultar" : "Ver"}
        </button>
      </div>
    </div>
  );
}
