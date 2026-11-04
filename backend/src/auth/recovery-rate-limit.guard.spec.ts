import { ExecutionContext } from '@nestjs/common';
import { handlerFor } from './auth-action.decorator';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RecoveryRateLimitGuard } from './recovery-rate-limit.guard';

describe('recovery rate limiter', () => {
  it('limits a repeated email locally if distributed storage fails', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('offline')),
      $executeRaw: jest.fn(),
    };
    const guard = new RecoveryRateLimitGuard(
      new ConfigService({
        JWT_SECRET: 'fixture-secret',
        AUTH_PASSWORD_POLICY_V2_ENABLED: 'true',
        AUTH_RATE_LIMIT_ENABLED: 'true',
      }),
      prisma as unknown as PrismaService,
    );
    const response = { setHeader: jest.fn() };
    const context = {
      getHandler: () => handlerFor('forgot'),
      switchToHttp: () => ({
        getRequest: () => ({
          ip: '192.0.2.1',
          body: { email: 'fictional@example.test' },
        }),
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
    for (let i = 0; i < 5; i++)
      await expect(guard.canActivate(context)).resolves.toBe(true);
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 429,
      response: { code: 'AUTH_RATE_LIMITED' },
    });
    expect(response.setHeader).toHaveBeenCalledWith(
      'Retry-After',
      expect.any(String),
    );
  });

  it('does not inspect requests or touch the database when recovery is disabled', async () => {
    const prisma = { $queryRaw: jest.fn(), $executeRaw: jest.fn() };
    const guard = new RecoveryRateLimitGuard(
      new ConfigService({
        JWT_SECRET: 'fixture-secret',
        AUTH_PASSWORD_POLICY_V2_ENABLED: 'false',
      }),
      prisma as unknown as PrismaService,
    );
    await expect(guard.canActivate({} as ExecutionContext)).rejects.toThrow(
      'no está disponible',
    );
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('does not activate in production without the authentication rate limiter', async () => {
    const prisma = { $queryRaw: jest.fn(), $executeRaw: jest.fn() };
    const config = new ConfigService({
      JWT_SECRET: 'fixture-secret',
      NODE_ENV: 'production',
      AUTH_PASSWORD_POLICY_V2_ENABLED: 'true',
      AUTH_RATE_LIMIT_ENABLED: 'false',
    });
    const guard = new RecoveryRateLimitGuard(
      config,
      prisma as unknown as PrismaService,
    );
    await expect(guard.canActivate({} as ExecutionContext)).rejects.toThrow(
      'no está disponible',
    );
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
