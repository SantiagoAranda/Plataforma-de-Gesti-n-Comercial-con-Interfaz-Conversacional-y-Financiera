"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterForm() {
  const router = useRouter();

  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // ⛔ MOCK TEMPORAL
    setTimeout(() => {
      if (businessName && email && password) {
        router.push("/login");
      } else {
        setError("Completá todos los campos");
      }
      setLoading(false);
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

      <div>
        <label className="block text-sm font-medium mb-1 text-gray-700">
          Nombre del negocio
        </label>
        <input
          type="text"
          placeholder="Mi negocio"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          required
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-800
          placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-black"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1 text-gray-700">
          Email
        </label>
        <input
          type="email"
          placeholder="correo@ejemplo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-800
          placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-black"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1 text-gray-700">
          Contraseña
        </label>
        <input
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-800
          placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-black"
        />
      </div>

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
