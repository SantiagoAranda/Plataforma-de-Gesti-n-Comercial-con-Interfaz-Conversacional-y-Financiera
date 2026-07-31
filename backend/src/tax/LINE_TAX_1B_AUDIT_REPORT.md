# Auditoría previa a Etapa 1B — Adopción del cálculo fiscal por línea

Fecha de auditoría: 2026-07-30

## Resumen ejecutivo

El motor oficial continúa siendo `TaxService.calculateTaxPreview`, con cálculo agregado y sin redondeo fiscal explícito antes de persistir. La Etapa 1A permanece aislada: el calculador por línea no alimenta órdenes, impuestos persistidos, contabilidad, inventario ni Régimen Simple.

La adopción por línea no puede limitarse a reemplazar la fórmula de IVA/INC. Los importes oficiales se distribuyen entre tres fuentes:

- `Order.total`: base comercial de la venta, sin IVA, INC ni retenciones.
- `OrderFiscalContext`: subtotal fiscal, impuestos cobrados agregados, retenciones agregadas y `netReceived`.
- `SaleTaxLine`: detalle por tipo/dirección consumido directamente por contabilidad y UI.

Los tres casos divergentes de 1A alteran IVA, INC, caja/banco y cuentas de impuestos aun cuando el total comercial permanezca igual. El caso de compensación oculta demuestra que comparar solo el total no es suficiente.

La puerta de auditoría es **`BLOQUEADO_POR_INCONSISTENCIAS`**. Antes de adoptar `LINE_ROUNDED_V2` deben resolverse, como mínimo, estos P0:

1. Versionar el método fiscal y fijarlo de forma estable por venta.
2. Persistir el detalle fiscal inmutable por línea que alimentará simultáneamente contexto, `SaleTaxLine`, contabilidad y futuras facturas.
3. Evitar contextos fiscales obsoletos después de editar ítems pendientes.
4. Adaptar consumidores que toman solamente la primera `SaleTaxLine` de cada tipo.
5. Definir el tratamiento de reservas, que hoy calculan preview pero no congelan contexto ni líneas.
6. Exigir balance contable exacto a dos decimales; hoy se tolera hasta COP 1,00.
7. Definir reversión fiscal y contable; la reversión confirmada actual revierte inventario, pero no asientos ni impuestos.
8. Resolver la incompatibilidad entre la precedencia actual y la candidata para INC cuando el vendedor es persona natural no responsable de IVA.

## Alcance y método

Se inspeccionaron esquema Prisma, servicios de ventas, impuestos, contabilidad, Régimen Simple, tienda pública, contratos y componentes de ventas/movimientos. Se ejecutaron las suites fiscal, ventas, contabilidad y SIMPLE, además de TypeScript backend. No se modificó lógica funcional ni se actualizaron expectativas.

Referencias principales:

- `backend/prisma/schema.prisma:843-958`, `2179-2250`
- `backend/src/tax/tax.service.ts:71-540`, `589-769`
- `backend/src/sales/sales.service.ts:377-516`, `818-880`, `904-1064`, `1203-1480`, `1707-1826`, `1913-2029`, `2094-2229`
- `backend/src/public/public.service.ts:1134-1248`
- `backend/src/accounting/accounting.service.ts:426-462`, `918-1234`, `1885-1908`
- `backend/src/simple-tax/simple-tax.service.ts:815-868`

## Mapa de dependencias

| Componente | Campo usado | Fórmula/comportamiento actual | Impacto 1B | Prioridad |
| --- | --- | --- | --- | --- |
| Creación manual de orden | `Order.total`, `OrderItem.lineTotal` | Suma de `lineTotal`, con conversión `Decimal -> number` | Debe conservarse como base comercial o redefinirse expresamente | P0 |
| Creación en tienda pública | `Order.total` | Suma de `Number(lineTotal)` | Mismo significado que venta manual, con riesgo de precisión intermedia | P1 |
| Edición de líneas | `Order.total` | `_sum.lineTotal` en Prisma | No recalcula siempre el contexto fiscal existente | P0 |
| Preview fiscal | subtotal, IVA, INC, retenciones, neto | Motor agregado oficial | Fuente que debe reemplazarse de manera atómica | P0 |
| Confirmación | snapshot, contexto, líneas | Recalcula y congela si existe contexto de comprador | Sin contexto fiscal confirma y contabiliza solo `Order.total` | P0 |
| `OrderFiscalContext` | subtotal, cobrado, retenido, neto | Totales persistidos a escala 2 | Debe derivar de una única ejecución versionada | P0 |
| `SaleTaxLine` | base, tasa, importe, cuenta | Una línea agregada por tipo en el motor actual | Debe soportar varias tasas/líneas sin perder sumas | P0 |
| `TaxCalculationSnapshot` | JSON de entrada/salida | Snapshot agregado sin versión ni política de redondeo | Requiere versionamiento y detalle por línea | P0 |
| Contabilidad | `netReceived`, `SaleTaxLine`, `Order.total` | Caja por neto; ingresos por total base; impuestos por líneas | Debe consumir exactamente los importes oficiales V2 | P0 |
| Régimen Simple | `fiscalContext.subtotal ?? Order.total` | Acumula base sin impuestos | Sin impacto si subtotal comercial no cambia | P1 |
| API de ventas | contexto y líneas | Convierte `Decimal` a `number`; resumen usa primera línea por tipo | Debe sumar todas las líneas de cada tipo | P0 |
| Panel fiscal | preview/contexto | Recalcula totales visuales con `number` | Riesgo de centavos y contratos inconsistentes | P1 |
| Dashboard de ventas | `sale.total` | Suma `Order.total` | Muestra base comercial, no bruto ni neto | P1 |
| Comprobante local | resumen fiscal | `subtotal + IVA + INC`; descuento fijo 0 | Debe mostrar totales persistidos, no recomputados | P1 |
| Reservas | precio actual del ítem | Preview no persistido; contabilidad sin impuestos | Flujo fiscal distinto al de Order | P0 |
| Cancelación/reversión | estado, inventario | No genera líneas fiscales ni asientos inversos | Inconsistencia histórica y contable | P0 |
| Movimientos/dashboard contable | movimientos contables | Convierte a `number` y redondea a COP entero en vistas | Informativo, puede ocultar diferencias de centavos | P2 |

## 1. Significado real de los importes de `Order`

### Campos existentes

`Order` solo posee `total Decimal(14,2)` y `currency`. No existen columnas `Order.subtotal`, `Order.taxAmount`, `Order.discount` ni `Order.netReceived`. Sus equivalentes fiscales viven en `OrderFiscalContext`.

| Campo solicitado | Ubicación real | Significado real | Incluye impuestos | Incluye retenciones | Fuente |
| --- | --- | --- | ---: | ---: | --- |
| `Order.subtotal` | No existe | N/A | N/A | N/A | N/A |
| `Order.total` | `Order.total` | Suma comercial de líneas después de opciones, antes de impuestos | No | No | `OrderItem.lineTotal` |
| `Order.taxAmount` | No existe | `chargedTaxTotal` en contexto | Sí, IVA + INC | No | preview fiscal |
| `Order.discount` | No existe | No hay descuento de orden/línea en este flujo | No | No | N/A |
| `Order.netReceived` | No existe | `OrderFiscalContext.netReceived` | Sí | Sí, resta retenciones del comprador | preview fiscal |

### Fórmula y escrituras

En `SalesService.resolveOrderLines`:

```text
baseUnitPrice = Item.price o precio manual
optionsTotal = suma de modificadores seleccionados
unitPrice = baseUnitPrice + optionsTotal
lineTotal = unitPrice × quantity
Order.total = suma Number(lineTotal)
```

El precio manual se lleva a dos decimales antes de construir la línea. `OrderItem.unitPrice` tiene escala 2, `lineTotal` escala 2 y `quantity` es entero.

Escrituras localizadas:

- Creación manual: `backend/src/sales/sales.service.ts:818-846`.
- Creación pública: `backend/src/public/public.service.ts:1134-1197`.
- Agregar, editar o eliminar línea: `backend/src/sales/sales.service.ts:1707-1826`, usando `_sum.lineTotal`.
- Reemplazar todas las líneas: `backend/src/sales/sales.service.ts:2094-2161`.

La confirmación no modifica `Order.total`. Si hay contexto fiscal, vuelve a calcular el preview, congela contexto/líneas/snapshot y luego contabiliza; si no lo hay, contabiliza `Order.total` sin impuestos.

### Interpretación

`Order.total` es el **subtotal/base comercial cobrada antes de impuestos**. No incluye:

- IVA;
- impoconsumo;
- retefuente, reteIVA o reteICA;
- autorretención;
- propinas;
- pagos parciales;
- crédito;
- descuentos, porque no hay un descuento modelado.

Por tanto:

```text
total bruto al cliente = fiscalContext.subtotal + chargedTaxTotal
netReceived = total bruto - withheldTaxTotal
```

`Order.total` no coincide con `payment_details.amount` esperado para una futura factura cuando existen impuestos. El candidato natural para pago bruto sería `subtotal + chargedTaxTotal`, no `netReceived`, porque las retenciones no reducen el valor fiscal total del documento aunque sí el efectivo esperado.

### Pendientes, confirmadas, editadas y canceladas

- Pendiente: `Order.total` cambia con las líneas. Si se guardó contexto fiscal y después se editan líneas sin enviar nuevamente `buyerFiscalContext`, el contexto, líneas y snapshot pueden quedar obsoletos.
- Confirmada: `assertOrderEditable` bloquea edición cuando ya existen marcas contables o de inventario. La confirmación es idempotente por esas marcas dentro de una transacción serializable.
- Cancelada pendiente: conserva total, contexto, líneas y snapshot; solo cambia estado.
- Reversión confirmada: genera movimientos inversos de inventario y marca `CANCELLED`, pero no revierte movimientos contables ni crea líneas fiscales inversas.
- Reembolso/devolución parcial: no existe como operación fiscal; solo hay reversión completa de inventario.
- Soft delete: `archived=true`; los datos permanecen.

### Canales

- Venta manual y tienda pública crean `Order` con el mismo significado de `total`.
- La tienda pública tiene idempotencia por `businessId/publicRequestId`, pero también convierte cada `Decimal` a `number` para sumar.
- Una reserva independiente no crea `Order`; presenta como total el precio **actual** de `Item`, no un snapshot fiscal. Al confirmar puede calcular preview, pero deliberadamente no lo congela.
- Un servicio manual programado sí crea `Order` y una reserva espejo; ese flujo usa el significado normal de `Order.total`.

## 2. Motor fiscal agregado oficial

Fuente: `backend/src/tax/tax.service.ts:71-540`.

### Pseudocódigo fiel

```text
uvt = parámetro activo más reciente o 52.374
vatRate = parámetro activo más reciente o 0,19
incRate = parámetro activo más reciente o 0,08

subtotal = 0
vatBase = 0
vat = 0
incBase = 0
inc = 0

para cada cartItem encontrado en DB:
    quantity = Decimal(cartItem.quantity)
    price = Decimal(cartItem.unitPrice ?? Item.price)
    itemSubtotal = price × quantity
    subtotal += itemSubtotal

    si vendedor es persona natural y responsabilidad 49:
        continuar                         // también omite INC

    si Item.appliesImpoconsumo:
        rate = Item.impoconsumoRate ?? globalIncRate ?? 0,08
        incBase += itemSubtotal
        inc += itemSubtotal × rate
        continuar

    si vendedor tiene responsabilidad 48:
        vatBase += itemSubtotal
        vat += itemSubtotal × globalVatRate

concepto = único concepto de ítems o prioridad fija si hay mezcla
retefuente = aplicar reglas sobre subtotal si subtotal >= UVT × mínimo
reteIVA = vat × tasa si comprador Gran Contribuyente y demás condiciones
reteICA = subtotal × tasa si cumple municipio/perfil/umbral
autorretención = subtotal × tasa de retefuente si vendedor código 15

netReceived = max(
    0,
    subtotal + vat + inc - retefuente - reteIVA - reteICA
)
```

### Precisión y redondeo

- El cálculo usa `Prisma.Decimal`.
- No hay `round`, `toDecimalPlaces(2)` ni modo explícito dentro de la fórmula oficial.
- IVA global equivale matemáticamente a sumar bases y multiplicar una vez, porque todas las líneas usan la misma tarifa.
- INC suma `base × tasa` por ítem sin redondear; permite tasas distintas, pero luego las colapsa en una sola línea.
- Las retenciones se calculan sobre valores no redondeados del preview.
- El redondeo ocurre implícitamente al persistir en columnas `Decimal(...,2)`.
- El modo de redondeo de PostgreSQL/Prisma no está registrado en el snapshot.
- Preview y persistencia pueden diferir: la respuesta en memoria puede contener más decimales mientras la base almacena escala 2.
- Ventas transforma precios/cantidades de los snapshots a `number` antes de llamar al servicio fiscal.

`toFixed(4)` se usa solo para identificar tasas INC distintas; no calcula el impuesto.

### Diferencias funcionales con el candidato 1A

El motor oficial ignora los nuevos `Item.taxTreatment` y `Item.vatRate`. Tampoco permite IVA por tarifa específica.

Existe una divergencia adicional no cubierta por los tres casos principales: el motor oficial omite **todos** los impuestos cuando el vendedor es persona natural no responsable de IVA, antes de evaluar INC; el candidato 1A da precedencia a INC independientemente del perfil IVA. Esta regla debe resolverse jurídicamente y probarse antes de 1B.

## 3. `SaleTaxLine`

Estructura (`schema.prisma:2221-2234`):

```text
orderId, taxType, direction, baseAmount, rate,
taxAmount, accountCode, applied, reason, createdAt
```

Se crean en `freezeTaxCalculation`: primero se eliminan todas las líneas de la orden y luego se ejecuta `createMany` con el preview (`tax.service.ts:692-712`). Esto ocurre:

- al crear/actualizar una orden si se suministra contexto fiscal;
- otra vez al confirmar, si existe contexto fiscal enviado o recuperable del snapshot.

Representación actual:

- una línea IVA agregada para toda la venta;
- una línea INC agregada para toda la venta;
- una línea por cada retención;
- líneas no aplicadas con importe cero para varios conceptos;
- autorretención como dirección `SELF`.

Limitaciones:

- Varias tasas IVA no son representables.
- Varias tasas INC acumulan base/importe, pero el campo `rate` se reemplaza por la tasa global cuando se detecta mezcla; la línea deja de describir fielmente su importe.
- No existe relación con `OrderItem`.
- No existe versión ni secuencia determinista.
- No se crean líneas inversas en cancelaciones/devoluciones.

### Consumidores

| Consumidor | Uso | Clasificación |
| --- | --- | --- |
| `AccountingService.postOrderMovements` | Crea débitos de retenciones y créditos IVA/INC usando cada línea aplicada | P0 |
| `SalesService.findAll` | Usa `.find(...)` y toma la primera línea aplicada por tipo | P0 |
| `SalesService.getOne` | Mismo resumen por primera línea | P0 |
| API `taxLines` | Serializa todas las líneas a `number` | P1 |
| `SaleTaxPanel` | Lista líneas y también usa resumen agregado | P1 |
| `TaxPreviewModal` | Lista líneas agrupadas por dirección | P1 |
| `TaxCalculationSnapshot.rawCalculation.allLines` | Copia informativa/auditable | P1 |

Para V2, contabilidad puede consumir múltiples líneas sin cambio conceptual, pero los resúmenes deben sumar por tipo. No debe elegirse una sola línea.

## 4. `TaxCalculationSnapshot`

Estructura:

- `uvtValue`;
- `sellerFiscal` JSON;
- `buyerFiscal` JSON;
- `rawCalculation` JSON;
- `createdAt`.

Snapshot del vendedor:

- nombre comercial;
- NIT y DV;
- dirección y municipio;
- declarante de renta;
- tipo de persona;
- códigos de responsabilidades.

Snapshot del comprador:

- objeto recibido por el flujo de venta, incluidos los campos opcionales agregados en 1A.

`rawCalculation`:

- subtotal;
- IVA;
- INC;
- retefuente;
- reteIVA;
- reteICA;
- autorretención;
- neto;
- todas las líneas;
- concepto y advertencia por mezcla;
- datos resumidos del vendedor;
- tasas ICA/INC y año.

No permite identificar de forma inequívoca:

- método agregado o por línea;
- escala y modo de redondeo;
- versión del motor;
- versión legal/normativa;
- bases y resultados por ítem;
- configuración fiscal completa del ítem al confirmar.

El `upsert` sobrescribe el snapshot en cada congelamiento; no es un historial de versiones. Su `createdAt` tampoco se actualiza, de modo que no indica cuándo se recalculó.

### Estrategia propuesta, no implementada

```ts
calculationMethod: "AGGREGATE_V1" | "LINE_ROUNDED_V2";
roundingMode: "ROUND_HALF_UP";
roundingScale: 2;
engineVersion: string;
legalVersion: string;
calculatedAt: Date;
```

Reglas históricas:

- Snapshot existente sin metadatos: inferir `AGGREGATE_V1`; nunca recalcularlo silenciosamente.
- Venta confirmada sin snapshot: marcar explícitamente `MISSING_LEGACY_SNAPSHOT`; no reconstruir con configuración actual.
- Snapshot parcial: `AGGREGATE_V1_PARTIAL`, bloqueado para reconstrucción electrónica automática.
- Venta pendiente ya calculada antes del despliegue: conservar `AGGREGATE_V1`.
- Venta creada antes del despliegue, sin cálculo fiscal previo: asignar método explícito en una operación de corte; no depender solo de `createdAt`.

## 5. Retenciones

| Retención | Base | Tarifa/regla | Umbral | Redondeo actual | Dependencia 1B |
| --- | --- | --- | --- | --- | --- |
| ReteFuente | subtotal agregado | regla por concepto o defaults 2,5/3,5/4/6/10/11 % | `subtotal.gte(minBaseUvt × uvt)` | Implícito al persistir | Cambia si cambia subtotal/base redondeada |
| ReteIVA | IVA oficial no redondeado | regla o 15 % | IVA `> 0`; sin umbral UVT | Implícito al persistir | Depende directamente de diferencia IVA |
| ReteICA | subtotal agregado | override por mil/1000, tabla municipio+CIIU, municipio o 0,00966 | `subtotal.gte(minBaseUvt × uvt)` | Implícito al persistir | Cambia si cambia subtotal/base redondeada |
| Autorretención | subtotal agregado | actualmente usa tasa de **ReteFuente**, no `autoRetencionRule.rate` | `subtotal.gte(minBaseUvt × uvt)` | Implícito al persistir | Base debe permanecer alineada; revisar tasa |

### ReteFuente

Conceptos y defaults:

- servicios: 15 UVT; 4 % declarante o 6 % no declarante;
- honorarios: 0 UVT; 11 % o 10 %;
- arrendamientos: 27 UVT; 3,5 %;
- bienes/default: 10 UVT; 2,5 % o 3,5 %.

Una venta mixta se reduce a un solo concepto mediante prioridad, no separa bases por concepto. La comparación es inclusiva (`gte`). Una diferencia de COP 0,01 en la base puede activar/desactivar una retención exactamente en el umbral.

Con el modelo actual de `OrderItem` —cantidad entera y precio escala 2— el subtotal productivo normalmente ya está a centavos. Sin embargo, el DTO fiscal acepta `number`, y la futura cantidad decimal o precio con mayor precisión vuelve real el riesgo de umbral.

### ReteIVA

Se calcula sobre `vatTotal` antes de persistir/redondear, no por línea. Un delta de IVA de COP 0,01 produce un delta previo al redondeo de COP 0,0015 con la tasa default. Puede transformarse en COP 0,01 persistido si cruza una frontera de redondeo.

### ReteICA

Usa `fiscalMunicipalityCode`, separado correctamente de `buyerMunicipalityCode`. Busca primero municipio+CIIU, luego municipio y finalmente 9,66 por mil. Un override manual positivo activa ReteICA sin todas las validaciones normales de perfil; este comportamiento debe conservarse o corregirse de forma explícita, no accidental.

### Autorretención

Se persiste como `TaxDirection.SELF`, no reduce `netReceived` y contabilidad solo la registra si existe una regla con `postToAccounting=true`. Genera débito y crédito espejo.

Hallazgo: el importe y el campo `rate` usan `reteFuenteRate`, aunque se haya encontrado `autoRetencionRule`. Esta inconsistencia debe decidirse antes de copiar la lógica a V2.

### Diagnóstico de umbrales

- En los tres fixtures divergentes, el subtotal actual y candidato coincide; ReteFuente, ReteICA y autorretención no cambian ni cruzan umbrales.
- ReteIVA sí recibe una base distinta en los casos 1, 2 y 3.
- Una diferencia futura de subtotal de COP 0,01 puede cambiar cualquier regla con `gte` cuando la base oficial quede exactamente alrededor del umbral.
- Deben agregarse fixtures `threshold - 0,01`, `threshold` y `threshold + 0,01` para cada concepto antes de aprobar 1B.

## 6. `netReceived`

Fórmula exacta:

```text
netReceived = max(
  0,
  subtotal
  + IVA
  + impoconsumo
  - retefuente
  - reteIVA
  - reteICA
)
```

No resta autorretención. No modela descuentos, propinas, pagos parciales, cuotas, crédito o devoluciones.

Semánticamente es el **valor esperado a recibir después de retenciones del comprador**, no evidencia de un pago real. Contabilidad lo usa como débito a caja/banco incluso antes de verificar recaudo; por ello es simultáneamente valor fiscal esperado y contrapartida contable, no un ledger de pagos.

Consumidores:

- débito de caja/banco al confirmar;
- resumen fiscal de ventas;
- panel y modal fiscal;
- comprobante local;
- snapshot y contexto.

No alimenta directamente Régimen Simple. Dashboard general de ventas usa `Order.total`, no `netReceived`.

## 7. Contabilidad

Fuente: `AccountingService.postOrderMovements`.

| Cuenta/concepto | Naturaleza | Fuente actual | Fuente requerida 1B | Diferencia posible |
| --- | --- | --- | --- | --- |
| Caja/Banco | Débito | `fiscalContext.netReceived`, o `Order.total` sin contexto | Neto V2 persistido | IVA/INC/retenciones |
| ReteFuente por cobrar | Débito | `SaleTaxLine`/cuenta default `135515` | Línea V2 exacta | Base/redondeo/umbral |
| ReteIVA por cobrar | Débito | `SaleTaxLine`/`135517` | Línea V2 exacta | Cambio de IVA |
| ReteICA por cobrar | Débito | `SaleTaxLine`/`135518` | Línea V2 exacta | Base/redondeo/umbral |
| Ingreso producto/servicio | Crédito | snapshots de líneas ajustados a `Order.total` | Mismo subtotal comercial oficial | Solo si cambia base |
| IVA generado | Crédito | `SaleTaxLine`, cuenta `2408` | Suma exacta de líneas IVA V2 | ± centavos por línea |
| Impoconsumo | Crédito | `SaleTaxLine`, cuenta `519595` | Suma exacta de líneas INC V2; revisar cuenta | ± centavos por línea |
| Autorretención anticipo | Débito | línea `SELF`, default `135515` | Línea V2, si regla contabiliza | Base/tasa |
| Autorretención pasivo | Crédito | línea `SELF`, default `236575` | Misma fuente V2 | Base/tasa |
| Costo de venta | Débito | movimientos de inventario, redondeo por línea | Sin cambio fiscal | Ninguna por IVA/INC |
| Inventario | Crédito | movimientos de inventario | Sin cambio fiscal | Ninguna por IVA/INC |

No hay recálculo tributario dentro de contabilidad: consume contexto y líneas persistidos. Sí existe una composición propia de ingresos: cada snapshot de línea se redondea a 2 y la última línea se ajusta para que los créditos de ingreso sumen exactamente `Order.total`.

### Balance

La validación calcula débitos y créditos con `Prisma.Decimal`, pero solo falla si la diferencia es **mayor** que COP 1,00. Una diferencia de 0,01 a 1,00 se acepta. Para 1B se requiere igualdad exacta a escala 2.

### Reversión

La reversión confirmada solo ejecuta `reverseInventoryConsumptionForOrder` y cambia estado a `CANCELLED`. Los asientos con origen `ORDER`, el contexto fiscal y `SaleTaxLine` permanecen positivos. No existe devolución fiscal parcial ni asiento inverso automático.

## 8. Régimen Simple

`SimpleTaxService.calculateSalesGrossIncome` incluye órdenes:

- `COMPLETED`;
- no archivadas;
- por `accountingPostedAt`, con fallback a `createdAt`.

Fuente:

```text
fiscalContext.subtotal ?? Order.total
```

`AccountingService.calculateSimpleTaxProjectionGrossIncome` usa la misma fuente.

Clasificación: **`SIN_IMPACTO` condicionado**.

No debe cambiar si V2 conserva como subtotal la base comercial sin IVA/INC y no usa `netReceived`. Se transforma en **`RIESGO_DE_REGRESION`** si:

- el subtotal V2 pasa a sumar bases redondeadas por línea y difiere del subtotal comercial;
- se elimina el fallback para ventas sin contexto;
- se incluyen reservas de otra forma;
- se usa bruto con impuestos o neto después de retenciones.

La diferencia IVA/INC de los tres casos no debe cambiar la base SIMPLE. Deben mantenerse pruebas que demuestren que `fiscalContext.subtotal`, y no `Order.total` con impuestos, es la fuente.

## 9. Frontend y contratos

### Contratos

`frontend/src/lib/tax/api.ts` y `frontend/src/types/sales.ts` representan todos los importes como `number`. `SalesService` convierte cada `Decimal` persistido con `Number(...)`.

### Componentes

| Componente | Fuente | Cálculo local | Riesgo |
| --- | --- | --- | --- |
| `SaleTaxPanel` | `/sales/tax-preview` o resumen persistido | total cobrado = subtotal + IVA + INC; total retenido suma conceptos | `number`, recomposición local |
| `TaxPreviewModal` | `/sales/tax-preview` | mismas sumas | `number`, preview puede tener más decimales |
| `SaleDetailsModal` | venta | bruto = subtotal + IVA + INC | puede divergir de total persistido |
| `SaleReceiptModal` | venta | subtotal + impuestos; descuento fijo 0 | recomposición y semántica ambigua |
| `SalesChatComposer` | carrito + preview | suma precios localmente; usa preview para bruto | cálculo duplicado de subtotal |
| `SaleCard` | venta | muestra `sale.total` | muestra base, no bruto |
| página Venta/dashboard | ventas | suma `sale.total` de cerradas | métrica es base comercial |
| Movimientos | API contable | `Math.round` a COP entero | oculta diferencias de centavos |

La API de resumen fiscal usa `.find` por tipo, por lo que con múltiples líneas IVA/INC mostraría únicamente la primera. `TaxPreviewModal` sí itera todas las líneas, pero también muestra agregados calculados con `number`.

### Cálculo tributario duplicado

`frontend/app/(app)/carrito/page.tsx` contiene `TAX_RATE = 0.16` y calcula subtotal/impuesto/total con `number` y `toFixed(2)`. Aunque parece un carrito separado/demostrativo, es un motor tributario paralelo e incompatible con Colombia/IVA 19 %. Debe aislarse o eliminarse de cualquier flujo real antes de 1B.

No se encontró uso de `Math.round` para calcular el preview fiscal de ventas, pero sí redondeo entero en dashboards de movimientos, que puede esconder la migración de centavos.

## 10. Flujo temporal y corte histórico

| Caso | Comportamiento actual | Regla propuesta |
| --- | --- | --- |
| Creada antes de 1B, confirmada después | Puede tener snapshot V1 o no tenerlo | Si tuvo primer cálculo V1, conservar V1; si no, asignación explícita en corte |
| Pendiente editada después | Puede dejar snapshot viejo si no reenvía contexto | Invalidar/recalcular con el mismo método fijado |
| Confirmada V1 | Datos agregados persistidos | Inmutable; nunca recalcular como V2 |
| Nueva confirmada V2 | No existe aún | Snapshot versionado y detalle por línea |
| Cancelada | Datos positivos permanecen | Mantener método histórico y registrar reversión separada |
| Devuelta | Solo inventario completo | No habilitar V2 sin política fiscal/contable |
| Duplicada/reintentada | Marcas contables/inventario evitan doble post | Mantener método y snapshot en todos los reintentos |
| Pública | `Order` normal | Mismo método por venta |
| Reserva | Sin snapshot fiscal persistido | Bloquear V2 o migrar a un documento de venta persistible |
| Sin contexto fiscal | Contabiliza solo `Order.total` | Definir si es venta no fiscal o snapshot mínimo obligatorio |

### Evaluación de opciones

- A, fecha de creación: no refleja cuándo se fijaron parámetros; una venta antigua sin cálculo podría quedar V1 innecesariamente.
- B, fecha de confirmación: peligrosa; una venta con preview V1 podría confirmarse con V2 y cambiar el importe mostrado.
- C, método al crear: estable, pero órdenes públicas/legacy y flujos sin contexto pueden no calcular impuestos al crear.
- D, método al primer cálculo fiscal: mejor alineación entre preview, edición y confirmación.

### Recomendación

**Opción D**, con un corte explícito complementario:

1. Persistir `calculationMethod` al primer cálculo fiscal.
2. Todo snapshot existente sin versión se interpreta como `AGGREGATE_V1`.
3. Antes de activar V2, clasificar órdenes pendientes existentes sin snapshot; no dejar la decisión a una fecha implícita.
4. Una edición invalida resultados, pero conserva el método asignado.
5. Confirmación debe exigir que el snapshot corresponda al hash/revisión actual de líneas.
6. Reintentos usan el mismo método y revisión.

## 11. Trazabilidad de los tres casos divergentes

Política candidata: base, impuesto y bruto redondeados por línea con `ROUND_HALF_UP`, escala 2. Diferencia = candidato - actual.

Para mostrar el efecto en retenciones se usa un escenario diagnóstico con comprador Gran Contribuyente y ReteIVA 15 %, sin ReteFuente/ReteICA; en un comprador ordinario todas las retenciones de estos fixtures son cero. Autorretención no cambia porque el subtotal no cambia. Los valores V1 de retención y neto respetan el orden real del motor oficial: primero operan sobre importes no redondeados y después cada columna se persiste a escala 2.

### Caso 1 — Dos líneas decimales, diferencia `-0,01`

| Línea | Cantidad | Precio | Base línea | IVA línea V2 |
| --- | ---: | ---: | ---: | ---: |
| 1 | 1 | 749,49 | 749,49 | 142,40 |
| 2 | 1 | 747,12 | 747,12 | 141,95 |

```text
Agregado V1:
subtotal = 1.496,61
IVA = round2(1.496,61 × 0,19) = 284,36
INC = 0,00
bruto = 1.780,97

Por línea V2:
subtotal = 1.496,61
IVA = 142,40 + 141,95 = 284,35
INC = 0,00
bruto = 1.780,96

diferencia IVA = -0,01
diferencia total = -0,01
```

Retenciones diagnósticas:

| Concepto | V1 | V2 | Diferencia |
| --- | ---: | ---: | ---: |
| ReteFuente | 0,00 | 0,00 | 0,00 |
| ReteIVA 15 % persistida | 42,65 | 42,65 | 0,00 |
| ReteICA | 0,00 | 0,00 | 0,00 |
| Autorretención | 0,00 | 0,00 | 0,00 |
| `netReceived` persistido | 1.738,31 | 1.738,31 | 0,00 |

Asiento hipotético:

| Cuenta/concepto | V1 | V2 | Diferencia |
| --- | ---: | ---: | ---: |
| Débito caja/banco | 1.738,31 | 1.738,31 | 0,00 |
| Débito ReteIVA por cobrar | 42,65 | 42,65 | 0,00 |
| Crédito ingreso | 1.496,61 | 1.496,61 | 0,00 |
| Crédito IVA | 284,36 | 284,35 | -0,01 |

El asiento V1 queda desbalanceado por COP 0,01: débitos 1.780,96 frente a créditos 1.780,97. El sistema lo acepta porque solo rechaza diferencias mayores a COP 1,00. El asiento V2 hipotético sí balancea en 1.780,96. Sin ReteIVA, caja cambiaría de 1.780,97 a 1.780,96 y ambos asientos balancearían.

### Caso 2 — Diferencia clásica `+0,01`

| Línea | Cantidad | Precio | Base línea | IVA línea V2 |
| --- | ---: | ---: | ---: | ---: |
| 1 | 1 | 0,03 | 0,03 | 0,01 |
| 2 | 1 | 0,03 | 0,03 | 0,01 |

```text
V1: subtotal 0,06; IVA 0,01; bruto 0,07
V2: subtotal 0,06; IVA 0,02; bruto 0,08
Δ IVA +0,01; Δ bruto +0,01
```

ReteIVA 15 % redondea a 0,00 en ambos. `netReceived` pasa de 0,07 a 0,08.

| Cuenta/concepto | V1 | V2 | Diferencia |
| --- | ---: | ---: | ---: |
| Débito caja/banco | 0,07 | 0,08 | +0,01 |
| Crédito ingreso | 0,06 | 0,06 | 0,00 |
| Crédito IVA | 0,01 | 0,02 | +0,01 |

### Caso 3 — Compensación oculta

| Línea | Tipo | Cantidad | Precio | Impuesto V2 |
| --- | --- | ---: | ---: | ---: |
| 1 | IVA 19 % | 1 | 0,03 | 0,01 |
| 2 | IVA 19 % | 1 | 0,03 | 0,01 |
| 3 | INC 8 % | 1 | 0,01 | 0,00 |
| 4 | INC 8 % | 1 | 0,06 | 0,00 |

```text
V1: subtotal 0,13; IVA 0,01; INC 0,01; bruto 0,15
V2: subtotal 0,13; IVA 0,02; INC 0,00; bruto 0,15

IVA: +0,01
INC: -0,01
total: 0,00
```

`netReceived` permanece 0,15 y ReteIVA redondea a 0,00, pero el asiento cambia:

| Cuenta/concepto | V1 | V2 | Diferencia |
| --- | ---: | ---: | ---: |
| Débito caja/banco | 0,15 | 0,15 | 0,00 |
| Crédito ingreso | 0,13 | 0,13 | 0,00 |
| Crédito IVA | 0,01 | 0,02 | +0,01 |
| Crédito INC | 0,01 | 0,00 | -0,01 |

Componentes afectados aunque no cambie el total:

- `SaleTaxLine`;
- pasivo de IVA;
- cuenta de INC;
- base de ReteIVA antes de redondeo;
- reportes por impuesto;
- resumen fiscal que toma la primera línea;
- futuro XML/payload electrónico.

## 12. Riesgos adicionales

### P0

- Snapshot/contexto obsoleto al editar líneas sin reenviar contexto fiscal.
- Fuente fiscal ausente para reservas confirmadas.
- Primera línea por tipo en el resumen de ventas.
- Snapshot sin método, versión ni redondeo.
- Reversión de inventario sin reversión fiscal/contable.
- Tolerancia contable de hasta COP 1,00.
- Diferente precedencia de INC para vendedor natural no responsable.
- Motor V2 necesita snapshot tributario por línea; `OrderItem` actual no captura tratamiento/tasas/códigos.
- `Order.total` no es total fiscal ni monto de pago bruto.

### P1

- Conversiones `Decimal -> number` en ventas y tienda pública.
- Preview no redondeado explícitamente versus persistencia a escala 2.
- Varias tasas INC colapsadas con una tasa descriptiva incorrecta.
- Venta mixta reduce conceptos a una prioridad única para retenciones.
- Autorretención usa tasa de ReteFuente en vez de la regla propia.
- Cuenta default de INC `519595` debe validarse contablemente.
- Frontend recompone bruto y neto con `number`.
- Carrito con tasa fija 16 %.
- Cancelaciones pendientes conservan snapshots que pueden confundirse con documentos vigentes.
- Falta política para ítems gratuitos: el candidato permite precio cero; el oficial los incluye con base/impuesto cero.

### P2

- Dashboards redondean a pesos enteros y ocultan centavos.
- Formateo con `toFixed` en UI; actualmente es presentación, pero no debe convertirse en fuente.
- Reservas muestran precio actual del ítem, no snapshot.
- Pruebas oficiales usan frecuentemente `.toNumber()`; conviene comparar `Decimal`/strings a escala definida en V2.

### Otros controles

- Orden de ítems: V2 debe sumar resultados redondeados; el total no debe depender del orden. El ajuste contable actual sí se aplica a la última línea de ingreso.
- Cantidades decimales: no son representables en `OrderItem.quantity Int`, aunque el calculador/DTO fiscal las acepta.
- Valores negativos: DTO/servicios de venta no permiten una devolución fiscal negativa; no debe simularse con líneas negativas.
- Concurrencia: confirmación usa transacción serializable y marcas de posting, pero el congelamiento fiscal y el claim deben mantener una única revisión de líneas.
- Idempotencia pública existe; venta manual no tiene clave externa de creación.

## 13. Archivos que requeriría Etapa 1B

Lista propuesta; no se modificaron en esta auditoría:

### Backend y datos

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/<nueva_migracion_1b>/migration.sql`
- `backend/src/tax/tax.service.ts`
- `backend/src/tax/line-tax-calculator.ts`
- `backend/src/tax/tax-calculation-comparator.ts`
- `backend/src/tax/dto/tax-preview.dto.ts`
- `backend/src/sales/sales.service.ts`
- `backend/src/sales/dto/create-order.dto.ts`
- `backend/src/sales/dto/update-order.dto.ts`
- `backend/src/accounting/accounting.service.ts`
- `backend/src/simple-tax/simple-tax.service.ts`
- `backend/src/public/public.service.ts`

### Contratos y frontend

- `frontend/src/lib/tax/api.ts`
- `frontend/src/types/sales.ts`
- `frontend/src/services/sales.ts`
- `frontend/app/(app)/venta/page.tsx`
- `frontend/src/components/sales/SaleTaxPanel.tsx`
- `frontend/src/components/sales/TaxPreviewModal.tsx`
- `frontend/src/components/sales/SalesChatComposer.tsx`
- `frontend/src/components/sales/SaleDetailsModal.tsx`
- `frontend/src/components/sales/SaleFiscalSummary.tsx`
- `frontend/src/components/sales/SaleReceiptModal.tsx`
- `frontend/src/components/sales/SaleCard.tsx`
- `frontend/app/(app)/carrito/page.tsx`

### Pruebas

- `backend/src/tax/tax.service.spec.ts`
- `backend/src/tax/line-tax-calculator.spec.ts`
- `backend/src/tax/tax-calculation-comparator.spec.ts`
- `backend/src/tax/line-tax-comparison.fixtures.ts`
- `backend/src/tax/line-tax-comparison.fixtures.spec.ts`
- `backend/src/sales/sales.service.spec.ts`
- `backend/src/sales/sales-price-history.spec.ts`
- `backend/src/accounting/accounting.service.spec.ts`
- `backend/src/simple-tax/simple-tax.service.spec.ts`

Etapa 1B probablemente requerirá nuevos tipos para snapshot/revisión fiscal por línea. No deben crearse hasta aprobar una especificación que resuelva los P0.

## 14. Verificación ejecutada

Comando:

```text
npm test -- --runInBand
  src/tax/tax.service.spec.ts
  src/tax/line-tax-calculator.spec.ts
  src/tax/tax-calculation-comparator.spec.ts
  src/tax/line-tax-comparison.fixtures.spec.ts
  src/sales/sales.service.spec.ts
  src/accounting/accounting.service.spec.ts
  src/simple-tax/simple-tax.service.spec.ts
```

Resultado:

```text
7 suites aprobadas
161 pruebas aprobadas
0 fallos
```

TypeScript backend:

```text
npx tsc -p tsconfig.build.json --noEmit
Resultado: aprobado, 0 errores
```

No se ejecutó migración, no se alteró producción y no se cambiaron expectativas.

## Puerta de auditoría

**Resultado: `BLOQUEADO_POR_INCONSISTENCIAS`**

Motivo:

- Los importes oficiales no tienen todavía una revisión/método persistido.
- El modelo actual no puede reconstruir impuestos históricos por línea.
- Ediciones pendientes pueden dejar contexto fiscal obsoleto.
- Reservas y reversión no mantienen consistencia fiscal/contable.
- Los consumidores actuales no soportan de forma segura múltiples líneas por tipo.
- La validación contable no exige igualdad a centavos.
- Existe una divergencia no resuelta en la precedencia de INC.

Este resultado no invalida el calculador candidato. Indica que debe redactarse y aprobarse una especificación de resolución de P0 antes de autorizar cambios de motor. No se inicia Etapa 1B.

## Confirmación de no modificación

La auditoría no cambió:

- `Order.total`;
- `OrderFiscalContext`;
- `SaleTaxLine`;
- `TaxCalculationSnapshot`;
- `netReceived`;
- asientos contables;
- inventario;
- Régimen Simple;
- contratos públicos;
- motor fiscal oficial;
- infraestructura Factus.

El único artefacto agregado por esta auditoría es este informe.
