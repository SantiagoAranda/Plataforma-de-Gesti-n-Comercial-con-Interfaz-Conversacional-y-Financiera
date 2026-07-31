# Etapa 1B-0 — Informe de implementación

## Resumen ejecutivo

Se implementó la normalización fiscal, contable y de reversión manteniendo
`AGGREGATE_V1` como única política operativa. `LINE_ROUNDED_V2` existe solamente
como valor de dominio futuro y no aparece en ninguna escritura de aplicación.

La implementación:

- generaliza el contexto fiscal para órdenes y reservas;
- separa integridad histórica de estado de cálculo en el contrato de ventas;
- versiona método, motor y redondeo;
- invalida contextos pendientes y protege contextos confirmados;
- normaliza múltiples líneas tributarias;
- agrupa movimientos contables por fuente;
- exige balance exacto para asientos automáticos nuevos;
- implementa reversión total, única y transaccional;
- incorpora ajustes SIMPLE trazables para períodos cerrados;
- registra una responsabilidad de impoconsumo independiente de IVA;
- conserva importes históricos y las fórmulas oficiales V1.

## Migraciones

### `20260730190000_add_line_fiscal_foundation`

Base de Etapa 1A: tratamiento fiscal por ítem y datos opcionales del comprador.

### `20260731120000_normalize_sale_fiscal_1b0`

Incluye:

- enums de fuente, método, redondeo, estado, tipo de asiento y ajuste SIMPLE;
- cambio de `OrderFiscalContext` a `SaleFiscalContext`;
- XOR para orden/reserva;
- preflight de datos huérfanos, grupos contables ambiguos y fechas de bloqueo;
- backfill exclusivamente estructural a `AGGREGATE_V1`;
- `SaleAccountingEntry`, `SaleReversal` y ajustes SIMPLE;
- normalización de `SaleTaxLine` y `TaxCalculationSnapshot`;
- índices únicos parciales de reversión;
- triggers de inmutabilidad y validación estricta de líneas inversas.

La migración no fabrica contextos para ventas confirmadas legacy sin contexto y
no recalcula importes. `calculationLockedAt` se resuelve desde el entry/grupo
contable original y luego desde `Order.accountingPostedAt`; no usa `now()`,
`createdAt` ni `updatedAt`.

La base local reportó ambas migraciones como pendientes. No se ejecutó
`migrate deploy`, de acuerdo con la restricción de no aplicar la migración en
producción. El esquema Prisma fue validado correctamente.

## Versionamiento y ciclo fiscal

Toda escritura nueva fija:

```text
calculationMethod = AGGREGATE_V1
taxEngineVersion = aggregate-v1
roundingMode = DATABASE_DEFAULT
roundingScale = 2
```

El fingerprint usa SHA-256, serialización estable, decimales canónicos, cero
normalizado y colecciones ordenadas canónicamente. Cambios de ítems, cantidades,
precio, comprador, pago, ICA y configuración fiscal marcan contextos pendientes
como `STALE`. Los contextos `LOCKED` quedan fuera de toda invalidación.

La confirmación recalcula un contexto `STALE` dentro de la misma transacción con
V1, persiste contexto/snapshot/líneas y solo lo cambia a `LOCKED` después de
inventario y contabilidad. Un rollback conserva el estado previo.

El contrato público distingue:

```text
fiscalIntegrityStatus:
  COMPLETE
  LEGACY_CONFIRMED_WITHOUT_FISCAL_CONTEXT
  ORPHANED_DATA

fiscalCalculationStatus:
  CURRENT
  STALE
  LOCKED
  null
```

## Reservas

Las reservas comparten `SaleFiscalContext`. Únicamente congelan snapshots
comerciales:

- `itemNameSnapshot`;
- `unitPriceSnapshot`;
- `durationMinutesSnapshot`.

Las reservas pendientes legacy los capturan al primer cálculo/confirmación. No
se creó ningún snapshot fiscal por línea y el calculador candidato de 1A no es
invocado por el flujo de reserva.

## `SaleTaxLine`

La estructura final identifica:

- contexto fiscal;
- tipo, dirección, tratamiento y tarifa;
- base e importe a dos decimales;
- concepto de venta;
- método, redondeo y escala;
- cuenta y condición de aplicación;
- vínculo de reversión.

V1 continúa creando líneas agregadas, no líneas por ítem. Los consumidores de
ventas suman todas las líneas del tipo solicitado. Las líneas inversas conservan
dirección y clasificación, y niegan únicamente base e importe.

Los triggers solo permiten insertar sobre un contexto bloqueado cuando existe
una `SaleReversal` válida y la línea es exactamente opuesta a una línea original
del mismo contexto.

## Redondeo y contabilidad

Se centralizaron:

```text
roundCalculatedFiscalAmount
roundFiscalRate
sumRoundedFiscalAmounts
assertBalancedEntry
```

Las operaciones estructurales nuevas usan `Prisma.Decimal`,
`ROUND_HALF_UP`, escala 2 para importes y escala 6 para tarifas. La sumatoria no
redondea nuevamente cada importe oficial.

`AccountingService` consume `SaleFiscalContext` y `SaleTaxLine` para
`netReceived`, impuestos y retenciones. No recalcula IVA, INC ni retenciones.
Cada publicación crea `SaleAccountingEntry`, vincula sus movimientos y exige:

```text
debitTotal - creditTotal = 0.00
```

Una diferencia de COP 0,01 produce `AUTOMATIC_ENTRY_UNBALANCED`; no se creó una
cuenta de ajuste.

## Reversión

La reversión implementada es total y única. No soporta cantidades parciales ni
múltiples notas crédito.

En una transacción serializable:

1. valida fuente confirmada y ausencia de reversión;
2. valida contexto bloqueado cuando existe;
3. ejecuta el guard electrónico desacoplado;
4. crea `SaleReversal`;
5. revierte inventario;
6. invierte y balancea el asiento original;
7. inserta líneas fiscales exactamente opuestas;
8. crea el ajuste SIMPLE cuando corresponde;
9. vincula toda la auditoría;
10. cambia la fuente a `CANCELLED`.

Las ventas legacy sin contexto no reciben líneas inventadas. Pueden revertirse
solo si el grupo contable original es inequívoco y balanceado. Los errores
estables principales son:

```text
SALE_ALREADY_REVERSED
LEGACY_ACCOUNTING_GROUP_AMBIGUOUS
LEGACY_ENTRY_UNBALANCED
INVALID_FISCAL_REVERSAL_LINE
ELECTRONIC_INVOICE_CREDIT_NOTE_REQUIRED
```

El último error queda preparado mediante un guard sustituible; 1B-0 no consulta
ni implementa ningún proveedor electrónico.

## Responsabilidad de impoconsumo

`BusinessTaxProfile.isImpoconsumoResponsible` es nullable y no tiene backfill:

```text
null  -> SELLER_IMPOCONSUMO_RESPONSIBILITY_UNCONFIRMED
false -> SELLER_NOT_RESPONSIBLE_FOR_IMPOCONSUMO
true  -> continuar con AGGREGATE_V1
```

La UI de RUT permite confirmarla independientemente de IVA. Guardar `false` con
ítems INC activos exige confirmación explícita y no modifica productos ni ventas.

## Régimen Simple

La base continúa siendo el subtotal fiscal/comercial sin IVA ni INC. Las
retenciones y `netReceived` no alteran esa base.

Para una reversión:

- período `DRAFT` o `CALCULATED`: la venta cancelada queda excluida al
  reconstruir el período;
- período `POSTED` o `PAID`: se crea un ajuste negativo `PENDING` para el
  siguiente período elegible.

La reclamación:

- reconstruye desde fuentes y ajustes;
- incluye ajustes `APPLIED` vinculados exactamente una vez;
- recorre destinos cerrados cronológicamente y registra cada salto;
- nunca aplica anticipadamente a otro período mutable;
- usa actualización condicionada y detecta conflictos;
- vincula `APPLIED`, `appliedPeriodId` y `appliedAt` en la misma transacción que
  persiste el período;
- bloquea publicación si quedan ajustes `PENDING` destinados al período.

## Frontend

Los cambios visibles se limitan a:

- suma de múltiples líneas fiscales;
- advertencia de contexto `STALE`;
- indicación de contexto `LOCKED`;
- estados separados de integridad y cálculo;
- selector de responsabilidad INC.

No se muestra ni selecciona `LINE_ROUNDED_V2`, no se incorporó Factus y no se
cambió el diseño general.

## Archivos principales modificados o creados

### Modelo y migraciones

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260731120000_normalize_sale_fiscal_1b0/migration.sql`

### Fiscal

- `backend/src/tax/tax.service.ts`
- `backend/src/tax/tax.module.ts`
- `backend/src/tax/fiscal-rounding.ts`
- `backend/src/tax/fiscal-fingerprint.ts`
- `backend/src/tax/fiscal-lifecycle.service.ts`
- `backend/src/tax/tax-line-summary.ts`
- `backend/src/tax/fiscal-reversal-line.ts`
- `backend/src/tax/impoconsumo-responsibility.ts`

### Ventas, reservas y configuración

- `backend/src/sales/sales.service.ts`
- `backend/src/sales/sales.controller.ts`
- `backend/src/sales/sales.module.ts`
- `backend/src/sales/electronic-sale-reversal.guard.ts`
- `backend/src/reservations/reservations.service.ts`
- `backend/src/items/items.service.ts`
- `backend/src/items/items.module.ts`
- `backend/src/settings/settings.service.ts`
- `backend/src/settings/settings.module.ts`
- `backend/src/settings/dto/upsert-tax-profile.dto.ts`

### Contabilidad y SIMPLE

- `backend/src/accounting/accounting.service.ts`
- `backend/src/accounting/automatic-entry-balance.ts`
- `backend/src/simple-tax/simple-tax.service.ts`

### Frontend

- `frontend/src/types/sales.ts`
- `frontend/src/lib/settings/api.ts`
- `frontend/src/components/sales/SaleTaxPanel.tsx`
- `frontend/src/components/sales/SalesChatComposer.tsx`
- `frontend/app/(app)/configuracion/rut-impuestos/page.tsx`

## Pruebas y verificación

Resultado de la selección fiscal/ventas/contabilidad/inventario/SIMPLE:

```text
Test Suites: 16 passed, 16 total
Tests:       277 passed, 277 total
```

Incluye pruebas nuevas para:

- redondeo y sumatoria;
- fingerprint canónico;
- invalidación sin tocar `LOCKED`;
- múltiples líneas;
- balance exacto y diferencia de COP 0,01;
- línea inversa exacta;
- responsabilidad INC;
- suites existentes de confirmación, inventario, contabilidad y SIMPLE.

Verificaciones:

```text
Prisma validate: PASS
Backend TypeScript/build: PASS
Frontend TypeScript: PASS
Frontend production build: PASS
Prisma migrate status: 1A y 1B-0 pendientes; no desplegadas
```

## Diferencias y límites conservados

- Las tres diferencias de redondeo encontradas en 1A permanecen documentadas.
- No se actualizaron expectativas para convertir V2 en resultado oficial.
- No se recalcularon ventas confirmadas ni importes históricos.
- No se soportan reversiones parciales.
- La ejecución del preflight contra una copia representativa de producción debe
  preceder cualquier `migrate deploy`; los códigos de aborto forman parte de la
  migración.

## Puerta

La estructura necesaria para especificar la adopción posterior está presente y
las verificaciones de código son satisfactorias. Una puerta favorable no inicia
ni autoriza automáticamente 1B.

```text
Puerta 1B-0: LISTO_PARA_IMPLEMENTAR_1B
Motor oficial: AGGREGATE_V1
LINE_ROUNDED_V2 utilizado: NO
Ventas históricas recalculadas: NO
Snapshots fiscales por línea creados: NO
Factus implementado: NO
Etapa 1B iniciada: NO
```
