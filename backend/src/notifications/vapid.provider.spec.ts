import * as webpush from 'web-push';
import { VapidProvider } from './vapid.provider';

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  getVapidHeaders: jest.fn().mockReturnValue({ Authorization: 'redacted' }),
}));

describe('VapidProvider', () => {
  it('stays disabled without preventing startup when variables are absent', () => {
    const provider = new VapidProvider({
      get: jest.fn().mockReturnValue(undefined),
    } as never);

    expect(() => provider.onModuleInit()).not.toThrow();
    expect(provider.isEnabled()).toBe(false);
  });

  it('performs the optional local header check with a valid synthetic audience', () => {
    const values: Record<string, string> = {
      VAPID_PUBLIC_KEY: 'A'.repeat(87),
      VAPID_PRIVATE_KEY: 'B'.repeat(43),
      VAPID_SUBJECT: 'mailto:soporte@example.com',
    };
    const provider = new VapidProvider({
      get: jest.fn((key: string) => values[key]),
    } as never);

    provider.onModuleInit();

    expect(webpush.getVapidHeaders).toHaveBeenCalledWith(
      'https://push-validation.invalid',
      values.VAPID_SUBJECT,
      values.VAPID_PUBLIC_KEY,
      values.VAPID_PRIVATE_KEY,
      'aes128gcm',
    );
    expect(provider.isEnabled()).toBe(true);
  });
});
