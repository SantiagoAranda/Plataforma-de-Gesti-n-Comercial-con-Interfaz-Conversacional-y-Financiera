"use client";

import { useState } from "react";

type Product = {
  id: number;
  name: string;
  price: number;
};

export default function MiNegocioPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");

  const handleSend = () => {
    if (!name || !price) return;

    const newProduct: Product = {
      id: Date.now(),
      name,
      price: Number(price),
    };

    setProducts((prev) => [...prev, newProduct]);
    setName("");
    setPrice("");
  };

  const isTyping = name.length > 0 || price.length > 0;

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Header */}
      <header className="h-14 flex items-center px-4 border-b bg-gray-50 font-semibold">
        Mi Negocio
      </header>

      {/* Chat */}
      <main className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* System message (solo cuando no escribe) */}
        {!isTyping && (
          <div className="max-w-[80%] text-sm bg-gray-200 text-gray-700 px-3 py-2 rounded-2xl">
            Cargá un producto escribiendo el nombre y el precio 👇
          </div>
        )}

        {/* Productos */}
        {products.map((product) => (
          <div
            key={product.id}
            className="ml-auto max-w-[75%] bg-green-500 text-white px-3 py-2 rounded-2xl"
          >
            <p className="font-medium leading-tight">{product.name}</p>
            <p className="text-sm opacity-90">${product.price}</p>
          </div>
        ))}
      </main>

      {/* Input */}
      <footer className="border-t bg-white p-3">
        <p className="text-xs text-gray-500 mb-1">¿Qué vas a cargar?</p>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Nombre del producto"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />

          <input
            type="number"
            placeholder="$ Precio"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-24 border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />

          <button
            onClick={handleSend}
            className="bg-green-600 text-white px-4 rounded-xl text-sm font-medium"
          >
            Enviar
          </button>
        </div>
      </footer>
    </div>
  );
}
