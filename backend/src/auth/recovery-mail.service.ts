import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';

@Injectable()
export class RecoveryMailService {
  private transport?: Transporter;

  constructor(private readonly config: ConfigService) {}

  recoveryUrl(token: string): string {
    const base = this.config.get<string>('FRONTEND_PUBLIC_URL');
    if (!base)
      throw new ServiceUnavailableException(
        'La recuperación no está disponible temporalmente.',
      );
    let url: URL;
    try {
      url = new URL(base);
    } catch {
      throw new ServiceUnavailableException(
        'La recuperación no está disponible temporalmente.',
      );
    }
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== 'https:' &&
        !(
          url.protocol === 'http:' &&
          ['localhost', '127.0.0.1'].includes(url.hostname) &&
          this.config.get('NODE_ENV') !== 'production'
        ))
    ) {
      throw new ServiceUnavailableException(
        'La recuperación no está disponible temporalmente.',
      );
    }
    url.pathname = '/reset-password';
    url.hash = new URLSearchParams({ token }).toString();
    return url.toString();
  }

  private getTransport(): Transporter {
    const provider = this.config.get<string>('MAIL_PROVIDER');
    if (provider === 'test' && this.config.get('NODE_ENV') === 'test') {
      return (this.transport ??= createTransport({ jsonTransport: true }));
    }
    const host = this.config.get<string>('SMTP_HOST');
    const port = Number(this.config.get<string>('SMTP_PORT'));
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASSWORD');
    if (
      provider !== 'smtp' ||
      !host ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535 ||
      !user ||
      !pass ||
      !this.config.get<string>('MAIL_FROM')
    ) {
      throw new ServiceUnavailableException(
        'La recuperación no está disponible temporalmente.',
      );
    }
    return (this.transport ??= createTransport({
      host,
      port,
      secure: port === 465,
      requireTLS: port !== 465,
      auth: { user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    }));
  }

  assertConfigured(): void {
    this.getTransport();
    this.recoveryUrl('configuration-check');
  }

  async sendRecovery(email: string, token: string): Promise<void> {
    const link = this.recoveryUrl(token);
    await this.getTransport().sendMail({
      from: this.config.get<string>('MAIL_FROM') || 'testing@example.test',
      to: email,
      subject: 'Restablecé tu contraseña',
      text: `Recibimos una solicitud para restablecer tu contraseña. Abrí este enlace antes de que venza:\n\n${link}\n\nSi no fuiste vos, ignorá este mensaje.`,
    });
  }

  async sendChanged(email: string): Promise<void> {
    await this.getTransport().sendMail({
      from: this.config.get<string>('MAIL_FROM') || 'testing@example.test',
      to: email,
      subject: 'Tu contraseña fue cambiada',
      text: 'La contraseña de tu cuenta fue cambiada. Si no fuiste vos, contactá a soporte de inmediato.',
    });
  }
}
