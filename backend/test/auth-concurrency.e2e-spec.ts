import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { AuthService } from '../src/auth/auth.service';
import { AuthRateLimitGuard } from '../src/auth/auth-rate-limit.guard';
import { BusinessesService } from '../src/businesses/businesses.service';
import { UsersService } from '../src/users/users.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { parsePayrollAccountingMappingTemplate } from '../src/common/payroll/payroll-accounting-mapping-template';

// Never falls back to DATABASE_URL or loads application configuration.
const enabled = process.env.RUN_AUTH_DB_TESTS === '1';
const describeDatabase = enabled ? describe : describe.skip;

describeDatabase(
  'Auth PostgreSQL atomicity and distributed counters (isolated database only)',
  () => {
    let prisma: PrismaClient;
    let auth: AuthService;
    let users: UsersService;
    let businesses: BusinessesService;
    let expectedMappingCount: number;
    const suffix = randomUUID();
    const prefix = `Auth fixture ${suffix}`;
    const dto = (tag: string) => ({
      name: `${prefix} ${tag}`,
      email: `${tag}-${suffix}@example.test`,
      password: 'Abc123',
      phoneWhatsapp: '000',
    });

    beforeAll(async () => {
      const raw = process.env.AUTH_TEST_DATABASE_URL;
      if (!raw) throw new Error('AUTH_TEST_DATABASE_URL is required');
      const url = new URL(raw);
      if (
        !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
        !url.pathname.endsWith('_test') ||
        url.searchParams.get('schema') !== 'auth_stage1_test'
      ) {
        throw new Error(
          'Use a local *_test database and schema=auth_stage1_test; production URLs are forbidden',
        );
      }
      prisma = new PrismaClient({ datasources: { db: { url: raw } } });
      await prisma.$connect();
      const rows = parsePayrollAccountingMappingTemplate(
        fs.readFileSync(
          path.resolve(
            __dirname,
            '../prisma/seed-data/payroll_accounting_mapping.csv',
          ),
          'utf8',
        ),
      );
      expectedMappingCount = rows.length;
      for (const row of rows) {
        const code = row.account_code;
        await prisma.pucClase.upsert({
          where: { code: code.slice(0, 1) },
          update: {},
          create: { code: code.slice(0, 1), name: 'Test class' },
        });
        await prisma.pucGrupo.upsert({
          where: { code: code.slice(0, 2) },
          update: {},
          create: {
            code: code.slice(0, 2),
            name: 'Test group',
            claseCode: code.slice(0, 1),
          },
        });
        await prisma.pucCuenta.upsert({
          where: { code: code.slice(0, 4) },
          update: {},
          create: {
            code: code.slice(0, 4),
            name: 'Test account',
            grupoCode: code.slice(0, 2),
          },
        });
        if (code.length === 6)
          await prisma.pucSubcuenta.upsert({
            where: { code },
            update: {},
            create: {
              code,
              name: 'Test subaccount',
              cuentaCode: code.slice(0, 4),
            },
          });
      }
      users = new UsersService(prisma as PrismaService);
      businesses = new BusinessesService(prisma as PrismaService, {} as never);
      auth = new AuthService(
        users,
        businesses,
        new JwtService({ secret: 'isolated-test-only' }),
        prisma as PrismaService,
      );
    }, 30000);

    afterAll(async () => {
      if (!prisma) return;
      try {
        await prisma.user.deleteMany({
          where: { email: { endsWith: `${suffix}@example.test` } },
        });
        await prisma.business.deleteMany({
          where: { name: { startsWith: prefix } },
        });
      } finally {
        await prisma.$disconnect();
      }
    });

    it('concurrent identical email creates exactly one business and complete mappings', async () => {
      const input = dto('same-email');
      const results = await Promise.allSettled([
        auth.registerBusiness(input),
        auth.registerBusiness(input),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(await prisma.user.count({ where: { email: input.email } })).toBe(
        1,
      );
      expect(await prisma.business.count({ where: { name: input.name } })).toBe(
        1,
      );
      expect(
        await prisma.payrollAccountingMapping.count({
          where: { business: { name: input.name } },
        }),
      ).toBe(expectedMappingCount);
    }, 30000);

    it('concurrent different emails with same slug both succeed without duplicate slug', async () => {
      const first = dto('slug-one');
      const second = { ...dto('slug-two'), name: first.name };
      const results = await Promise.all([
        auth.registerBusiness(first),
        auth.registerBusiness(second),
      ]);
      expect(results).toHaveLength(2);
      const rows = await prisma.business.findMany({
        where: { name: first.name },
      });
      expect(new Set(rows.map((row) => row.slug)).size).toBe(2);
    }, 30000);

    it('failure after accounting writes rolls back business, mappings and user', async () => {
      const input = dto('rollback');
      const fail = jest
        .spyOn(users, 'createBusinessUser')
        .mockRejectedValueOnce(new Error('injected user failure'));
      try {
        await expect(auth.registerBusiness(input)).rejects.toThrow(
          'injected user failure',
        );
      } finally {
        fail.mockRestore();
      }
      expect(await prisma.business.count({ where: { name: input.name } })).toBe(
        0,
      );
      expect(await prisma.user.count({ where: { email: input.email } })).toBe(
        0,
      );
      expect(
        await prisma.payrollAccountingMapping.count({
          where: { business: { name: input.name } },
        }),
      ).toBe(0);
    });

    it('failure during accounting initialization rolls back its first write', async () => {
      const input = dto('accounting-rollback');
      const accounting = businesses as unknown as {
        assertPucAccountExists(
          tx: Prisma.TransactionClient,
          code: string,
        ): Promise<void>;
      };
      const check = jest
        .spyOn(accounting, 'assertPucAccountExists')
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('injected accounting failure'));
      const createUser = jest.spyOn(users, 'createBusinessUser');
      try {
        await expect(auth.registerBusiness(input)).rejects.toThrow(
          'injected accounting failure',
        );
        expect(check).toHaveBeenCalledTimes(2);
        expect(createUser).not.toHaveBeenCalled();
      } finally {
        check.mockRestore();
        createUser.mockRestore();
      }
      expect(await prisma.business.count({ where: { name: input.name } })).toBe(
        0,
      );
      expect(await prisma.user.count({ where: { email: input.email } })).toBe(
        0,
      );
      expect(
        await prisma.payrollAccountingMapping.count({
          where: { business: { name: input.name } },
        }),
      ).toBe(0);
    });

    it('two instances enforce a shared atomic limit under parallel requests', async () => {
      const config = new ConfigService({
        JWT_SECRET: suffix,
        AUTH_RATE_LIMIT_ENABLED: 'true',
        AUTH_CLIENT_IP_MODE: 'direct',
      });
      const guards = [
        new AuthRateLimitGuard(config, prisma as PrismaService),
        new AuthRateLimitGuard(config, prisma as PrismaService),
      ];
      const context = {
        getHandler: () => function login() {},
        switchToHttp: () => ({
          getRequest: () => ({
            ip: '192.0.2.123',
            body: { email: dto('limit').email },
          }),
          getResponse: () => ({ setHeader: () => undefined }),
        }),
      };
      const results = await Promise.allSettled(
        Array.from({ length: 20 }, (_, i) =>
          guards[i % 2].canActivate(context as never),
        ),
      );
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(10);
      for (const result of results)
        if (result.status === 'rejected')
          expect((result.reason as { status: number }).status).toBe(429);
    });
  },
);
