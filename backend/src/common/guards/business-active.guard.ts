import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BusinessActiveGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.businessId) return true;

    const business = await this.prisma.business.findUnique({
      where: { id: user.businessId },
    });

    if (!business || business.status === 'INACTIVE') {
      throw new ForbiddenException('Business is inactive');
    }

    return true;
  }
}
