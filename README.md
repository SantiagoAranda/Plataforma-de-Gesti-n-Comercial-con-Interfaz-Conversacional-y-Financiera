# Plataforma de Gestión Comercial

MVP de una plataforma web, pensada para celular, con la que un pequeño negocio gestiona ventas, inventario, contabilidad y su tienda pública desde un único lugar. La interfaz está inspirada en aplicaciones de mensajería: se registra una operación como se escribe un mensaje, y el sistema se ocupa del resto.

**Demo:** https://plataforma-de-gesti-n-comercial-con.vercel.app

## Qué resuelve

Muchos negocios chicos llevan sus números repartidos entre chats, planillas y memoria. Esta plataforma ordena esa operación sin pedirle al usuario que aprenda un sistema contable.

- **Ventas:** registro de ventas con estados (pendiente, cerrado) y precio histórico inmutable: cambiar el precio del catálogo no altera ventas ya hechas.
- **Contabilidad automática:** cada venta genera su asiento contable (débito y crédito) sin intervención del usuario. Resumen del período con el peso de cada indicador.
- **Catálogo e inventario:** productos y servicios, opciones con recargo, recetas e ingredientes, movimientos de stock.
- **Tienda pública** conectada al catálogo.
- **Agenda y reservas** para servicios, con ventanas y bloques horarios.
- **Impuestos y facturación electrónica:** cálculo de IVA y retenciones, plan de cuentas (PUC) e integración con Factus.
- **Nómina:** empleados, contratos, períodos, novedades y liquidaciones.
- **Notificaciones push.**

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| Backend | NestJS 11, TypeScript, API REST |
| Base de datos | PostgreSQL con Prisma ORM |
| Autenticación | JWT (Passport) |
| Almacenamiento de imágenes | Compatible con S3 (Cloudflare R2) |
| Tests | Jest |
| Despliegue del frontend | Vercel |

## Decisiones de diseño

- **Consistencia contable:** la venta y sus asientos se guardan en una misma transacción de PostgreSQL. Si algo falla, no queda nada a medias.
- **Precio histórico:** cada línea de venta guarda el precio con el que se vendió. Hay pruebas automatizadas que cubren cambios de catálogo, opciones con recargo y reapertura de ventas (`backend/src/sales/sales-price-history.spec.ts`).
- **Arquitectura modular:** un módulo de NestJS por dominio (ventas, contabilidad, inventario, impuestos, nómina, reservas), con DTOs validados con `class-validator`.

## Estructura

```
backend/    API NestJS + esquema Prisma y migraciones
frontend/   Aplicación Next.js (panel, tienda pública, reservas)
```

## Cómo correrlo

Requisitos: Node.js 20+ y una base PostgreSQL.

```bash
# Backend
cd backend
npm install
# Crear .env con DATABASE_URL apuntando a tu PostgreSQL
npx prisma migrate deploy
npx prisma db seed
npm run start:dev

# Frontend (en otra terminal)
cd frontend
npm install
npm run dev
```

Tests del backend: `npm test` dentro de `backend/`.

## Estado

MVP en desarrollo activo. Quedan preparados para ampliarse los pagos, las automatizaciones y la gestión más avanzada.

## Autor

Santiago Aranda, desarrollador full stack.
[LinkedIn](https://www.linkedin.com/in/santiago-aranda-dev/) · [GitHub](https://github.com/SantiagoAranda)
