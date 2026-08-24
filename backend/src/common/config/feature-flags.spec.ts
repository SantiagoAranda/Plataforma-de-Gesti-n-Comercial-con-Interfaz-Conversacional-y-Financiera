import { FeatureFlagsService, parseBooleanFlag } from './feature-flags';

describe('FeatureFlagsService', () => {
  it.each([
    ['true', true],
    [' TRUE ', true],
    ['false', false],
    ['unexpected', false],
    [undefined, false],
  ])('parses SIMPLE_REGIME_ENABLED=%p as %p', (value, expected) => {
    expect(parseBooleanFlag(value)).toBe(expected);
  });

  it('uses the legacy flag only as a sales fallback and keeps the tax module disabled', () => {
    const service = new FeatureFlagsService({
      get: (key: string) => (key === 'SIMPLE_REGIME_ENABLED' ? 'true' : undefined),
    } as any);

    expect(service.simpleRegimeSalesEnabled).toBe(true);
    expect(service.simpleRegimeTaxModuleEnabled).toBe(false);
    expect(service.simpleRegimeEnabled).toBe(true);
  });

  it('prefers the sales-specific flag and defaults both policies to disabled', () => {
    const service = new FeatureFlagsService({
      get: (key: string) =>
        key === 'SIMPLE_REGIME_SALES_ENABLED'
          ? 'false'
          : key === 'SIMPLE_REGIME_ENABLED'
            ? 'true'
            : undefined,
    } as any);

    expect(service.simpleRegimeSalesEnabled).toBe(false);
    expect(service.simpleRegimeTaxModuleEnabled).toBe(false);
    const defaultService = new FeatureFlagsService({ get: () => undefined } as any);
    expect(defaultService.simpleRegimeEnabled).toBe(false);
  });

  it('supports sales while keeping the bimonthly tax module disabled', () => {
    const service = new FeatureFlagsService({
      get: (key: string) =>
        key === 'SIMPLE_REGIME_SALES_ENABLED'
          ? 'true'
          : key === 'SIMPLE_REGIME_TAX_MODULE_ENABLED'
            ? 'false'
            : undefined,
    } as any);

    expect(service.simpleRegimeSalesEnabled).toBe(true);
    expect(service.simpleRegimeTaxModuleEnabled).toBe(false);
  });
});
