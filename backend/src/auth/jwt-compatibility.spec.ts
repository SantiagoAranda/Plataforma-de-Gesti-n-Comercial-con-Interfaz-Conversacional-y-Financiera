import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtStrategy } from './jwt.strategy/jwt.strategy';
import { jwtSecret } from './jwt.config';

describe('Historical JWT compatibility', () => {
  const secret = ' fictitious-secret-with-significant-spaces ';
  function authenticate(token: string) {
    const strategy = new JwtStrategy(
      new ConfigService({ JWT_SECRET: secret }),
    ) as JwtStrategy & {
      success: (user: unknown) => void;
      fail: (reason: unknown) => void;
      error: (reason: unknown) => void;
      authenticate: (request: unknown, options: unknown) => void;
    };
    return new Promise((resolve, reject) => {
      strategy.success = resolve;
      strategy.fail = reject;
      strategy.error = reject;
      strategy.authenticate(
        { headers: { authorization: `Bearer ${token}` } },
        {},
      );
    });
  }
  it('verifies old claims and signature including significant secret spaces', async () => {
    const legacy = new JwtService({ secret }).sign(
      { sub: 'old-user', role: 'BUSINESS', businessId: 'old-business' },
      { expiresIn: '24h' },
    );
    await expect(authenticate(legacy)).resolves.toEqual({
      userId: 'old-user',
      role: 'BUSINESS',
      businessId: 'old-business',
    });
  });
  it('rejects expired and differently signed tokens', async () => {
    const claims = { sub: 'old-admin', role: 'ADMIN', businessId: null };
    await expect(
      authenticate(new JwtService({ secret }).sign(claims, { expiresIn: -1 })),
    ).rejects.toBeDefined();
    await expect(
      authenticate(new JwtService({ secret: 'other' }).sign(claims)),
    ).rejects.toBeDefined();
  });
  it.each([undefined, '', '  '])(
    'fails closed without a configured secret',
    (value) => {
      expect(() => jwtSecret(new ConfigService({ JWT_SECRET: value }))).toThrow(
        'JWT_SECRET must be configured',
      );
    },
  );
});
