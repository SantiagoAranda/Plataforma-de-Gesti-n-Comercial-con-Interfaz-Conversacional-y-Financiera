import { PayrollOvertimeCalculationMode } from '@prisma/client';

export const PAYROLL_RATES_2026_V1 = [
  [
    'HORA_ORDINARIA_NOCTURNA',
    'Hora Ordinaria Nocturna',
    35,
    1.35,
    0.35,
    PayrollOvertimeCalculationMode.SURCHARGE_ONLY,
  ],
  [
    'HORA_EXTRA_DIURNA',
    'Hora Extra Diurna',
    25,
    1.25,
    1.25,
    PayrollOvertimeCalculationMode.FULL_HOUR_FACTOR,
  ],
  [
    'HORA_EXTRA_NOCTURNO',
    'Hora Extra Nocturno',
    75,
    1.75,
    1.75,
    PayrollOvertimeCalculationMode.FULL_HOUR_FACTOR,
  ],
  [
    'HORA_DOMINICAL_FESTIVO',
    'Hora Dominical/Festivo',
    80,
    1.8,
    0.8,
    PayrollOvertimeCalculationMode.SURCHARGE_ONLY,
  ],
  [
    'HORA_EXTRA_DOM_FESTIVO',
    'Hora Extra Dom/Festivo',
    105,
    2.05,
    2.05,
    PayrollOvertimeCalculationMode.FULL_HOUR_FACTOR,
  ],
  [
    'HORA_DOM_FESTIVO_NOCTURNO',
    'Hora Dom/Festivo Nocturno',
    115,
    2.15,
    1.15,
    PayrollOvertimeCalculationMode.SURCHARGE_ONLY,
  ],
  [
    'HORA_EXTRA_NOCTURNO_DOM_FESTIVO',
    'Hora Extra Nocturno Dom/Festivo',
    155,
    2.55,
    2.55,
    PayrollOvertimeCalculationMode.FULL_HOUR_FACTOR,
  ],
] as const;

export function payrollRateFixtureData(
  globalParameterId: string,
  sundaySurcharge90 = false,
) {
  return PAYROLL_RATES_2026_V1.map(
    ([
      code,
      name,
      legalPercentage,
      totalFactor,
      payableMultiplier,
      calculationMode,
    ]) => {
      const julyValues: Record<string, [number, number, number]> = {
        HORA_DOMINICAL_FESTIVO: [90, 1.9, 0.9],
        HORA_EXTRA_DOM_FESTIVO: [115, 2.15, 2.15],
        HORA_DOM_FESTIVO_NOCTURNO: [125, 2.25, 1.25],
        HORA_EXTRA_NOCTURNO_DOM_FESTIVO: [165, 2.65, 2.65],
      };
      const normalized = sundaySurcharge90 ? julyValues[code] : undefined;
      return {
        globalParameterId,
        code,
        name,
        legalPercentage: normalized?.[0] ?? legalPercentage,
        totalFactor: normalized?.[1] ?? totalFactor,
        payableMultiplier: normalized?.[2] ?? payableMultiplier,
        calculationMode,
        isActive: true,
      };
    },
  );
}
