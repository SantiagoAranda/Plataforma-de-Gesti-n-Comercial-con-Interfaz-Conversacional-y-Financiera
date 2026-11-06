# Etapa 2: identificadores públicos reservados

## Estado y alcance

Implementación del registro central terminada. La migración y las verificaciones se ejecutaron exclusivamente en PostgreSQL aislado. **La base principal de desarrollo no fue migrada**; el backend actualizado necesita esta migración antes de permitir registros en esa base. No se conectó a Railway ni se operaron servicios remotos.

No se modifican identificadores heredados, URLs, `Business.name`, identidad fiscal ni reglas de ventas, inventario o nómina. No se implementan edición de slugs, resolución de históricos, redirecciones ni Etapas 3/4.

## Implementación e inventario de escrituras

| Punto | Comportamiento y compatibilidad |
| --- | --- |
| `BusinessesService.createBusinessInTransaction` | Genera, crea Business y reserva BusinessSlug antes de inicializar los mapeos existentes; todo con el mismo cliente transaccional. |
| `BusinessesService.createBusiness` | Abre y reintenta la transacción completa; no deja una creación sin reserva. |
| `AuthService.createAccount` | Comparte transacción entre negocio, reserva, mapeos y usuario; distingue correo duplicado de colisión de identificador. |
| Administración: activar/desactivar | Solo cambia estado. Conserva todas las reservas. No hay endpoint de borrado físico de Business. |
| Perfil, logos, notificaciones y ajustes fiscales | Las actualizaciones auditadas no escriben `Business.slug`. |
| `prisma/seed.ts` | Consulta negocios existentes; no crea ni elimina Business. Sin cambios funcionales. |
| Fixtures de integración | Creación transaccional mediante `test/business-fixtures.ts`; limpieza solo con marcador de base aislada e IDs explícitos. |
| `test-db-payload.ts` | Deshabilitado antes de abrir AppModule/conexiones. Usaba una firma antigua y borrado físico. No se repararon sus escenarios ajenos a esta etapa. |

No se encontraron otros escritores activos de Business/slug en servicios, scripts o herramientas administrativas versionadas. La clave primaria de BusinessSlug impide duplicar una reserva; la FK `ON DELETE RESTRICT` impide borrar su negocio. La aplicación no ofrece eliminación ni reasignación de reservas. Las excepciones de limpieza están únicamente en pruebas aisladas.

La normalización heredada de `slug.util.ts`, utilizada por las consultas públicas, permanece intacta. `business-slug.ts` implementa la política nueva: minúsculas ASCII, 3–50 caracteres, guiones intermedios, base `negocio` para resultados menores de tres caracteres y variantes base/base-2/base-3. El sufijo entra en el límite de 50. Se consulta el registro completo, incluyendo históricos, inactivos y coincidencias sin distinguir mayúsculas. El validador personalizado rechaza valores inválidos sin corregirlos silenciosamente.

La lista reservada está centralizada en esa utilidad y deriva de segmentos raíz del frontend/controladores, más `api` y el alias `registro`. Los identificadores heredados reservados permanecen válidos. Los conflictos P2002 de slug y P2034 reintentan hasta cinco transacciones; el agotamiento devuelve un error controlado en español.

## Migración y evidencia local

Migración: `backend/prisma/migrations/20261106120000_business_slug_registry/migration.sql`.

- Transacción explícita, bloqueo de escrituras sobre Business durante el backfill, PK, índice por negocio y FK restrictiva.
- Copia literal de `(slug, id)`; sin normalización ni cambios de identificadores.
- La auditoría previa y posterior es de solo lectura: `backend/scripts/audit-business-slugs.ts`. Exige `BUSINESS_SLUG_AUDIT_URL` explícita y no cae a DATABASE_URL. Solo muestra host/puerto/base/esquema, no credenciales.
- Detecta vacíos, formato/longitud inválidos, reservados y colisiones por mayúsculas. `--snapshot` guarda evidencia sin sobrescribirla; `--verify --snapshot <archivo>` verifica propietarios y conservación de los identificadores originales.

Primer destino verificado: contenedor `sactec-slug-stage2`, ID `91c14a54aa3d4c34837a14757c76d0f1f0ceb07eac0654fa200a72e01724daa0`, PostgreSQL 16, `127.0.0.1:55441/sactec_slug_stage2_test`, esquema `public`. Se verificaron identidad, etiqueta, binding exclusivamente local y cero tablas al crear la base.

Se preparó el esquema anterior en esa base vacía y se ejecutó **el SQL real de la migración** con `prisma db execute`. `db push` solo preparó el esquema previo y esquemas adicionales de regresión; no se presenta como evidencia de migración. No se ensayó la cadena completa de migraciones con `migrate deploy`.

Los seis slugs heredados de prueba fueron `tecnogames-1`, `ADMIN`, `MiTienda`, `mitienda`, cadena vacía y `bad slug`. Todos conservaron identificador y propietario tras el backfill.

## Reproducción segura

Con dependencias locales y la imagen `postgres:16` disponibles, desde la raíz:

```powershell
powershell -NoProfile -File backend/scripts/test-business-slugs-local.ps1
```

El runner crea un contenedor nuevo con nombre/etiqueta únicos, falla si el puerto 55441 está ocupado, verifica identidad, binding y base vacía, fija una conexión explícita y restaura las variables del proceso al terminar. No reutiliza ni vacía bases existentes. Ejecuta el SQL real, auditoría, concurrencia, rollback y regresión del nombre comercial. Detiene únicamente su propio contenedor y conserva sus datos. La evidencia queda en el directorio temporal informado.

Los fixtures requieren `SACTEC_TEST_RUN_ID` y una coincidencia en `public.SactecTestEnvironment`; estar en localhost no basta. Las suites que inicializan AppModule comprueban el destino antes de hacerlo. La limpieza elimina primero OrderItem del fixture, luego sus reservas y negocio, en una transacción; no cambia el borrado de producción. Las conexiones de pruebas se cierran incluso ante un fallo de limpieza del escenario de inventario corregido.

Para las regresiones amplias se usó `stage2_regression`, dentro de la misma instancia aislada, con catálogos ficticios y el índice funcional `Ingredient_businessId_normalized_current_name_key` definido por la migración histórica de ingredientes. Ese índice no se representa en schema.prisma y `db push` no lo crea. No se alteró la migración histórica ni se aplicó a la base principal.

## Resultados y diagnóstico

Los resultados finales y sus limitaciones se registran en `BUSINESS_SLUG_STAGE2_VERIFICATION.md`. Las suites de ventas/nómina se compararon con copias de sus tests originales de HEAD; no se reemplazaron los cambios de trabajo ni las reglas de esos módulos para hacerlas pasar.

## Futuro despliegue Railway — documentación, no ejecución

1. Inventariar escritores externos y comandos configurados; verificar respaldo y restauración en destino aislado.
2. Suspender registros, tareas/scripts que creen o borren negocios o escriban slugs, y despliegues automáticos; drenar operaciones y comprobar la pausa en todas las instancias.
3. Auditar la base y revisar el historial de migraciones pendientes. No ejecutar incidentalmente otras migraciones.
4. Aplicar la migración revisada una sola vez mediante `prisma migrate deploy`. No usar reset, db push ni seed general para ese despliegue.
5. Verificar backfill completo, propietarios, ausencia de huérfanos y conservación exacta del snapshot previo.
6. Desplegar el backend compatible, comprobar salud y retirada de instancias antiguas manteniendo los registros suspendidos.
7. Rehabilitar escritores solo después de las comprobaciones y monitorizar errores e invariantes.

Si algo falla, mantener la pausa y el esquema aditivo. No borrar reservas ni reabrir registros con un backend anterior. La configuración real de Railway no fue inspeccionada y la validación local no acredita preparación productiva.
