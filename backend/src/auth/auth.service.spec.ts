import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { BusinessesService } from '../businesses/businesses.service';
import { PrismaService } from '../prisma/prisma.service';

describe('Auth compatibility and registration', () => {
  const dto = {
    name: 'Fictitious',
    email: 'fixture@example.test',
    password: 'Abc123',
    phoneWhatsapp: '000',
  };
  const business = {
    id: 'business-fixture',
    status: 'ACTIVE',
    name: dto.name,
    slug: 'fixture',
  };
  type UserData = { email: string; password: string; businessId: string };
  let users: {
    findByEmail: jest.Mock<Promise<unknown>, [string]>;
    createBusinessUser: jest.Mock<
      Promise<{ id: string; role: string }>,
      [UserData, unknown]
    >;
  };
  let businesses: {
    createBusinessInTransaction: jest.Mock<
      Promise<typeof business>,
      [unknown, typeof dto]
    >;
  };
  let prisma: {
    $transaction: jest.Mock<
      Promise<unknown>,
      [(tx: unknown) => Promise<unknown>]
    >;
  };
  let tx: { marker: string };
  let jwt: JwtService;
  let auth: AuthService;

  beforeEach(() => {
    tx = { marker: 'same-transaction' };
    users = {
      findByEmail: jest
        .fn<Promise<unknown>, [string]>()
        .mockResolvedValue(null),
      createBusinessUser: jest
        .fn<Promise<{ id: string; role: string }>, [UserData, unknown]>()
        .mockResolvedValue({ id: 'user-fixture', role: 'BUSINESS' }),
    };
    businesses = {
      createBusinessInTransaction: jest
        .fn<Promise<typeof business>, [unknown, typeof dto]>()
        .mockResolvedValue(business),
    };
    prisma = {
      $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    };
    jwt = new JwtService({
      secret: 'fictitious-test-secret',
      signOptions: { expiresIn: '24h' },
    });
    auth = new AuthService(
      users as unknown as UsersService,
      businesses as unknown as BusinessesService,
      jwt,
      prisma as unknown as PrismaService,
    );
  });

  it.each([
    'abcdef',
    '  significant spaces  ',
    'A1😀😀',
    'x'.repeat(72) + 'suffix',
  ])('retains historical bcrypt verification for %p', async (password) => {
    const hash = await bcrypt.hash(password, 10);
    const account = {
      id: 'existing',
      role: 'BUSINESS',
      businessId: business.id,
      business,
      password: hash,
    };
    users.findByEmail.mockResolvedValue(account);
    const result = await auth.login(dto.email, password);
    expect(jwt.verify(result.accessToken)).toMatchObject({
      sub: 'existing',
      role: 'BUSINESS',
      businessId: business.id,
    });
    expect(account.password).toBe(hash);
    expect(users.createBusinessUser).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    if (password.startsWith(' '))
      await expect(
        auth.login(dto.email, password.trim()),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    if (password.length > 72)
      await expect(
        auth.login(dto.email, 'x'.repeat(72) + 'other'),
      ).resolves.toHaveProperty('accessToken');
  });

  it('accepts an existing global ADMIN and rejects inactive BUSINESS', async () => {
    const password = await bcrypt.hash(dto.password, 10);
    users.findByEmail.mockResolvedValue({
      id: 'admin',
      role: 'ADMIN',
      businessId: null,
      password,
    });
    expect(
      jwt.verify((await auth.login(dto.email, dto.password)).accessToken),
    ).toMatchObject({ role: 'ADMIN', businessId: null });
    users.findByEmail.mockResolvedValue({
      id: 'business-user',
      role: 'BUSINESS',
      businessId: business.id,
      business: { ...business, status: 'INACTIVE' },
      password,
    });
    await expect(auth.login(dto.email, dto.password)).rejects.toThrow(
      'Business inactive',
    );
  });

  it('passes one transaction through business, accounting initialization and user creation', async () => {
    const result = await auth.registerBusiness(dto);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(businesses.createBusinessInTransaction).toHaveBeenCalledWith(
      tx,
      dto,
    );
    const [data, client] = users.createBusinessUser.mock.calls[0];
    expect(client).toBe(tx);
    expect(data.businessId).toBe(business.id);
    expect(await bcrypt.compare(dto.password, data.password)).toBe(true);
    expect(result).toHaveProperty('accessToken');
  });

  it('rejects existing and racing duplicate emails without retrying', async () => {
    users.findByEmail.mockResolvedValueOnce({ id: 'existing' });
    await expect(auth.registerBusiness(dto)).rejects.toThrow(
      'Email already in use',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    users.createBusinessUser.mockRejectedValue({
      code: 'P2002',
      meta: { target: ['email'] },
    });
    await expect(auth.registerBusiness(dto)).rejects.toThrow(
      'Email already in use',
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('propagates intermediate failures and never signs before a successful commit', async () => {
    const sign = jest.spyOn(jwt, 'sign');
    businesses.createBusinessInTransaction.mockRejectedValue(
      new Error('accounting failure'),
    );
    await expect(auth.registerBusiness(dto)).rejects.toThrow(
      'accounting failure',
    );
    expect(users.createBusinessUser).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
  });

  it('retries a slug race, but bounds retries to three', async () => {
    businesses.createBusinessInTransaction.mockRejectedValueOnce({
      code: 'P2002',
      meta: { target: ['slug'] },
    });
    await expect(auth.registerBusiness(dto)).resolves.toHaveProperty(
      'accessToken',
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    prisma.$transaction.mockClear();
    businesses.createBusinessInTransaction.mockRejectedValue({ code: 'P2034' });
    await expect(auth.registerBusiness(dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it('reports committed account when signing fails and permits subsequent login', async () => {
    const sign = jest.spyOn(jwt, 'sign').mockImplementationOnce(() => {
      throw new Error('sign failure');
    });
    await expect(auth.registerBusiness(dto)).resolves.toMatchObject({
      accountCreated: true,
      code: 'ACCOUNT_CREATED_LOGIN_REQUIRED',
    });
    expect(users.createBusinessUser).toHaveBeenCalledTimes(1);
    const data = users.createBusinessUser.mock.calls[0][0];
    users.findByEmail.mockResolvedValue({
      ...data,
      id: 'user-fixture',
      role: 'BUSINESS',
      business,
    });
    await expect(auth.login(dto.email, dto.password)).resolves.toHaveProperty(
      'accessToken',
    );
    expect(sign).toHaveBeenCalledTimes(2);
  });
});
