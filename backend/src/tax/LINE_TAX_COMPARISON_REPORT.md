# Line Tax Comparison Report

## Resumen

- Casos ejecutados: 25
- Casos comparables: 13
- Casos comparables sin diferencias: 10
- Casos comparables con diferencias: 3
- Casos no representables: 4
- Errores de validación esperados: 8
- Errores inesperados: 0

## Política

- Redondeo: `ROUND_HALF_UP`
- Escala: 2
- Diferencia: candidato - actual
- Motor fiscal oficial modificado: No
- Diagnóstico expuesto en producción: No

## Matriz fiscal

| Caso | Subtotal actual | Subtotal candidato | Δ subtotal | IVA actual | IVA candidato | Δ IVA | INC actual | INC candidato | Δ INC | Δ total | Estado |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Una línea con IVA global | 100.00 | 100.00 | 0.00 | 19.00 | 19.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | COMPARABLE |
| Varias unidades del mismo producto | 370.35 | 370.35 | 0.00 | 70.37 | 70.37 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | COMPARABLE |
| Dos líneas con IVA y decimales | 1496.61 | 1496.61 | 0.00 | 284.36 | 284.35 | -0.01 | 0.00 | 0.00 | 0.00 | -0.01 | COMPARABLE |
| Dos tarifas IVA distintas | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | CURRENT_ENGINE_UNREPRESENTABLE |
| Producto con impoconsumo | 100.00 | 100.00 | 0.00 | 0.00 | 0.00 | 0.00 | 8.00 | 8.00 | 0.00 | 0.00 | COMPARABLE |
| Venta mixta IVA e impoconsumo | 800.70 | 800.70 | 0.00 | 95.05 | 95.05 | 0.00 | 24.04 | 24.04 | 0.00 | 0.00 | COMPARABLE |
| Ítem exento | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | CURRENT_ENGINE_UNREPRESENTABLE |
| Ítem excluido | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | CURRENT_ENGINE_UNREPRESENTABLE |
| Ítem no gravado | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | CURRENT_ENGINE_UNREPRESENTABLE |
| Vendedor no responsable de IVA | 100.00 | 100.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | COMPARABLE |
| Tarifa IVA global cuando vatRate es nulo | 100.00 | 100.00 | 0.00 | 5.00 | 5.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | COMPARABLE |
| Tarifa IVA específica igual a la global | 100.00 | 100.00 | 0.00 | 19.00 | 19.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | COMPARABLE |
| Cantidad decimal | 124.99 | 124.99 | 0.00 | 23.75 | 23.75 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | COMPARABLE |
| Precio unitario con más de dos decimales | 20.01 | 20.01 | 0.00 | 3.80 | 3.80 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | COMPARABLE |
| Diferencia clásica de un centavo | 0.06 | 0.06 | 0.00 | 0.01 | 0.02 | 0.01 | 0.00 | 0.00 | 0.00 | 0.01 | COMPARABLE |
| Proyección desglosada de retenciones | 1000000.00 | 1000000.00 | 0.00 | 190000.00 | 190000.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | COMPARABLE |
| Compensación IVA e INC con total sin diferencia | 0.13 | 0.13 | 0.00 | 0.01 | 0.02 | 0.01 | 0.01 | 0.00 | -0.01 | 0.00 | COMPARABLE |
| Impoconsumo con tratamiento exento | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | EXPECTED_VALIDATION_ERROR |
| Impoconsumo con tarifa IVA configurada | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | EXPECTED_VALIDATION_ERROR |
| Perfil IVA contradictorio | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | EXPECTED_VALIDATION_ERROR |
| TAXED con tarifa IVA explícita cero | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | EXPECTED_VALIDATION_ERROR |
| Cantidad cero | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | EXPECTED_VALIDATION_ERROR |
| Precio negativo | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | EXPECTED_VALIDATION_ERROR |
| Tarifa IVA global fuera de rango | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | EXPECTED_VALIDATION_ERROR |
| Tarifa INC global fuera de rango | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | EXPECTED_VALIDATION_ERROR |

## Matriz de retenciones

Cada celda contiene `actual / candidato / diferencia`.

| Caso comparable | ReteFuente | ReteIVA | ReteICA | Autorretención | Neto recibido |
| --- | ---: | ---: | ---: | ---: | ---: |
| Una línea con IVA global | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 119.00 / 119.00 / 0.00 |
| Varias unidades del mismo producto | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 440.72 / 440.72 / 0.00 |
| Dos líneas con IVA y decimales | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 1780.97 / 1780.96 / -0.01 |
| Producto con impoconsumo | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 108.00 / 108.00 / 0.00 |
| Venta mixta IVA e impoconsumo | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 919.79 / 919.79 / 0.00 |
| Vendedor no responsable de IVA | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 100.00 / 100.00 / 0.00 |
| Tarifa IVA global cuando vatRate es nulo | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 105.00 / 105.00 / 0.00 |
| Tarifa IVA específica igual a la global | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 119.00 / 119.00 / 0.00 |
| Cantidad decimal | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 148.74 / 148.74 / 0.00 |
| Precio unitario con más de dos decimales | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 23.81 / 23.81 / 0.00 |
| Diferencia clásica de un centavo | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 0.07 / 0.08 / 0.01 |
| Proyección desglosada de retenciones | 25000.00 / 25000.00 / 0.00 | 28500.00 / 28500.00 / 0.00 | 9660.00 / 9660.00 / 0.00 | 8000.00 / 8000.00 / 0.00 | 1126840.00 / 1126840.00 / 0.00 |
| Compensación IVA e INC con total sin diferencia | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 0.00 / 0.00 / 0.00 | 0.15 / 0.15 / 0.00 |

## Casos no comparables y validaciones

- **Dos tarifas IVA distintas:** El motor oficial solo aplica una tarifa IVA global.
- **Ítem exento:** El motor oficial no distingue ítems exentos.
- **Ítem excluido:** El motor oficial no distingue ítems excluidos.
- **Ítem no gravado:** El motor oficial no distingue ítems no gravados.
- **Impoconsumo con tratamiento exento:** código validado `IMPOCONSUMO_REQUIRES_TAXED_TREATMENT`.
- **Impoconsumo con tarifa IVA configurada:** código validado `IMPOCONSUMO_FORBIDS_VAT_RATE`.
- **Perfil IVA contradictorio:** código validado `INVALID_SELLER_VAT_PROFILE`.
- **TAXED con tarifa IVA explícita cero:** código validado `TAXED_ZERO_VAT_RATE`.
- **Cantidad cero:** código validado `INVALID_QUANTITY`.
- **Precio negativo:** código validado `INVALID_UNIT_PRICE`.
- **Tarifa IVA global fuera de rango:** código validado `INVALID_GLOBAL_VAT_RATE`.
- **Tarifa INC global fuera de rango:** código validado `INVALID_GLOBAL_IMPOCONSUMO_RATE`.

## Puerta 1A

**Resultado: DETENER**

Motivo: se encontraron diferencias en 3 casos comparables. No se modificó la fuente fiscal oficial y no debe comenzar la Etapa 1B.
