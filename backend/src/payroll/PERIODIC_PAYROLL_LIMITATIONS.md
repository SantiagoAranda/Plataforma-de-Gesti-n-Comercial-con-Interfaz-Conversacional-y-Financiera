# Límite temporal del cálculo periódico

Julio de 2026 contiene dos vigencias legales:

- Del 1 al 14 de julio: jornada máxima de 44 horas y divisor mensual de 220.
- Desde el 15 de julio: jornada máxima de 42 horas y divisor mensual de 210.

El motor periódico actual selecciona una única vigencia usando la fecha de cierre
del período. Por ese motivo, la creación y el cálculo de nuevas nóminas mensuales
o quincenales anteriores a agosto de 2026 permanecen temporalmente deshabilitados.

Esta restricción no modifica ni oculta períodos, runs o snapshots históricos, y
no se aplica a empleados, contratos, liquidaciones contractuales, simulaciones de
liquidación ni datos acumulados.

La futura etapa de nómina por días y eventos fechados dividirá julio y aplicará V2
hasta el 14 y V3 desde el 15. No debe simularse esa división usando solamente la
fecha de cierre.
