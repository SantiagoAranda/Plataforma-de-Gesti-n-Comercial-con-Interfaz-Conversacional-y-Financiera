import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { mailErrorCode, RecoveryMailService } from './recovery-mail.service';
import { hashNewPassword, validateNewPassword } from './password-policy';
import { passwordV2Enabled } from './password-rollout';
import {
  cooldownMinutes,
  MailQuotaLimits,
  mailQuotaLimits,
  recordMailOutcome,
  reserveMailSlot,
} from './mail-quota';

const MAX_LIVE_LINKS = 3;
const INVALID_LINK = 'El enlace es inválido o venció. Solicitá uno nuevo.';

@Injectable()
export class PasswordRecoveryService {
  private readonly logger = new Logger(PasswordRecoveryService.name);
  private readonly quota?: MailQuotaLimits;
  private readonly cooldown?: number;
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: RecoveryMailService,
    private readonly config: ConfigService,
  ) {
    // Only validated when the feature is on, so a disabled deployment never fails to boot.
    if (passwordV2Enabled(config)) {
      this.quota = mailQuotaLimits(config);
      this.cooldown = cooldownMinutes(config);
    }
  }

  private lifetimeMinutes(): number {
    const minutes = Number(
      this.config.get<string>('PASSWORD_RESET_TTL_MINUTES') ?? '30',
    );
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440)
      throw new ServiceUnavailableException(
        'La recuperación no está disponible temporalmente.',
      );
    return minutes;
  }

  request(email: string): { message: string } {
    this.assertEnabled();
    this.mail.assertConfigured();
    const minutes = this.lifetimeMinutes();
    void this.issue(email, minutes).catch((error: unknown) =>
      this.logger.error(
        `No se pudo procesar una solicitud de recuperación (${mailErrorCode(error)}).`,
      ),
    );
    return {
      message:
        'Si existe una cuenta con ese correo, recibirás instrucciones para recuperar tu contraseña.',
    };
  }

  /**
   * Cooldown, live-link cap, global mail quota and token creation commit together
   * under the user's row lock, so concurrent requests yield one token and one quota unit.
   * Existing live links are left untouched: repeated requests cannot invalidate them.
   */
  private async issue(email: string, minutes: number): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, role: true },
    });
    // ADMIN self-service recovery is disabled until a stronger procedure exists.
    if (!user || user.role === 'ADMIN') return;
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const issued = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
      const [state] = await tx.$queryRaw<
        Array<{ now: Date; recent: number; live: number }>
      >`SELECT CURRENT_TIMESTAMP AS "now",
          COUNT(*) FILTER (WHERE "createdAt" > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - ${this.cooldown} * interval '1 minute')::int AS "recent",
          COUNT(*) FILTER (WHERE "consumedAt" IS NULL AND "expiresAt" > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))::int AS "live"
        FROM "PasswordResetToken" WHERE "userId" = ${user.id}`;
      if (state.recent > 0 || state.live >= MAX_LIVE_LINKS) return false;
      if (!(await reserveMailSlot(tx, 'recovery', this.quota))) {
        this.logger.warn('Cuota diaria de correos de recuperación agotada.');
        return false;
      }
      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          createdAt: state.now,
          expiresAt: new Date(state.now.getTime() + minutes * 60000),
        },
      });
      return true;
    });
    if (!issued) return;
    try {
      await this.mail.sendRecovery(user.email, token);
      await recordMailOutcome(this.prisma, 'accepted');
    } catch (error) {
      await recordMailOutcome(this.prisma, 'failed');
      throw error;
    }
    if (randomInt(200) === 0) await this.purgeExpiredTokens();
  }

  /** Bounded cleanup of long-expired tokens; failures are retried by a later request. */
  async purgeExpiredTokens(): Promise<void> {
    try {
      await this.prisma
        .$executeRaw`DELETE FROM "PasswordResetToken" WHERE "id" IN (SELECT "id" FROM "PasswordResetToken" WHERE "expiresAt" < (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - interval '1 day' LIMIT 500)`;
    } catch {
      this.logger.warn('No se pudo limpiar tokens de recuperación vencidos.');
    }
  }

  async reset(token: string, password: string): Promise<{ message: string }> {
    this.assertEnabled();
    const tokenHash = createHash('sha256').update(token).digest('hex');
    // Token validity is checked before validating the new password.
    const [record] = await this.prisma.$queryRaw<Array<{ userId: string }>>`
      SELECT t."userId" FROM "PasswordResetToken" t JOIN "User" u ON u."id" = t."userId"
      WHERE t."tokenHash" = ${tokenHash} AND t."consumedAt" IS NULL
        AND t."expiresAt" > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AND u."role" <> 'ADMIN'`;
    if (!record) throw new BadRequestException(INVALID_LINK);
    validateNewPassword(password);
    const hashed = await hashNewPassword(password);
    const user = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${record.userId} FOR UPDATE`;
      const consumed = await tx.$queryRaw<
        Array<{ userId: string }>
      >`UPDATE "PasswordResetToken" t SET "consumedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') FROM "User" u WHERE t."tokenHash" = ${tokenHash} AND t."consumedAt" IS NULL AND t."expiresAt" > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AND u."id" = t."userId" AND u."role" <> 'ADMIN' RETURNING t."userId"`;
      if (consumed.length !== 1) throw new BadRequestException(INVALID_LINK);
      const updated = await tx.user.update({
        where: { id: record.userId },
        data: { password: hashed, sessionVersion: { increment: 1 } },
        select: { email: true },
      });
      // Every device must be re-authorized individually after recovery.
      await tx.pushSubscription.updateMany({
        where: { userId: record.userId },
        data: { enabled: false },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId: record.userId, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      return updated;
    });
    await this.sendChangedNotice(user.email);
    return {
      message:
        'Tu contraseña fue actualizada. Iniciá sesión con tu nueva contraseña.',
    };
  }

  private async sendChangedNotice(email: string): Promise<void> {
    try {
      if (!(await reserveMailSlot(this.prisma, 'notice', this.quota))) {
        this.logger.warn('Sin cuota para el aviso de cambio de contraseña.');
        return;
      }
      await this.mail.sendChanged(email);
      await recordMailOutcome(this.prisma, 'accepted');
    } catch (error) {
      await recordMailOutcome(this.prisma, 'failed');
      this.logger.error(
        `No se pudo enviar el aviso de cambio de contraseña (${mailErrorCode(error)}).`,
      );
    }
  }

  private assertEnabled(): void {
    if (!passwordV2Enabled(this.config)) {
      throw new ServiceUnavailableException(
        'La recuperación no está disponible temporalmente.',
      );
    }
  }
}
