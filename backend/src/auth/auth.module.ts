import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { BusinessesModule } from '../businesses/businesses.module';
import { JwtStrategy } from './jwt.strategy/jwt.strategy';
import { RolesGuard } from './guards/roles.guard';
import { BusinessActiveGuard } from './guards/business-active.guard';
import { jwtSecret, JWT_EXPIRATION } from './jwt.config';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';

@Module({
  imports: [
    UsersModule,
    BusinessesModule,
    ConfigModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: jwtSecret(configService),
        signOptions: { expiresIn: JWT_EXPIRATION },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    RolesGuard,
    BusinessActiveGuard,
    AuthRateLimitGuard,
  ],
  exports: [JwtModule],
})
export class AuthModule {}
