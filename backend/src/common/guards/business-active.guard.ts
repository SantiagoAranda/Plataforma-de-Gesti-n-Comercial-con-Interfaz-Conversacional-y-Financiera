import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BusinessActiveGuard implements CanActivate {
  // shortcut: in-memory per instance, up to 30s stale on deactivation; use Redis if scaling out.
  private readonly cache = new Map<string, { active: boolean; until: number }>();

  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.businessId) return true;

    let hit = this.cache.get(user.businessId);
    if (!hit || hit.until < Date.now()) {
      const business = await this.prisma.business.findUnique({
        where: { id: user.businessId },
        select: { status: true },
      });
      hit = {
        active: !!business && business.status !== 'INACTIVE',
        until: Date.now() + 30_000,
      };
      this.cache.set(user.businessId, hit);
    }

    if (!hit.active) {
      throw new ForbiddenException('Business is inactive');
    }

    return true;
  }
}
