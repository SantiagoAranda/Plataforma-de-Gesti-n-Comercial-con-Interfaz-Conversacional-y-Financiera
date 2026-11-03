# Hallazgos priorizados

**Dictamen técnico:** el módulo no puede considerarse una liquidación integral normativa confiable sin correcciones. Hay errores demostrados en obligaciones, descuentos y flujos de pago. No se ha demostrado daño económico ocurrido en producción: faltan datos reales y ejecución de integración aislada.

Corte 30-10-2026; commit y alcance en [01](01-inventario-funcional.md); norma en [02](02-matriz-normativa.md); fórmulas en [03](03-comparacion-formulas.md); evidencia ejecutada en [04](04-casos-prueba.md).

**22 hallazgos del sistema: 4 críticos, 10 altos, 7 medios, 1 bajo.** Los errores de referencia del cliente se cuentan separadamente. Severidad expresa riesgo potencial; estado funcional expresa corrección/completitud; evidencia distingue ejecución en memoria, inspección y validación pendiente.

| ID | Severidad | Estado | Hallazgo | Evidencia / validación pendiente |
|---|---|---|---|---|
| H01 | CRÍTICA | INCORRECTO | Exoneración indebida salud/SENA/ICBF | Código + T02/T09/T21; comprobar empleadores afectados en producción |
| H02 | CRÍTICA | INCORRECTO | IBC sin exceso no salarial 40% ni tope 25M | Código + T03/T04; perfiles y mínimos especiales requieren ampliación |
| H03 | CRÍTICA | NO IMPLEMENTADO | Retención laboral siempre 0 | Código + resultados; depuración legal por persona pendiente |
| H04 | CRÍTICA | INCOMPLETO | Terminación usa corte anual sin saldos integrales | T19/T20 + código; pagos/historial productivo pendientes |
| H05 | ALTA | INCORRECTO | Pago pendiente conserva neto anterior al recálculo | TT02 + lectura de lote; integración pendiente |
| H06 | ALTA | INCORRECTO | POSTED puede volver a OPEN/CALCULATED | TT01; CLOSED sí bloqueado; impacto contable end-to-end pendiente |
| H07 | ALTA | INCORRECTO | Prima pagada puede volver a pendiente y cambiar monto | TT03; duplicación real no ejecutada |
| H08 | ALTA | INCOMPLETO | Novedades no horarias aceptadas pero ignoradas | T18 + filtro OVERTIME; reglas por novedad pendientes |
| H09 | ALTA | INCORRECTO | Días manuales no limitados a cuota/contrato | T17; pruebas de calendario ampliadas pendientes |
| H10 | ALTA | INCORRECTO | Recálculo general borra variables salariales/manuales | Flujo inspeccionado; persistencia en BD no ejecutada |
| H11 | ALTA | INCOMPLETO | Auxilios dependen de salario fijo y booleano remoto | T05/T08/T22; régimen remoto y desplazamiento requieren validación |
| H12 | ALTA | INCORRECTO | Vacaciones excluyen recargo ordinario nocturno | Base en código + T14; promedio/compensación requieren revisión |
| H13 | ALTA | INCOMPLETO | Referencias opcionales de prestaciones sin control tenant explícito | Brecha de validación inspeccionada; relación cruzada en BD NO demostrada |
| H14 | MEDIA | INCOMPLETO | Provisiones aproximadas y conciliación insuficiente | T01 + código; no confundir con pago ilícito automático |
| H15 | MEDIA | INCOMPLETO | FSP sobre-retenido Q1 no se devuelve | Código + suite 113; devolución externa no verificada |
| H16 | MEDIA | REQUIERE VALIDACIÓN LEGAL | Horarios/descanso/compensatorios y límites no modelados | Capacidad ausente; cuantía legal depende hechos |
| H17 | MEDIA | INCOMPLETO | Versiones legales mutables y vigencia abierta | Código/migración; parámetros desplegados desconocidos |
| H18 | MEDIA | INCORRECTO | Formularios legacy mandan horas rechazadas | Contrato frontend/backend + T16; navegador no ejecutado |
| H19 | MEDIA | NO IMPLEMENTADO | Liquidación PILA y conciliación específica | Búsqueda/inspección; integración externa no acreditada |
| H20 | ALTA | INCORRECTO | Ruta de creación de pago permite PAID sin controles contables | Código; HTTP/BD no ejecutados |
| H21 | MEDIA | INCOMPLETO | Redondeos dejan diferencias entre conceptos/neto/pagos | T12 + tests de ajuste contable; conciliación productiva pendiente |
| H22 | BAJA | INCOMPLETO | Historia periódica restringida y documentación desactualizada | T13/T15 + documento; no hay cálculo anterior a julio |

## Críticos

### H01 — Exoneraciones

S:2842–2857 recibe conteo pero no lo utiliza, tampoco isIncomeTaxFiler ni legalPersonType. Para salud exige banderas y salario fijo menor a 10 M. S:3851–3856 exonera SENA/ICBF solo por salario fijo, independientemente de banderas. Se replica en preview S:3205–3226.

Persona natural con 1 trabajador y S = $4 millones: se omiten 540.000 de aportes (salud 340.000, SENA 80.000, ICBF 120.000). Con S = $4 millones y C = $15 millones, el devengo 19M supera umbral 17.509.050 y se omiten 2.565.000. ET114-1/N06 exige elegibilidad real y devengo, no etiqueta “Ley 1819”.

**Recomendación:** predicado fechado y comprobable por empleador/trabajador/aporte; regímenes fiscales especiales explícitos; total salarial pertinente en umbral. No cambiar producción en esta etapa.

### H02 — IBC

S:3806 suma únicamente salario causado, comisiones y horas. No hay exceso 40% de NS ni tope 25SMMLV. Se replica S:3174. NS4M sobre salario 4M deja 800.000 fuera de IBC; empleado aporta 64.000 menos a salud/pensión. S50M provoca 498.190 de descuento excedente de salud+pensión bajo régimen ordinario, además de FSP. Véanse N04/N05.

**Recomendación:** bases por subsistema, naturaleza de cada pago, límites/novedades mensuales y conciliación quincenal. No aplicar tope 25M a CCF/SENA/ICBF ni exceso 40% a prestaciones automáticamente. Salario integral, cotizantes parciales y pensionados son perfiles faltantes, no variantes ya certificadas.

### H03 — Retención

S:3821 y 3191 asignan 0 aunque haya obligación tributaria. `applyIncomeTax`, UVT y modelos de retención no ejecutan procedimiento. N11/N12: una base ya depurada 100UVT genera 49.755,30 antes de política de aproximación; no 0.

**Recomendación:** depuración/procedimiento/legalidad por fecha y datos del trabajador. Hasta implementarlo, la futura interfaz debe indicar cálculo incompleto cuando corresponda; no basta una bandera desactivada invisible.

### H04 — Liquidación contractual incompleta

S:5678 limita inicio a 1 de enero; S:5731 acepta variable manual única; S:5742–5749 fija salarios pendientes/pagados 0; S:5794–5796 fija cesantías/intereses/vacaciones pagados 0. Solo resta PRIMA PAID. S:5819 paga únicamente beneficios; S:6322–6404 emplea ese cálculo para REAL_TERMINATION e inactiva contrato.

Caso S = $4 millones, contrato desde 1 de enero de 2025, retiro 30 de octubre de 2026 sin vacaciones disfrutadas: se calculan 1.666.667 de vacaciones en lugar de 3.666.667: diferencia 2M. También puede volver a reconocer derechos ya satisfechos. No calcula indemnización ni promedios automáticos. La liquidación simple de intereses para 180d sí es correcta:60.000 sobre cesantía 1M; **no corregirla por imitar S182 del cliente**.

**Recomendación:** separar corte informativo de finiquito, ledger de derechos/pagos/disfrutes por concepto y período, promedios salariales, salarios pendientes, causal y eventual indemnización. Exigir soportes históricos para cuantificar déficit real.

## Altos

### H05 — Recálculo y pago pendiente desactualizado

S:4054 actualiza run; S:4271 llama ensurePayrollRunPayments; S:1034 retorna si ya existe pago, sin actualizar amount. TT02 cambia neto de 1000 a 2000 y conserva pago 1000. El lote S:4920 toma pagos persistidos sin cotejar neto.

**Impacto:** monto pagado distinto de deuda calculada por cualquier cambio salarial, comisión o deducción. **Corregir:** sincronización transaccional de pagos pendientes sin lote; invariantes neto/saldo/importe; nunca reescribir pagos consumados.

### H06 — Reapertura de contabilizadas

S:1694 bloquea CLOSED; S:1702–1721 controla destinos POSTED/CLOSED, pero no POSTED→OPEN/CALCULATED. DTO permite todos los enums. TT01 devuelve OPEN. Con estado abierto, el recálculo elimina movimientos de causación S:4071. El bloqueo de pagos ya PAID reduce algunos casos, no elimina el defecto.

**Corregir:** máquina de estados explícita y reversión contable autorizada como operación separada. No afirmar que CLOSED se pudo reabrir: esa transición está bloqueada.

### H07 — Prima pagada mutable

S:5101–5115 permite, por mera petición PENDING, actualizar una prima existente PAID, modificar monto y borrar paidAt. Retorna antes de conciliar movimientos. TT03 lo confirma. Las consultas futuras de liquidación solo descuentan PAID, por lo que el derecho podría volver a reconocerse.

**Corregir:** pago consumado inmutable; reversión con contrapartidas y vínculo; no emitir nuevos movimientos por cambio de monto sobre mismo pago. Un índice único no impide mutar estado/monto.

### H08 — Novedades sin efecto

P:1252–1265 admite incapacidad, licencias, vacaciones, ingreso/retiro, comisión y bono. S:1920 las persiste, pero S:2548 solo consume OVERTIME. T18 registra licencia no remunerada 10d y mantiene salario 30d.

**Corregir:** implementar cada novedad con salario/auxilio/IBC/prestaciones propios, o rechazar categorías sin soporte. Distinguir “registrado” de “aplicado”. No aplicar a incapacidades una simple resta de días y 8% genérico.

### H09 — Días fuera del período

S:3752 permite override, S:3753 solo compara máximo mensual 30. DTO acepta entero≥1, no 0. Q1 con 30d se acepta y paga mes enteroT17; también puede superar intersección efectiva del contrato.

**Corregir:** límites derivados de contrato/cuota, cero días justificado y calendario 30/360 documentado. Las horas fechadas también deben validar vigencia contractual, no solo pertenencia al período.

### H10 — Pérdida de comisiones/bonos/deducciones al recalcular

S:4354–4358 recalcula con {}; S:3778–3781 interpreta ausencias como 0, sin recuperar entradas anteriores. S:4065–4069 borra conceptos/ajustes. Por tanto, una comisión manual 100.000 incorporada al cálculo puede perderse en el siguiente cálculo general. El hecho de persistir un resultado no lo convierte en entrada recuperable.

**Corregir:** entradas versionadas independientes del resultado; recálculo puro sobre esas entradas; distinguir “no enviar” de “poner 0”. Reproducción end-to-end en BD pendiente.

### H11 — Auxilios

S:3761 usa S fijo; no total con comisiones. T05 conserva 249.095 aunque devengo salarial 4M supere 2M. No hay elegibilidad de transporte por desplazamiento/días ni diferenciación teletrabajo/trabajo en casa/remoto. Ley 2466 art. 53 usa<2M para teletrabajo, transporte N14 usa≤2M.

**Corregir:** régimen/días/umbral por modalidad; precisar tratamiento de variables con asesor laboral. No copiar exclusión del cliente en exactamente 2M para transporte.

### H12 — Base vacaciones

S:3863=salaryEarned+commissions, excluye agregado O que incluye HORA_ORDINARIA_NOCTURNA. CST192 excluye extras y descanso obligatorio; no excluye ese recargo salarial ordinario. Una hora nocturna al mínimo añade 2.918,18 a base cuando corresponde. La provisión exacta pasa 72.954,375→73.075,966; sistema conserva base y provisión 73.013 truncada.

**Corregir:** clasificar cada concepto, promedio cuando corresponde y tratamiento diferenciado de disfrute/compensación. No inferir que toda hora marcada OVERTIME es extraordinaria.

### H13 — Relaciones multi-tenant de prestaciones

S:5071 valida contrato del negocio. Pero periodId/payrollRunId/settlementId del DTO se asignan directamente S:5109–5111,5300–5302,5324–5326 sin verificar pertenencia, empleado/contrato y coherencia. P:1949 usa FK independientes. Esto permite estructuralmente referencias inconsistentes si existen ids válidos ajenos.

**Impacto:** contaminación de relaciones/historia y potencial exposición por futuros includes. **No se probó exfiltración ni una inserción cruzada real.** **Corregir:** validar todas las referencias en la transacción y endurecer invariantes de BD cuando corresponda; ejecutar pruebas A/B aisladas.

### H20 — Pago directo salta flujo protegido

S:4492–4523 verifica run del negocio y importe positivo, pero `paidAt` crea PAID sin exigir POSTED, sin saldo máximo y sin asiento. El flujo updatePayrollPaymentStatus sí verifica estado y contabiliza. El unique(run, type) limita duplicados del mismo tipo, no garantiza saldo entre SALARY_PAYMENT/ADJUSTMENT ni contabilización.

**Corregir:** unificar transiciones/pago/contabilidad en una operación transaccional; no permitir creación directa PAID sin invariantes. Evidencia estática; no se invocó HTTP.

## Medios

### H14 — Provisiones y pagos efectivos

Semilla usa 0,0833 y 0,0417; interés usa 0,0833×0,12=0,009996. T01:166.600 vs 166.667 en cesantía/prima;73.013 vs 72.954 vacaciones;19.992 vs 20.000 interés proyectado. Costo difiere−83. Las diferencias no prueban por sí solas pago legal insuficiente: liquidación usa 360/720; N10 permite anticipo 8,33%. Falta conciliación general contra pagos/provisiones y acuerdo de mensualización. S:5825–5828 deja reconciliación 0/vacía.

**Corregir:** política de provisión, ajuste de cierre y ledger. No reemplazar provisión mensual por interés proporcional de un mes indiscriminadamente.

### H15 — Solidaridad sin devolución

S:2454–2468 trunca diferencias negativas a 0 y advierte NO_REFUND. Un exceso provisional Q1 persiste como descuento al trabajador. Es transparencia diagnóstica, no resolución.

**Corregir:** devolución/crédito identificado, conciliación mensual y estado definitivo Q1. No se verificó devolución externa.

### H16 — Jornada, noche y descanso

No existe registro de horario que derive 19–06, festivos/día pactado, límites diarios/semanales y compensatorios. Eventos solo reciben código/cantidad; amountOverride puede sustituir monto legal S:2574. Control heredado maxSupplementaryHours 720 no prueba límite legal y no aplica al recorrido de eventos.

**Corregir:** capturar hechos o declarar clasificación manual revisada; validar límites sin negar remuneración por horas efectivamente trabajadas. Validar jurídicamente SURCHARGE_ONLY en descanso según base reconocida. Impacto no cuantificable sin hechos.

### H17 — Versiones modificables

S:480 actualiza registro legal existente, conservando id/versión; aviso registra cambios pero no crea versión nueva. Snapshots protegen resultados almacenados, no repetibilidad de un recálculo histórico. V3 sin fin y findActiveGlobalParameter sin filtro de año puede devolver parámetros 2026 para 2027 si no se cargan otros.

**Corregir:** versiones inmutables, vigencia exhaustiva, rechazo de año no soportado y política de corrección explícita. Verificar índices desplegados.

### H18 — Interfaz inconsistente

UI:2008–2028 y 4001–4010 envía overtimeHours sin fecha; backend S:2526 rechaza. Sí hay otro flujo fechado createEvent en UI:4358; no afirmar ausencia total de interfaz nueva. UI:2082 fuerza MONTHLY al guardar contrato; campos de días con máximo 30 no respetan quincena.

**Corregir:** consolidar formularios con eventos fechados, preservar ciclo y límites; probar E2E navegador. No cambiar fórmulas para aceptar agregado histórico ambiguo.

### H19 — PILA ausente

money en S:794 es redondeo de nómina al peso cercano. PILA (N15) usa aproximación superior del IBC al peso y de la cotización al múltiplo de cien; requiere cotizante, subsistemas, novedades y consolidación mensual y validación del operador. No hay exportación/liquidador completo localizado.

**Corregir:** módulo/integración PILA con conciliación. No es un error afirmar que un recibo de nómina muestra pesos: el defecto es asumir que esos importes constituyen PILA válida.

### H21 — Redondeos y contabilidad

Campos y total se redondean independientemente. T12 netos quincenales suman un peso menos que mensual y salarios un peso más. S:2739–2807 corrige diferencias contables≤1 modificando el crédito NET_PAY u otro movimiento, sin cambiar el neto/pago. Tests:3850 y 3894 lo esperan.

**Corregir:** política de residuales conciliada por cuota/concepto; cuenta de ajuste contable apropiada, no modificar silenciosamente deuda salarial. No atribuir magnitudes grandes sin caso probado.

## Bajo

### H22 — Históricos y documentación

Constante S:85 permite julio 2026; documento `PERIODIC_PAYROLL_LIMITATIONS.md` dice anteriores a agosto deshabilitados y única vigencia, pese al motor por fechas. Mensaje de error también menciona agosto. Junio previo bloqueado T15; julio correcto T13.

**Corregir:** documentación/verificación de períodos soportados; ampliar históricos solo con parámetros legales correctos, no reutilizar V3.

## Controles favorables y límites del dictamen

- Decimal y snapshots son bases técnicas útiles; no garantizan fórmulas correctas.
- Eventos de julio seleccionan divisor por fecha; extras combinadas 2,15/2,65 correctas. Las referencias del cliente no deben reemplazarlas.
- Fórmula proporcional de intereses de liquidación y división de prima por semestre correctas para salario fijo/caso simple.
- Costo parte del bruto, a diferencia del cliente. Causación y pago están separados en flujo principal.
- CLOSED bloqueado, recálculo con PAID bloqueado, lotes con idempotencyKey/hash y actualización condicional; índices protegen varios duplicados.
- No se emitió certificación de cálculo PILA, configuración productiva, ausencia de duplicados, concurrencia, seguridad HTTP completa o exactitud de la calculadora oficial.

