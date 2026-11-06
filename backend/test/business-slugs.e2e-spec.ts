import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BusinessesService } from '../src/businesses/businesses.service';
import { AuthService } from '../src/auth/auth.service';
import { UsersService } from '../src/users/users.service';
import { PublicService } from '../src/public/public.service';
import { parsePayrollAccountingMappingTemplate } from '../src/common/payroll/payroll-accounting-mapping-template';
import { assertIsolatedBusinessFixtures, createBusinessFixture } from './business-fixtures';

const describeDatabase = process.env.RUN_BUSINESS_SLUG_DB_TESTS === '1' ? describe : describe.skip;
describeDatabase('Permanent slug registry (isolated PostgreSQL)', () => {
  let prisma: PrismaClient;
  let service: BusinessesService;
  let auth: AuthService;
  let users: UsersService;
  const suffix = randomUUID();
  const input = (tag: string, name = `Same ${suffix.slice(0, 16)}`) => ({ name, email: `${tag}-${suffix}@example.test`, password: 'Fixture password 1!', phoneWhatsapp: '000' });
  beforeAll(async () => {
    if (!process.env.SACTEC_TEST_RUN_ID) throw new Error('Explicit isolated test run required before initializing services');
    const raw = process.env.BUSINESS_SLUG_TEST_DATABASE_URL;
    if (!raw) throw new Error('Explicit BUSINESS_SLUG_TEST_DATABASE_URL required');
    const url = new URL(raw);
    if (url.hostname !== '127.0.0.1' || url.port !== '55441' || url.pathname !== '/sactec_slug_stage2_test') throw new Error('Wrong isolated target');
    prisma = new PrismaClient({ datasources: { db: { url: raw } } });
    await assertIsolatedBusinessFixtures(prisma);
    // Only fictitious reference data in the marked database; do not run the general seed.
    const rows = parsePayrollAccountingMappingTemplate(fs.readFileSync(path.resolve(__dirname, '../prisma/seed-data/payroll_accounting_mapping.csv'), 'utf8'));
    for (const row of rows) {
      const code = row.account_code;
      await prisma.pucClase.upsert({ where: { code: code.slice(0, 1) }, update: {}, create: { code: code.slice(0, 1), name: 'Test class' } });
      await prisma.pucGrupo.upsert({ where: { code: code.slice(0, 2) }, update: {}, create: { code: code.slice(0, 2), name: 'Test group', claseCode: code.slice(0, 1) } });
      await prisma.pucCuenta.upsert({ where: { code: code.slice(0, 4) }, update: {}, create: { code: code.slice(0, 4), name: 'Test account', grupoCode: code.slice(0, 2) } });
      if (code.length === 6) await prisma.pucSubcuenta.upsert({ where: { code }, update: {}, create: { code, name: 'Test subaccount', cuentaCode: code.slice(0, 4) } });
    }
    service = new BusinessesService(prisma as any, {} as any);
    users = new UsersService(prisma as any);
    auth = new AuthService(users, service, new JwtService({ secret: 'isolated-only' }), prisma as any, new ConfigService({ AUTH_PASSWORD_POLICY_V2_ENABLED: 'true', AUTH_RATE_LIMIT_ENABLED: 'true' }));
  }, 30000);
  afterAll(async () => { jest.restoreAllMocks(); await prisma?.$disconnect(); });

  it('preserves the exact legacy backfill', async () => {
    const expected = ['tecnogames-1', 'ADMIN', 'MiTienda', 'mitienda', '', 'bad slug'];
    for (let i = 0; i < expected.length; i++) {
      const id = `legacy-${i + 1}`;
      expect((await prisma.business.findUniqueOrThrow({ where: { id } })).slug).toBe(expected[i]);
      expect((await prisma.businessSlug.findUniqueOrThrow({ where: { slug: expected[i] } })).businessId).toBe(id);
    }
  });

  it('registers exact custom slugs, serves their public store, and logs in with the assigned slug', async () => {
    const slug = `custom-${suffix}`;
    const dto = { ...input('custom'), slug };
    expect(await service.businessSlugAvailability({ slug })).toEqual({ mode: 'custom', slug, available: true });
    await expect(auth.registerBusiness(dto)).resolves.toMatchObject({ businessSlug: slug });
    const business = await prisma.business.findUniqueOrThrow({ where: { slug }, include: { slugs: true } });
    expect(business.slugs).toEqual([expect.objectContaining({ slug, businessId: business.id })]);
    const publicService = new PublicService(prisma as any, {} as any, { getItemsSellabilityBulk: async () => [] } as any, {} as any);
    expect((await publicService.listPublicItems(slug)).business?.name).toBe(dto.name);
    await expect(auth.login(dto.email, dto.password)).resolves.toMatchObject({ businessSlug: slug });
    await expect(auth.registerBusiness({ ...input('taken'), slug })).rejects.toMatchObject({ status: 409 });
    expect(await prisma.user.count({ where: { email: input('taken').email } })).toBe(0);
    const historical = `historic-${suffix}`;
    await prisma.businessSlug.create({ data: { slug: historical.toUpperCase(), businessId: business.id } });
    await expect(auth.registerBusiness({ ...input('history-custom'), slug: historical })).rejects.toMatchObject({ status: 409 });
  }, 30000);

  it('forces a custom collision and rolls back the losing account without substitution', async () => {
    const slug = `race-${suffix}`;
    let arrivals = 0;
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const lookup = service.isBusinessSlugAvailable.bind(service);
    const barrier = jest.spyOn(service, 'isBusinessSlugAvailable').mockImplementation(async (candidate, tx) => {
      const available = await lookup(candidate, tx);
      if (candidate === slug && arrivals < 2) {
        arrivals++;
        if (arrivals === 2) release();
        await gate;
      }
      return available;
    });
    try {
      const outcomes = await Promise.allSettled(['race-a', 'race-b'].map(tag => auth.registerBusiness({ ...input(tag, `Custom race ${suffix}`), slug })));
      expect(outcomes.filter(r => r.status === 'fulfilled')).toHaveLength(1);
      expect(outcomes.find(r => r.status === 'rejected')).toMatchObject({ reason: { status: 409 } });
      const businesses = await prisma.business.findMany({ where: { name: `Custom race ${suffix}` }, include: { slugs: true, user: true } });
      expect(businesses).toHaveLength(1);
      expect(businesses[0].slug).toBe(slug);
      expect(businesses[0].slugs).toHaveLength(1);
      expect(businesses[0].user).not.toBeNull();
    } finally { barrier.mockRestore(); }
  }, 30000);

  it('rolls back a custom reservation after an intermediate failure', async () => {
    const slug = `fail-${suffix}`;
    const dto = { ...input('custom-fail'), slug };
    const failure = jest.spyOn(users, 'createBusinessUser').mockRejectedValueOnce(new Error('injected custom failure'));
    try { await expect(auth.registerBusiness(dto)).rejects.toThrow('injected custom failure'); }
    finally { failure.mockRestore(); }
    expect(await prisma.business.findUnique({ where: { slug } })).toBeNull();
    expect(await prisma.businessSlug.findUnique({ where: { slug } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { email: dto.email } })).toBeNull();
  });

  it('forces both transactions to select the same candidate, then retries with -2', async () => {
    let arrivals = 0;
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const create = service.createBusinessInTransaction.bind(service);
    const barrier = jest.spyOn(service, 'createBusinessInTransaction').mockImplementation(async (tx, data) => {
      const lookup = tx.businessSlug.findFirst.bind(tx.businessSlug);
      const wrapped = new Proxy(tx, { get(target, key) {
        if (key !== 'businessSlug') return Reflect.get(target, key);
        return new Proxy(tx.businessSlug, { get(delegate, method) {
          if (method !== 'findFirst') return Reflect.get(delegate, method);
          return async (args: any) => {
            const result = await lookup(args);
            if (arrivals < 2) {
              arrivals++;
              if (arrivals === 2) release();
              await gate;
            }
            return result;
          };
        } });
      } });
      return create(wrapped, data);
    });
    try {
      const results = await Promise.all([auth.registerBusiness(input('one')), auth.registerBusiness(input('two'))]);
      const slugs = results.map(r => 'businessSlug' in r ? r.businessSlug! : '').sort();
      expect(slugs[1]).toBe(`${slugs[0]}-2`);
      expect(barrier.mock.calls.length).toBeGreaterThanOrEqual(3);
      const businesses = await prisma.business.findMany({ where: { slug: { in: slugs } }, include: { slugs: true, user: true, payrollAccountingMappings: true } });
      expect(businesses).toHaveLength(2);
      for (const b of businesses) {
        expect(b.slugs.map(r => r.slug)).toEqual([b.slug]);
        expect(b.user).not.toBeNull();
        expect(b.payrollAccountingMappings.length).toBeGreaterThan(0);
      }
    } finally { barrier.mockRestore(); }
  }, 30000);

  it('reserves historical and uppercase identifiers, and keeps reservations when inactive', async () => {
    const owner = await createBusinessFixture(prisma, { data: { name: 'History', slug: `history-${suffix}`, fiscalId: '', phoneWhatsapp: '000' } });
    const historical = `archive-${suffix}`;
    await prisma.businessSlug.create({ data: { slug: historical, businessId: owner.id } });
    await service.inactivateBusiness(owner.id);
    const result = await service.createBusiness({ name: historical, phoneWhatsapp: '000' });
    expect(result.slug).toBe(`${historical}-2`);
    const upper = `CASE-${suffix}`;
    await prisma.businessSlug.create({ data: { slug: upper, businessId: owner.id } });
    expect((await service.createBusiness({ name: upper, phoneWhatsapp: '000' })).slug).toBe(`${upper.toLowerCase()}-2`);
    await expect(prisma.business.delete({ where: { id: owner.id } })).rejects.toMatchObject({ code: 'P2003' });
    await service.activateBusiness(owner.id);
    expect(await prisma.businessSlug.count({ where: { businessId: owner.id } })).toBe(3);
    await expect(prisma.businessSlug.create({ data: { slug: historical, businessId: result.id } })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rolls back business, reservation and mappings if user creation fails', async () => {
    const dto = input('rollback', `Rollback ${suffix}`);
    const before = await prisma.businessSlug.count();
    const failure = jest.spyOn(users, 'createBusinessUser').mockRejectedValueOnce(new Error('injected failure'));
    try { await expect(auth.registerBusiness(dto)).rejects.toThrow('injected failure'); }
    finally { failure.mockRestore(); }
    expect(await prisma.business.count({ where: { name: dto.name } })).toBe(0);
    expect(await prisma.businessSlug.count()).toBe(before);
    expect(await prisma.user.count({ where: { email: dto.email } })).toBe(0);
  });

  it('racing identical emails create only one complete account', async () => {
    const dto = input('duplicate', `Email race ${suffix}`);
    const outcomes = await Promise.allSettled([auth.registerBusiness(dto), auth.registerBusiness(dto)]);
    expect(outcomes.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const businesses = await prisma.business.findMany({ where: { name: dto.name }, include: { slugs: true } });
    expect(businesses).toHaveLength(1);
    expect(businesses[0].slugs).toHaveLength(1);
  });
});
