import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import { AuthService } from './auth.service';
import { RegisterBusinessDto } from './dto/register-business.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
@UseGuards(AuthRateLimitGuard)
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register-business')
  registerBusiness(@Body() dto: RegisterBusinessDto) {
    return this.authService.registerBusiness(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }
}
