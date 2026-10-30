import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { JWT_EXPIRATION } from './jwt.config';
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
    private prisma: PrismaService,
  ) {}

  async registerBusiness(dto: RegisterBusinessDto) {
    // Verificar si el email ya está registrado
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new BadRequestException('Email already in use');
    }

    // Hashear contraseña
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const { user, business } = await this.createAccount(dto, hashedPassword);
    try {
      const accessToken = this.jwtService.sign(
        {
          sub: user.id,
          role: user.role,
          businessId: business.id,
        },
        { expiresIn: JWT_EXPIRATION },
      );
      return {
        accessToken,
        businessName: business.name,
        businessSlug: business.slug,
      };
    } catch {
      new Logger(AuthService.name).error(
        'Account committed; automatic sign-in failed',
      );
      return {
        accountCreated: true as const,
        code: 'ACCOUNT_CREATED_LOGIN_REQUIRED' as const,
        message:
          'Tu cuenta fue creada, pero no pudimos iniciar sesión automáticamente. Iniciá sesión con tus credenciales.',
      };
    }
  }

  private async createAccount(
    dto: RegisterBusinessDto,
    hashedPassword: string,
  ) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const business =
            await this.businessesService.createBusinessInTransaction(tx, dto);
          const user = await this.usersService.createBusinessUser(
            {
              email: dto.email,
              password: hashedPassword,
              businessId: business.id,
            },
            tx,
          );
          return { user, business };
        });
      } catch (error) {
        const failure = error as {
          code?: string;
          meta?: { target?: string[] | string };
        };
        const target = failure.meta?.target;
        const fields = Array.isArray(target) ? target : [target];
        if (
          failure.code === 'P2002' &&
          fields.some(
            (field) => field === 'email' || field === 'User_email_key',
          )
        ) {
          throw new BadRequestException('Email already in use');
        }
        const slugConflict =
          failure.code === 'P2002' &&
          fields.length === 1 &&
          (fields[0] === 'slug' || fields[0] === 'Business_slug_key');
        if (attempt < 2 && (slugConflict || failure.code === 'P2034')) continue;
        if (slugConflict || failure.code === 'P2034') {
          throw new BadRequestException(
            'No se pudo completar el registro. Intentá nuevamente.',
          );
        }
        throw error;
      }
    }
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
          expiresIn: JWT_EXPIRATION,
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
        expiresIn: JWT_EXPIRATION,
      },
    );

    console.log(`[AuthService] Login result - Name: "${user.business.name}"`);
    console.log(
      `[AuthService] Name Hex: ${Buffer.from(user.business.name).toString('hex')}`,
    );

    return {
      accessToken,
      businessName: user.business.name,
      businessSlug: user.business.slug,
    };
  }
}
