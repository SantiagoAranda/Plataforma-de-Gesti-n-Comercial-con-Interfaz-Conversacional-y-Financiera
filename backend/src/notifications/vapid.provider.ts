import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

@Injectable()
export class VapidProvider implements OnModuleInit {
  private readonly logger = new Logger(VapidProvider.name);
  private configured = false;
  private details: webpush.RequestOptions['vapidDetails'];

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY')?.trim();
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY')?.trim();
    const subject = this.config.get<string>('VAPID_SUBJECT')?.trim();

    if (!publicKey || !privateKey || !subject) {
      this.logger.warn(
        'Web Push deshabilitado: faltan variables VAPID requeridas.',
      );
      return;
    }

    if (
      !BASE64URL_PATTERN.test(publicKey) ||
      !BASE64URL_PATTERN.test(privateKey) ||
      publicKey.length > 256 ||
      privateKey.length > 256 ||
      !this.isValidSubject(subject)
    ) {
      this.logger.warn(
        'Web Push deshabilitado: la configuración VAPID tiene formato inválido.',
      );
      return;
    }

    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      webpush.getVapidHeaders(
        'https://push-validation.invalid',
        subject,
        publicKey,
        privateKey,
        'aes128gcm',
      );
      this.details = { subject, publicKey, privateKey };
      this.configured = true;
    } catch {
      this.logger.warn(
        'Web Push deshabilitado: web-push rechazó la configuración VAPID.',
      );
    }
  }

  isEnabled() {
    return this.configured;
  }

  getDetails() {
    return this.details;
  }

  private isValidSubject(subject: string) {
    if (/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(subject)) return true;
    try {
      return new URL(subject).protocol === 'https:';
    } catch {
      return false;
    }
  }
}
