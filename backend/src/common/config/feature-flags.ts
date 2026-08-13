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
  /**
   * RUT and sales policy. The legacy SIMPLE_REGIME_ENABLED value is used only
   * while SIMPLE_REGIME_SALES_ENABLED is absent.
   */
  readonly simpleRegimeSalesEnabled: boolean;
  /** Bimonthly/annual Simple Tax module policy. It never inherits the legacy flag. */
  readonly simpleRegimeTaxModuleEnabled: boolean;
  /** @deprecated Use simpleRegimeSalesEnabled. */
  readonly simpleRegimeEnabled: boolean;

  constructor(private readonly config: ConfigService) {
    const salesFlag = this.config.get<string>('SIMPLE_REGIME_SALES_ENABLED');
    this.simpleRegimeSalesEnabled = parseBooleanFlag(
      salesFlag === undefined
        ? this.config.get<string>('SIMPLE_REGIME_ENABLED')
        : salesFlag,
    );
    this.simpleRegimeTaxModuleEnabled = parseBooleanFlag(
      this.config.get<string>('SIMPLE_REGIME_TAX_MODULE_ENABLED'),
    );
    this.simpleRegimeEnabled = this.simpleRegimeSalesEnabled;
  }

  isSimpleRegimeSalesEnabled() {
    return this.simpleRegimeSalesEnabled;
  }

  isSimpleRegimeTaxModuleEnabled() {
    return this.simpleRegimeTaxModuleEnabled;
  }
}
