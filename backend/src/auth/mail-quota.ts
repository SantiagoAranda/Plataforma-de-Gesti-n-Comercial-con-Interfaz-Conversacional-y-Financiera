import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

type Db = Pick<PrismaService, '$queryRaw'>;
const TTL_MS = 26 * 3600 * 1000;

export type MailQuotaLimits = { limit: number; reserve: number };

function integer(
  config: ConfigService,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = Number(config.get<string>(name) ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return value;
}

/** Throws on invalid configuration so a bad value fails at startup. */
export function mailQuotaLimits(config: ConfigService): MailQuotaLimits {
  const limit = integer(config, 'RECOVERY_MAIL_DAILY_LIMIT', 80, 2, 100000);
  const reserve = integer(
    config,
    'RECOVERY_MAIL_NOTICE_RESERVE',
    Math.min(20, limit - 1),
    0,
    limit - 1,
  );
  return { limit, reserve };
}

export function cooldownMinutes(config: ConfigService): number {
  return integer(config, 'RECOVERY_COOLDOWN_MINUTES', 3, 2, 5);
}

/**
 * Atomically reserves one unit of today's (UTC, database clock) mail quota.
 * Recovery mail may use `limit - reserve`; security notices may use `limit`.
 * Reservations are never released: a timed-out send may still have been delivered.
 */
export async function reserveMailSlot(
  db: Db,
  kind: 'recovery' | 'notice',
  { limit, reserve }: MailQuotaLimits,
): Promise<boolean> {
  const cap = kind === 'recovery' ? limit - reserve : limit;
  const rows = await db.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "AuthRateLimit" ("key", "count", "expiresAt")
    VALUES ('mail-reserved-v1:' || to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD'), 1, clock_timestamp() + ${TTL_MS} * interval '1 millisecond')
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "AuthRateLimit"."expiresAt" <= clock_timestamp() THEN 1 ELSE "AuthRateLimit"."count" + 1 END,
      "expiresAt" = CASE WHEN "AuthRateLimit"."expiresAt" <= clock_timestamp() THEN clock_timestamp() + ${TTL_MS} * interval '1 millisecond' ELSE "AuthRateLimit"."expiresAt" END
    WHERE "AuthRateLimit"."expiresAt" <= clock_timestamp() OR "AuthRateLimit"."count" < ${cap}
    RETURNING "count"`;
  return rows.length === 1;
}

/** Informational counters (accepted/failed); never used to decide anything. */
export async function recordMailOutcome(
  db: Db,
  outcome: 'accepted' | 'failed',
): Promise<void> {
  const prefix = `mail-${outcome}-v1:`;
  try {
    await db.$queryRaw`
      INSERT INTO "AuthRateLimit" ("key", "count", "expiresAt")
      VALUES (${prefix} || to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD'), 1, clock_timestamp() + ${TTL_MS} * interval '1 millisecond')
      ON CONFLICT ("key") DO UPDATE SET "count" = LEAST("AuthRateLimit"."count", 2147483646) + 1
      RETURNING "count"`;
  } catch {
    /* Diagnostics only. */
  }
}
