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
        w-full max-w-md
        bg-white
        border border-gray-200
        rounded-2xl
        px-5 py-6
        space-y-5
        shadow-lg
      "
    >
      {/* Título */}
      <h1 className="text-xl font-semibold text-center text-gray-900">
        Iniciar sesión
      </h1>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-600 text-center">
          {error}
        </p>
      )}

      {/* Email */}
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
          className="
            w-full
            border border-gray-300
            rounded-lg
            px-3 py-2.5
            text-gray-800
            placeholder-gray-400
            focus:outline-none
            focus:ring-2 focus:ring-black/70
            transition
          "
        />
      </div>

      {/* Contraseña */}
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
          className="
            w-full
            border border-gray-300
            rounded-lg
            px-3 py-2.5
            text-gray-800
            placeholder-gray-400
            focus:outline-none
            focus:ring-2 focus:ring-black/70
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
        {loading ? "Ingresando..." : "Ingresar"}
      </button>

      {/* Link register */}
      <p className="text-sm text-center text-gray-500">
        ¿No tenés cuenta?{" "}
        <span
          onClick={() => router.push("/register")}
          className="text-black underline underline-offset-2 cursor-pointer"
        >
          Registrarse
        </span>
      </p>
    </form>
  );
}
