import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { BusinessesService } from '../businesses/businesses.service';
import { RegisterBusinessDto } from './dto/register-business.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private businessesService: BusinessesService,
    private jwtService: JwtService,
  ) {}

  async registerBusiness(dto: RegisterBusinessDto) {
    // Verificar si el email ya está registrado
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new BadRequestException('Email already in use');
    }

    // Hashear contraseña
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // Crear negocio
    const business = await this.businessesService.createBusiness({
      name: dto.name,
      fiscalId: dto.fiscalId,
      phoneWhatsapp: dto.phoneWhatsapp,
    });

    // Crear usuario asociado al negocio
    const user = await this.usersService.createBusinessUser({
      email: dto.email,
      password: hashedPassword,
      businessId: business.id,
    });

    // Generar JWT con expiración
    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        role: user.role,
        businessId: business.id,
      },
      {
        expiresIn: '4h',
      },
    );

    console.log(`[AuthService] Register result - Name: "${business.name}"`);
    console.log(`[AuthService] Name Hex: ${Buffer.from(business.name).toString('hex')}`);

    return {
      accessToken,
      businessName: business.name,
      businessSlug: business.slug,
    };
  }

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Validar contraseña
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // ✅ Permitir ADMIN global (sin negocio)
    if (user.role === 'ADMIN' && !user.businessId) {
      const accessToken = this.jwtService.sign(
        {
          sub: user.id,
          role: user.role,
          businessId: null,
        },
        {
          expiresIn: '4h',
        },
      );

      return {
        accessToken,
        businessName: 'System Admin',
      };
    }

    // Validar estado del negocio
    if (!user.business || user.business.status === 'INACTIVE') {
      throw new UnauthorizedException('Business inactive');
    }

    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        role: user.role,
        businessId: user.businessId,
      },
      {
        expiresIn: '4h',
      },
    );

    console.log(`[AuthService] Login result - Name: "${user.business.name}"`);
    console.log(`[AuthService] Name Hex: ${Buffer.from(user.business.name).toString('hex')}`);

    return {
      accessToken,
      businessName: user.business.name,
      businessSlug: user.business.slug,
    };
  }
}