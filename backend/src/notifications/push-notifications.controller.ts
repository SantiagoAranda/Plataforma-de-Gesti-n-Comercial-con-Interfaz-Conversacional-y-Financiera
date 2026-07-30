import {
  Body,
  Controller,
  Delete,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BusinessActiveGuard } from '../common/guards/business-active.guard';
import { RegisterPushSubscriptionDto } from './dto/register-push-subscription.dto';
import { PushStatusDto } from './dto/push-status.dto';
import { TestPushDto } from './dto/test-push.dto';
import { UnregisterPushSubscriptionDto } from './dto/unregister-push-subscription.dto';
import { UpdatePushPreferencesDto } from './dto/update-push-preferences.dto';
import { PushNotificationsService } from './push-notifications.service';

type AuthenticatedRequest = Request & {
  user: { userId: string; businessId: string };
};

const perUser = (req: Record<string, unknown>) => {
  const user = req.user;
  if (user && typeof user === 'object' && 'userId' in user) {
    const userId = (user as { userId?: unknown }).userId;
    if (typeof userId === 'string') return userId;
  }
  return typeof req.ip === 'string' ? req.ip : 'unknown';
};

@Controller('notifications/push')
@UseGuards(JwtAuthGuard, BusinessActiveGuard)
export class PushNotificationsController {
  constructor(private readonly notifications: PushNotificationsService) {}

  @Post('register')
  @UseGuards(ThrottlerGuard)
  @Throttle({
    default: { limit: 10, ttl: 600_000, getTracker: perUser },
  })
  register(
    @Req() req: AuthenticatedRequest,
    @Body() dto: RegisterPushSubscriptionDto,
  ) {
    return this.notifications.register(req.user, dto);
  }

  @Post('status')
  status(@Req() req: AuthenticatedRequest, @Body() dto: PushStatusDto) {
    return this.notifications.getStatus(req.user, dto.deviceId);
  }

  @Delete('unregister')
  unregister(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UnregisterPushSubscriptionDto,
  ) {
    return this.notifications.unregister(req.user, dto.deviceId);
  }

  @Post('test')
  @UseGuards(ThrottlerGuard)
  @Throttle({
    default: { limit: 5, ttl: 600_000, getTracker: perUser },
  })
  test(@Req() req: AuthenticatedRequest, @Body() dto: TestPushDto) {
    return this.notifications.sendTest(req.user, dto.deviceId);
  }

  @Patch('preferences')
  preferences(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdatePushPreferencesDto,
  ) {
    return this.notifications.updatePreference(
      req.user,
      dto.notifyOnAutomaticSale,
    );
  }
}
