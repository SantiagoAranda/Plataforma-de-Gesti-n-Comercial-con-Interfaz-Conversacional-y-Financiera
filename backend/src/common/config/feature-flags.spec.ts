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

  it('defaults Simple Regime to disabled', () => {
    const service = new FeatureFlagsService({ get: () => undefined } as any);
    expect(service.simpleRegimeEnabled).toBe(false);
  });
});
