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

@Module({
  imports: [
    UsersModule,
    BusinessesModule,
    ConfigModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '24h' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RolesGuard, BusinessActiveGuard],
  exports: [JwtModule],
})
export class AuthModule {}