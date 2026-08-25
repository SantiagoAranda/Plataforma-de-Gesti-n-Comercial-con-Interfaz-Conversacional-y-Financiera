import {
  businessDateAtCurrentTime,
  parseAccountingDate,
} from './accounting-date';

describe('Colombian accounting dates', () => {
  it('converts a civil date using the current Bogota time and round-trips exactly', () => {
    const confirmedAt = new Date('2026-08-22T20:30:45.000Z');
    const result = businessDateAtCurrentTime('2026-08-19', confirmedAt);

    expect(result?.toISOString()).toBe('2026-08-19T20:30:45.000Z');
    const roundTrip = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(result!);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      roundTrip.find((candidate) => candidate.type === type)?.value;
    expect({
      year: part('year'),
      month: part('month'),
      day: part('day'),
      hour: part('hour'),
      minute: part('minute'),
      second: part('second'),
    }).toEqual({
      year: '2026',
      month: '08',
      day: '19',
      hour: '15',
      minute: '30',
      second: '45',
    });
  });

  it('does not interpret a date-only input as midnight UTC', () => {
    const result = parseAccountingDate(
      '2026-08-22',
      new Date('2026-08-23T01:15:00.000Z'),
    );

    expect(result?.toISOString()).toBe('2026-08-23T01:15:00.000Z');
  });

  it('preserves an explicit instant including an explicit Bogota time', () => {
    const result = parseAccountingDate('2026-08-19T14:45:00.000Z');

    expect(result?.toISOString()).toBe('2026-08-19T14:45:00.000Z');
  });

  it('rejects an invalid civil date', () => {
    expect(businessDateAtCurrentTime('2026-02-30')).toBeNull();
  });
});
