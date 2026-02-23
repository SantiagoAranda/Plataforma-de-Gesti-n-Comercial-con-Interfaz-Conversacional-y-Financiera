import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();

import { parse } from "csv-parse/sync";

type Row = Record<string, string>;

function parseCSV(filePath: string): Row[] {
  const raw = fs.readFileSync(filePath, "utf8");

  const records = parse(raw, {
    columns: true,          // usa el header como keys
    skip_empty_lines: true,
    trim: true,
  }) as Row[];

  return records;
}

function toBool(v: string | undefined) {
    if (!v) return false;
    return ["true", "1", "yes", "y", "si", "sí"].includes(v.toLowerCase());
}

async function main() {
    const base = path.join(process.cwd(), "prisma", "seed-data");

    const clases = parseCSV(path.join(base, "puc_clase.csv"));
    const grupos = parseCSV(path.join(base, "puc_grupo.csv"));
    const cuentas = parseCSV(path.join(base, "puc_cuenta.csv"));
    const subcuentas = parseCSV(path.join(base, "puc_subcuenta.csv"));

    // Orden por FKs: Clase -> Grupo -> Cuenta -> Subcuenta
    for (const r of clases) {
        await prisma.pucClase.upsert({
            where: { code: r.code },
            update: { name: r.name },
            create: { code: r.code, name: r.name },
        });
    }

    for (const r of grupos) {
        await prisma.pucGrupo.upsert({
            where: { code: r.code },
            update: { name: r.name, claseCode: r.claseCode },
            create: { code: r.code, name: r.name, claseCode: r.claseCode },
        });
    }

    for (const r of cuentas) {
        await prisma.pucCuenta.upsert({
            where: { code: r.code },
            update: { name: r.name, grupoCode: r.grupoCode },
            create: { code: r.code, name: r.name, grupoCode: r.grupoCode },
        });
    }

    for (const r of subcuentas) {
        await prisma.pucSubcuenta.upsert({
            where: { code: r.code },
            update: {
                name: r.name,
                cuentaCode: r.cuentaCode,
                active: toBool(r.active),
            },
            create: {
                code: r.code,
                name: r.name,
                cuentaCode: r.cuentaCode,
                active: toBool(r.active),
            },
        });
    }

    console.log(
        `PUC seed OK: clases=${clases.length}, grupos=${grupos.length}, cuentas=${cuentas.length}, subcuentas=${subcuentas.length}`
    );
}

main()
    .catch((e) => {
        console.error("Seed failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });