# Cierre técnico: fixes del flujo de servicios

## 1. Resumen general

Se cerró el flujo completo de servicios y reservas entre Mi Negocio, reserva pública, Ventas, Movimientos y Contabilidad. El ajuste consolidó la persistencia de configuración del servicio, la disponibilidad real para reserva y reprogramación, la visualización operativa de reservas dentro de Ventas y su impacto contable final.

## 2. Bugs corregidos

- Se corrigió la persistencia de horarios y duración en servicios, tanto en alta como en edición.
- Se corrigió el `400` en `PATCH /items/:id` al actualizar servicios con duración y agenda.
- Se bloqueó el cambio de tipo en edición para evitar conversiones inconsistentes entre producto y servicio.
- Se corrigió el desplazamiento de fecha de 1 día usando manejo local de `date` y `scheduledAt`, sin depender de conversiones UTC para reserva y reprogramación.
- El calendario público y el de reprogramación en Ventas ahora muestran disponibilidad real.
- Los turnos ocupados o bloqueados ya no se ofrecen como seleccionables.
- Las reservas ingresan en Ventas como `PENDIENTE`.
- La edición de reservas valida fechas y horarios contra disponibilidad vigente antes de guardar.
- Se definió una plantilla de WhatsApp específica para servicio/reserva, incluyendo turno.
- La confirmación/anulación impacta correctamente en Movimientos según el flujo unificado de ventas.
- La confirmación de servicios impacta correctamente en Contabilidad con imputación de ingreso a la subcuenta `417095`.

## 3. Resultado funcional

El flujo operativo final permite crear y editar servicios desde Mi Negocio con duración y ventanas horarias persistidas. La reserva pública consume esa disponibilidad real, crea la reserva en estado pendiente y la expone en Ventas como una venta de servicio.

Desde Ventas, una reserva pendiente puede visualizarse, reprogramarse con fechas y horarios válidos, confirmarse o anularse. Al confirmar, el flujo genera el impacto correspondiente en Movimientos y en Contabilidad; para servicios, el ingreso se registra contra la cuenta `417095`.

## 4. Restricciones respetadas

- No se tocó `schema.prisma`.
- No se crearon `Order` persistidas para reservas; la integración contable se resolvió sin introducir ese acoplamiento.
- Se preservó el flujo de productos existente, incluyendo confirmación e impacto contable sin mezclar productos y servicios.

## 5. Limitación pendiente

Las reservas históricas creadas antes del fix de fecha no se corrigen solas. Si quedaron persistidas con fecha incorrecta, requieren un saneamiento puntual aparte.
