import { ConfigService } from '@nestjs/config';
import {
  HttpException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AuthService } from '../src/auth/auth.service';
import { JwtStrategy } from '../src/auth/jwt.strategy/jwt.strategy';
import { PasswordRecoveryService } from '../src/auth/password-recovery.service';
import { RecoveryMailService } from '../src/auth/recovery-mail.service';
import { RecoveryRateLimitGuard } from '../src/auth/recovery-rate-limit.guard';
import { UsersService } from '../src/users/users.service';
import { BusinessesService } from '../src/businesses/businesses.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthController } from '../src/auth/auth.controller';
import { AuthRateLimitGuard } from '../src/auth/auth-rate-limit.guard';
import { handlerFor } from '../src/auth/auth-action.decorator';
import { mailQuotaLimits, reserveMailSlot } from '../src/auth/mail-quota';
import { PushNotificationsService } from '../src/notifications/push-notifications.service';
import { signPushProof } from '../src/notifications/push-authorization';
import { RegisterPushSubscriptionDto } from '../src/notifications/dto/register-push-subscription.dto';

jest.mock('../src/notifications/push-endpoint-security', () => ({
  resolveAndValidatePushEndpoint: jest.fn().mockResolvedValue({}),
}));

const describeDatabase =
  process.env.RUN_AUTH_DB_TESTS === '1' ? describe : describe.skip;

describeDatabase('Password recovery using isolated PostgreSQL', () => {
  const suffix = randomUUID();
  const oldPassword = '  historical password  ';
  const newPassword = 'Nueva frase ficticia con espacios 🐱 1';
  const baseConfig = {
    AUTH_PASSWORD_POLICY_V2_ENABLED: 'true',
    AUTH_RATE_LIMIT_ENABLED: 'true',
    AUTH_CLIENT_IP_MODE: 'direct',
    NODE_ENV: 'test',
    MAIL_PROVIDER: 'test',
    FRONTEND_PUBLIC_URL: 'http://localhost:3000',
    JWT_SECRET: 'fixture-secret',
  };
  const config = new ConfigService(baseConfig);
  let prisma: PrismaClient;
  let db: PrismaService;
  let recovery: PasswordRecoveryService;
  let strategy: JwtStrategy;
  let auth: AuthService;
  let push: PushNotificationsService;
  let app: INestApplication;
  let mail: RecoveryMailService;
  let changedNotification: jest.SpyInstance;
  let fetchSpy: jest.SpyInstance;
  let hash: string;
  const businessOf = new Map<string, string>();
  const createdBusinesses: string[] = [];
  let businessUserId: string;
  let adminId: string;
  let delivered: string[];
  const email = (tag: string) => `${tag}-${suffix}@example.test`;
  const sha = (value: string) =>
    createHash('sha256').update(value).digest('hex');
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const ip = () => `192.0.2.${Math.floor(Math.random() * 250) + 1}`;

  async function createUser(tag: string, role: 'BUSINESS' | 'ADMIN') {
    // User.businessId is unique (one account per business), so each account gets its own business.
    const business =
      role === 'BUSINESS'
        ? await prisma.business.create({
            data: {
              name: `Test ${tag} ${suffix}`,
              slug: `test-${tag}-${suffix}`,
              fiscalId: '',
              phoneWhatsapp: '000',
            },
          })
        : null;
    if (business) createdBusinesses.push(business.id);
    const user = await prisma.user.create({
      data: {
        email: email(tag),
        password: hash,
        role,
        businessId: business?.id ?? null,
      },
    });
    if (business) businessOf.set(user.id, business.id);
    return user.id;
  }

  async function plantToken(
    userId: string,
    options: { expiresInMs?: number; createdAgoMs?: number } = {},
  ) {
    const token = randomBytes(32).toString('base64url');
    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: sha(token),
        createdAt: new Date(Date.now() - (options.createdAgoMs ?? 600000)),
        expiresAt: new Date(Date.now() + (options.expiresInMs ?? 1800000)),
      },
    });
    return token;
  }

  const tokenCount = (userId: string) =>
    prisma.passwordResetToken.count({ where: { userId } });
  const mailCounter = async (prefix: string) =>
    (
      await prisma.$queryRawUnsafe<Array<{ count: number }>>(
        `SELECT COALESCE(SUM("count"),0)::int AS count FROM "AuthRateLimit" WHERE "key" LIKE '${prefix}%'`,
      )
    )[0].count;

  async function settle(userId: string, expected: number) {
    for (let i = 0; i < 100 && (await tokenCount(userId)) < expected; i++)
      await wait(20);
    await wait(150); // let any wrongly issued extra token appear
  }

  async function codeOf(promise: Promise<unknown>): Promise<string | number> {
    try {
      await promise;
      return 'OK';
    } catch (error) {
      if (error instanceof HttpException) {
        const body = error.getResponse() as { code?: string };
        return body.code ?? error.getStatus();
      }
      throw error;
    }
  }

  const actorFor = (userId: string) => ({
    userId,
    businessId: businessOf.get(userId) as string,
  });
  const registration = (
    deviceId: string,
    endpoint: string,
    authorizationProof?: string,
  ): RegisterPushSubscriptionDto =>
    ({
      deviceId,
      subscription: {
        endpoint,
        expirationTime: null,
        keys: { p256dh: `key-${endpoint.slice(-8)}`, auth: 'auth-key' },
      },
      platform: 'WEB_DESKTOP',
      authorizationProof,
    }) as RegisterPushSubscriptionDto;
  const endpoint = () => `https://push.example.test/${randomUUID()}`;

  beforeAll(async () => {
    const raw = process.env.AUTH_TEST_DATABASE_URL;
    if (!raw) throw new Error('AUTH_TEST_DATABASE_URL is required');
    const url = new URL(raw);
    if (
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      !url.pathname.endsWith('_test') ||
      url.searchParams.get('schema') !== 'auth_stage1_test'
    )
      throw new Error('Dedicated isolated database required');
    prisma = new PrismaClient({ datasources: { db: { url: raw } } });
    await prisma.$connect();
    db = prisma as unknown as PrismaService;
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('no external call expected'));
    hash = await bcrypt.hash(oldPassword, 10);
    businessUserId = await createUser('business', 'BUSINESS');
    adminId = await createUser('admin', 'ADMIN');
    delivered = [];
    mail = new RecoveryMailService(config);
    jest.spyOn(mail, 'sendRecovery').mockImplementation((_email, token) => {
      delivered.push(token);
      return Promise.resolve();
    });
    changedNotification = jest.spyOn(mail, 'sendChanged').mockResolvedValue();
    recovery = new PasswordRecoveryService(db, mail, config);
    strategy = new JwtStrategy(config, db);
    push = new PushNotificationsService(
      db,
      { isEnabled: () => false } as never,
      { send: jest.fn() } as never,
      config,
    );
    auth = new AuthService(
      new UsersService(db),
      {} as BusinessesService,
      new JwtService({ secret: 'fixture-secret' }),
      db,
      config,
    );
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: PasswordRecoveryService, useValue: recovery },
        { provide: ConfigService, useValue: config },
        { provide: PrismaService, useValue: prisma },
        AuthRateLimitGuard,
        RecoveryRateLimitGuard,
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  }, 60000);

  afterAll(async () => {
    jest.restoreAllMocks();
    if (app) await app.close();
    if (prisma) {
      try {
        await prisma.user.deleteMany({
          where: { email: { endsWith: `${suffix}@example.test` } },
        });
        await prisma.business.deleteMany({
          where: { id: { in: createdBusinesses } },
        });
      } finally {
        await prisma.$disconnect();
      }
    }
  });

  it('keeps bcrypt BUSINESS and ADMIN login, answers generically and sends nothing for ADMIN or unknown accounts', async () => {
    await expect(
      auth.login(email('business'), oldPassword),
    ).resolves.toHaveProperty('accessToken');
    await expect(
      auth.login(email('admin'), oldPassword),
    ).resolves.toHaveProperty('accessToken');
    const known = recovery.request(email('business'));
    expect(recovery.request(email('missing'))).toEqual(known);
    expect(recovery.request(email('admin'))).toEqual(known);
    await settle(businessUserId, 1);
    expect(delivered).toHaveLength(1);
    expect(await tokenCount(adminId)).toBe(0);
  });

  it('keeps ADMIN out of self-service recovery even with a planted token', async () => {
    const token = await plantToken(adminId);
    await expect(recovery.reset(token, newPassword)).rejects.toThrow(
      'inválido o venció',
    );
    const admin = await prisma.user.findUniqueOrThrow({
      where: { id: adminId },
    });
    expect(admin.sessionVersion).toBe(0);
    expect(admin.password).toBe(hash);
    await expect(
      auth.login(email('admin'), oldPassword),
    ).resolves.toHaveProperty('accessToken');
  });

  it('validates the new password policy without external calls and leaves the token usable after a rejection', async () => {
    const userId = await createUser('policy', 'BUSINESS');
    await expect(
      recovery.reset(randomBytes(32).toString('base64url'), newPassword),
    ).rejects.toThrow('inválido o venció');
    const token = await plantToken(userId);
    await expect(recovery.reset(token, 'Abc1!')).rejects.toMatchObject({
      status: 400,
    });
    const untouched = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    expect(untouched.password).toBe(hash);
    expect(untouched.sessionVersion).toBe(0);
    // Formerly leaked/common passwords are accepted when they meet the policy.
    await expect(recovery.reset(token, 'Password123!')).resolves.toHaveProperty(
      'message',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('uses UTC for expiry and consumption regardless of the database time zone, and purges only long-expired tokens', async () => {
    const [{ TimeZone }] = await prisma.$queryRaw<Array<{ TimeZone: string }>>`
      SELECT current_setting('TimeZone') AS "TimeZone"`;
    if (process.env.AUTH_TEST_NON_UTC_DB === '1')
      expect(TimeZone).toBe('America/Bogota');
    const userId = await createUser('expiry', 'BUSINESS');
    // Margins of minutes tolerate host/container clock skew yet are far below a UTC-offset error (hours).
    const expired = await plantToken(userId, { expiresInMs: -120000 });
    await expect(recovery.reset(expired, newPassword)).rejects.toThrow(
      'inválido o venció',
    );
    const valid = await plantToken(userId, { expiresInMs: 300000 });
    const before = Date.now();
    await recovery.reset(valid, newPassword);
    const consumed = await prisma.passwordResetToken.findUniqueOrThrow({
      where: { tokenHash: sha(valid) },
    });
    expect(
      Math.abs((consumed.consumedAt as Date).getTime() - before),
    ).toBeLessThan(60000);

    const old = await plantToken(userId, { expiresInMs: -3 * 86400000 });
    const recent = await plantToken(userId, { expiresInMs: -3600000 });
    const live = await plantToken(userId);
    await recovery.purgeExpiredTokens();
    const remaining = new Set(
      (await prisma.passwordResetToken.findMany({ where: { userId } })).map(
        (t) => t.tokenHash,
      ),
    );
    expect(remaining.has(sha(old))).toBe(false);
    expect(remaining.has(sha(recent))).toBe(true);
    expect(remaining.has(sha(live))).toBe(true);
  }, 30000);

  it('issues exactly one token and one quota unit for concurrent requests, never invalidating live links', async () => {
    const userId = await createUser('cooldown', 'BUSINESS');
    const reservedBefore = await mailCounter('mail-reserved-v1:');
    const deliveredBefore = delivered.length;
    await Promise.all(
      Array.from({ length: 20 }, () =>
        Promise.resolve(recovery.request(email('cooldown'))),
      ),
    );
    await settle(userId, 1);
    expect(await tokenCount(userId)).toBe(1);
    expect(delivered).toHaveLength(deliveredBefore + 1);
    expect((await mailCounter('mail-reserved-v1:')) - reservedBefore).toBe(1);
    const first = delivered[deliveredBefore];

    // Within the cooldown nothing new is issued; the first link keeps working.
    recovery.request(email('cooldown'));
    await wait(300);
    expect(await tokenCount(userId)).toBe(1);

    // After the cooldown a second request leaves the first link alive.
    await prisma.$executeRaw`UPDATE "PasswordResetToken" SET "createdAt" = "createdAt" - interval '10 minutes' WHERE "userId" = ${userId}`;
    recovery.request(email('cooldown'));
    await settle(userId, 2);
    expect(await tokenCount(userId)).toBe(2);
    expect(
      await prisma.passwordResetToken.count({
        where: { userId, consumedAt: null },
      }),
    ).toBe(2);

    // At most three live links; a fourth request is ignored.
    await prisma.$executeRaw`UPDATE "PasswordResetToken" SET "createdAt" = "createdAt" - interval '10 minutes' WHERE "userId" = ${userId}`;
    recovery.request(email('cooldown'));
    await settle(userId, 3);
    await prisma.$executeRaw`UPDATE "PasswordResetToken" SET "createdAt" = "createdAt" - interval '10 minutes' WHERE "userId" = ${userId}`;
    recovery.request(email('cooldown'));
    await wait(300);
    expect(await tokenCount(userId)).toBe(3);

    await expect(recovery.reset(first, newPassword)).resolves.toHaveProperty(
      'message',
    );
    expect(
      await prisma.passwordResetToken.count({
        where: { userId, consumedAt: null },
      }),
    ).toBe(0);
  }, 60000);

  it('reserves mail capacity for security notices and shares the daily quota across instances', async () => {
    await prisma.$executeRaw`DELETE FROM "AuthRateLimit" WHERE "key" LIKE 'mail-%'`;
    const tight = new ConfigService({
      ...baseConfig,
      RECOVERY_MAIL_DAILY_LIMIT: '4',
      RECOVERY_MAIL_NOTICE_RESERVE: '2',
    });
    const makeInstance = () => {
      const instanceMail = new RecoveryMailService(tight);
      const sent: string[] = [];
      jest.spyOn(instanceMail, 'sendRecovery').mockImplementation((_e, t) => {
        sent.push(t);
        return Promise.resolve();
      });
      const notice = jest
        .spyOn(instanceMail, 'sendChanged')
        .mockResolvedValue();
      return {
        service: new PasswordRecoveryService(db, instanceMail, tight),
        sent,
        notice,
      };
    };
    const one = makeInstance();
    const two = makeInstance();
    const users = [] as string[];
    for (const tag of ['q1', 'q2', 'q3', 'q4'])
      users.push(await createUser(tag, 'BUSINESS'));
    one.service.request(email('q1'));
    two.service.request(email('q2'));
    await settle(users[0], 1);
    await settle(users[1], 1);
    one.service.request(email('q3')); // recovery cap (limit - reserve = 2) already used
    two.service.request(email('q4'));
    await wait(400);
    expect(await tokenCount(users[2])).toBe(0);
    expect(await tokenCount(users[3])).toBe(0);
    expect(one.sent.length + two.sent.length).toBe(2);
    expect(await mailCounter('mail-reserved-v1:')).toBe(2);
    expect(await mailCounter('mail-accepted-v1:')).toBe(2);

    // The reserve still serves security notices, up to the full limit.
    await expect(
      reserveMailSlot(db, 'notice', mailQuotaLimits(tight)),
    ).resolves.toBe(true);
    const token = await plantToken(users[0]);
    await one.service.reset(token, newPassword);
    expect(one.notice).toHaveBeenCalledTimes(1);
    expect(await mailCounter('mail-reserved-v1:')).toBe(4);

    // Everything is spent: reset still succeeds, the notice is skipped.
    const second = await plantToken(users[1]);
    await expect(
      two.service.reset(second, newPassword),
    ).resolves.toHaveProperty('message');
    expect(two.notice).not.toHaveBeenCalled();
    expect(await mailCounter('mail-reserved-v1:')).toBe(4);
    await prisma.$executeRaw`DELETE FROM "AuthRateLimit" WHERE "key" LIKE 'mail-%'`;
  }, 60000);

  it('atomically consumes one token and revokes only that user', async () => {
    const token = await plantToken(businessUserId);
    const saved = await prisma.passwordResetToken.findUniqueOrThrow({
      where: { tokenHash: sha(token) },
    });
    expect(saved.tokenHash).not.toBe(token);
    const results = await Promise.allSettled([
      recovery.reset(token, newPassword),
      recovery.reset(token, newPassword),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    await expect(recovery.reset(token, newPassword)).rejects.toThrow(
      'inválido o venció',
    );
    const updated = await prisma.user.findUniqueOrThrow({
      where: { id: businessUserId },
    });
    expect(updated.sessionVersion).toBe(1);
    expect(updated.businessId).toBe(businessOf.get(businessUserId));
    expect(updated.password).toMatch(/^\$argon2id\$/);
    await expect(
      auth.login(email('business'), newPassword),
    ).resolves.toHaveProperty('accessToken');
    await expect(auth.login(email('business'), oldPassword)).rejects.toThrow(
      'Invalid credentials',
    );
    await expect(
      strategy.validate({
        sub: businessUserId,
        role: 'BUSINESS',
        businessId: businessOf.get(businessUserId),
      }),
    ).rejects.toThrow();
    await expect(
      strategy.validate({
        sub: businessUserId,
        role: 'BUSINESS',
        businessId: businessOf.get(businessUserId),
        sessionVersion: 1,
      }),
    ).resolves.toHaveProperty('userId', businessUserId);
    await expect(
      strategy.validate({ sub: adminId, role: 'ADMIN', businessId: null }),
    ).resolves.toHaveProperty('userId', adminId);
    expect(changedNotification).toHaveBeenCalled();
  }, 30000);

  it('disables every push subscription of the recovered user, requires per-device authorization and keeps other users intact', async () => {
    const userId = await createUser('push', 'BUSINESS');
    const otherId = await createUser('pushother', 'BUSINESS');
    const actor = actorFor(userId);
    const otherActor = actorFor(otherId);
    const [deviceA, deviceB, deviceC, otherDevice] = [1, 2, 3, 4].map(() =>
      randomUUID(),
    );
    const endpointA = endpoint();
    const endpointB = endpoint();
    await push.register(actor, registration(deviceA, endpointA));
    await push.register(actor, registration(deviceB, endpointB));
    await push.register(otherActor, registration(otherDevice, endpoint()));
    // Never-recovered users keep the historical behaviour, including bcrypt authorization.
    await expect(
      push.authorize(otherActor, otherDevice, oldPassword, ip()),
    ).resolves.toHaveProperty('proof');

    const token = await plantToken(userId);
    await recovery.reset(token, newPassword);
    expect(
      await prisma.pushSubscription.count({
        where: { userId, enabled: true },
      }),
    ).toBe(0);
    expect(
      await prisma.pushSubscription.count({
        where: { userId: otherId, enabled: true },
      }),
    ).toBe(1);

    // A tokens minted before the reset are dead for authenticated requests.
    await expect(
      strategy.validate({
        sub: userId,
        role: 'BUSINESS',
        businessId: businessOf.get(userId),
      }),
    ).rejects.toThrow();

    // Neither the old device, a new deviceId, nor a new endpoint can re-register unaided.
    expect(
      await codeOf(push.register(actor, registration(deviceA, endpointA))),
    ).toBe('PUSH_AUTHORIZATION_REQUIRED');
    expect(
      await codeOf(push.register(actor, registration(deviceC, endpoint()))),
    ).toBe('PUSH_AUTHORIZATION_REQUIRED');
    expect(
      await codeOf(push.register(actor, registration(deviceA, endpoint()))),
    ).toBe('PUSH_AUTHORIZATION_REQUIRED');
    expect((await push.getStatus(actor, deviceA)).requiresAuthorization).toBe(
      true,
    );

    // The password is verified (the old bcrypt password no longer is).
    expect(
      await codeOf(push.authorize(actor, deviceB, oldPassword, ip())),
    ).toBe('PUSH_PASSWORD_INVALID');
    const { proof } = await push.authorize(actor, deviceB, newPassword, ip());

    // Proofs are bound to the device, the user and the epoch.
    expect(
      await codeOf(
        push.register(actor, registration(deviceA, endpointA, proof)),
      ),
    ).toBe('PUSH_AUTHORIZATION_REQUIRED');
    expect(
      await codeOf(
        push.register(otherActor, registration(deviceB, endpoint(), proof)),
      ),
    ).toBe('OK'); // other user has version 0, so no proof is needed at all
    const secret = 'fixture-secret';
    const claims = {
      u: userId,
      b: businessOf.get(userId) as string,
      d: deviceB,
      v: 1,
      exp: Date.now() + 60000,
    };
    expect(
      await codeOf(
        push.register(
          actor,
          registration(
            deviceB,
            endpointB,
            signPushProof(secret, { ...claims, exp: Date.now() - 1 }),
          ),
        ),
      ),
    ).toBe('PUSH_AUTHORIZATION_REQUIRED');
    expect(
      await codeOf(
        push.register(
          actor,
          registration(
            deviceB,
            endpointB,
            signPushProof(secret, { ...claims, v: 0 }),
          ),
        ),
      ),
    ).toBe('PUSH_AUTHORIZATION_REQUIRED');
    expect(
      await codeOf(
        push.register(
          actor,
          registration(
            deviceB,
            endpointB,
            signPushProof(secret, { ...claims, u: otherId }),
          ),
        ),
      ),
    ).toBe('PUSH_AUTHORIZATION_REQUIRED');
    expect(
      await codeOf(
        push.register(
          actor,
          registration(deviceB, endpointB, `${proof.slice(0, -2)}xx`),
        ),
      ),
    ).toBe('PUSH_AUTHORIZATION_REQUIRED');

    // Device B authorizes and registers.
    expect(
      await codeOf(
        push.register(actor, registration(deviceB, endpointB, proof)),
      ),
    ).toBe('OK');
    expect((await push.getStatus(actor, deviceB)).requiresAuthorization).toBe(
      false,
    );
    expect((await push.getStatus(actor, deviceB)).enabled).toBe(true);

    // Device A stays disabled: B's authorization does not transfer, and automatic reconciliation fails.
    expect((await push.getStatus(actor, deviceA)).requiresAuthorization).toBe(
      true,
    );
    expect((await push.getStatus(actor, deviceA)).enabled).toBe(false);
    expect(
      await codeOf(push.register(actor, registration(deviceA, endpointA))),
    ).toBe('PUSH_AUTHORIZATION_REQUIRED');
    expect(
      (
        await prisma.pushSubscription.findUniqueOrThrow({
          where: { userId_deviceId: { userId, deviceId: deviceA } },
        })
      ).enabled,
    ).toBe(false);

    // B can rotate its own endpoint later without another password prompt.
    expect(
      await codeOf(push.register(actor, registration(deviceB, endpoint()))),
    ).toBe('OK');
    // A brand new device can be activated, but only with its own proof.
    const proofC = (await push.authorize(actor, deviceC, newPassword, ip()))
      .proof;
    expect(
      await codeOf(
        push.register(actor, registration(deviceC, endpoint(), proofC)),
      ),
    ).toBe('OK');
    expect(
      await prisma.pushSubscription.count({
        where: { userId, enabled: true },
      }),
    ).toBe(2);
  }, 60000);

  it('limits password attempts to authorize push registration per user', async () => {
    const userId = await createUser('pushlimit', 'BUSINESS');
    const results: Array<string | number> = [];
    for (let i = 0; i < 6; i++)
      results.push(
        await codeOf(
          push.authorize(actorFor(userId), randomUUID(), 'wrong', ip()),
        ),
      );
    expect(results.slice(0, 5)).toEqual(Array(5).fill('PUSH_PASSWORD_INVALID'));
    expect(results[5]).toBe('AUTH_RATE_LIMITED');
  }, 60000);

  it('never leaves an enabled subscription or a usable proof when reset races register or authorize', async () => {
    for (let i = 0; i < 4; i++) {
      const userId = await createUser(`race${i}`, 'BUSINESS');
      const actor = actorFor(userId);
      const device = randomUUID();
      const token = await plantToken(userId);
      const [, registered, authorized] = await Promise.allSettled([
        recovery.reset(token, newPassword),
        push.register(actor, registration(device, endpoint())),
        push.authorize(actor, device, oldPassword, ip()),
      ]);
      expect(
        await prisma.pushSubscription.count({
          where: { userId, enabled: true },
        }),
      ).toBe(0);
      if (authorized.status === 'fulfilled') {
        // A proof minted from the pre-reset epoch must not register anything afterwards.
        expect(
          await codeOf(
            push.register(
              actor,
              registration(randomUUID(), endpoint(), authorized.value.proof),
            ),
          ),
        ).toBe('PUSH_AUTHORIZATION_REQUIRED');
      }
      expect(['fulfilled', 'rejected']).toContain(registered.status);
      expect(
        await prisma.pushSubscription.count({
          where: { userId, enabled: true },
        }),
      ).toBe(0);
    }
  }, 60000);

  it('serializes two simultaneous registrations of one authorized device', async () => {
    const userId = await createUser('twotabs', 'BUSINESS');
    const actor = actorFor(userId);
    await recovery.reset(await plantToken(userId), newPassword);
    const device = randomUUID();
    const sharedEndpoint = endpoint();
    const { proof } = await push.authorize(actor, device, newPassword, ip());
    const results = await Promise.allSettled([
      push.register(actor, registration(device, sharedEndpoint, proof)),
      push.register(actor, registration(device, sharedEndpoint, proof)),
    ]);
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
    const rows = await prisma.pushSubscription.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].enabled).toBe(true);
    expect(rows[0].authorizedSessionVersion).toBe(1);
  }, 60000);

  it('limits recovery attempts across two guard instances and treats email case variants as one identity', async () => {
    const guards = [
      new RecoveryRateLimitGuard(config, db),
      new RecoveryRateLimitGuard(config, db),
    ];
    const contextFor = (action: 'reset' | 'forgot', body: object) => ({
      getHandler: () => handlerFor(action),
      switchToHttp: () => ({
        getRequest: () => ({ ip: ip(), body }),
        getResponse: () => ({ setHeader: () => undefined }),
      }),
    });
    const token = randomBytes(32).toString('base64url');
    const byToken = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        guards[i % 2].canActivate(contextFor('reset', { token }) as never),
      ),
    );
    expect(byToken.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
    expect(byToken.filter((r) => r.status === 'rejected')).toHaveLength(5);

    const variants = [
      'Mixed@Example.test',
      ' mixed@example.TEST',
      'MIXED@example.test',
    ];
    const byEmail: PromiseSettledResult<boolean>[] = [];
    for (let i = 0; i < 10; i++)
      byEmail.push(
        ...(await Promise.allSettled([
          guards[i % 2].canActivate(
            contextFor('forgot', { email: variants[i % 3] }) as never,
          ),
        ])),
      );
    expect(byEmail.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
  }, 30000);

  it('exposes generic HTTP recovery, validates malformed requests and applies size limits without rejecting historical logins', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const httpUser = await createUser('http', 'BUSINESS');
    const deliveredBefore = delivered.length;
    const known = await request(server)
      .post('/auth/forgot-password')
      .send({ email: email('http') });
    const unknown = await request(server)
      .post('/auth/forgot-password')
      .send({ email: email('missing') });
    expect(known.status).toBe(201);
    expect(unknown.status).toBe(201);
    expect(known.body).toEqual(unknown.body);
    await settle(httpUser, 1);
    expect(delivered).toHaveLength(deliveredBefore + 1);
    const invalid = await request(server)
      .post('/auth/reset-password')
      .send({ token: 'invalid', password: newPassword });
    expect(invalid.status).toBe(400);
    const tooLong = await request(server)
      .post('/auth/reset-password')
      .send({
        token: randomBytes(32).toString('base64url'),
        password: 'x'.repeat(2049),
      });
    expect(tooLong.status).toBe(400);
    const registerTooLong = await request(server)
      .post('/auth/register-business')
      .send({
        name: 'n',
        phoneWhatsapp: '1',
        email: email('toolong'),
        password: 'x'.repeat(2049),
      });
    expect(registerTooLong.status).toBe(400);
    // Login accepts any historical length: the DTO never rejects by size.
    const longLogin = await request(server)
      .post('/auth/login')
      .send({ email: email('http'), password: 'x'.repeat(100000) });
    expect(longLogin.status).toBe(401);
    expect(JSON.stringify(longLogin.body)).not.toMatch(
      /longer than|maxLength/i,
    );
  }, 60000);
});
