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

  describe('Stage 4: single slug change', () => {
    const publicService = () => new PublicService(prisma as any, {} as any, { getItemsSellabilityBulk: async () => [] } as any, {} as any);
    const owner = async (tag: string) => {
      const result = await auth.registerBusiness(input(`change-${tag}`, `Change ${tag} ${suffix}`)) as { businessSlug: string };
      const business = await prisma.business.update({
        where: { slug: result.businessSlug }, data: { fiscalId: `tax-${tag}-${suffix}` }, include: { user: true },
      });
      expect(business.slugChangedAt).toBeNull();
      return { ...business, userId: business.user!.id };
    };
    const change = (b: { id: string; userId: string }, slug: unknown) => service.changeBusinessSlug(b.id, b.userId, slug);

    it('changes once, keeps the old alias for the same business and preserves name and fiscal data', async () => {
      const b = await owner('first');
      const next = `chg-${suffix}`;
      const profile = await change(b, next);
      expect(profile).toMatchObject({ id: b.id, slug: next, name: b.name, fiscalId: b.fiscalId });
      expect(profile.slugChangedAt).toBeInstanceOf(Date);
      const stored = await prisma.business.findUniqueOrThrow({ where: { id: b.id }, include: { slugs: true } });
      expect(stored.slugChangedAt).toEqual(profile.slugChangedAt);
      expect(stored.slugs.map(r => r.slug).sort()).toEqual([b.slug, next].sort());
      expect(stored.slugs.every(r => r.businessId === b.id)).toBe(true);

      await expect(change(b, `chg2-${suffix}`)).rejects.toMatchObject({ status: 409, response: { code: 'BUSINESS_SLUG_CHANGE_USED' } });
      await expect(change(b, b.slug)).rejects.toMatchObject({ status: 409 });
      expect((await prisma.business.findUniqueOrThrow({ where: { id: b.id } })).slug).toBe(next);
      // A new login receives the current slug, which the frontend stores as businessSlug.
      await expect(auth.login(input('change-first').email, 'Fixture password 1!')).resolves.toMatchObject({ businessSlug: next });
      // The previous slug stays reserved: neither registration nor another change may take it.
      const other = await owner('takes-old');
      await expect(change(other, b.slug)).rejects.toMatchObject({ status: 409, response: { code: 'BUSINESS_SLUG_TAKEN' } });
      await expect(auth.registerBusiness({ ...input('old-slug'), slug: b.slug })).rejects.toMatchObject({ status: 409 });

      const store = publicService();
      expect(await store.resolveStore(b.slug)).toMatchObject({ slug: next, name: b.name });
      expect(await store.resolveStore(next)).toMatchObject({ slug: next });
      // Order, reservation, availability and fiscal endpoints all resolve through findActiveBusiness.
      expect((await (store as any).findActiveBusiness(b.slug)).id).toBe(b.id);
      expect((await store.listPublicItems(b.slug)).business?.slug).toBe(next);
      expect(await store.resolveStore(`missing-${suffix}`)).toBeNull();
      await service.inactivateBusiness(b.id);
      expect(await store.resolveStore(b.slug)).toBeNull();
      expect(await store.resolveStore(next)).toBeNull();
      await expect((store as any).findActiveBusiness(b.slug)).rejects.toMatchObject({ status: 400 });
      await service.activateBusiness(b.id);
    }, 30000);

    it('rejects occupied, historical, invalid, reserved, foreign and inactive requests without consuming the change', async () => {
      const b = await owner('reject');
      const other = await owner('reject-other');
      await expect(change(b, other.slug)).rejects.toMatchObject({ status: 409, response: { code: 'BUSINESS_SLUG_TAKEN' } });
      await prisma.businessSlug.create({ data: { slug: `HIST-${suffix}`, businessId: other.id } });
      await expect(change(b, `hist-${suffix}`)).rejects.toMatchObject({ status: 409 });
      for (const invalid of ['AB', 'foo--bar', ' foo ', '', 'x'.repeat(51), 5]) {
        await expect(change(b, invalid)).rejects.toMatchObject({ status: 400 });
      }
      await expect(change(b, 'admin')).rejects.toMatchObject({ status: 400, message: expect.stringContaining('reservado') });
      await expect(service.changeBusinessSlug(b.id, other.userId, `foreign-${suffix}`)).rejects.toMatchObject({ status: 403 });
      await service.inactivateBusiness(b.id);
      await expect(change(b, `inactive-${suffix}`)).rejects.toMatchObject({ status: 403 });
      await service.activateBusiness(b.id);
      const stored = await prisma.business.findUniqueOrThrow({ where: { id: b.id }, include: { slugs: true } });
      expect(stored.slugChangedAt).toBeNull();
      expect(stored.slugs.map(r => r.slug)).toEqual([b.slug]);
      await expect(change(b, `after-reject-${suffix}`)).resolves.toMatchObject({ slug: `after-reject-${suffix}` });
    }, 30000);

    it('lets only one of two concurrent changes of the same business win', async () => {
      const b = await owner('same-race');
      const outcomes = await Promise.allSettled([change(b, `race-one-${suffix}`), change(b, `race-two-${suffix}`)]);
      expect(outcomes.filter(r => r.status === 'fulfilled')).toHaveLength(1);
      expect(outcomes.find(r => r.status === 'rejected')).toMatchObject({ reason: { status: 409 } });
      const stored = await prisma.business.findUniqueOrThrow({ where: { id: b.id }, include: { slugs: true } });
      expect(stored.slugs).toHaveLength(2);
      expect(stored.slugs.map(r => r.slug)).toContain(stored.slug);
    }, 30000);

    it('gives a contested slug to exactly one of two businesses', async () => {
      const [a, b] = [await owner('pair-a'), await owner('pair-b')];
      const slug = `contested-${suffix}`;
      let arrivals = 0;
      let release!: () => void;
      const gate = new Promise<void>(r => { release = r; });
      const lookup = service.isBusinessSlugAvailable.bind(service);
      const barrier = jest.spyOn(service, 'isBusinessSlugAvailable').mockImplementation(async (candidate, tx) => {
        const available = await lookup(candidate, tx);
        if (candidate === slug && arrivals < 2) { arrivals++; if (arrivals === 2) release(); await gate; }
        return available;
      });
      try {
        const outcomes = await Promise.allSettled([change(a, slug), change(b, slug)]);
        expect(outcomes.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        expect(outcomes.find(r => r.status === 'rejected')).toMatchObject({ reason: { status: 409 } });
      } finally { barrier.mockRestore(); }
      const winners = await prisma.business.findMany({ where: { id: { in: [a.id, b.id] } } });
      expect(winners.filter(w => w.slug === slug)).toHaveLength(1);
      const loser = winners.find(w => w.slug !== slug)!;
      expect(loser.slugChangedAt).toBeNull();
      expect((await prisma.businessSlug.findUniqueOrThrow({ where: { slug } })).businessId).not.toBe(loser.id);
    }, 30000);

    it('rolls back the slug and the used change if the reservation fails', async () => {
      const b = await owner('rollback');
      const slug = `rollback-${suffix}`;
      const transaction = prisma.$transaction.bind(prisma) as any;
      const failing = jest.spyOn(prisma, '$transaction').mockImplementationOnce(((fn: any) => transaction((tx: any) => fn(new Proxy(tx, {
        get(target, key) {
          if (key !== 'businessSlug') return Reflect.get(target, key);
          return {
            findFirst: target.businessSlug.findFirst.bind(target.businessSlug),
            create: async () => { throw new Error('injected reservation failure'); },
          };
        },
      })))) as any);
      try { await expect(change(b, slug)).rejects.toThrow('injected reservation failure'); }
      finally { failing.mockRestore(); }
      const stored = await prisma.business.findUniqueOrThrow({ where: { id: b.id } });
      expect(stored).toMatchObject({ slug: b.slug, slugChangedAt: null, name: b.name, fiscalId: b.fiscalId });
      expect(await prisma.businessSlug.findUnique({ where: { slug } })).toBeNull();
    }, 30000);
  });
});
