import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import { AuthService } from './auth.service';
import { RegisterBusinessDto } from './dto/register-business.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { PasswordRecoveryService } from './password-recovery.service';
import { RecoveryRateLimitGuard } from './recovery-rate-limit.guard';
import { AuthAction } from './auth-action.decorator';

@Controller('auth')
@UseGuards(AuthRateLimitGuard)
export class AuthController {
  constructor(
    private authService: AuthService,
    private recovery: PasswordRecoveryService,
  ) {}

  @Post('register-business')
  @AuthAction('register')
  registerBusiness(@Body() dto: RegisterBusinessDto) {
    return this.authService.registerBusiness(dto);
  }

  @Post('login')
  @AuthAction('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('forgot-password')
  @AuthAction('forgot')
  @UseGuards(RecoveryRateLimitGuard)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.recovery.request(dto.email);
  }

  @Post('reset-password')
  @AuthAction('reset')
  @UseGuards(RecoveryRateLimitGuard)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.recovery.reset(dto.token, dto.password);
  }
}
