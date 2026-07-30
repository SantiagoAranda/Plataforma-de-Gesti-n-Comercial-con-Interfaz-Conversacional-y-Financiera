import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { PushNotificationsController } from './push-notifications.controller';
import { PushNotificationsService } from './push-notifications.service';
import { VapidProvider } from './vapid.provider';
import { WebPushTransport } from './web-push.transport';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 600_000,
        limit: 1_000,
      },
    ]),
  ],
  controllers: [PushNotificationsController],
  providers: [VapidProvider, WebPushTransport, PushNotificationsService],
  exports: [PushNotificationsService],
})
export class NotificationsModule {}
