import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, UserRole } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async createBusinessUser(data: {
    email: string;
    password: string;
    businessId: string;
  }): Promise<User> {
    return this.prisma.user.create({
      data: {
        email: data.email,
        password: data.password,
        role: UserRole.BUSINESS,
        businessId: data.businessId,
      },
    });
  }
}
