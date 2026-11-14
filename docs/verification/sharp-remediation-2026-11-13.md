# Remediación acotada de sharp y build backend

13/11/2026. Base auditada: Fase1, `dbed804159bd640d0ae3cd199102830b57272f2f`. Sin commits, despliegues, cambios de base compartida ni emisión Factus.

## Selección previa de versión

Se evaluó `sharp 0.35.5` antes de modificar los manifiestos de la rama. Es la mínima versión que cubre los tres avisos de sharp encontrados en la auditoría:

| Aviso | Componente | Versión sharp corregida |
|---|---|---|
| [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) | libvips: CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591 | 0.35.0 |
| [GHSA-rgj7-g3m4-5g8c](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c) | libheif | 0.35.4 |
| [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) | librsvg, CVE-2026-96889 | 0.35.5 |

Se fija la versión exacta para hacer reproducible esta remediación. El lockfile se generó con npm, sin editarlo manualmente. Solo cambian sharp, sus paquetes nativos/opcionales y dos transitivas requeridas por sus nuevos rangos: semver y @emnapi/runtime. No se ejecutó `npm audit fix` ni se actualizaron Prisma, Nest o Factus.

Compatibilidad revisada en los [changelogs 0.35.0–0.35.5](https://sharp.pixelplumbing.com/changelog/v0.35.0/) y la [documentación de instalación](https://sharp.pixelplumbing.com/install/):

- Requiere Node >=20.9.0: se elimina soporte de Node 18. Validación realizada con Node 24.13.0.
- Linux x64 precompilado requiere glibc >=2.28 y SSE4.2; Alpine requiere musl >=1.2.5. La prueba usa Debian Bookworm glibc, no certifica una imagen de producción desconocida.
- Se mantienen rotate(), resize({fit:'inside', withoutEnlargement:true}) y webp({quality:80}), usadas por ambos servicios SACTEC.
- Cambian límites/propiedades obsoletas y se introduce límite de cinco canales. SACTEC no usa las APIs retiradas en estas rutas; imágenes multicanal inusuales pueden ser rechazadas.
- Cambia la afinación de salida AVIF; SACTEC produce WebP, por lo que no usa ese cambio de salida. No se exige igualdad binaria del WebP: los codecs nativos pueden producir bytes/tamaños distintos.
- Deben instalarse dependencias opcionales para disponer de los binarios. No se reutilizaron binarios Windows en Linux.

## Formatos y comportamiento

Se ejercitan los métodos compilados reales ItemsService.uploadImage y BusinessesService.uploadLogo, con sharp nativo real y mocks exclusivamente de persistencia/almacenamiento. No se usa una copia de la función de conversión ni se sube nada a R2.

| Entrada | Resultado esperado y comprobado |
|---|---|
| JPEG | WebP, dimensiones máximas de producto 1200 y logo 768 |
| PNG y WebP con alpha parcial | WebP conserva transparencia; no se convierte a fondo negro |
| GIF estático | Conversión a WebP |
| AVIF con alpha | Conversión a WebP conservando transparencia |
| SVG con alpha | Conversión a WebP con librsvg actualizado |
| JPEG con orientación EXIF 6 | Rotación aplicada, sin ampliar imágenes pequeñas |
| Bytes inválidos y tamaño declarado >15MB | Rechazo antes de llamar a almacenamiento |
| HEIC con HEVC | Limitación preexistente del binario precompilado, no una regresión del cambio |

El HEIC de ejemplo de [libheif](https://github.com/strukturag/libheif/blob/master/examples/example.heic), descargado solo al directorio temporal, falla tanto con sharp 0.34.5 local como con 0.35.5 Linux: falta el decodificador HEVC. AVIF sí pasa. Aceptar MIME HEIC/HEIF no prueba soporte de todas sus compresiones; no se agregó un decodificador ni se alteró el contrato de errores. Ese soporte requiere una tarea separada si se considera obligatorio.

Las pruebas no certifican animaciones, perfiles de color arbitrarios o todo archivo HEIF existente. El pipeline actual no solicita `animated:true`; esta actualización no añade preservación de animación. Tampoco es una revisión visual del formulario ni una prueba de explotación de CVEs.

## Build limpio y reproducción

Entorno: Docker local, `node:24.13.0-bookworm`, digest `sha256:1de022d8459f896fff2e7b865823699dc7a8d5567507e8b87b14a7442e07f206`. npm 11.6.2, Linux x64. Copia de archivos versionados, sin .env, sin node_modules o dist del host, sin credenciales productivas. DATABASE_URL apunta a loopback inaccesible. No se inicia AppModule ni se ejecutan migraciones.

Comandos principales desde backend:

```sh
npm ci --no-audit --no-fund
npm run build
node --test test/sharp-image-compat.test.cjs
npm test -- --runInBand --json --outputFile=/evidence/backend-tests.json
npm audit --omit=dev --json
```

La suite backend incluye tests de nómina que leen `../frontend/app/(app)/nomina/page.tsx`. El entorno de pruebas debe conservar ese archivo hermano. El primer intento lo omitió y mostró dos ENOENT; se conservan esos logs y se repite con el archivo original intacto. No se corrigieron tests para esconder fallos.

Build estándar completo aprobado: generación Prisma y tsc. Se supera el EPERM de la DLL Windows al no compartir node_modules con procesos locales. La compilación mantiene los warnings preexistentes de configuración Prisma/dependencias obsoletas.

Binarios verificados: sharp 0.35.5, libvips 8.18.7, libheif 1.23.5, librsvg 2.63.2. Las 17 pruebas de imagen incluyen 16 casos funcionales y una comprobación de que el binario cargado coincide con la versión fijada.

El cambio de manifiestos no actualiza procesos ya abiertos ni constituye un despliegue. Los node_modules del workspace Windows no se reemplazaron durante la validación: antes de ejecutar allí las nuevas pruebas, instalar el lockfile en un entorno libre de bloqueos. No considerar corregido un servidor que siga ejecutando el binario antiguo.

## Aclaración de concurrencia

Antecedente aportado por el usuario: el escenario «Reservas contra Ventas manual» falló una vez en cuatro ejecuciones; se esperaba 409 y apareció un error Prisma sin traducir. P2028 fue una hipótesis, no un código capturado. Las posteriores 148 rondas de 6–32 solicitudes, realizadas por Claude Code según ese antecedente, no reprodujeron el error ni mostraron reservas duplicadas, órdenes huérfanas o efectos parciales. No hay traza original preservada.

Contraste con la auditoría: `backend/test/reservations-concurrency.e2e-spec.ts:275` sí corrió y pasó en la suite oficial de 76 casos. Combina tres creaciones por Reservas y tres por Ventas manual, exige un único éxito, ConflictException para cada rechazo, ausencia de solapes, espejo para cada Order y ausencia de consumo. También pasó en la copia diagnóstica de la auditoría. Las 20 rondas adicionales propias fueron de ocho creaciones públicas; no deben sumarse como 20 reproducciones del escenario mixto ni presentarse como 168 rondas idénticas.

El mapper toBookingConflict no contempla P2028 expresamente; sí P2002 de slot, P2034 y ciertos errores de lock. Esa ausencia es verificable, pero no identifica el código del incidente. Los caminos de creación usan el mapper; otras transiciones tienen un manejador distinto. No se modificó ninguno, no se generalizó P2028 a 409 y no se cambiaron timeouts. La evidencia actual sostiene integridad en los escenarios probados, con una incidencia de traducción de error aún no diagnosticada. Si reaparece: capturar ruta, código Prisma/SQLSTATE, duración y transacción antes de decidir una corrección.

## Alcance y decisión

Esta entrega atiende sharp y la reproducibilidad del build. No corrige los cinco fallos de la auditoría, el comportamiento de horarios, el soporte HEIC, otros avisos de dependencias ni el formulario. No equivale a GO de producción: siguen pendientes los demás controles del informe inicial y la confirmación de que el runtime de destino cumple los requisitos nativos.


Resultado de npm audit --omit=dev: sharp ya no aparece; quedan 7 entradas altas y 2 bajas de otras dependencias (antes: 8 altas y 2 bajas). No se declara limpio el conjunto de dependencias.

Evidencia de esta ejecuci?n: `C:/Users/Viko/Documents/SACTEC-sharp-2026-11-13-evidencia/`. Se conservaron build limpio, suite final, resultados JSON, auditor?a de dependencias e intentos intermedios.
