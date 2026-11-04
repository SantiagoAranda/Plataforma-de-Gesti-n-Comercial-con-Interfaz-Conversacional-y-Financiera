import { ConfigService } from '@nestjs/config';
import { cooldownMinutes, mailQuotaLimits } from './mail-quota';
import { normalizeEmailKey } from './recovery-rate-limit.guard';
import { authActionOf, handlerFor } from './auth-action.decorator';

const cfg = (values: Record<string, string>) => new ConfigService(values);

describe('mail quota configuration', () => {
  it('defaults to a free-tier friendly limit with a notice reserve', () => {
    expect(mailQuotaLimits(cfg({}))).toEqual({ limit: 80, reserve: 20 });
    expect(cooldownMinutes(cfg({}))).toBe(3);
  });

  it('reads values from configuration and rejects invalid ones', () => {
    expect(
      mailQuotaLimits(
        cfg({
          RECOVERY_MAIL_DAILY_LIMIT: '100',
          RECOVERY_MAIL_NOTICE_RESERVE: '30',
        }),
      ),
    ).toEqual({ limit: 100, reserve: 30 });
    expect(() =>
      mailQuotaLimits(
        cfg({
          RECOVERY_MAIL_DAILY_LIMIT: '10',
          RECOVERY_MAIL_NOTICE_RESERVE: '10',
        }),
      ),
    ).toThrow();
    expect(() =>
      mailQuotaLimits(cfg({ RECOVERY_MAIL_DAILY_LIMIT: 'x' })),
    ).toThrow();
    expect(() =>
      cooldownMinutes(cfg({ RECOVERY_COOLDOWN_MINUTES: '1' })),
    ).toThrow();
    expect(() =>
      cooldownMinutes(cfg({ RECOVERY_COOLDOWN_MINUTES: '6' })),
    ).toThrow();
  });
});

describe('rate-limit identities and policy metadata', () => {
  it('normalizes only the counter key', () => {
    expect(normalizeEmailKey(' Mixed@Example.TEST ')).toBe(
      'mixed@example.test',
    );
    expect(normalizeEmailKey('ＡＢ@example.test')).toBe('ab@example.test');
  });

  it('identifies actions by metadata, not by method name', () => {
    function login() {}
    expect(authActionOf(login)).toBeUndefined();
    expect(authActionOf(handlerFor('forgot'))).toBe('forgot');
  });
});
