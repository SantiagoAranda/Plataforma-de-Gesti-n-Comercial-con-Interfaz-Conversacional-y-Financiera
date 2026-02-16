import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { BusinessesService } from '../businesses/businesses.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private businessesService: BusinessesService,
    private jwtService: JwtService,
  ) {}

  async registerBusiness(data: {
    name: string;
    fiscalId: string;
    phoneWhatsapp: string;
    email: string;
    password: string;
  }) {
    const existingUser = await this.usersService.findByEmail(data.email);
    if (existingUser) {
      throw new BadRequestException('Email already in use');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const business = await this.businessesService.createBusiness({
      name: data.name,
      fiscalId: data.fiscalId,
      phoneWhatsapp: data.phoneWhatsapp,
    });

    const user = await this.usersService.createBusinessUser({
      email: data.email,
      password: hashedPassword,
      businessId: business.id,
    });

    const token = this.jwtService.sign({
      sub: user.id,
      role: user.role,
      businessId: business.id,
    });

    return {
      accessToken: token,
    };
  }

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = this.jwtService.sign({
      sub: user.id,
      role: user.role,
      businessId: user.businessId,
    });

    return {
      accessToken: token,
    };
  }
}
