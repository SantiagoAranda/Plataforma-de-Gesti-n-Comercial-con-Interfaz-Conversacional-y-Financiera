# Política de contraseñas nuevas (solicitud del cliente)

> Complementa `AUTH_STAGE2_IMPLEMENTATION.md` y `AUTH_STAGE2_AUDIT_FIXES.md`. Donde esos documentos mencionan Have I Been Pwned, la lista local de contraseñas comunes o el mínimo de 15 caracteres, **este documento prevalece**. No se desplegó, no se hizo merge ni se ejecutaron migraciones productivas.

## Decisión del cliente

El cliente solicitó una política **menos estricta** para facilitar el acceso de personas adultas y mayores. Esto reduce deliberadamente la resistencia de las contraseñas nuevas. **La política ya no comprueba si una contraseña está comprometida**: una contraseña filtrada o muy común (p. ej. `Password123!`) se acepta si cumple los requisitos.

## Política vigente (registro y restablecimiento)
- Mínimo 8 caracteres, al menos una mayúscula (`\p{Lu}`), un número (`\p{Nd}`) y un símbolo (ni letra, número, marca combinante ni espacio). No se exige minúscula.
- Máximo técnico: 1024 puntos de código (equivale a ≤ 4096 bytes UTF-8). El frontend lo muestra solo si se supera.
- Argon2id para contraseñas nuevas (sin cambios). Los espacios y Unicode se conservan sin recortar.
- Frontend (`frontend/src/lib/auth/new-password.ts`) y backend (`backend/src/auth/password-policy.ts`) usan las mismas reglas; hay que mantenerlas en sincronía.

## Eliminado
- Consulta a HIBP, lista local de contraseñas comunes (`common-password-hashes.ts` y su licencia), el error `PASSWORD_CHECK_UNAVAILABLE` y los mensajes de "filtrada/común". `validateNewPassword` ahora es síncrona y no hace llamadas externas.
- El reset sigue comprobando el token antes de validar la contraseña; un rechazo por política no consume el token.

## Sin cambios
Login (sin reglas nuevas), hashes bcrypt existentes (sin rehash), rate limiting, `sessionVersion` y revocación de JWT, revocación push por dispositivo, tokens de recuperación, SMTP, `JWT_SECRET` y módulos comerciales. `AUTH_PASSWORD_POLICY_V2_ENABLED` se mantiene: controla el despliegue escalonado de Argon2id/recuperación, no la verificación de filtraciones.

## Frontend
`PasswordRequirements.tsx` (reutilizado en registro y restablecimiento) lista los cuatro requisitos, que pasan de pendiente a cumplido al escribir (con texto accesible "cumplido/pendiente"). No afirma que la contraseña sea segura. Al enviar con requisitos incumplidos se marcan en rojo sin repetir el mensaje; el máximo técnico solo aparece si se supera. Se mantiene el botón mostrar/ocultar.

## Pruebas
- Backend unitarias: 746 aprobadas; 2 fallidas ajenas (`accounting.service.spec`, `tax/manual-verification.spec`, ya fallaban antes).
- Integración PostgreSQL desechable: 18/18 (reset con Argon2id, login histórico bcrypt, revocación de sesión y push). Una primera corrida falló en el test de expiración (margen de 1 s entre el reloj del host y el del contenedor); la repetición pasó.
- Unitarias de política: 7 caracteres, sin mayúscula/número/símbolo, 8 válidos, contraseñas filtradas aceptadas sin llamada externa, límite de 1024, Unicode y espacios.
- Frontend: 59/59 (incluye coincidencia con el backend), `tsc` y `next build` correctos.

## Riesgos residuales
- Contraseñas como `Password1!` cumplen la política y son fáciles de adivinar; el único freno es el rate limiting. La interfaz lo advierte con un texto neutro.
- Las dos implementaciones (frontend/backend) están duplicadas; el backend es la autoridad.
- Cuentas existentes conservan sus contraseñas actuales (posiblemente débiles o filtradas) hasta que restablezcan.

