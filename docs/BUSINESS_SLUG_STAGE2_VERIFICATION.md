# Verificación final de Etapa 2

## Conclusión

Implementación terminada. Verificación específica de identificadores, transacciones, concurrencia, rollback, backfill y Etapa 1 aprobada. La verificación ampliada fue ejecutada y diagnosticada, pero **no está completamente verde**: permanecen 14 fallos preexistentes de tests de ventas/nómina. No se detectaron regresiones pendientes atribuibles a BusinessSlug. No se declara preparación productiva.

La base principal de desarrollo permanece intacta y sin esta migración. El registro del backend actualizado requerirá aplicar la migración allí en una tarea posterior autorizada. No hubo operaciones sobre Railway.

## Entorno y migración

- PostgreSQL 16 aislado, base `sactec_slug_stage2_test`, puerto publicado solo en `127.0.0.1:55441`.
- El contenedor inicial y su marcador se verificaron antes de continuar. Las escrituras de regresión usaron los esquemas `public`, `auth_stage1_test` y `stage2_regression` de esa base aislada.
- Se ejecutó el SQL real `20261106120000_business_slug_registry/migration.sql` sobre el esquema anterior con seis negocios ficticios. Auditoría previa/posterior: valores exactos conservados y cada principal reservado por el mismo negocio.
- También se ensayó el runner reproducible, que crea otra instancia vacía y vuelve a ejecutar preparación, auditoría, migración SQL y pruebas. Los contenedores de esta tarea quedan detenidos, con datos conservados para inspección.
- Ensayo final aprobado: contenedor `sactec-slug-stage2-64828abd66e544b183de8de20515d323`, ID `d980fa2810ce40e833676ea8f79e2c3f8dca485e6406509aefd6beb5b94a5746`. Snapshot de auditoría en `%TEMP%/slug-stage2-64828abd66e544b183de8de20515d323/before.json`. Los resultados JSON de unitarias, autenticación y regresiones, junto con la comparación baseline, están en `%TEMP%/sactec-slug-stage2/`.
- No se ejecutó reset ni se reutilizó la base principal. No se ejecutó el historial completo de Prisma con `migrate deploy`; la evidencia corresponde al SQL aditivo de esta etapa.

## Comprobaciones

| Comprobación | Resultado |
| --- | --- |
| Prisma validate | Aprobado |
| Prisma generate | Aprobado con salida alternativa local |
| TypeScript backend, `tsconfig.build.json --noEmit` | Aprobado |
| Build backend: compilación con emisión JS a directorio temporal | Aprobado |
| Suites unitarias afectadas: auth, businesses, public, reservations, business-slug | 170 aprobadas, 16 suites |
| Integración PostgreSQL: identificadores y regresión de nombre comercial | 7 aprobadas |
| Integración PostgreSQL: autenticación concurrente y recuperación | 18 aprobadas |
| Frontend: perfil/nombre y sesión | 27 aprobadas |
| Suites ampliadas de ventas, inventario y nómina | 14 aprobadas, 14 fallidas diagnosticadas |
| `git diff --check` | Sin errores |

Total de casos distintos ejecutados en estas comprobaciones: **236 aprobados y 14 fallidos**. Las repeticiones de diagnóstico no se suman.

El backend local existente mantenía cargada `query_engine-windows.dll.node`, impidiendo reemplazarla. Se generó el cliente en `node_modules/.prisma/slug-stage2-final-client` mediante una copia temporal del mismo esquema, y se compiló a una carpeta temporal. No se mataron procesos ajenos ni se reemplazó su DLL. Se validaron los componentes del build; no se afirma que el comando estándar `npm run build` haya terminado mientras persistía ese bloqueo. La copia temporal del esquema fue retirada.

## Fallos ampliados: clasificación y evidencia

Se ejecutaron copias de los tests anteriores de `HEAD` (`6db8afa`), sin descartar el trabajo actual, contra los mismos servicios de ventas/nómina que esta etapa no modifica. La comparación de nombres completos de tests fallidos coincide exactamente con los 14 fallos finales. Las copias temporales se retiraron.

| Suite | Aprobadas / fallidas | Diagnóstico |
| --- | --- | --- |
| `sales-flow.e2e-spec.ts` | 6 / 3 | Dos fixtures de productos SIMPLE cargan insumos/recetas pero no el stock materializado del producto que exige la implementación vigente. Otra aserción espera texto de venta en el primer movimiento, que resulta ser la contrapartida. Reproducidos con los tests anteriores. |
| `payroll-payments.e2e-spec.ts` | 0 / 8 | Usa períodos anteriores a agosto de 2026, rechazados por la regla vigente. Los fallos posteriores son consecuencias de no crearse/calcularse el período esperado. Reproducidos con los tests anteriores. |
| `payroll-advanced-audits.e2e-spec.ts` | 2 / 3 | Escenarios de cálculo usan períodos bloqueados por la misma regla vigente. Reproducidos con los tests anteriores. |
| `ingredient-smart-delete-concurrency.e2e-spec.ts` | 3 / 0 | Aprobada después de completar el entorno y corregir la limpieza del fixture. |
| `purchase-presentations-concurrency.e2e-spec.ts` | 1 / 0 | Aprobada, incluida limpieza adaptada. |
| `ingredient-deactivation-sale-concurrency.e2e-spec.ts` | 2 / 0 | Aprobada, incluida limpieza adaptada. |

No se modificaron reglas de stock, contabilidad ni vigencias de nómina, ni se relajaron aserciones para ocultar estos resultados. Su actualización funcional queda fuera de Etapa 2.

## Correcciones adicionales realizadas al retomar

1. **Entorno de inventario:** se preparó un esquema aislado nuevo con la unidad UNIT, su conversión identidad y el índice funcional de nombres de ingredientes definido por una migración anterior. `db push` no reproduce ese índice SQL. No se modificó dicha regla ni la migración histórica.
2. **Catálogo de nómina:** se completaron las cuentas PUC ficticias del esquema aislado. Un fallo adicional por catálogo ausente desapareció; no era una regresión del registro de slugs.
3. **Limpieza:** `deleteBusinessFixtures` elimina primero las líneas OrderItem de los IDs explícitos para no chocar con la FK restrictiva al borrar sus productos. Reservas y negocio se eliminan en la misma transacción, exclusivamente tras comprobar el marcador de aislamiento.
4. **Cierre:** la suite de borrado de ingredientes cierra AppModule en `finally`, incluso si falla la limpieza.
5. **Runner:** espera el listener TCP definitivo de PostgreSQL. El arranque temporal por socket Unix podía responder a `pg_isready` y apagarse antes de la siguiente consulta. El primer ensayo fallido se detuvo antes de migrar; no se reutilizó esa base.
6. **Script obsoleto:** se conserva su deshabilitación antes de inicializar servicios y se corrigió la codificación del mensaje.

## Archivos de implementación y pruebas

- Modelo y migración: `backend/prisma/schema.prisma`, `backend/prisma/migrations/20261106120000_business_slug_registry/migration.sql`.
- Política y transacciones: `backend/src/common/utils/business-slug.ts`, `backend/src/businesses/businesses.service.ts`, `backend/src/auth/auth.service.ts`.
- Auditoría y reproducción: `backend/scripts/audit-business-slugs.ts`, `backend/scripts/test-business-slugs-local.ps1`.
- Herramienta obsoleta: `backend/test-db-payload.ts`.
- Unitarias: `backend/src/common/utils/business-slug.spec.ts`, `backend/src/businesses/businesses.service.spec.ts`, `backend/src/auth/auth.service.spec.ts`.
- Helpers/nuevas integraciones: `backend/test/business-fixtures.ts`, `backend/test/business-slugs.e2e-spec.ts`.
- Suites adaptadas: `business-name`, `auth-concurrency`, `password-recovery`, `sales-flow`, `payroll-payments`, `payroll-advanced-audits`, `purchase-presentations-concurrency`, `ingredient-deactivation-sale-concurrency` e `ingredient-smart-delete-concurrency`, bajo `backend/test/*.e2e-spec.ts`.
- Documentación: este informe y `docs/BUSINESS_SLUG_STAGE2.md`, que incluye inventario de escritores y procedimiento futuro Railway, no ejecutado.

## Límites pendientes

- La base principal de desarrollo no tiene BusinessSlug; no activar registros con el backend nuevo allí hasta auditarla y aplicar la migración mediante una tarea autorizada.
- Las 14 pruebas preexistentes necesitan trabajo independiente; la plataforma completa no tiene una suite verde.
- No se validó toda la cadena histórica de migraciones, un navegador real ni la configuración de Railway.
- Las reservas son permanentes en los flujos de aplicación; un administrador SQL privilegiado conserva capacidad de modificar datos. No se introducen triggers ni restricciones ajenas al modelo aprobado.
