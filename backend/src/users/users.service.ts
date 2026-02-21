import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: {
        business: true, // 🔥 necesario para validar estado del negocio
      },
    });
  }

  async createBusinessUser(data: {
    email: string;
    password: string;
    businessId: string;
  }) {
    return this.prisma.user.create({
      data: {
        email: data.email,
        password: data.password,
        role: UserRole.BUSINESS,
        businessId: data.businessId,
      },
      include: {
        business: true, // opcional pero útil
      },
    });
  }
}