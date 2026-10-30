import { ConfigService } from '@nestjs/config';

export const JWT_EXPIRATION = '24h' as const;

export function jwtSecret(config: ConfigService): string {
  const secret = config.get<string>('JWT_SECRET');
  if (typeof secret !== 'string' || !secret.trim()) {
    throw new Error('JWT_SECRET must be configured before starting the server');
  }
  return secret;
}
