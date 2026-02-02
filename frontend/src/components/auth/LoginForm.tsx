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

    // ⛔ MOCK TEMPORAL
    setTimeout(() => {
      if (email === "admin@test.com" && password === "123456") {
        router.push("/home");
      } else {
        setError("Credenciales incorrectas");
      }
      setLoading(false);
    }, 1000);
  };

  return (
    <form
  onSubmit={handleSubmit}
  className="
    bg-black
    border border-white/10
    rounded-2xl
    shadow-[0_0_40px_rgba(255,255,255,0.05)]
    p-6
    space-y-4
    w-full
    max-w-sm
  "
>
      <h1 className="text-2xl font-semibold text-center">
        Iniciar sesión
      </h1>

      {error && (
        <p className="text-sm text-red-400 text-center">
          {error}
        </p>
      )}

      <div>
        <label className="block text-sm font-medium mb-1 text-gray-300">
          Email
        </label>
        <input
          type="email"
          placeholder="correo@ejemplo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 
          text-white placeholder-gray-400
          focus:outline-none focus:ring-2 focus:ring-white"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1 text-gray-300">
          Contraseña
        </label>
        <input
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 
          text-white placeholder-gray-400
          focus:outline-none focus:ring-2 focus:ring-white"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-white text-black py-2 rounded-lg font-medium
        hover:bg-gray-200 transition disabled:opacity-50"
      >
        {loading ? "Ingresando..." : "Ingresar"}
      </button>
    </form>
  );
}
