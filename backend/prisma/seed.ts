import { PrismaClient, PayrollWithholdingStatus } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import * as bcrypt from "bcrypt";
import { parse } from "csv-parse/sync";

const prisma = new PrismaClient();

type Row = Record<string, string>;

function parseCSV(filePath: string): Row[] {
    const raw = fs.readFileSync(filePath, "utf8");

    return parse(raw, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
        record_delimiter: "\n",
    }) as Row[];
}

function toBool(v: string | undefined) {
    if (!v) return false;
    return ["true", "1", "yes", "y", "si", "sí"].includes(v.toLowerCase());
}

function toDecimal(v: string | undefined) {
    if (v === undefined || v === null || v === "") return null;
    return v.replace(",", ".");
}

function normalizeCode(value: string | undefined, length: number) {
    return String(value ?? "").trim().padStart(length, "0");
}

function normalizeOvertimeCode(name: string) {
    return name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
}

async function seedPuc(base: string) {
    const clases = parseCSV(path.join(base, "puc_clase.csv"));
    const grupos = parseCSV(path.join(base, "puc_grupo.csv"));
    const cuentas = parseCSV(path.join(base, "puc_cuenta.csv"));
    const subcuentas = parseCSV(path.join(base, "puc_subcuenta.csv"));

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
        `PUC seed OK: clases=${clases.length}, grupos=${grupos.length}, cuentas=${cuentas.length}, subcuentas=${subcuentas.length}`,
    );
}

async function seedAdmin() {
    const adminEmail = "admin@sistema.com";

    const existingAdmin = await prisma.user.findUnique({
        where: { email: adminEmail },
    });

    if (!existingAdmin) {
        const hashedPassword = await bcrypt.hash("admin123", 10);

        await prisma.user.create({
            data: {
                email: adminEmail,
                password: hashedPassword,
                role: "ADMIN",
                businessId: null,
            },
        });

        console.log("ADMIN del sistema creado");
    } else {
        console.log("ADMIN ya existe");
    }
}

async function seedPayrollGlobalParameters(base: string) {
    const rows = parseCSV(path.join(base, "payroll_global_parameters.csv"));

    for (const r of rows) {
        await prisma.payrollGlobalParameter.upsert({
            where: {
                year_version: {
                    year: Number(r.year),
                    version: Number(r.version),
                },
            },
            update: {
                isActive: toBool(r.is_active),
                smmlv: toDecimal(r.smmlv)!,
                transportAllowance: toDecimal(r.transport_allowance)!,
                uvt: toDecimal(r.uvt),
                weeklyHours: toDecimal(r.weekly_hours)!,
                monthlyHours: toDecimal(r.monthly_hours)!,
                dailyHours: toDecimal(r.daily_hours)!,
                maxWorkedDaysMonth: Number(r.max_worked_days_month),
                maxSupplementaryHours: Number(r.max_supplementary_hours),
                healthEmployeeRate: toDecimal(r.health_employee_rate)!,
                pensionEmployeeRate: toDecimal(r.pension_employee_rate)!,
                healthEmployerRate: toDecimal(r.health_employer_rate)!,
                pensionEmployerRate: toDecimal(r.pension_employer_rate)!,
                compensationFundRate: toDecimal(r.compensation_fund_rate)!,
                senaRate: toDecimal(r.sena_rate)!,
                icbfRate: toDecimal(r.icbf_rate)!,
                severanceRate: toDecimal(r.severance_rate)!,
                severanceInterestRate: toDecimal(r.severance_interest_rate)!,
                serviceBonusRate: toDecimal(r.service_bonus_rate)!,
                vacationRate: toDecimal(r.vacation_rate)!,
                law1819ThresholdSmmlv: toDecimal(r.law1819_threshold_smmlv)!,
                transportLimitSmmlv: toDecimal(r.transport_limit_smmlv)!,
                withholdingStatus: r.withholding_status as PayrollWithholdingStatus,
            },
            create: {
                year: Number(r.year),
                version: Number(r.version),
                isActive: toBool(r.is_active),
                smmlv: toDecimal(r.smmlv)!,
                transportAllowance: toDecimal(r.transport_allowance)!,
                uvt: toDecimal(r.uvt),
                weeklyHours: toDecimal(r.weekly_hours)!,
                monthlyHours: toDecimal(r.monthly_hours)!,
                dailyHours: toDecimal(r.daily_hours)!,
                maxWorkedDaysMonth: Number(r.max_worked_days_month),
                maxSupplementaryHours: Number(r.max_supplementary_hours),
                healthEmployeeRate: toDecimal(r.health_employee_rate)!,
                pensionEmployeeRate: toDecimal(r.pension_employee_rate)!,
                healthEmployerRate: toDecimal(r.health_employer_rate)!,
                pensionEmployerRate: toDecimal(r.pension_employer_rate)!,
                compensationFundRate: toDecimal(r.compensation_fund_rate)!,
                senaRate: toDecimal(r.sena_rate)!,
                icbfRate: toDecimal(r.icbf_rate)!,
                severanceRate: toDecimal(r.severance_rate)!,
                severanceInterestRate: toDecimal(r.severance_interest_rate)!,
                serviceBonusRate: toDecimal(r.service_bonus_rate)!,
                vacationRate: toDecimal(r.vacation_rate)!,
                law1819ThresholdSmmlv: toDecimal(r.law1819_threshold_smmlv)!,
                transportLimitSmmlv: toDecimal(r.transport_limit_smmlv)!,
                withholdingStatus: r.withholding_status as PayrollWithholdingStatus,
            },
        });
    }

    console.log(`PayrollGlobalParameter seed OK: ${rows.length}`);
}

async function seedArlRiskClasses(base: string) {
    const rows = parseCSV(path.join(base, "arl_risk_classes.csv"));

    for (const r of rows) {
        await prisma.payrollArlRiskClass.upsert({
            where: { level: Number(r.level) },
            update: {
                name: r.name,
                rate: toDecimal(r.rate)!,
                isActive: true,
            },
            create: {
                level: Number(r.level),
                name: r.name,
                rate: toDecimal(r.rate)!,
                isActive: true,
            },
        });
    }

    console.log(`ARL seed OK: ${rows.length}`);
}

async function seedCiiu(base: string) {
    const rows = parseCSV(path.join(base, "ciiu_codes.csv"));

    let count = 0;

    for (const r of rows) {
        const code = normalizeCode(r.code ?? r.codigo, 4);
        const description = r.description ?? r.descripcion;

        if (!code || !description) continue;

        await prisma.economicActivityCiiu.upsert({
            where: { code },
            update: {
                description,
                section: r.section ?? r.seccion ?? null,
                isActive: true,
            },
            create: {
                code,
                description,
                section: r.section ?? r.seccion ?? null,
                isActive: true,
            },
        });

        count++;
    }

    console.log(`CIIU seed OK: ${count}`);
}

async function seedOvertimeRates(base: string) {
    const rows = parseCSV(path.join(base, "horas.csv"));

    const globalParameter = await prisma.payrollGlobalParameter.findFirst({
        where: { year: 2026, isActive: true },
        orderBy: { version: "desc" },
    });

    if (!globalParameter) {
        throw new Error("No existe PayrollGlobalParameter activo para 2026");
    }

    for (const r of rows) {
        const name = r.tipo_hora ?? r.name;
        const factor = r.factor_multiplicador ?? r.factor;
        const code = normalizeOvertimeCode(name);

        await prisma.payrollOvertimeRate.upsert({
            where: {
                globalParameterId_code: {
                    globalParameterId: globalParameter.id,
                    code,
                },
            },
            update: {
                name,
                factor: toDecimal(factor)!,
                isActive: true,
            },
            create: {
                globalParameterId: globalParameter.id,
                code,
                name,
                factor: toDecimal(factor)!,
                isActive: true,
            },
        });
    }

    console.log(`Horas extra seed OK: ${rows.length}`);
}

async function seedSolidarityBrackets(base: string) {
    const rows = parseCSV(path.join(base, "solidaridad.csv"));

    const globalParameter = await prisma.payrollGlobalParameter.findFirst({
        where: { year: 2026, isActive: true },
        orderBy: { version: "desc" },
    });

    if (!globalParameter) {
        throw new Error("No existe PayrollGlobalParameter activo para 2026");
    }

    await prisma.payrollSolidarityBracket.deleteMany({
        where: { globalParameterId: globalParameter.id },
    });

    for (const r of rows) {
        await prisma.payrollSolidarityBracket.create({
            data: {
                globalParameterId: globalParameter.id,
                fromSmmlv: toDecimal(r.limite_inferior_smmlv ?? r.from_smmlv)!,
                toSmmlv: toDecimal(r.limite_superior_smmlv ?? r.to_smmlv),
                rate: toDecimal(r.porcentaje_decimal ?? r.rate)!,
            },
        });
    }

    console.log(`Solidaridad seed OK: ${rows.length}`);
}

async function seedPayrollAccountingMappings(base: string) {
    const rows = parseCSV(path.join(base, "payroll_accounting_mapping.csv"));

    const businesses = await prisma.business.findMany({
        select: { id: true, name: true },
    });

    if (businesses.length === 0) {
        console.log("PayrollAccountingMapping seed omitido: no hay negocios creados");
        return;
    }

    for (const business of businesses) {
        for (const r of rows) {
            const accountCode = r.account_code.trim();
            if (accountCode.length === 4) {
                const account = await prisma.pucCuenta.findUnique({
                    where: { code: accountCode },
                    select: { code: true },
                });
                if (!account) {
                    throw new Error(`Payroll accounting PUC cuenta not found: ${accountCode}`);
                }
            } else if (accountCode.length === 6) {
                const subaccount = await prisma.pucSubcuenta.findFirst({
                    where: { code: accountCode, active: true },
                    select: { code: true },
                });
                if (!subaccount) {
                    throw new Error(`Payroll accounting PUC subcuenta not found or inactive: ${accountCode}`);
                }
            } else {
                throw new Error(`Payroll accounting account_code invalid: ${accountCode}`);
            }

            await prisma.payrollAccountingMapping.upsert({
                where: {
                    businessId_conceptCode_side: {
                        businessId: business.id,
                        conceptCode: r.concept_code,
                        side: r.side as any,
                    },
                },
                update: {
                    conceptName: r.concept_name,
                    accountCode: r.account_code,
                    accountName: r.account_name,
                    isActive: true,
                },
                create: {
                    businessId: business.id,
                    conceptCode: r.concept_code,
                    conceptName: r.concept_name,
                    accountCode: r.account_code,
                    accountName: r.account_name,
                    side: r.side as any,
                    isActive: true,
                },
            });
        }
    }

    console.log(
        `PayrollAccountingMapping seed OK: businesses=${businesses.length}, mappings=${rows.length}`,
    );
}

async function seedInventoryDemoData() {
    const business = await prisma.business.findFirst({
        orderBy: { createdAt: "asc" },
        select: { id: true },
    });

    if (!business) {
        console.log("Inventory seed omitido: no hay negocios creados");
        return;
    }

    const ingredientInputs = [
        {
            name: "Harina demo",
            consumptionUnit: "G" as const,
            purchaseUnit: "KG" as const,
            purchaseToConsumptionFactor: "1000",
            minStock: "1000",
            quantity: "5000",
            unitCost: "4",
        },
        {
            name: "Queso demo",
            consumptionUnit: "G" as const,
            purchaseUnit: "KG" as const,
            purchaseToConsumptionFactor: "1000",
            minStock: "500",
            quantity: "2000",
            unitCost: "18",
        },
        {
            name: "Salsa demo",
            consumptionUnit: "ML" as const,
            purchaseUnit: "L" as const,
            purchaseToConsumptionFactor: "1000",
            minStock: "500",
            quantity: "3000",
            unitCost: "6",
        },
    ];

    const ingredients = [];
    for (const input of ingredientInputs) {
        const ingredient = await prisma.ingredient.upsert({
            where: {
                businessId_name: {
                    businessId: business.id,
                    name: input.name,
                },
            },
            update: {
                status: "ACTIVE",
                consumptionUnit: input.consumptionUnit,
                purchaseUnit: input.purchaseUnit,
                purchaseToConsumptionFactor: input.purchaseToConsumptionFactor,
                minStock: input.minStock,
            },
            create: {
                businessId: business.id,
                name: input.name,
                consumptionUnit: input.consumptionUnit,
                purchaseUnit: input.purchaseUnit,
                purchaseToConsumptionFactor: input.purchaseToConsumptionFactor,
                minStock: input.minStock,
            },
        });

        const existingInitial = await prisma.inventoryMovement.findFirst({
            where: {
                businessId: business.id,
                ingredientId: ingredient.id,
                type: "INVENTORY_INITIAL",
            },
            select: { id: true },
        });

        if (!existingInitial) {
            const quantity = input.quantity;
            const unitCost = input.unitCost;
            await prisma.inventoryMovement.create({
                data: {
                    businessId: business.id,
                    ingredientId: ingredient.id,
                    type: "INVENTORY_INITIAL",
                    quantity,
                    unitCost,
                    totalValue: Number(quantity) * Number(unitCost),
                    stockAfter: quantity,
                    averageCostAfter: unitCost,
                    referenceType: "MANUAL",
                    detail: "Seed demo inventario",
                },
            });
            await prisma.ingredient.update({
                where: { id: ingredient.id },
                data: {
                    currentStock: quantity,
                    averageCost: unitCost,
                },
            });
        }

        ingredients.push(ingredient);
    }

    let simpleItem = await prisma.item.findFirst({
        where: { businessId: business.id, name: "Pan demo inventario" },
    });
    if (!simpleItem) {
        simpleItem = await prisma.item.create({
            data: {
                businessId: business.id,
                name: "Pan demo inventario",
                type: "PRODUCT",
                price: "2500",
                status: "ACTIVE",
                inventoryMode: "SIMPLE",
            },
        });
    } else {
        await prisma.item.update({
            where: { id: simpleItem.id },
            data: { inventoryMode: "SIMPLE", status: "ACTIVE" },
        });
    }

    await prisma.recipe.upsert({
        where: {
            businessId_itemId_ingredientId: {
                businessId: business.id,
                itemId: simpleItem.id,
                ingredientId: ingredients[0].id,
            },
        },
        update: {
            quantityRequired: "120",
            isOptional: false,
        },
        create: {
            businessId: business.id,
            itemId: simpleItem.id,
            ingredientId: ingredients[0].id,
            quantityRequired: "120",
            isOptional: false,
        },
    });

    let recipeItem = await prisma.item.findFirst({
        where: { businessId: business.id, name: "Pizza demo inventario" },
    });
    if (!recipeItem) {
        recipeItem = await prisma.item.create({
            data: {
                businessId: business.id,
                name: "Pizza demo inventario",
                type: "PRODUCT",
                price: "18000",
                status: "ACTIVE",
                inventoryMode: "RECIPE_BASED",
            },
        });
    } else {
        await prisma.item.update({
            where: { id: recipeItem.id },
            data: { inventoryMode: "RECIPE_BASED", status: "ACTIVE" },
        });
    }

    for (const line of [
        { ingredient: ingredients[0], quantityRequired: "250" },
        { ingredient: ingredients[1], quantityRequired: "120" },
        { ingredient: ingredients[2], quantityRequired: "80" },
    ]) {
        await prisma.recipe.upsert({
            where: {
                businessId_itemId_ingredientId: {
                    businessId: business.id,
                    itemId: recipeItem.id,
                    ingredientId: line.ingredient.id,
                },
            },
            update: {
                quantityRequired: line.quantityRequired,
                isOptional: false,
            },
            create: {
                businessId: business.id,
                itemId: recipeItem.id,
                ingredientId: line.ingredient.id,
                quantityRequired: line.quantityRequired,
                isOptional: false,
            },
        });
    }

    console.log("Inventory demo seed OK");
}

async function main() {
    const base = path.join(process.cwd(), "prisma", "seed-data");

    await seedPuc(base);
    await seedAdmin();

    await seedPayrollGlobalParameters(base);
    await seedArlRiskClasses(base);
    await seedCiiu(base);
    await seedOvertimeRates(base);
    await seedSolidarityBrackets(base);
    await seedPayrollAccountingMappings(base);
    await seedInventoryDemoData();
}

main()
    .catch((e) => {
        console.error("Seed failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
