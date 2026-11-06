import { Prisma, PrismaClient } from '@prisma/client';

// This table exists only in explicitly provisioned disposable test databases.
// A localhost URL alone is not evidence that deleting fixtures is safe.
export async function assertIsolatedBusinessFixtures(prisma: PrismaClient) {
  const marker = process.env.SACTEC_TEST_RUN_ID;
  if (!marker) throw new Error('SACTEC_TEST_RUN_ID is required for business fixtures');
  const rows = await prisma.$queryRaw<Array<{ runId: string }>>`
    SELECT "runId" FROM public."SactecTestEnvironment" WHERE "runId" = ${marker}`;
  if (rows.length !== 1) throw new Error('Database isolation marker mismatch');
}

export async function verifyIsolatedTestEnvironment() {
  const raw = process.env.DATABASE_URL;
  if (!raw || !process.env.SACTEC_TEST_RUN_ID) throw new Error('Explicit isolated test connection required');
  const url = new URL(raw);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !url.pathname.endsWith('_test')) {
    throw new Error('Refusing non-test target');
  }
  const probe = new PrismaClient({ datasources: { db: { url: raw } } });
  try { await assertIsolatedBusinessFixtures(probe); } finally { await probe.$disconnect(); }
}

export async function createBusinessFixture(
  prisma: PrismaClient,
  args: { data: Prisma.BusinessCreateInput },
) {
  await assertIsolatedBusinessFixtures(prisma);
  return prisma.$transaction(async tx => {
    const business = await tx.business.create(args);
    await tx.businessSlug.create({ data: { slug: business.slug, businessId: business.id } });
    return business;
  });
}

export async function deleteBusinessFixtures(prisma: PrismaClient, ids: string[]) {
  await assertIsolatedBusinessFixtures(prisma);
  if (!ids.length) return;
  if (ids.some(id => typeof id !== 'string' || !id)) throw new Error('Explicit fixture IDs required');
  // Only explicit fixture IDs, never an unfiltered deletion or an application path.
  await prisma.$transaction(async tx => {
    // OrderItem restricts deletion of its Item; remove the fixture's lines before
    // Business cascades to items/orders. This is never an application cleanup.
    await tx.orderItem.deleteMany({ where: { businessId: { in: ids } } });
    await tx.businessSlug.deleteMany({ where: { businessId: { in: ids } } });
    await tx.business.deleteMany({ where: { id: { in: ids } } });
  });
}
