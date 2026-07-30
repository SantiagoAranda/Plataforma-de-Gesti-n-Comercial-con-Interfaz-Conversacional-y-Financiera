import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PushNotificationsService } from './push-notifications.service';
import { WebPushTransportError } from './web-push.transport';

jest.mock('./push-endpoint-security', () => ({
  resolveAndValidatePushEndpoint: jest.fn().mockResolvedValue({
    url: new URL('https://push.example.test/subscription'),
    addresses: [{ address: '1.1.1.1', family: 4 }],
  }),
}));

describe('PushNotificationsService', () => {
  const subscription = {
    id: 'sub-1',
    businessId: 'business-1',
    userId: 'user-1',
    deviceId: '00000000-0000-4000-8000-000000000001',
    endpoint: 'https://push.example.test/subscription',
    expirationTime: null,
    p256dh: 'p256dh',
    auth: 'auth',
    enabled: true,
    platform: 'WEB_WINDOWS',
    userAgent: null,
    lastUsedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  function setup(sendResult: unknown = { statusCode: 201 }) {
    const transport = {
      send: jest.fn().mockResolvedValue(sendResult),
    };
    const prisma: any = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'user-1' }),
      },
      business: {
        findUnique: jest.fn().mockResolvedValue({
          notifyOnAutomaticSale: false,
        }),
        findFirst: jest.fn().mockResolvedValue({
          pushSubscriptions: [subscription],
        }),
        update: jest.fn().mockResolvedValue({
          notifyOnAutomaticSale: true,
        }),
      },
      pushSubscription: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(subscription),
        count: jest.fn().mockResolvedValue(1),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        upsert: jest.fn().mockResolvedValue(subscription),
        delete: jest.fn().mockResolvedValue(subscription),
        update: jest.fn().mockResolvedValue(subscription),
      },
    };
    prisma.$transaction = jest
      .fn()
      .mockImplementation((callback: (tx: any) => unknown) => callback(prisma));

    return {
      service: new PushNotificationsService(
        prisma,
        { isEnabled: () => true } as any,
        transport as any,
      ),
      prisma,
      transport,
    };
  }

  it('returns status without exposing endpoint or keys', async () => {
    const { service, prisma } = setup();
    prisma.pushSubscription.findUnique.mockResolvedValue(subscription);
    const result = await service.getStatus(
      { businessId: 'business-1', userId: 'user-1' },
      subscription.deviceId,
    );
    expect(result).toEqual({
      configured: true,
      enabled: true,
      notifyOnAutomaticSale: false,
      registeredDeviceCount: 1,
      subscriptionFingerprint: expect.any(String),
    });
    expect(JSON.stringify(result)).not.toContain('endpoint');
    expect(JSON.stringify(result)).not.toContain('p256dh');
  });

  it('registers using only the authenticated actor and upserts the device', async () => {
    const { service, prisma } = setup();
    prisma.pushSubscription.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    await service.register(
      { businessId: 'business-1', userId: 'user-1' },
      {
        deviceId: subscription.deviceId,
        subscription: {
          endpoint: subscription.endpoint,
          expirationTime: null,
          keys: { p256dh: 'public-key', auth: 'auth-key' },
        },
        platform: 'WEB_WINDOWS',
      },
    );

    expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_deviceId: {
            userId: 'user-1',
            deviceId: subscription.deviceId,
          },
        },
        create: expect.objectContaining({
          businessId: 'business-1',
          userId: 'user-1',
        }),
      }),
    );
  });

  it('does not reassign an endpoint owned by another account', async () => {
    const { service, prisma } = setup();
    prisma.pushSubscription.findUnique
      .mockResolvedValueOnce({
        ...subscription,
        businessId: 'business-2',
        userId: 'user-2',
      })
      .mockResolvedValueOnce(null);

    await expect(
      service.register(
        { businessId: 'business-1', userId: 'user-1' },
        {
          deviceId: subscription.deviceId,
          subscription: {
            endpoint: subscription.endpoint,
            expirationTime: null,
            keys: { p256dh: 'public-key', auth: 'auth-key' },
          },
          platform: 'WEB_WINDOWS',
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.pushSubscription.upsert).not.toHaveBeenCalled();
  });

  it('rejects an actor no longer associated with an active business', async () => {
    const { service, prisma } = setup();
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(
      service.getStatus(
        { businessId: 'business-1', userId: 'user-1' },
        subscription.deviceId,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('uses a stable URL-safe topic no longer than 32 characters', async () => {
    const { service, transport } = setup();
    await service.notifyAutomaticSaleCreated({
      businessId: 'business-1',
      saleId: '123e4567-e89b-12d3-a456-426614174000',
      total: 125000,
      customerName: 'Juan',
    });
    const options = transport.send.mock.calls[0][2];
    expect(options.topic).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(options.topic.length).toBeLessThanOrEqual(32);
  });

  it.each([
    ['Juan', 'Pedido de Juan por'],
    [null, 'Nuevo pedido por'],
  ])(
    'builds a sale message without exposing its reference for customer %s',
    async (customerName, expectedPrefix) => {
      const { service, transport } = setup();
      const saleId = '123e4567-e89b-12d3-a456-426614174000';
      await service.notifyAutomaticSaleCreated({
        businessId: 'business-1',
        saleId,
        total: 125000,
        customerName,
      });

      const payload = JSON.parse(transport.send.mock.calls[0][1]);
      expect(payload.title).toBe('Nueva venta recibida');
      expect(payload.body).toMatch(new RegExp(`^${expectedPrefix}`));
      expect(payload.body).not.toContain(saleId);
      expect(payload.body).not.toContain('Cliente:');
      expect(payload.data).toEqual({
        type: 'SALE_CREATED',
        saleId,
        url: `/venta?saleId=${saleId}`,
      });
    },
  );

  it.each([404, 410])(
    'disables a terminal subscription on %s',
    async (statusCode) => {
      const { service, prisma, transport } = setup();
      transport.send.mockRejectedValue(
        new WebPushTransportError('gone', statusCode),
      );
      await service.notifyAutomaticSaleCreated({
        businessId: 'business-1',
        saleId: 'sale-1',
        total: 1,
      });
      expect(prisma.pushSubscription.updateMany).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { enabled: false },
      });
    },
  );

  it('keeps the subscription enabled after a temporary timeout', async () => {
    const { service, prisma, transport } = setup();
    transport.send.mockRejectedValue(
      new WebPushTransportError('Web Push total timeout'),
    );
    await service.notifyAutomaticSaleCreated({
      businessId: 'business-1',
      saleId: 'sale-1',
      total: 1,
    });
    expect(prisma.pushSubscription.updateMany).not.toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: { enabled: false },
    });
  });

  it.each([302, 429, 500])(
    'keeps the subscription enabled after non-terminal status %s',
    async (statusCode) => {
      const { service, prisma, transport } = setup();
      transport.send.mockRejectedValue(
        new WebPushTransportError('temporary failure', statusCode),
      );
      await service.notifyAutomaticSaleCreated({
        businessId: 'business-1',
        saleId: 'sale-1',
        total: 1,
      });
      expect(prisma.pushSubscription.updateMany).not.toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { enabled: false },
      });
    },
  );

  it('limits concurrent sends to batches of ten', async () => {
    const { service, prisma, transport } = setup();
    prisma.business.findFirst.mockResolvedValue({
      pushSubscriptions: Array.from({ length: 21 }, (_, index) => ({
        ...subscription,
        id: `sub-${index + 1}`,
      })),
    });
    let active = 0;
    let maximum = 0;
    transport.send.mockImplementation(async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active -= 1;
      return { statusCode: 201 };
    });

    await service.notifyAutomaticSaleCreated({
      businessId: 'business-1',
      saleId: 'sale-1',
      total: 1,
    });

    expect(transport.send).toHaveBeenCalledTimes(21);
    expect(maximum).toBe(10);
  });
});
