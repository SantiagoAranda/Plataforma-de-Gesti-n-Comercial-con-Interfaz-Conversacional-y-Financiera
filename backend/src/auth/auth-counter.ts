import { PrismaService } from '../prisma/prisma.service';

/** Shared fixed-window counter in PostgreSQL (database clock), safe across instances. */
export async function incrementCounter(
  db: Pick<PrismaService, '$queryRaw'>,
  key: string,
  ttlMs: number,
): Promise<{ count: number; remaining: number }> {
  const [row] = await db.$queryRaw<Array<{ count: number; remaining: number }>>`
    INSERT INTO "AuthRateLimit" ("key", "count", "expiresAt")
    VALUES (${key}, 1, clock_timestamp() + ${ttlMs} * interval '1 millisecond')
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "AuthRateLimit"."expiresAt" <= clock_timestamp() THEN 1 ELSE LEAST("AuthRateLimit"."count", 2147483646) + 1 END,
      "expiresAt" = CASE WHEN "AuthRateLimit"."expiresAt" <= clock_timestamp() THEN clock_timestamp() + ${ttlMs} * interval '1 millisecond' ELSE "AuthRateLimit"."expiresAt" END
    RETURNING "count", GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("expiresAt" - clock_timestamp()))))::integer AS remaining`;
  return row;
}
