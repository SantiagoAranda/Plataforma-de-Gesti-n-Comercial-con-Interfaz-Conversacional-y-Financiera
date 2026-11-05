import { ConfigService } from '@nestjs/config';
import { mailErrorCode, RecoveryMailService } from './recovery-mail.service';

describe('RecoveryMailService', () => {
  it('builds the token link from trusted HTTPS configuration in a fragment', () => {
    const mail = new RecoveryMailService(
      new ConfigService({
        NODE_ENV: 'production',
        FRONTEND_PUBLIC_URL: 'https://example.test/base',
      }),
    );
    const url = new URL(mail.recoveryUrl('fixture-token'));
    expect(url.origin).toBe('https://example.test');
    expect(url.pathname).toBe('/reset-password');
    expect(url.search).toBe('');
    expect(new URLSearchParams(url.hash.slice(1)).get('token')).toBe(
      'fixture-token',
    );
  });
  it('rejects unsafe origins and missing SMTP configuration without sending', () => {
    const mail = new RecoveryMailService(
      new ConfigService({
        NODE_ENV: 'production',
        FRONTEND_PUBLIC_URL: 'http://example.test',
      }),
    );
    expect(() => mail.recoveryUrl('fixture-token')).toThrow(
      'no está disponible',
    );
    expect(() => mail.assertConfigured()).toThrow('no está disponible');
  });
  it('provides a non-delivering test transport', async () => {
    const mail = new RecoveryMailService(
      new ConfigService({
        NODE_ENV: 'test',
        MAIL_PROVIDER: 'test',
        FRONTEND_PUBLIC_URL: 'http://localhost:3000',
      }),
    );
    expect(() => mail.assertConfigured()).not.toThrow();
    await expect(
      mail.sendRecovery('fake@example.test', 'fixture-token'),
    ).resolves.toBeUndefined();
    await expect(
      mail.sendChanged('fake@example.test'),
    ).resolves.toBeUndefined();
  });
  it('uses mandatory STARTTLS on 587 with certificate verification and bounded timeouts', () => {
    const mail = new RecoveryMailService(
      new ConfigService({
        NODE_ENV: 'production',
        MAIL_PROVIDER: 'smtp',
        SMTP_HOST: 'smtp.example.test',
        SMTP_PORT: '587',
        SMTP_USER: 'fixture-user',
        SMTP_PASSWORD: 'fixture-password',
        MAIL_FROM: 'Fixture <no-reply@example.test>',
        FRONTEND_PUBLIC_URL: 'https://example.test',
      }),
    );
    expect(() => mail.assertConfigured()).not.toThrow();
    const options = (
      mail as unknown as { transport: { options: Record<string, unknown> } }
    ).transport.options;
    expect(options.secure).toBe(false);
    expect(options.requireTLS).toBe(true);
    expect(options.connectionTimeout).toBe(10000);
    expect(JSON.stringify(options.tls ?? {})).not.toContain(
      'rejectUnauthorized',
    );
  });
  it('exposes only a short safe code for mail failures', () => {
    expect(
      mailErrorCode(
        Object.assign(new Error('secret@x.test link'), { code: 'EAUTH' }),
      ),
    ).toBe('EAUTH');
    expect(mailErrorCode(new Error('secret@x.test'))).toBe('UNKNOWN');
    expect(mailErrorCode({ code: 'bad code with spaces and token' })).toBe(
      'UNKNOWN',
    );
    expect(mailErrorCode(null)).toBe('UNKNOWN');
  });
});
