import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { BusinessesController } from './businesses.controller';
import { BusinessesService } from './businesses.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { BusinessActiveGuard } from '../common/guards/business-active.guard';

describe('BusinessesController ADMIN Factus authorization', () => {
  let app: INestApplication;
  const updateFactusEntitlement = jest.fn().mockResolvedValue({ factus: { enabled: true, configured: false, environment: 'sandbox' } });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [BusinessesController],
      providers: [RolesGuard, { provide: BusinessesService, useValue: { updateFactusEntitlement } }],
    })
      .overrideGuard(JwtAuthGuard).useValue({
        canActivate(context: any) {
          const req = context.switchToHttp().getRequest();
          if (!req.headers['x-test-role']) throw new UnauthorizedException();
          req.user = { role: req.headers['x-test-role'], businessId: 'jwt-business' };
          return true;
        },
      })
      .overrideGuard(BusinessActiveGuard).useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });
  beforeEach(() => updateFactusEntitlement.mockClear());
  afterAll(async () => { await app?.close(); });

  it('allows ADMIN and uses the route business instead of the JWT tenant', async () => {
    await request(app.getHttpServer()).patch('/businesses/admin/selected-business/factus')
      .set('x-test-role', 'ADMIN').send({ enabled: true }).expect(200);
    expect(updateFactusEntitlement).toHaveBeenCalledWith('selected-business', { enabled: true });
  });
  it('rejects BUSINESS through the real RolesGuard', async () => {
    await request(app.getHttpServer()).patch('/businesses/admin/selected-business/factus')
      .set('x-test-role', 'BUSINESS').send({ enabled: true }).expect(403);
    expect(updateFactusEntitlement).not.toHaveBeenCalled();
  });
  it('requires authentication', async () => {
    await request(app.getHttpServer()).patch('/businesses/admin/selected-business/factus')
      .send({ enabled: true }).expect(401);
    expect(updateFactusEntitlement).not.toHaveBeenCalled();
  });
});
