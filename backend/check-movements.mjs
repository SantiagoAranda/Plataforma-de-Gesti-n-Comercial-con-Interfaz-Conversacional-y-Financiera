import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

// Get a business user to test with
const user = await p.user.findFirst({
  where: { businessId: { not: null } },
  select: { id: true, businessId: true, email: true }
});
console.log('Test user:', JSON.stringify(user, null, 2));

// Check if the MANUAL credit account (caja 110505) exists as subcuenta
const caja = await p.pucSubcuenta.findUnique({
  where: { code: '110505' },
  select: { code: true, name: true, active: true }
});
console.log('Caja (110505) subcuenta:', JSON.stringify(caja, null, 2));

const banco = await p.pucSubcuenta.findUnique({
  where: { code: '111005' },
  select: { code: true, name: true, active: true }
});
console.log('Banco (111005) subcuenta:', JSON.stringify(banco, null, 2));

await p.$disconnect();
