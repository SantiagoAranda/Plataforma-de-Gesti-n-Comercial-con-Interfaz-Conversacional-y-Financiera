import { ConfigService } from '@nestjs/config';
import { RecoveryMailService } from './recovery-mail.service';

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
});
