import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
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
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'supersecret_dev_key',
      signOptions: {
        expiresIn: '15m',
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RolesGuard, BusinessActiveGuard],
  exports: [JwtModule], // importante si luego otros módulos lo usan
})
export class AuthModule {}