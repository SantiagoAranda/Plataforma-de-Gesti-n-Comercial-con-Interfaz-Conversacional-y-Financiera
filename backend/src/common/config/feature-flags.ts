import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export function parseBooleanFlag(value: unknown): boolean {
  if (typeof value !== 'string') return false;

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return false;
}

@Injectable()
export class FeatureFlagsService {
  readonly simpleRegimeEnabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.simpleRegimeEnabled = parseBooleanFlag(
      this.config.get<string>('SIMPLE_REGIME_ENABLED'),
    );
  }
}
