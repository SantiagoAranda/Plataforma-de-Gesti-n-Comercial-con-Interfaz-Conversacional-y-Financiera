"use client";

import { useEffect, useState } from "react";
import { listClases, listGrupos } from "@/src/services/puc";
import { cuentaDesdeGrupo } from "@/src/services/accounting";

type Props = {
  onSelectCuenta: (cuentaCode: string) => void;
};

export default function AccountingLineSelector({ onSelectCuenta }: Props) {
  const [clases, setClases] = useState<any[]>([]);
  const [grupos, setGrupos] = useState<any[]>([]);
  const [clase, setClase] = useState("");
  const [grupo, setGrupo] = useState("");

  useEffect(() => {
    (async () => {
      const data = await listClases();
      setClases(data);
    })();
  }, []);

  useEffect(() => {
    if (!clase) return;
    (async () => {
      const data = await listGrupos(clase);
      setGrupos(data);
    })();
  }, [clase]);

  useEffect(() => {
    if (!grupo) return;

    // 🔥 Acá ocurre la magia:
    const cuentaCode = cuentaDesdeGrupo(grupo);
    onSelectCuenta(cuentaCode);
  }, [grupo]);

  return (
    <div className="flex gap-2">
      <select
        className="border rounded px-2"
        value={clase}
        onChange={(e) => {
          setClase(e.target.value);
          setGrupo("");
        }}
      >
        <option value="">Clase</option>
        {clases.map((c) => (
          <option key={c.code} value={c.code}>
            {c.code} - {c.name}
          </option>
        ))}
      </select>

      <select
        className="border rounded px-2"
        value={grupo}
        onChange={(e) => setGrupo(e.target.value)}
        disabled={!clase}
      >
        <option value="">Grupo</option>
        {grupos.map((g) => (
          <option key={g.code} value={g.code}>
            {g.code} - {g.name}
          </option>
        ))}
      </select>
    </div>
  );
}
