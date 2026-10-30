import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { PrismaService } from '../prisma/prisma.service';
import { jwtSecret } from './jwt.config';

export function authProxyTrust(config: ConfigService): false | string[] {
  if (config.get('AUTH_RATE_LIMIT_ENABLED') !== 'true') return false;
  const mode = config.get<string>('AUTH_CLIENT_IP_MODE');
  if (mode === 'direct') return false;
  const ranges = config
    .get<string>('AUTH_TRUSTED_PROXIES')
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    mode !== 'trusted-proxy' ||
    !ranges?.length ||
    ranges.some((range) => {
      const [address, prefix, extra] = range.split('/');
      const family = isIP(address);
      if (
        family &&
        extra === undefined &&
        prefix !== undefined &&
        /^\d+$/.test(prefix) &&
        Number(prefix) === 0
      ) {
        throw new Error('AUTH_TRUSTED_PROXIES must not include CIDR /0');
      }
      return (
        !family ||
        extra !== undefined ||
        (prefix !== undefined &&
          (!/^\d+$/.test(prefix) || Number(prefix) > (family === 4 ? 32 : 128)))
      );
    })
  )
    throw new Error(
      'Configure AUTH_CLIENT_IP_MODE and explicit AUTH_TRUSTED_PROXIES before enabling auth rate limiting',
    );
  return ranges;
}

type Counter = { count: number; expires: number };

@Injectable()
export class AuthRateLimitGuard implements CanActivate, OnModuleInit {
  private readonly logger = new Logger(AuthRateLimitGuard.name);
  private readonly local = new Map<string, Counter>();
  private degraded = false;
  private readonly enabled: boolean;
  private readonly secret: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.enabled = config.get('AUTH_RATE_LIMIT_ENABLED') === 'true';
    this.secret = jwtSecret(config);
    authProxyTrust(config);
  }

  onModuleInit() {
    this.logger.log(
      this.enabled
        ? 'Authentication rate limiting enabled'
        : 'Authentication rate limiting disabled; storage is not accessed',
    );
  }

  private localIncrement(key: string, ttl: number): Counter {
    const now = Date.now();
    if (this.local.size >= 10000) {
      for (const [entryKey, entry] of this.local)
        if (entry.expires <= now) this.local.delete(entryKey);
      if (!this.local.has(key) && this.local.size >= 10000) key = 'overflow';
    }
    let entry = this.local.get(key);
    if (!entry || entry.expires <= now) {
      entry = { count: 0, expires: now + ttl };
      this.local.set(key, entry);
    }
    entry.count = Math.min(entry.count + 1, 2147483647);
    return entry;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.enabled) return true;
    const request = context
      .switchToHttp()
      .getRequest<{ ip?: string; body?: { email?: unknown } }>();
    const response = context
      .switchToHttp()
      .getResponse<{ setHeader(name: string, value: string): void }>();
    const ip = request.ip || 'unknown';
    const email =
      typeof request.body?.email === 'string' ? request.body.email : undefined;
    const login = context.getHandler().name === 'login';
    const rules: Array<{
      scope: string;
      identity: string[];
      limit: number;
      ttl: number;
    }> = [
      {
        scope: login ? 'login-ip' : 'register-ip',
        identity: [ip],
        limit: login ? 200 : 30,
        ttl: login ? 900000 : 3600000,
      },
    ];
    if (email !== undefined) {
      rules.push({
        scope: login ? 'login-email' : 'register-email',
        identity: [email],
        limit: login ? 50 : 5,
        ttl: login ? 900000 : 3600000,
      });
      if (login)
        rules.push({
          scope: 'login-pair',
          identity: [email, ip],
          limit: 10,
          ttl: 300000,
        });
    }
    let retry = 0;
    let storageFailed = false;
    for (const rule of rules) {
      const key = createHmac('sha256', this.secret)
        .update(
          JSON.stringify(['auth-rate-limit-v1', rule.scope, ...rule.identity]),
        )
        .digest('hex');
      const fallback = this.localIncrement(key, rule.ttl);
      let count: number;
      let remaining: number;
      try {
        const [result] = await this.prisma.$queryRaw<
          Array<{ count: number; remaining: number }>
        >`
          INSERT INTO "AuthRateLimit" ("key", "count", "expiresAt")
          VALUES (${key}, 1, clock_timestamp() + ${rule.ttl} * interval '1 millisecond')
          ON CONFLICT ("key") DO UPDATE SET
            "count" = CASE WHEN "AuthRateLimit"."expiresAt" <= clock_timestamp() THEN 1 ELSE LEAST("AuthRateLimit"."count", 2147483646) + 1 END,
            "expiresAt" = CASE WHEN "AuthRateLimit"."expiresAt" <= clock_timestamp() THEN clock_timestamp() + ${rule.ttl} * interval '1 millisecond' ELSE "AuthRateLimit"."expiresAt" END
          RETURNING "count", GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("expiresAt" - clock_timestamp()))))::integer AS remaining
        `;
        count = result.count;
        remaining = result.remaining;
      } catch {
        storageFailed = true;
        count = fallback.count;
        remaining = Math.max(
          1,
          Math.ceil((fallback.expires - Date.now()) / 1000),
        );
      }
      if (count > rule.limit) retry = Math.max(retry, remaining);
    }
    if (storageFailed !== this.degraded) {
      this.degraded = storageFailed;
      if (storageFailed)
        this.logger.error(
          'Auth rate limiting degraded: per-instance fallback active',
        );
      else this.logger.log('Distributed auth rate limiting recovered');
    }
    if (retry) {
      response.setHeader('Retry-After', String(retry));
      throw new HttpException(
        {
          statusCode: 429,
          code: 'AUTH_RATE_LIMITED',
          message: `Demasiados intentos. Esperá ${retry} segundos antes de volver a intentar.`,
          retryAfterSeconds: retry,
        },
        429,
      );
    }
    return true;
  }

  @Interval(60000)
  async cleanup() {
    if (!this.enabled) return;
    for (const [key, entry] of this.local)
      if (entry.expires <= Date.now()) this.local.delete(key);
    try {
      await this.prisma
        .$executeRaw`DELETE FROM "AuthRateLimit" WHERE "key" IN (SELECT "key" FROM "AuthRateLimit" WHERE "expiresAt" < clock_timestamp() ORDER BY "expiresAt" LIMIT 1000)`;
    } catch {
      /* Request path reports degraded protection without logging database details. */
    }
  }
}
