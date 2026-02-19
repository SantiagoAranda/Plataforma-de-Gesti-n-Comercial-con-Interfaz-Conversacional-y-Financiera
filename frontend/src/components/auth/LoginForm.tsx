"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    setTimeout(() => {
      if (email === "admin@test.com" && password === "123456") {
        router.push("/home");
      } else {
        setError("Credenciales incorrectas");
      }
      setLoading(false);
    }, 800);
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
    {/* Título */}
    <h1 className="text-2xl font-semibold text-center text-gray-900">
      Iniciar sesión
    </h1>

    {/* Error */}
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
        onChange={(e) => setEmail(e.target.value)}
        required
        className="
          w-full
          bg-neutral-50
          border border-neutral-300
          rounded-xl
          px-4 py-3
          text-gray-800
          placeholder-gray-400
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
      <input
        type="password"
        placeholder="••••••••"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        className="
          w-full
          bg-neutral-50
          border border-neutral-300
          rounded-xl
          px-4 py-3
          text-gray-800
          placeholder-gray-400
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
      {loading ? "Ingresando..." : "Ingresar"}
    </button>

    {/* Link register */}
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