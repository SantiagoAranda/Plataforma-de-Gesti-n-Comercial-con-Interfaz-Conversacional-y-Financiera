import {
  isPublicPushAddress,
  resolveAndValidatePushEndpoint,
} from './push-endpoint-security';

describe('push endpoint address validation', () => {
  it.each([
    ['127.0.0.1', 4],
    ['10.1.2.3', 4],
    ['169.254.1.1', 4],
    ['192.168.1.1', 4],
    ['::1', 6],
    ['fe80::1', 6],
    ['fc00::1', 6],
    ['2001:db8::1', 6],
    ['::ffff:127.0.0.1', 6],
    ['::ffff:7f00:1', 6],
  ])('rejects non-public address %s', (address, family) => {
    expect(isPublicPushAddress(address as string, family as number)).toBe(
      false,
    );
  });

  it.each([
    ['8.8.8.8', 4],
    ['1.1.1.1', 4],
    ['2606:4700:4700::1111', 6],
  ])('accepts public address %s', (address, family) => {
    expect(isPublicPushAddress(address as string, family as number)).toBe(true);
  });

  it('rejects a public-looking hostname resolving to a private address', async () => {
    await expect(
      resolveAndValidatePushEndpoint(
        'https://push.example.test/subscription',
        async () => [{ address: '10.0.0.8', family: 4 }],
      ),
    ).rejects.toThrow('Endpoint Web Push no permitido');
  });

  it('rejects when any DNS result is non-public', async () => {
    await expect(
      resolveAndValidatePushEndpoint(
        'https://push.example.test/subscription',
        async () => [
          { address: '1.1.1.1', family: 4 },
          { address: 'fe80::1', family: 6 },
        ],
      ),
    ).rejects.toThrow('Endpoint Web Push no permitido');
  });

  it.each([
    'https://[::1]/push',
    'https://[fe80::1]/push',
    'https://[::ffff:127.0.0.1]/push',
  ])('rejects unsafe literal endpoint %s', async (endpoint) => {
    await expect(resolveAndValidatePushEndpoint(endpoint)).rejects.toThrow(
      'Endpoint Web Push no permitido',
    );
  });
});
