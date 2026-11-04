import { ConfigService } from '@nestjs/config';

// Enable only after the authentication limiter and its proxy mode are configured.
export function passwordV2Enabled(config: ConfigService): boolean {
  return (
    config.get<string>('AUTH_PASSWORD_POLICY_V2_ENABLED') === 'true' &&
    config.get<string>('AUTH_RATE_LIMIT_ENABLED') === 'true'
  );
}
