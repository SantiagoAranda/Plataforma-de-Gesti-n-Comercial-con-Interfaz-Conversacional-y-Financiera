# Inventario funcional — Nómina Colombia

Corte solicitado: **30 de octubre de 2026**. Revisión del árbol de trabajo sobre commit `5ff 886add 997f34f1aa 0578dbd 5b10eb 2e66fd 88`. Auditoría exclusivamente documental: no se ejecutaron migraciones, seeds, escrituras en PostgreSQL ni cambios de configuración. Los cambios preexistentes de notificaciones/push y las referencias del cliente se conservaron.

## Alcance y nivel de evidencia

Se revisaron servicio, controlador, DTO, esquema Prisma, semillas, migraciones relevantes, pantalla Next.js, cliente API y pruebas. No se conectó a una base de datos: las semillas describen el valor previsto, **no prueban los parámetros productivos ni que las restricciones estén desplegadas**. No se probó la interfaz en navegador. Se ejecutaron 113 pruebas unitarias existentes y escenarios adicionales con dependencias de persistencia en memoria. Los resultados y el programa reproducible figuran en [04-casos-prueba.md](04-casos-prueba.md).

Las conclusiones aplican a trabajadores particulares dependientes bajo el régimen ordinario, salvo indicación expresa. No certifican empleados públicos, salario integral, pensionados, aprendices, cotizantes parciales o regímenes especiales. El modelo no contiene una clasificación suficiente para todos ellos.

Convención: **S** = `backend/src/payroll/payroll.service.ts`; **P** = `backend/prisma/schema.prisma`; **UI** = `frontend/app/(app)/nomina/page.tsx`. Los números son líneas de la revisión. Todas las rutas son relativas a la raíz del repositorio.

## Inventario por concepto

| Concepto | Archivos, funciones y líneas | Entradas, fórmula y dependencias | Persistencia / alcance |
|---|---|---|---|
| Empleado y pertenencia | S:406, 643–782; controlador:54–150; DTO employee | businessId del JWT; validación empleado-negocio; bloqueo de borrado con historia | Employee, P:1540; datos identificatorios copiados al snapshot |
| Contrato / salario | S:392, 1404, 1472, 3722; DTO contract | mínimo al alta/edición; salario actual; contrato activo más reciente; edición crítica bloqueada con historia contabilizada | EmployeeContract, P:1571; no serie completa de salarios por fecha dentro del contrato |
| Días y salario causado | S:1326–1368, 2275–2294, 3751–3760; DTO calculate:22 | intersección contrato/período 30/360; mensual máximo 30, quincena automática 15; override workedDays; S×d/30 | PayrollRun.workedDays/salaryEarned; override solo valida máximo mensual, H09 |
| Transporte / conectividad | S:2250, 3761–3777, 5718–5730 | salario contractual ≤2 mínimos; auxilio proporcional; isRemote selecciona uno de los dos; ajuste del peso impar del auxilio en Q2 | PayrollRun y conceptos; no controla desplazamiento/modalidad remota jurídica ni comisiones en umbral, H11 |
| Horas y recargos | S:1876–2064, 2474–2608; DTO payroll-event | eventos OVERTIME APPROVED/APPLIED; tarifa y divisor por fecha; monto = salario/divisor × cantidad × payableMultiplier; amountOverride prevalece | PayrollEvent, P:1736; PayrollAdjustment; snapshot de evento, versión y tarifa; solo horas fechadas, no marcación de turnos |
| Comisiones | S:3778, 3806, 3858, 3863 | DTO commissions suma a devengo, IBC y bases de prestaciones/vacaciones | PayrollRun.commissions y PayrollConceptResult; eventos COMMISSION no se consumen |
| Bono no salarial | S:3779, 3800–3808 | suma al bruto, exclusión total del IBC y prestaciones | PayrollRun.nonSalaryBonus; falta límite del 40%, H02 |
| Salud / pensión empleado | S:3806–3808 | IBC = salario causado + comisiones + horas; 4% + 4% | PayrollRun y conceptos EMPLOYEE_DEDUCTION; falta tope de 25 mínimos y perfiles especiales |
| Solidaridad | S:2302–2470 | tabla por rango; mensual sobre IBC; Q1 provisional, Q2 suma IBC persistido Q1 y resta retención previa | solidaridad y diagnóstico en usedParameters; tabla PayrollSolidarityBracket, P:1522; exceso Q1 no se devuelve, H15 |
| Aportes patronales / ARL | S:3830–3849 | salud 8,5% o cero; pensión 12%; ARL según clase (fallback cero) | PayrollRun; clases P:1474; catálogo actividad P:1489; semillas arl_risk_classes.csv |
| Exoneración / parafiscales | S:2826–2866, 3850–3856 | salud depende de banderas y salario contractual <10 mínimos; SENA 2% e ICBF 3% se anulan solo por salario; CCF 4% del mismo IBC | parámetros de negocio y contrato, snapshot; campos naturaleza/declarante/conteo existen pero no intervienen en predicado, H01 |
| Provisión cesantías y prima | S:2810–2823, 3858–3875 | base causada con auxilio y variables ×0,0833 de semilla | PayrollRun, conceptos BENEFIT_PROVISION, contabilidad; distinta del pago efectivo |
| Provisión intereses | S:3868–3872 | provisión cesantías ×0,12; no aumenta neto del trabajador | PayrollRun.severanceInterest; no modela acuerdo de mensualización de intereses |
| Provisión vacaciones | S:3863, 3876 | (salario causado + comisiones) ×0,0417; excluye todo lo agrupado como overtime | PayrollRun.vacation; excluye también recargo nocturno ordinario, H12 |
| Retención laboral | S:3191, 3821; P:1797–1831 | siempre cero; applyIncomeTax y estructuras de configuración no producen depuración ni tabla | campos PayrollRun/WithholdingTaxResult no equivalen a motor implementado; H03 |
| Liquidación de contrato | S:5532, 5649–6174, 6175–6405, 6437–6574 | corte al año elegido; base salarial actual + auxilio + salaryConceptsAmount manual; cesantías B×d/360, intereses C×12%×d/360, prima por semestre, vacaciones V×d/720 | PayrollContractSettlement y líneas P:1832,1984; REAL_TERMINATION inactiva contrato y contabiliza; solo prima pagada se descuenta |
| Pagos de prestaciones | S:5055–5513; DTO payroll-payment | importe suministrado; identificación por contrato/tipo/año/semestre; regularización de prima con provisión insuficiente | PayrollBenefitPayment, movimientos PAYROLL_BENEFIT_PAYMENT/INITIAL_BALANCE; reversión indebida PAID→PENDING, H07 |
| Mensual / quincenal | S:1580, 2229, 3400, 3480, 4326, 4631 | períodos separados por ciclo/cuota; julio 2026 en adelante; mensual overview puede componer Q1/Q2 | PayrollPeriod unique negocio/año/mes/ciclo/cuota; no exclusión DB entre mensual y quincenal del mismo empleado |
| Ajustes manuales | S:1789–1855, 4065–4108 | alta/baja de PayrollAdjustment; no son por sí solos oráculo del total; recálculo borra ajustes y reconstruye con DTO/eventos | PayrollAdjustment; revisar ausencia de aplicación automática y pérdida de variables H10 |
| Contabilización / costo | S:2688–2810, 2869–3078, 1688–1786 | costo = bruto + aportes empleador + parafiscales + provisiones; asiento por concepto; ajuste contable de hasta $1 | AccountingMovement, mappings P:2008; snapshots; causar no significa pagar |
| Pago de nómina | S:1017–1229, 3609, 4492–4624, 4841–5040 | pago SALARY_PAYMENT pendiente; lote con clave idempotente/hash; compare-and-set del estado; ruta directa permite paidAt | PayrollPayment/Batch P:1876/1911; pago previo no se actualiza al recalcular; ruta directa sin contabilización H05/H20 |
| Configuración legal | S:291–389, 430–593, 2108–2226, 2611 | intervalos [effectiveFrom, effectiveTo); tasas por globalParameterId; negocio por año | PayrollGlobalParameter P:1320; avisos de cambios; actualización muta versión existente H17 |
| Novedades no horarias | P:1252; S:1920,2532 | enums ingreso/retiro, incapacidad, licencias, vacaciones, comisión/bono; consulta de cálculo filtra únicamente OVERTIME | Se pueden registrar sin efecto monetario; H08 |
| Frontend | UI:2008–2028,3997–4011,4352–4362; api.ts:324–339 | coexisten payload legacy overtimeHours y alta createEvent fechada; valores monetarios se convierten a Number para visualización | backend rechaza legacy; muestra costo desde backend; edición de contrato fuerza MONTHLY en UI:2082 |
| Interfaz conversacional | frontend/src/components/payroll/PayrollChatActionBar.tsx; backend/src/payroll/payroll.module.ts | acceso/acciones del módulo, no motor legal separado encontrado | No sustituye validaciones del servicio |

## Parámetros y esquema

Semilla `backend/prisma/seed-data/payroll_global_parameters.csv:2–4`:

| Versión | Intervalo | SMMLV / auxilio / UVT | Jornada / divisor | Descanso obligatorio |
|---|---|---|---|---|
| V1 | 01-01 a 30-06-2026 | 1.750.905 / 249.095 / 52.374 | 44 / 220 | 80% |
| V2 | 01-07 a 14-07-2026 | mismos | 44 / 220 | 90% |
| V3 | desde 15-07-2026, sin fin | mismos | 42 / 210 | 90% |

El intervalo V3 abierto no permite asumir parámetros válidos para 2027. `findActiveGlobalParameter` no exige coincidencia de año. Falta acreditar valores/versiones productivos e historia previa.

Prisma usa Decimal(20,6) en importes, Decimal(10,6) en tasas y JSON para snapshots. `money` redondea a pesos HALF_UP antes de persistir. Hay conversiones a Number en sumas de pagos de prima (S:5134), DTO numéricos y UI. No se detectó un liquidador/exportador PILA completo.

Restricciones revisadas: unicidad de período; run por período/empleado; pago por run/tipo; prima por contrato/tipo/año/semestre; lote por negocio/idempotencyKey. La unicidad con año/semestre NULL no evita todos los duplicados en PostgreSQL. Las FK independientes de negocio y entidades no comprueban por sí mismas pertenencia conjunta.

Migraciones relevantes:

- `20260725130000_payroll_legal_effective_dates_2026/migration.sql:183`: exclusión GiST de vigencias activas solapadas.
- `20260727120000_payroll_payment_batch_v2/migration.sql`: unicidad de pago y lotes.
- `20260728130000_add_accounting_movement_role_idempotency/migration.sql:17`: índice parcial de rol contable por negocio/origen. No cubre movimientos sin accountingRole.
- Semillas `solidaridad.csv`, `arl_risk_classes.csv`, `payroll_accounting_mapping.csv`; importación en `backend/prisma/seed.ts`. Se leyeron, no se ejecutaron.

## Controles técnicos: qué está probado

- El controlador obtiene businessId del usuario autenticado; consultas principales verifican pertenencia. No se demostró acceso cruzado en producción. Las referencias opcionales de pagos de prestaciones requieren prueba adversarial (H13).
- CLOSED bloquea cambios de estado; POSTED bloquea recálculo directo. Sin embargo, POSTED→OPEN es aceptado por el endpoint genérico (H06).
- Snapshots guardan contrato, empleado, parámetros y horas. No reconstruyen historia salarial ausente ni hacen inmutables los parámetros.
- Los lotes tienen controles sólidos de reintento y estado. No prueban idempotencia de todas las rutas ni bajo concurrencia real.
- 113/113 unitarias pasan; varias expectativas legitiman reglas incorrectas. Las pruebas e2e importan AppModule y escriben datos: no ejecutadas. No hay certificación de integración PostgreSQL ni de despliegue.

