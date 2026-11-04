/**
 * Read-only: counts accounts whose emails differ only by capitalization.
 * Never writes, merges or prints full addresses. Run against staging/production only with authorization.
 *   npx ts-node scripts/check-email-case-collisions.ts
 */
import { PrismaClient } from '@prisma/client';

const mask = (email: string) => {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 2)}***@${domain.slice(0, 1)}***`;
};

async function main() {
  const prisma = new PrismaClient();
  try {
    const groups = await prisma.$queryRaw<
      Array<{ normalized: string; accounts: number; examples: string[] }>
    >`SELECT lower(trim("email")) AS normalized, COUNT(*)::int AS accounts, array_agg("email") AS examples
      FROM "User" GROUP BY lower(trim("email")) HAVING COUNT(*) > 1`;
    const mixedCase = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM "User" WHERE "email" <> lower(trim("email"))`;
    console.log(
      JSON.stringify({
        collisionGroups: groups.length,
        accountsWithNonLowercaseEmail: mixedCase[0].count,
        groups: groups.map((g) => ({
          accounts: g.accounts,
          examples: g.examples.map(mask),
        })),
        verdict:
          groups.length === 0
            ? 'No collisions: a case-insensitive lookup would be unambiguous.'
            : 'Collisions found: keep exact-match lookup and resolve manually.',
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
