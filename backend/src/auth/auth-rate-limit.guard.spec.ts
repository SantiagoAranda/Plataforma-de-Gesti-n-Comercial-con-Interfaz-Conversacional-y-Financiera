import { ConfigService } from '@nestjs/config';
import { ExecutionContext } from '@nestjs/common';
import { AuthRateLimitGuard, authProxyTrust } from './auth-rate-limit.guard';
import { PrismaService } from '../prisma/prisma.service';

function makeDatabase() {
  const counts = new Map<string, number>();
  return {
    $queryRaw: jest.fn((_sql: TemplateStringsArray, key: string) => {
      const count = (counts.get(key) || 0) + 1;
      counts.set(key, count);
      return Promise.resolve([{ count, remaining: 120 }]);
    }),
    $executeRaw: jest.fn(),
  };
}

function fixture(enabled = true, database?: ReturnType<typeof makeDatabase>) {
  const config = new ConfigService({
    JWT_SECRET: 'fixture-secret',
    AUTH_RATE_LIMIT_ENABLED: String(enabled),
    AUTH_CLIENT_IP_MODE: 'direct',
  });
  const prisma = database || makeDatabase();
  const request = {
    ip: '192.0.2.1',
    body: { email: 'fixture@example.test' as unknown },
  };
  const response = { setHeader: jest.fn() };
  const context = {
    getHandler: () => function login() {},
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  };
  return {
    guard: new AuthRateLimitGuard(config, prisma as unknown as PrismaService),
    config,
    prisma,
    request,
    response,
    context: context as unknown as ExecutionContext,
    handler: context,
  };
}

describe('Auth rate limiter', () => {
  it('does not inspect request, query or clean absent table when disabled', async () => {
    const f = fixture(false);
    await expect(f.guard.canActivate({} as ExecutionContext)).resolves.toBe(
      true,
    );
    await f.guard.cleanup();
    expect(f.prisma.$queryRaw).not.toHaveBeenCalled();
    expect(f.prisma.$executeRaw).not.toHaveBeenCalled();
  });
  it('shares counters between guard instances and returns safe 429', async () => {
    const f = fixture();
    const second = fixture(true, f.prisma);
    for (let i = 0; i < 10; i++)
      await (i % 2 ? f : second).guard.canActivate(f.context);
    await expect(f.guard.canActivate(f.context)).rejects.toMatchObject({
      status: 429,
      response: { code: 'AUTH_RATE_LIMITED', retryAfterSeconds: 120 },
    });
    expect(f.response.setHeader).toHaveBeenCalledWith('Retry-After', '120');
    for (const call of f.prisma.$queryRaw.mock.calls)
      expect(call[1]).toMatch(/^[0-9a-f]{64}$/);
  });
  it('uses bounded local windows during storage failure without extending rejection', async () => {
    jest.useFakeTimers();
    try {
      const f = fixture();
      f.prisma.$queryRaw.mockRejectedValue(new Error('table absent'));
      for (let i = 0; i < 10; i++) await f.guard.canActivate(f.context);
      await expect(f.guard.canActivate(f.context)).rejects.toMatchObject({
        status: 429,
      });
      jest.advanceTimersByTime(300001);
      await expect(f.guard.canActivate(f.context)).resolves.toBe(true);
      f.prisma.$queryRaw.mockResolvedValue([{ count: 1, remaining: 60 }]);
      await expect(f.guard.canActivate(f.context)).resolves.toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
  it('limits registrations and handles malformed email without looking up accounts', async () => {
    const f = fixture();
    f.handler.getHandler = () => function registerBusiness() {};
    for (let i = 0; i < 5; i++) await f.guard.canActivate(f.context);
    await expect(f.guard.canActivate(f.context)).rejects.toMatchObject({
      status: 429,
    });
    f.request.body.email = {};
    await expect(f.guard.canActivate(f.context)).resolves.toBe(true);
  });
  it('requires explicit proxy configuration only when enabled', () => {
    expect(authProxyTrust(new ConfigService({}))).toBe(false);
    expect(() =>
      authProxyTrust(new ConfigService({ AUTH_RATE_LIMIT_ENABLED: 'true' })),
    ).toThrow();
    expect(() =>
      authProxyTrust(
        new ConfigService({
          AUTH_RATE_LIMIT_ENABLED: 'true',
          AUTH_CLIENT_IP_MODE: 'trusted-proxy',
          AUTH_TRUSTED_PROXIES: 'true',
        }),
      ),
    ).toThrow();
    expect(
      authProxyTrust(
        new ConfigService({
          AUTH_RATE_LIMIT_ENABLED: 'true',
          AUTH_CLIENT_IP_MODE: 'trusted-proxy',
          AUTH_TRUSTED_PROXIES: '127.0.0.1/32',
        }),
      ),
    ).toEqual(['127.0.0.1/32']);
  });
  it.each([
    '0.0.0.0/0',
    '::/0',
    '192.0.2.1/00',
    '::1/000',
    '192.0.2.0/24,::/0',
  ])('rejects trust-all proxy range %s when enabled', (range) => {
    const config = new ConfigService({
      JWT_SECRET: 'fixture-secret',
      AUTH_RATE_LIMIT_ENABLED: 'true',
      AUTH_CLIENT_IP_MODE: 'trusted-proxy',
      AUTH_TRUSTED_PROXIES: range,
    });
    expect(() => authProxyTrust(config)).toThrow(
      'AUTH_TRUSTED_PROXIES must not include CIDR /0',
    );
    expect(
      () =>
        new AuthRateLimitGuard(
          config,
          makeDatabase() as unknown as PrismaService,
        ),
    ).toThrow('AUTH_TRUSTED_PROXIES must not include CIDR /0');
  });
  it('accepts explicit IPv4 and IPv6 proxies and direct mode', () => {
    expect(
      authProxyTrust(
        new ConfigService({
          AUTH_RATE_LIMIT_ENABLED: 'true',
          AUTH_CLIENT_IP_MODE: 'trusted-proxy',
          AUTH_TRUSTED_PROXIES: '192.0.2.0/24,2001:db8::/32,::1',
        }),
      ),
    ).toEqual(['192.0.2.0/24', '2001:db8::/32', '::1']);
    expect(
      authProxyTrust(
        new ConfigService({
          AUTH_RATE_LIMIT_ENABLED: 'true',
          AUTH_CLIENT_IP_MODE: 'direct',
          AUTH_TRUSTED_PROXIES: '0.0.0.0/0',
        }),
      ),
    ).toBe(false);
  });
  it('ignores insecure proxy settings and storage when disabled', async () => {
    const config = new ConfigService({
      JWT_SECRET: 'fixture-secret',
      AUTH_RATE_LIMIT_ENABLED: 'false',
      AUTH_CLIENT_IP_MODE: 'trusted-proxy',
      AUTH_TRUSTED_PROXIES: '::/0',
    });
    const prisma = { $queryRaw: jest.fn(), $executeRaw: jest.fn() };
    const guard = new AuthRateLimitGuard(
      config,
      prisma as unknown as PrismaService,
    );
    expect(authProxyTrust(config)).toBe(false);
    await expect(guard.canActivate({} as ExecutionContext)).resolves.toBe(true);
    await guard.cleanup();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });
});
