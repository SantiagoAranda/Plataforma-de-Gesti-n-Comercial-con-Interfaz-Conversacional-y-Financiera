import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import { RecoveryRateLimitGuard } from './recovery-rate-limit.guard';
import { PasswordRecoveryService } from './password-recovery.service';
import { BusinessesService } from '../businesses/businesses.service';

describe('Public slug HTTP contract', () => {
  let app: INestApplication;
  const lookup = jest.fn().mockResolvedValue(null);
  const businesses = new BusinessesService({ businessSlug: { findFirst: lookup } } as any, {} as any);
  const registerBusiness = jest.fn().mockResolvedValue({ businessSlug: 'custom-slug' });
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { registerBusiness, businessSlugAvailability: query => businesses.businessSlugAvailability(query) } },
        { provide: PasswordRecoveryService, useValue: {} },
      ],
    }).overrideGuard(AuthRateLimitGuard).useValue({ canActivate: () => true })
      .overrideGuard(RecoveryRateLimitGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(async () => { await app?.close(); });
  it('responds publicly without owner data or cache, supports suggestions', async () => {
    const response = await request(app.getHttpServer()).get('/auth/business-slug-availability?slug=custom-slug').expect(200);
    expect(response.body).toEqual({ mode: 'custom', slug: 'custom-slug', available: true });
    expect(response.headers['cache-control']).toBe('no-store');
    const suggestion = await request(app.getHttpServer()).get('/auth/business-slug-availability?name=TecnoGames').expect(200);
    expect(suggestion.body.slug).toBe('tecnogames');
  });
  it.each(['', '?slug=admin', '?slug=UPPER', '?slug=abc&name=abc', '?slug=abc&businessId=other', '?slug=abc&slug=def'])('rejects invalid query %s', async query => {
    await request(app.getHttpServer()).get(`/auth/business-slug-availability${query}`).expect(400);
  });
  it('rejects null and protected body fields before registration', async () => {
    const body = { name: 'Name', email: 'fixture@example.test', password: 'Password1!', phoneWhatsapp: '000' };
    await request(app.getHttpServer()).post('/auth/register-business').send({ ...body, slug: null }).expect(400);
    await request(app.getHttpServer()).post('/auth/register-business').send({ ...body, businessId: 'other' }).expect(400);
    expect(registerBusiness).not.toHaveBeenCalled();
    await request(app.getHttpServer()).post('/auth/register-business').send(body).expect(201);
    await request(app.getHttpServer()).post('/auth/register-business').send({ ...body, slug: 'custom-slug' }).expect(201);
    expect(registerBusiness.mock.calls[1][0].slug).toBe('custom-slug');
  });
});
