# Plan de correcciones propuesto — sin implementar

Este documento es una propuesta para una etapa posterior. **No autoriza cambios ni contiene una implementación aplicada.** Solo se crearon los seis informes. Hallazgos y prioridades: [05](05-hallazgos-priorizados.md).

## Secuencia y criterios de aceptación

| Etapa | Hallazgos | Trabajo propuesto | Dependencias / responsable sugerido | Criterio de aceptación |
|---|---|---|---|---|
| 0. Cerrar base probatoria | Todos | Exportación controlada de parámetros/historia, estado migraciones, obligaciones/pagos/movimientos; conservar snapshots y hashes; identificar población afectada | Autorización expresa futura; administración de datos y auditoría | Copia aislada, trazable y anonimizada cuando proceda; ninguna reparación ciega de producción |
| 1. Integridad de estados y dinero | H05, H06, H07, H20, H13 | Máquina de estados; pagos consumados inmutables; recálculo sincroniza pendientes; una ruta contable de pago; validación businessId y referencias | Backend/contabilidad/seguridad | TT01 y TT03 rechazados; TT02 concilia; pago directo no omite causación; pruebas A/B y reintentos sin contaminación |
| 2. Entradas reproducibles | H08, H09, H10, H18 | Separar novedades fuente de resultados; persistir variables fechadas; límites por cuota/contrato; consolidar UI de eventos | Backend/frontend/producto | Recalcular no borra comisión/bono/deducción; Q1 no acepta 30d; categorías no soportadas se rechazan o producen efectos explícitos |
| 3. Bases y aportes legales | H01, H02, H11, H12, H15 | Clasificación salarial; exceso 40%; IBC por subsistema; límites; bases parafiscales; elegibilidad exoneración; auxilios; vacaciones; cierre mensual FSP | Asesor laboral/tributario con backend | T02, T03, T04, T05, T09, T21 corregidos con oráculo independiente; devoluciones identificadas; pruebas en umbrales y un peso alrededor |
| 4. Retención laboral | H03 | Definir procedimientos 1/2, datos de depuración, límites por año, acumulación, UVT y trazabilidad | Tributario y backend | Tabla ET383 independiente, casos con/sin retención, pagos quincenales/variables, límites anuales y certificados; no usar tablas de compras |
| 5. Prestaciones y terminación | H04, H14 | Ledger multianual por derecho; promedios; vacaciones disfrutadas vs compensadas; pagos anticipados/fondos; salarios pendientes; causal/indemnización | Laboral/contabilidad/backend | T19 permanece correcto; T20 reconoce saldo 2025; no duplica prestaciones pagadas; dos semestres y cambios salariales conciliados |
| 6. Vigencias y jornada | H16, H17, H22 | Parámetros inmutables, períodos completos, rechazo de futuros no configurados; jornada/horario/descanso y compensatorios; documentación exacta | Laboral/backend | Julio 14/15 correcto; Junio 30/julio 1 correcto; noche antes/después 25 de diciembre de 2025; históricos sin norma retroactiva; override auditado |
| 7. Precisión, contabilidad y PILA | H19, H21, H14 | Política de redondeo por obligación; residuales de cuotas; cuenta de ajustes; consolidación y exportación/integración PILA | Contabilidad/seguridad social/backend | Recibo, obligación, pago y asiento concilian; PILA al techo legal; ningún tope pensional aplicado a parafiscales |
| 8. Validación y despliegue | Todos | Pruebas aisladas, doble cálculo, revisión jurídica, reparación histórica revisable | QA/operaciones/responsable legal | Evidencia de aceptación firmada; plan de reversión; autorización expresa de implementación y de cambios productivos |

No se estima esfuerzo en días sin definir volumen de datos, regímenes soportados y alcance de retención/PILA. Las etapas 1–3 preceden a una confianza operativa amplia; un resultado visual o una suite verde no sustituyen los criterios.

## Decisiones jurídicas y de producto que deben quedar documentadas

1. Régimen de empleadores: persona natural/jurídica, declarante, régimen especial/SIMPLE y requisitos reales de ET114-1; fecha de los hechos y trabajadores computables. No usar un switch libre como prueba.
2. Universo de trabajadores: ordinario, integral, aprendiz, pensionado, parcial, público/especial. Cada perfil fuera de alcance debe rechazarse o informarse expresamente.
3. Auxilio: transporte suministrado/desplazamiento, trabajo en casa, teletrabajo/remoto y umbrales; variables salariales y días efectivos.
4. Descanso obligatorio: día pactado, habitualidad, compensatorio y qué hora ordinaria ya remunera el salario. Resolver SURCHARGE_ONLY con casos concretos antes de alterar factores.
5. Prestaciones: base/promedios por concepto, anticipos cesantías, interés anual versus mensualización escrita, saldo de vacaciones y tratamiento de compensación. No imponer tasa mensual como liquidación de retiro.
6. Retención: procedimiento, residencia y deducciones/exenciones acreditadas, límites y cambio de año; distinguir cálculo fiscal de provisión.
7. PILA: operador, anexos/novedades vigentes, cotizantes, precisión y calendario de pago; no asumir exportación ya existente.
8. Fuentes 2026: cerrar expediente del SMMLV transitorio e incidente pensional con asesor jurídico. El falloC-264 revisado no justifica anticipar tarifas futuras a octubre.
9. Historia: saldos iniciales importados por soporte y contrapartida; salarios anteriores, derechos disfrutados y pagos reales. Los resultados del cliente son referencias para contrastar, no saldos jurídicos acreditados.

## Diseño recomendado para la futura corrección

- Un motor compartido de preview y persistencia que reciba entradas normalizadas, versionadas y fechadas; no mantener dos bloques de fórmulas independientes.
- Conceptos con naturaleza salarial, inclusión por base y reglas de vigencia; bases separadas de salud/pensión/ARL/parafiscales/prestaciones/retención.
- Resultado inmutable una vez contabilizado, correcciones por reversión/ajuste enlazado. Conservar versiones previas y fuente legal de cada parámetro.
- Invariantes: obligación calculada = pagado + pendiente + ajustes identificados; suma de partidas monetarias = total mostrado; contabilidad conciliada por origen; ninguna relación cruza negocios.
- Transacciones y unicidad suficientes para cada operación, incluyendo prestaciones con período nullable; pruebas de concurrencia real, no solo mocks.
- Novedades como hechos persistidos, no parámetros efímeros de un recálculo. Cambio de estado APPLIED no debe borrar trazabilidad del cálculo anterior.

Estas son recomendaciones arquitectónicas, no instrucciones ejecutadas.

## Plan de pruebas posterior

Reutilizar entradas de [04](04-casos-prueba.md) y calcular esperados desde fórmulas externas revisadas. Para cada caso mantener: datos, norma/artículo, fecha, cálculo exacto, redondeo por subsistema, salida del motor, delta y explicación.

Pruebas mínimas adicionales:

- Fronteras 2/4/10/16/17/18/19/20/25SMMLV, antes/igual/después; variables y no salariales 40% exacto y excedido.
- Año/semestre/cuota completos e incompletos, febrero y 31; ingreso/retiro mismo día; períodos sin pago.
- Dos contratos históricos, cambios salariales, vacaciones multianuales, cesantías consignadas, prima parcial/pagada, anticipos e intereses mensualizados con soporte.
- Matriz de exoneración por naturaleza/régimen/número de trabajadores y devengo; ARL cinco clases.
- Escenarios de retención con base depurada independiente y límites; una tabla tributaria comercial no es el esperado.
- Todas las transiciones, reintentos y concurrencia; no pagar dos veces por otra ruta/tipo; relaciones A/B.
- Navegador: crear evento fechado, retirar formularios legacy, mantener ciclo y presentar diferencias/provisiones sin confundirlas con dinero pagado.
- ExportaciónPILA contra operador/validador aislado y comparación posterior con calculadora oficial, si recupera acceso.

Las 113 pruebas existentes deben ajustarse cuando contradigan norma; mantener pruebas de regresión de controles válidos. No “corregir” el oráculo para conservar un error del producto.

## Reparación histórica futura

Primero producir un informe por negocio/empleado/período/concepto con resultado guardado, esperado, delta, fuente y pagos relacionados. Clasificar sobrepago, subpago, obligación patronal, retención y mera provisión. No compensar automáticamente errores de un concepto con otro ni tocar períodos cerrados.

Revisión legal/contable de cada tipo de diferencia; preparar ajustes/reversiones explícitos y conciliación de caja, obligaciones y reportes. Mantener nóminas originales y justificar cada cambio. Una estimación del costo no es una autorización de descuento al trabajador.

## Entregables de esta etapa y condición de cierre

Entregados: inventario, normativa, comparación de fórmulas, casos reproducibles,22 hallazgos priorizados y este plan. Auditoría del código completada con reservas documentadas; integración y certificación productiva **no realizadas**. No hay implementaciones, migraciones ni cambios productivos pendientes autorizados en esta solicitud.

