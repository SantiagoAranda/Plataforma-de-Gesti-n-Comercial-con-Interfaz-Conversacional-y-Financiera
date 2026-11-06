import { createBusinessFixture } from './business-fixtures';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { BusinessesService } from '../src/businesses/businesses.service';
import { PublicService } from '../src/public/public.service';
import { UsersService } from '../src/users/users.service';
import { AuthService } from '../src/auth/auth.service';
import { hashNewPassword } from '../src/auth/password-policy';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

const describeDatabase = process.env.RUN_BUSINESS_NAME_DB_TESTS === '1' ? describe : describe.skip;
describeDatabase('Commercial name persistence in isolated PostgreSQL', () => {
  let prisma: PrismaClient;
  let service: BusinessesService;
  let publicService: PublicService;
  let auth: AuthService;
  const suffix = randomUUID();
  const businesses: any[] = [];
  const users: any[] = [];
  const taxProfiles: any[] = [];
  beforeAll(async () => {
    if (!process.env.SACTEC_TEST_RUN_ID) throw new Error('Explicit isolated test run required before initializing services');
    const raw = process.env.BUSINESS_NAME_TEST_DATABASE_URL;
    if (!raw) throw new Error('Explicit test database URL required');
    const url = new URL(raw);
    if (url.hostname !== '127.0.0.1' || !url.pathname.endsWith('_test')) {
      throw new Error('Only the dedicated local test container is allowed');
    }
    prisma = new PrismaClient({ datasources: { db: { url: raw } } });
    service = new BusinessesService(prisma as any, {} as any);
    publicService = new PublicService(prisma as any, {} as any, {
      getItemsSellabilityBulk: async (_id: string, items: any[]) => items.map(() => ({ sellable: true })),
    } as any, {} as any);
    auth = new AuthService(new UsersService(prisma as any), service, new JwtService({ secret: 'isolated-test-only' }), prisma as any, new ConfigService());
    for (const tag of ['a', 'b']) {
      const business = await createBusinessFixture(prisma, { data: { name: 'TecnoGmaes', slug: `${tag}-${suffix}`, fiscalId: `fiscal-${tag}`, phoneWhatsapp: '000' } });
      businesses.push(business);
      taxProfiles.push(await prisma.businessTaxProfile.create({ data: {
        businessId: business.id, nit: '900000000', tradeName: 'Fiscal identity unchanged',
        email: 'fiscal@example.test', phone: '000', departmentCode: '11',
        municipalityCode: '11001', address: 'Fictitious test address',
      } }));
      users.push(await prisma.user.create({ data: { email: `${tag}-${suffix}@example.test`, password: await hashNewPassword('Test password 1!'), role: 'BUSINESS', businessId: business.id } }));
      await prisma.item.create({ data: { businessId: business.id, name: `Product ${tag}`, price: 10, type: 'PRODUCT' } });
    }
  });
  afterAll(async () => { await prisma?.$disconnect(); });
  it('persists duplicate names with stable identities, isolated public catalogs and fresh login', async () => {
    for (let i = 0; i < 2; i++) {
      const before = businesses[i];
      const result = await service.updateProfile(before.id, users[i].id, { name: 'TecnoGames' });
      expect(result).toMatchObject({ id: before.id, name: 'TecnoGames', slug: before.slug, fiscalId: before.fiscalId });
      const after = await prisma.business.findUniqueOrThrow({ where: { id: before.id } });
      expect({ ...after, name: before.name, updatedAt: before.updatedAt }).toEqual(before);
      expect(await prisma.user.findUnique({ where: { id: users[i].id } })).toEqual(users[i]);
      expect(await prisma.businessTaxProfile.findUnique({ where: { businessId: before.id } })).toEqual(taxProfiles[i]);
      expect((await service.getProfile(before.id)).name).toBe('TecnoGames');
      const catalog = await publicService.listPublicItems(before.slug);
      expect(catalog.business?.name).toBe('TecnoGames');
      expect(catalog.data.map(item => item.name)).toEqual([`Product ${i === 0 ? 'a' : 'b'}`]);
      expect(await auth.login(users[i].email, 'Test password 1!')).toMatchObject({ businessName: 'TecnoGames', businessSlug: before.slug });
    }
    expect(businesses[0].id).not.toBe(businesses[1].id);
    expect(businesses[0].slug).not.toBe(businesses[1].slug);
  });
  it('preserves the footer endpoint and rejects cross-business changes', async () => {
    await expect(service.updateProfile(businesses[1].id, users[0].id, { name: 'Intrusion' })).rejects.toThrow('autorización');
    const footer = await service.updateStoreFooterSettings(businesses[0].id, { description: 'Footer remains', email: null, phones: [], socials: [], showLogo: false });
    expect(footer.description).toBe('Footer remains');
    expect((await publicService.listPublicItems(businesses[0].slug)).business?.storeFooterSettings).toMatchObject({ description: 'Footer remains' });
    expect(await prisma.businessTaxProfile.count({ where: { businessId: { in: businesses.map(b => b.id) } } })).toBe(2);
  });
});
