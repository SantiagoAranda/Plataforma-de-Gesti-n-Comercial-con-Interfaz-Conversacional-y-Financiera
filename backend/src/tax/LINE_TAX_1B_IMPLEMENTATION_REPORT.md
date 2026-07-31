# Etapa 1B — Informe de implementación

Fecha de cierre: 2026-07-31

## Resumen ejecutivo

Se adoptó `LINE_ROUNDED_V2` como método fiscal para el primer cálculo
persistido de fuentes nuevas de tipo `ORDER` y `RESERVATION`.
`AGGREGATE_V1` se conserva para contextos ya existentes y no se recalcularon
ventas históricas.

La implementación reutiliza el calculador puro introducido en 1A, persiste
snapshots fiscales neutrales por línea únicamente para V2 y mantiene la
contabilidad, la reversión y Régimen Simple sobre las fuentes persistidas
normalizadas en 1B-0.

No se implementó Factus.

## 1. Método fiscal

- Una fuente sin contexto usa `LINE_ROUNDED_V2` en su primer cálculo
  persistido.
- Una fuente con contexto conserva siempre su `calculationMethod`.
- El preview aislado usa V2 sin persistir contexto.
- El preview asociado a una fuente valida `businessId` y respeta el método
  persistido.
- La unicidad por fuente decide el ganador de cálculos concurrentes. Después
  del `upsert` se vuelve a verificar el método y
  `FISCAL_CALCULATION_METHOD_MISMATCH` impide sobrescribirlo.
- `LINE_ROUNDED_V2` usa `taxEngineVersion = line-rounded-v2`,
  `ROUND_HALF_UP` y escala 2.

## 2. Política de redondeo

El motor oficial V2 usa `Prisma.Decimal` y las utilidades fiscales comunes.

```text
base = round2(cantidad × precio neto - descuento)
impuesto = round2(base × tarifa efectiva)
bruto = round2(base + impuesto)
```

La agregación usa `sumRoundedFiscalAmounts` sobre importes oficiales ya
redondeados. `grossFiscalTotal` se normaliza sumando subtotal, IVA e INC por
esa misma utilidad. No se vuelve a calcular ningún impuesto sobre una base
agregada.

Los adaptadores comerciales exigen descuento y tasa de descuento iguales a
cero. Cualquier descuento comercial no modelado se bloquea con
`COMMERCIAL_DISCOUNTS_NOT_SUPPORTED`.

## 3. Semántica de `Order.total`

`Order.total` continúa siendo la base comercial sin IVA, INC ni retenciones.
El servicio fiscal no lo corrige.

En una confirmación V2 se compara, a dos decimales, con el subtotal oficial
por línea. Una diferencia bloquea la operación con
`ORDER_TOTAL_FISCAL_BASE_MISMATCH`.

En reservas, `unitPriceSnapshot` debe coincidir con el subtotal V2, la
cantidad fiscal es uno y la clave estable es `reservation:{id}`. Una reserva
que no pueda representarse como un único servicio se bloquea con
`RESERVATION_MULTILINE_NOT_SUPPORTED`.

## 4. Snapshots fiscales por línea

Se creó `SaleItemFiscalSnapshot`, relacionado con `SaleFiscalContext`.
Conserva:

- origen y clave estable de línea;
- identidad, código y nombre congelados;
- cantidad, precio neto y descuentos;
- unidad, estándar y concepto;
- tratamiento, tipo, tarifa, base, impuesto y bruto;
- método, versión y política de redondeo.

El modelo aplica XOR entre `orderItemId` y `reservationId`, unicidad por
contexto/clave y restricciones específicas para reservas. Los triggers
protegen los snapshots pertenecientes a contextos `LOCKED`.

Los snapshots pueden regenerarse mientras el contexto sea mutable. No se
generó backfill para históricos V1.

## 5. `SaleTaxLine`

Las líneas V2 se agrupan por:

```text
tipo + tarifa + tratamiento + concepto
```

Se añadieron los tipos informativos `EXEMPT`, `EXCLUDED`, `NOT_TAXED` y
`NONE`. `isInformationalTaxType` centraliza su identificación.

Las líneas informativas:

- conservan la base y tienen impuesto cero;
- no generan movimientos contables;
- no participan en IVA, INC o retenciones;
- sí se exponen en el detalle fiscal;
- se revierten conservando clasificación y con base opuesta.

Los resúmenes suman todas las líneas aplicables; no seleccionan la primera
línea encontrada.

## 6. Tratamientos e impuestos

- `TAXED`: IVA específico o global si el vendedor genera IVA.
- `EXEMPT`: categoría diferenciada, tarifa e impuesto cero.
- `EXCLUDED`: categoría diferenciada, tarifa e impuesto cero.
- `NOT_TAXED`: categoría diferenciada, tarifa e impuesto cero.
- `NONE`: tratamiento potencialmente gravado sin IVA generado por el perfil
  del vendedor.
- `IMPOCONSUMO`: requiere tratamiento compatible, tarifa válida y
  responsabilidad INC confirmada; no se deriva de la responsabilidad IVA.

Los tres casos divergentes de 1A quedan cubiertos como resultados oficiales
V2:

| Caso | Δ IVA V2 vs. V1 | Δ INC V2 vs. V1 | Δ total |
| --- | ---: | ---: | ---: |
| Dos líneas decimales | -0,01 | 0,00 | -0,01 |
| Redondeo clásico | +0,01 | 0,00 | +0,01 |
| Compensación oculta | +0,01 | -0,01 | 0,00 |

El informe 1A permanece intacto y conserva su puerta histórica `DETENER`.

## 7. Retenciones y `netReceived`

Se preservó la semántica V1 de concepto, elegibilidad, umbrales y tarifas.
Para V2 se reemplazaron únicamente las bases por los importes oficiales:

- retefuente sobre la base comercial oficial aplicable;
- reteIVA sobre el IVA oficial ya redondeado;
- reteICA sobre su base oficial;
- autorretención separada.

Cada componente se redondea antes de agregarse. Las retenciones practicadas
por el comprador deben ser menores o iguales que `grossFiscalTotal`; de lo
contrario se produce `RETENTIONS_EXCEED_GROSS_TOTAL`.

La autorretención no reduce `netReceived`.

## 8. Snapshot global

`TaxCalculationSnapshot` incorpora `lineSnapshotIds` para V2 y congela:

- método, versión y redondeo;
- perfiles de vendedor y comprador;
- subtotal, IVA, INC, bruto;
- retenciones individuales y neto recibido;
- fórmulas, concepto y líneas;
- fingerprint de la fuente.

`SaleFiscalContext.grossFiscalTotal` es obligatorio lógicamente para V2 y
permanece nullable para históricos V1.

## 9. Confirmación, contabilidad y reversión

Órdenes y reservas envían identidad estable de sus líneas al cálculo fiscal.
La confirmación reutiliza la transacción Serializable e invariantes
introducidos en 1B-0. Los resultados fiscales, snapshots, inventario y
contabilidad se confirman o revierten como una unidad.

La contabilidad:

- consume el contexto y las líneas persistidas;
- excluye tipos informativos;
- no vuelve a calcular IVA o INC;
- conserva la validación exacta de débitos y créditos a dos decimales.

La reversión total de 1B-0 opera sobre líneas y asientos originales. Para V2
no consulta catálogo, precios ni configuración fiscal actuales. Los
originales y sus snapshots no se eliminan.

## 10. Régimen Simple

No se cambiaron tarifas, períodos ni fórmulas.

- Orden: la base continúa siendo `Order.total`.
- Reserva: la base es el subtotal comercial congelado.
- IVA, INC, retenciones y `netReceived` no forman parte de esa base.
- Las reversiones continúan usando el mecanismo transaccional y los ajustes
  trazables de 1B-0.

## 11. API y frontend

El preview acepta opcionalmente `sourceType` y `sourceId`. Las respuestas
incluyen método, subtotal, IVA, INC, bruto, retenciones, neto y líneas con
tratamiento e indicador informativo.

El frontend:

- pasa identidad de fuente y claves estables de línea;
- usa `grossFiscalTotal` del backend;
- presenta todas las líneas y distingue las informativas;
- deja de reconstruir el total fiscal desde subtotal más impuestos;
- conserva la visualización de históricos V1.

## 12. Compatibilidad histórica

- No se recalcularon contextos `AGGREGATE_V1`.
- No se crearon snapshots fiscales por línea históricos.
- No se cambiaron importes persistidos.
- Una operación que requiera detalle V2 de un histórico debe responder
  `HISTORICAL_ITEM_SNAPSHOT_MISSING`.
- El informe y la migración 1B no contienen backfill de importes ni
  snapshots.

## 13. Migración

Migración creada:

```text
prisma/migrations/20260731180000_adopt_line_rounded_v2/migration.sql
```

Incluye `LineTaxType`, tipos informativos, `SaleItemFiscalSnapshot`,
`grossFiscalTotal`, `lineSnapshotIds`, relaciones, índices, checks y
triggers de inmutabilidad.

La migración fue revisada y el esquema Prisma valida. No se aplicó sobre la
base local ni sobre producción. `prisma migrate status` informa pendientes,
en orden:

```text
20260730190000_add_line_fiscal_foundation
20260731120000_normalize_sale_fiscal_1b0
20260731180000_adopt_line_rounded_v2
```

El despliegue debe ejecutar primero el preflight histórico 1B-0 y aplicar las
tres migraciones en ese orden.

## 14. Archivos modificados

Backend:

- `prisma/schema.prisma`
- `prisma/migrations/20260731180000_adopt_line_rounded_v2/migration.sql`
- `src/tax/dto/tax-preview.dto.ts`
- `src/tax/line-tax-calculator.ts`
- `src/tax/tax.service.ts`
- `src/tax/tax.service.spec.ts`
- `src/tax/tax-line-summary.ts`
- `src/tax/tax-line-summary.spec.ts`
- `src/tax/v2-fiscal-invariants.ts`
- `src/tax/v2-fiscal-invariants.spec.ts`
- `src/tax/tax-v2-persistence.spec.ts`
- `src/sales/sales.service.ts`
- `src/sales/sales.service.spec.ts`
- `src/accounting/accounting.service.ts`

Frontend:

- `src/lib/tax/api.ts`
- `src/types/sales.ts`
- `src/components/sales/TaxPreviewModal.tsx`
- `src/components/sales/SaleTaxPanel.tsx`
- `src/components/sales/SaleReceiptModal.tsx`

## 15. Verificación

| Verificación | Resultado |
| --- | --- |
| Precondición 1B-0 | `LISTO_PARA_IMPLEMENTAR_1B` |
| Informe comparativo 1A | Conserva `DETENER` y las diferencias originales |
| `prisma validate` | Correcto |
| Suite backend completa | 40 suites, 525 pruebas, todas correctas |
| Pruebas focales V2 finales | 4 suites, 43 pruebas, todas correctas |
| Conciliación de persistencia V2 | Correcta |
| Build backend | Correcto |
| TypeScript frontend | Correcto |
| Build frontend | Correcto |
| Migraciones aplicadas | No; pendientes de preflight/despliegue |

La prueba de persistencia V2 concilia explícitamente subtotal, IVA, INC,
bruto y neto entre el resultado por línea, `SaleTaxLine`,
`SaleFiscalContext` y `TaxCalculationSnapshot`. Las suites de ventas y
contabilidad verifican el consumo posterior y el balance exacto.

## 16. Pendientes para Factus

- aplicar y verificar las migraciones en sandbox después del preflight;
- ejecutar smoke tests transaccionales contra PostgreSQL con datos
  representativos;
- construir readiness y mapper exclusivamente desde snapshots bloqueados;
- implementar autenticación, configuración y cliente Factus en una etapa
  separada;
- mantener bloqueados los históricos V1 sin snapshot de línea.

## Puerta 1B

```text
Puerta 1B: LISTO_PARA_IMPLEMENTAR_FACTUS
Motor oficial para fuentes nuevas: LINE_ROUNDED_V2
AGGREGATE_V1 históricos recalculados: NO
Snapshots V2 históricos generados: NO
Factus implementado: NO
Factus iniciado automáticamente: NO
```

