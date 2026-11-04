# Etapa 2: registro local y presentación de contraseñas

## Diagnóstico y configuración local

El servicio con la configuración original devuelve 503 `AUTH_PASSWORD_POLICY_DISABLED` antes de consultar usuarios. Faltaban ambos flags de activación, no las migraciones. Se verificó mediante lectura la base `127.0.0.1:5432/GestionMVP`, esquema `public`: las migraciones `20261029120000_auth_rate_limit`, `20261103000000_password_reset` y `20261104000000_push_device_authorization` estaban aplicadas, con sus estructuras presentes.

Se configuraron únicamente estas claves en el `.env` local ignorado por Git:

```dotenv
AUTH_PASSWORD_POLICY_V2_ENABLED=true
AUTH_RATE_LIMIT_ENABLED=true
AUTH_CLIENT_IP_MODE=direct
```

Esta configuración corresponde al acceso directo actual al backend. No trasladarla sin revisión a un entorno con proxy. Se comprobó que `trust proxy=false`, que la IP se obtiene del socket y que `X-Forwarded-For` no la suplanta. El servicio supera ahora el bloqueo de activación en una prueba sin acceso a usuarios reales. El backend compilado arrancó, registró el limitador habilitado y respondió HTTP 200 en `/`; se detuvo después de la comprobación.

## Presentación y sesión

Registro y reset comparten ayuda, validación de presentación y errores accesibles. La ayuda muestra el mínimo de 15 caracteres y permite espacios, símbolos y Unicode. El máximo de 1024 puntos de código se muestra solo al excederlo; se conserva la comprobación de 4096 bytes UTF-8. No se normalizan ni recortan contraseñas. El login y la política del backend permanecen intactos.

Las regresiones del cliente API y de componentes confirman que un 503 público conserva la sesión y los campos, y no genera redirección ni aviso de expiración. Se reprodujo un aviso al montar login con `session_expired_notice` previamente guardado; sin esa marca, no aparece. Esto demuestra un recorrido posible, no la causa histórica de la prueba original. No se cambió el manejo global de sesiones ni se ocultaron 401 legítimos.

## Verificación

- 45 pruebas de autenticación backend, 39 pruebas de frontend y 2 pruebas de proxies.
- 18 pruebas de integración en PostgreSQL Docker desechable, eliminado al finalizar: bcrypt histórico, Argon2id nuevo, JWT, concurrencia y reset acotado al usuario afectado.
- Compilación TypeScript backend y build Next.js correctos.
- Las pruebas de componentes cubren 14, 15, 1024 y 1025 puntos de código, Unicode astral, 4096 bytes, espacios, errores asociados al campo, 503 y navegación posterior a login. Las pruebas del cliente cubren 401/429 y conservación de sesión.
- Se aisló la configuración del test de proxies para que no herede los flags del `.env` local.

No se ejecutaron migraciones en GestionMVP ni en producción, ni se modificaron JWT_SECRET, cuentas reales o hashes existentes. Las migraciones de prueba se ejecutaron únicamente en la base desechable.

**Pendiente:** revisión visual en navegador móvil/escritorio y captura de red del caso original. El host de acceso al navegador devolvió `The browser access host is unavailable`; las pruebas de componentes usan JSDOM y no sustituyen esa revisión visual.
