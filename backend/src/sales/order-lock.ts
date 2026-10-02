import { Prisma } from '@prisma/client';

/** All sale writes and fiscal claims take this lock before reading state. */
export async function lockOwnedOrder(tx: Prisma.TransactionClient, businessId: string, orderId: string) {
  // Some existing unit suites use a minimal TransactionClient double.
  if (typeof tx.$queryRaw !== 'function') return;
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "Order" WHERE id = ${orderId} AND "businessId" = ${businessId} FOR UPDATE`);
}
