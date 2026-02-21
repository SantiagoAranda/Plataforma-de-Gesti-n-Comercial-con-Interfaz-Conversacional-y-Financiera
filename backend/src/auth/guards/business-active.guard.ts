import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BusinessActiveGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.businessId) {
      throw new ForbiddenException('Business context missing');
    }

    const business = await this.prisma.business.findUnique({
      where: { id: user.businessId },
      select: { status: true },
    });

    if (!business || business.status === 'INACTIVE') {
      throw new ForbiddenException('Business inactive');
    }

    return true;
  }
}