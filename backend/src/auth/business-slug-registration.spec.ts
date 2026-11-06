import { ValidationPipe } from '@nestjs/common';
import { RegisterBusinessDto } from './dto/register-business.dto';
import { BusinessesService } from '../businesses/businesses.service';
import { retryBusinessSlugTransaction } from '../common/utils/business-slug';

describe('Registration slug contract', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const body = { name: 'Repeated name', phoneWhatsapp: '000', email: 'test@example.test', password: 'password' };
  const validate = (value: object) => pipe.transform(value, { type: 'body', metatype: RegisterBusinessDto });
  it.each([null, '', 'ab', 'Aaa', ' has-space ', 'foo--bar', '-foo', 'foo-', 'ábc', 'a'.repeat(51), 'admin', 123])('rejects %p', async slug => {
    await expect(validate({ ...body, slug })).rejects.toMatchObject({ status: 400 });
  });
  it('accepts old clients and exact custom slugs, rejects protected fields', async () => {
    await expect(validate(body)).resolves.toMatchObject(body);
    await expect(validate({ ...body, slug: 'tecnogames-sf' })).resolves.toMatchObject({ slug: 'tecnogames-sf' });
    await expect(validate({ ...body, businessId: 'other' })).rejects.toMatchObject({ status: 400 });
  });
  it('returns 409 immediately for custom races, without retrying a different slug', async () => {
    const operation = jest.fn().mockRejectedValue({ code: 'P2002', meta: { target: ['slug'], modelName: 'BusinessSlug' } });
    await expect(retryBusinessSlugTransaction(operation, 'exact-slug')).rejects.toMatchObject({ status: 409 });
    expect(operation).toHaveBeenCalledTimes(1);
  });
  it('availability exposes only slug and availability and queries case-insensitively', async () => {
    const prisma = { businessSlug: { findFirst: jest.fn().mockResolvedValue({ slug: 'Historical' }) } };
    const service = new BusinessesService(prisma as any, {} as any);
    await expect(service.businessSlugAvailability({ slug: 'historical' })).resolves.toEqual({ mode: 'custom', slug: 'historical', available: false });
    expect(prisma.businessSlug.findFirst).toHaveBeenCalledWith({ where: { slug: { equals: 'historical', mode: 'insensitive' } }, select: { slug: true } });
    await expect(service.businessSlugAvailability({ name: 'x', slug: 'abc' })).rejects.toMatchObject({ status: 400 });
    await expect(service.businessSlugAvailability({})).rejects.toMatchObject({ status: 400 });
    prisma.businessSlug.findFirst.mockResolvedValueOnce({ slug: 'abc' }).mockResolvedValueOnce(null as any);
    await expect(service.businessSlugAvailability({ name: 'ABC' })).resolves.toEqual({ mode: 'automatic', slug: 'abc-2', available: true });
  });
});
