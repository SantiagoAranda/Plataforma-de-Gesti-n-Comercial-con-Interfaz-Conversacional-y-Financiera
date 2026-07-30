import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterPushSubscriptionDto } from './dto/register-push-subscription.dto';
import { resolveAndValidatePushEndpoint } from './push-endpoint-security';
import { WebPushTransport, WebPushTransportError } from './web-push.transport';
import { VapidProvider } from './vapid.provider';

type Actor = { businessId: string; userId: string };

type PushPayload = {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data: Record<string, string>;
};

@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger(PushNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vapid: VapidProvider,
    private readonly transport: WebPushTransport,
  ) {}

  async register(actor: Actor, dto: RegisterPushSubscriptionDto) {
    await this.assertActiveActor(actor);
    await resolveAndValidatePushEndpoint(dto.subscription.endpoint);

    const expirationTime =
      dto.subscription.expirationTime == null
        ? null
        : new Date(dto.subscription.expirationTime);

    try {
      await this.prisma.$transaction(async (tx) => {
        const [endpointOwner, deviceRegistration] = await Promise.all([
          tx.pushSubscription.findUnique({
            where: { endpoint: dto.subscription.endpoint },
          }),
          tx.pushSubscription.findUnique({
            where: {
              userId_deviceId: {
                userId: actor.userId,
                deviceId: dto.deviceId,
              },
            },
          }),
        ]);

        if (
          endpointOwner &&
          (endpointOwner.userId !== actor.userId ||
            endpointOwner.businessId !== actor.businessId)
        ) {
          throw new ConflictException(
            'La suscripción ya está asociada a otra cuenta',
          );
        }

        if (endpointOwner && endpointOwner.id !== deviceRegistration?.id) {
          if (deviceRegistration) {
            await tx.pushSubscription.delete({
              where: { id: deviceRegistration.id },
            });
          }
          await tx.pushSubscription.update({
            where: { id: endpointOwner.id },
            data: {
              businessId: actor.businessId,
              userId: actor.userId,
              deviceId: dto.deviceId,
              expirationTime,
              p256dh: dto.subscription.keys.p256dh,
              auth: dto.subscription.keys.auth,
              platform: dto.platform,
              userAgent: dto.userAgent?.trim() || null,
              enabled: true,
              lastUsedAt: new Date(),
            },
          });
          return;
        }

        await tx.pushSubscription.upsert({
          where: {
            userId_deviceId: {
              userId: actor.userId,
              deviceId: dto.deviceId,
            },
          },
          create: {
            businessId: actor.businessId,
            userId: actor.userId,
            deviceId: dto.deviceId,
            endpoint: dto.subscription.endpoint,
            expirationTime,
            p256dh: dto.subscription.keys.p256dh,
            auth: dto.subscription.keys.auth,
            platform: dto.platform,
            userAgent: dto.userAgent?.trim() || null,
          },
          update: {
            businessId: actor.businessId,
            endpoint: dto.subscription.endpoint,
            expirationTime,
            p256dh: dto.subscription.keys.p256dh,
            auth: dto.subscription.keys.auth,
            platform: dto.platform,
            userAgent: dto.userAgent?.trim() || null,
            enabled: true,
            lastUsedAt: new Date(),
          },
        });
      });
    } catch (error) {
      if (this.isEndpointUniqueConflict(error)) {
        throw new ConflictException(
          'La suscripción ya está asociada a otra cuenta',
        );
      }
      throw error;
    }

    return { configured: true, enabled: true };
  }

  async getStatus(actor: Actor, deviceId: string) {
    await this.assertActiveActor(actor);
    const [subscription, business, registeredDeviceCount] = await Promise.all([
      this.prisma.pushSubscription.findUnique({
        where: {
          userId_deviceId: { userId: actor.userId, deviceId },
        },
        select: {
          enabled: true,
          businessId: true,
          endpoint: true,
          p256dh: true,
          auth: true,
        },
      }),
      this.prisma.business.findUnique({
        where: { id: actor.businessId },
        select: { notifyOnAutomaticSale: true },
      }),
      this.prisma.pushSubscription.count({
        where: {
          businessId: actor.businessId,
          enabled: true,
          user: { businessId: actor.businessId },
        },
      }),
    ]);

    const belongsToBusiness = subscription?.businessId === actor.businessId;
    return {
      configured: Boolean(subscription && belongsToBusiness),
      enabled: Boolean(
        subscription && belongsToBusiness && subscription.enabled,
      ),
      notifyOnAutomaticSale: business?.notifyOnAutomaticSale ?? false,
      registeredDeviceCount,
      subscriptionFingerprint:
        subscription && belongsToBusiness
          ? this.subscriptionFingerprint(subscription)
          : null,
    };
  }

  async unregister(actor: Actor, deviceId: string) {
    await this.assertActiveActor(actor);
    await this.prisma.pushSubscription.updateMany({
      where: {
        businessId: actor.businessId,
        userId: actor.userId,
        deviceId,
      },
      data: { enabled: false },
    });
    return { configured: false, enabled: false };
  }

  async updatePreference(actor: Actor, notifyOnAutomaticSale: boolean) {
    await this.assertActiveActor(actor);
    return this.prisma.business.update({
      where: { id: actor.businessId },
      data: { notifyOnAutomaticSale },
      select: { notifyOnAutomaticSale: true },
    });
  }

  async sendTest(actor: Actor, deviceId: string) {
    await this.assertActiveActor(actor);
    const subscription = await this.prisma.pushSubscription.findFirst({
      where: {
        businessId: actor.businessId,
        userId: actor.userId,
        deviceId,
        enabled: true,
      },
    });
    if (!subscription) {
      throw new NotFoundException('Este dispositivo no está registrado');
    }
    if (!this.vapid.isEnabled()) {
      throw new BadRequestException(
        'Las notificaciones no están configuradas en el servidor',
      );
    }

    await this.sendOne(subscription, {
      title: 'Notificaciones activadas',
      body: 'Este dispositivo puede recibir alertas de nuevas ventas.',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png',
      tag: `push-test-${subscription.id}`,
      data: {
        type: 'PUSH_TEST',
        saleId: '',
        url: '/configuracion',
      },
    });
    return { sent: true };
  }

  async notifyAutomaticSaleCreated(sale: {
    businessId: string;
    saleId: string;
    total: number;
    customerName?: string | null;
  }) {
    const formattedTotal = new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(sale.total);
    const customer = sale.customerName?.trim();

    await this.sendToBusiness(sale.businessId, {
      title: 'Nueva venta recibida',
      body: customer
        ? `Pedido de ${customer} por ${formattedTotal}`
        : `Nuevo pedido por ${formattedTotal}`,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png',
      tag: `sale-${sale.saleId}`,
      data: {
        type: 'SALE_CREATED',
        saleId: sale.saleId,
        url: `/venta?saleId=${sale.saleId}`,
      },
    });
  }

  async sendToBusiness(businessId: string, payload: PushPayload) {
    if (!this.vapid.isEnabled()) return;
    this.assertInternalUrl(payload.data.url);

    const business = await this.prisma.business.findFirst({
      where: {
        id: businessId,
        status: 'ACTIVE',
        notifyOnAutomaticSale: true,
      },
      select: {
        pushSubscriptions: {
          where: {
            enabled: true,
            user: { businessId },
          },
        },
      },
    });
    if (!business?.pushSubscriptions.length) return;

    for (
      let index = 0;
      index < business.pushSubscriptions.length;
      index += 10
    ) {
      const batch = business.pushSubscriptions.slice(index, index + 10);
      await Promise.allSettled(
        batch.map((subscription) => this.sendOne(subscription, payload)),
      );
    }
  }

  private async sendOne(
    subscription: {
      id: string;
      endpoint: string;
      expirationTime: Date | null;
      p256dh: string;
      auth: string;
    },
    payload: PushPayload,
  ) {
    const saleId = payload.data.saleId || subscription.id;
    const topic = createHash('sha256')
      .update(`sale:${saleId}`)
      .digest('base64url')
      .slice(0, 32);

    try {
      await this.transport.send(
        {
          endpoint: subscription.endpoint,
          expirationTime: subscription.expirationTime?.getTime() ?? null,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify(payload),
        { TTL: 300, urgency: 'high', topic },
      );
      await this.prisma.pushSubscription.updateMany({
        where: { id: subscription.id, enabled: true },
        data: { lastUsedAt: new Date() },
      });
    } catch (error) {
      const statusCode =
        error instanceof WebPushTransportError ? error.statusCode : undefined;
      if (statusCode === 404 || statusCode === 410) {
        await this.prisma.pushSubscription.updateMany({
          where: { id: subscription.id },
          data: { enabled: false },
        });
      }
      this.logger.warn(
        `Web Push falló subscription=${subscription.id} sale=${saleId} status=${statusCode ?? 'network'}`,
      );
      throw error;
    }
  }

  private async assertActiveActor(actor: Actor) {
    if (!actor.businessId || !actor.userId) {
      throw new ForbiddenException('Usuario sin negocio asociado');
    }
    const user = await this.prisma.user.findFirst({
      where: {
        id: actor.userId,
        businessId: actor.businessId,
        business: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (!user) {
      throw new ForbiddenException('Usuario o negocio no habilitado');
    }
  }

  private assertInternalUrl(url: string) {
    if (
      !url.startsWith('/') ||
      url.startsWith('//') ||
      /^[a-z][a-z0-9+.-]*:/i.test(url)
    ) {
      throw new BadRequestException('URL de notificación inválida');
    }
  }

  private subscriptionFingerprint(subscription: {
    endpoint: string;
    p256dh: string;
    auth: string;
  }) {
    return createHash('sha256')
      .update(
        JSON.stringify({
          endpoint: subscription.endpoint,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        }),
      )
      .digest('base64url');
  }

  private isEndpointUniqueConflict(error: unknown) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return false;
    }
    const target = error.meta?.target;
    return (
      (Array.isArray(target) &&
        target.length === 1 &&
        target[0] === 'endpoint') ||
      target === 'PushSubscription_endpoint_key'
    );
  }
}
