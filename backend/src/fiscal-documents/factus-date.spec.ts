import { parseFactusDateTime } from './factus-date';

describe('parseFactusDateTime', () => {
  it.each([
    ['13-09-2026 10:37:14 PM', '2026-09-14T03:37:14.000Z'],
    ['13-09-2026 10:37:14 AM', '2026-09-13T15:37:14.000Z'],
    ['31-12-2026 11:59:59 PM', '2027-01-01T04:59:59.000Z'],
    ['01-01-2026 12:00:00 AM', '2026-01-01T05:00:00.000Z'],
    ['01-01-2026 12:00:00 PM', '2026-01-01T17:00:00.000Z'],
  ])('parses %s as the deterministic Colombia instant', (value, expected) => {
    expect(parseFactusDateTime(value)?.toISOString()).toBe(expected);
  });

  it.each([
    undefined,
    null,
    '',
    '13-09-2026 00:37:14 PM',
    '31-02-2026 10:37:14 PM',
    '2026-09-13T22:37:14Z',
  ])('returns null rather than an invalid Date for %p', (value) => {
    expect(parseFactusDateTime(value)).toBeNull();
  });
});
