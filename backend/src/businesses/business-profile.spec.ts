import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { BusinessesController } from './businesses.controller';
import { BusinessesService } from './businesses.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

describe('Business commercial name HTTP contract', () => {
  let app: INestApplication;
  let profile: any;
  const prisma = {
    user: { findUnique: jest.fn() },
    business: { findUnique: jest.fn(), update: jest.fn() },
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [BusinessesController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: BusinessesService, useValue: new BusinessesService(prisma as any, {} as any) },
      ],
    }).overrideGuard(JwtAuthGuard).useValue({ canActivate(context: any) {
      const req = context.switchToHttp().getRequest();
      if (!req.headers.authorization) throw new UnauthorizedException();
      req.user = { userId: 'user-a', businessId: req.headers['x-no-business'] ? null : 'a' };
      return true;
    } }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  beforeEach(() => {
    jest.resetAllMocks();
    profile = { id: 'a', name: 'TecnoGmaes', slug: 'original-slug', status: 'ACTIVE', fiscalId: 'unchanged' };
    prisma.user.findUnique.mockResolvedValue({ businessId: 'a' });
    prisma.business.findUnique.mockImplementation(async () => ({ ...profile }));
    prisma.business.update.mockImplementation(async ({ data }) => Object.assign(profile, data));
  });
  afterAll(() => app.close());
  const patch = (body: unknown) => request(app.getHttpServer()).patch('/businesses/profile').set('Authorization', 'test').send(body as any);

  it('persists normalized name and returns the database profile without changing identity', async () => {
    const response = await patch({ name: '  TecnoGames \t Shop  ' }).expect(200);
    expect(response.body).toMatchObject({ name: 'TecnoGames Shop', slug: 'original-slug', fiscalId: 'unchanged' });
    expect(prisma.business.update).toHaveBeenCalledWith({ where: { id: 'a' }, data: { name: 'TecnoGames Shop' } });
  });
  it.each([{}, { name: '' }, { name: ' \n ' }, { name: null }, { name: 123 }, { name: [] }, { name: {} }, { name: 'a'.repeat(81) }, { name: 'ok', businessId: 'b' }, { name: 'ok', slug: 'new' }])('rejects invalid payload %j', async body => {
    await patch(body).expect(400);
    expect(prisma.business.update).not.toHaveBeenCalled();
  });
  it.each(['a', 'a'.repeat(80), '😀'.repeat(80)])('accepts normalized boundary length', async name => {
    await patch({ name: ` ${name} ` }).expect(200);
    expect(profile.name).toBe(name);
  });
  it('rejects anonymous requests', async () => {
    await request(app.getHttpServer()).patch('/businesses/profile').send({ name: 'New' }).expect(401);
  });
  it('rejects a session without a business', async () => {
    await patch({ name: 'New' }).set('x-no-business', '1').expect(403);
  });
  it('rejects changed membership', async () => {
    prisma.user.findUnique.mockResolvedValue({ businessId: 'b' });
    await patch({ name: 'New' }).expect(403);
    expect(prisma.business.update).not.toHaveBeenCalled();
  });
  it('rejects inactive businesses through the existing guard', async () => {
    profile.status = 'INACTIVE';
    await patch({ name: 'New' }).expect(403);
  });
  it('maps deletion during update to 404', async () => {
    prisma.business.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('missing', { code: 'P2025', clientVersion: '6' }));
    await patch({ name: 'New' }).expect(404);
  });
});
