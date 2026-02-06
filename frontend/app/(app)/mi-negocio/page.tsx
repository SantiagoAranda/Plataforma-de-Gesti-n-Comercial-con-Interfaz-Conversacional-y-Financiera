"use client";

import { useEffect, useState } from "react";

type Product = {
  id: number;
  name: string;
  price: number;
  image?: string;
};

export default function MiNegocioPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [image, setImage] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  useEffect(() => {
    return () => {
      if (image) URL.revokeObjectURL(image);
    };
  }, [image]);

  const handleImageChange = (file: File | null) => {
    if (!file) return;
    setImage(URL.createObjectURL(file));
  };

  const resetForm = () => {
    setName("");
    setPrice("");
    setImage(null);
    setEditingId(null);
  };

  const handleSend = () => {
    if (!name || !price) return;

    if (editingId) {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === editingId
            ? {
                ...p,
                name,
                price: Number(price),
                image: image || p.image,
              }
            : p
        )
      );
    } else {
      setProducts((prev) => [
        ...prev,
        {
          id: Date.now(),
          name,
          price: Number(price),
          image: image || undefined,
        },
      ]);
    }

    resetForm();
  };

  const startEdit = (product: Product) => {
    setEditingId(product.id);
    setName(product.name);
    setPrice(product.price.toString());
    setImage(product.image || null);
    setMenuOpenId(null);
  };

  const requestDelete = (id: number) => {
    setConfirmDeleteId(id);
    setMenuOpenId(null);
  };

  const confirmDelete = () => {
    if (!confirmDeleteId) return;

    setProducts((prev) =>
      prev.filter((p) => p.id !== confirmDeleteId)
    );

    if (editingId === confirmDeleteId) resetForm();
    setConfirmDeleteId(null);
  };

  const cancelDelete = () => {
    setConfirmDeleteId(null);
  };

  const isComposing =
    name !== "" || price !== "" || image !== null || editingId !== null;

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Header */}
      <header className="h-14 flex items-center px-4 border-b bg-gray-50 font-semibold">
        Mi Negocio
      </header>

      {/* Chat */}
      <main className="flex-1 overflow-y-auto p-4 space-y-3">
        {!isComposing && (
          <div className="max-w-[80%] text-sm bg-gray-200 text-gray-700 px-3 py-2 rounded-2xl">
            Cargá productos a tu catálogo 👇
          </div>
        )}

        {products.map((product) => (
          <div
            key={product.id}
            className="ml-auto max-w-[75%] bg-green-500 text-white px-3 py-2 rounded-2xl space-y-2 relative"
          >
            {/* Menu trigger */}
            <button
              onClick={() =>
                setMenuOpenId(
                  menuOpenId === product.id ? null : product.id
                )
              }
              className="absolute top-2 right-2 text-white/80 text-lg"
            >
              ⋮
            </button>

            {/* Menu */}
            {menuOpenId === product.id && (
              <div className="absolute top-8 right-2 bg-white text-gray-700 rounded-xl shadow-md overflow-hidden text-sm z-10">
                <button
                  onClick={() => startEdit(product)}
                  className="block w-full text-left px-4 py-2 hover:bg-gray-100"
                >
                  ✏️ Editar
                </button>
                <button
                  onClick={() => requestDelete(product.id)}
                  className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-red-600"
                >
                  🗑️ Eliminar
                </button>
              </div>
            )}

            {product.image && (
              <img
                src={product.image}
                alt={product.name}
                className="w-full max-h-40 object-cover rounded-xl"
              />
            )}

            <p className="font-medium leading-tight">{product.name}</p>
            <p className="text-sm opacity-90">${product.price}</p>

            {/* Confirm delete */}
            {confirmDeleteId === product.id && (
              <div className="mt-2 bg-white text-gray-800 rounded-xl p-3 text-sm space-y-2">
                <p>¿Eliminar este producto del catálogo?</p>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={cancelDelete}
                    className="px-3 py-1 rounded-lg bg-gray-200"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmDelete}
                    className="px-3 py-1 rounded-lg bg-red-600 text-white"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </main>

      {/* Input */}
      <footer className="border-t bg-white p-3 relative z-20">
        <p className="text-xs text-gray-500 mb-1">
          {editingId ? "Editando producto" : "Agregá un producto"}
        </p>

        {image && (
          <div className="mb-2">
            <img
              src={image}
              alt="Preview"
              className="h-24 w-24 rounded-xl object-cover border"
            />
          </div>
        )}

        <div className="flex gap-2 items-center">
          <label className="flex items-center justify-center w-10 h-10 rounded-xl cursor-pointer bg-gray-200 text-gray-700 font-bold">
            +
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) =>
                handleImageChange(e.target.files?.[0] || null)
              }
            />
          </label>

          <input
            type="text"
            placeholder="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 border rounded-xl px-3 py-2 text-sm"
          />

          <input
            type="number"
            placeholder="$"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-24 border rounded-xl px-3 py-2 text-sm"
          />

          <button
            onClick={handleSend}
            disabled={!name || !price}
            className="bg-green-600 text-white px-4 rounded-xl text-sm font-medium disabled:opacity-50"
          >
            {editingId ? "Guardar" : "Enviar"}
          </button>
        </div>

        {editingId && (
          <button
            onClick={resetForm}
            className="mt-2 text-xs text-gray-500 underline"
          >
            Cancelar edición
          </button>
        )}
      </footer>
    </div>
  );
}
