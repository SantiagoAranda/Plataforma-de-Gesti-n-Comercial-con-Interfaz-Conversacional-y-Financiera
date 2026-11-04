import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { jwtSecret } from './jwt.config';
import { passwordV2Enabled } from './password-rollout';
import { authActionOf } from './auth-action.decorator';

// Only the counter key is normalized; stored emails and account identity are untouched.
export function normalizeEmailKey(email: string): string {
  return email.normalize('NFKC').trim().toLowerCase();
}

@Injectable()
export class RecoveryRateLimitGuard implements CanActivate {
  private readonly counters = new Map<
    string,
    { count: number; expires: number }
  >();
  private readonly secret: string;
  private readonly enabled: boolean;
  private degraded = false;
  private readonly logger = new Logger(RecoveryRateLimitGuard.name);
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.secret = jwtSecret(config);
    this.enabled = passwordV2Enabled(config);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.enabled)
      throw new ServiceUnavailableException(
        'La recuperación no está disponible temporalmente.',
      );
    const http = context.switchToHttp();
    const request = http.getRequest<{
      ip?: string;
      body?: { email?: unknown; token?: unknown };
    }>();
    const response = http.getResponse<{
      setHeader(name: string, value: string): void;
    }>();
    const isForgot = authActionOf(context.getHandler()) === 'forgot';
    const ip = request.ip || 'unknown';
    const identity = isForgot ? request.body?.email : request.body?.token;
    const rules = [{ key: ['ip', ip], max: 30, ttl: 900000 }];
    if (typeof identity === 'string' && identity.length <= 320)
      rules.push({
        key: [
          isForgot ? 'email' : 'token',
          isForgot ? normalizeEmailKey(identity) : identity,
        ],
        max: 5,
        ttl: 900000,
      });
    let retry = 0;
    let failed = false;
    for (const rule of rules) {
      let key = createHmac('sha256', this.secret)
        .update(JSON.stringify(['recovery-rate-v1', ...rule.key]))
        .digest('hex');
      const now = Date.now();
      if (this.counters.size >= 10000) {
        for (const [entry, value] of this.counters)
          if (value.expires <= now) this.counters.delete(entry);
        if (!this.counters.has(key) && this.counters.size >= 10000)
          key = 'overflow';
      }
      let local = this.counters.get(key);
      if (!local || local.expires <= now) {
        local = { count: 0, expires: now + rule.ttl };
        this.counters.set(key, local);
      }
      local.count = Math.min(local.count + 1, 2147483647);
      let count = local.count;
      let remaining = Math.max(1, Math.ceil((local.expires - now) / 1000));
      try {
        const [row] = await this.prisma.$queryRaw<
          Array<{ count: number; remaining: number }>
        >`
          INSERT INTO "AuthRateLimit" ("key", "count", "expiresAt")
          VALUES (${key}, 1, clock_timestamp() + ${rule.ttl} * interval '1 millisecond')
          ON CONFLICT ("key") DO UPDATE SET
            "count" = CASE WHEN "AuthRateLimit"."expiresAt" <= clock_timestamp() THEN 1 ELSE LEAST("AuthRateLimit"."count", 2147483646) + 1 END,
            "expiresAt" = CASE WHEN "AuthRateLimit"."expiresAt" <= clock_timestamp() THEN clock_timestamp() + ${rule.ttl} * interval '1 millisecond' ELSE "AuthRateLimit"."expiresAt" END
          RETURNING "count", GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("expiresAt" - clock_timestamp()))))::integer AS remaining`;
        count = row.count;
        remaining = row.remaining;
      } catch {
        failed = true;
      }
      if (count > rule.max) retry = Math.max(retry, remaining);
    }
    if (failed !== this.degraded) {
      this.degraded = failed;
      if (failed)
        this.logger.error(
          'Límite de recuperación degradado a almacenamiento local.',
        );
      else this.logger.log('Límite distribuido de recuperación restablecido.');
    }
    if (!failed && randomInt(1000) === 0) {
      try {
        await this.prisma
          .$executeRaw`DELETE FROM "AuthRateLimit" WHERE "key" IN (SELECT "key" FROM "AuthRateLimit" WHERE "expiresAt" <= clock_timestamp() LIMIT 1000)`;
      } catch {
        /* A later request can retry bounded cleanup. */
      }
    }
    if (retry) {
      response.setHeader('Retry-After', String(retry));
      throw new HttpException(
        {
          statusCode: 429,
          code: 'AUTH_RATE_LIMITED',
          message: 'Demasiados intentos. Esperá antes de volver a intentar.',
          retryAfterSeconds: retry,
        },
        429,
      );
    }
    return true;
  }
}
