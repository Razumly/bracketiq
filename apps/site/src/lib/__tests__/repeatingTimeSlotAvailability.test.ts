import {
  enumerateRepeatingTimeSlotOccurrences,
  resolveRepeatingTimeSlotOccurrence,
  RepeatingTimeSlotValidationError,
} from '../repeatingTimeSlotAvailability';

const slot = (overrides: Record<string, unknown> = {}) => ({
  id: 'weekly-slot-1',
  daysOfWeek: [5],
  startDate: '2026-02-01',
  endDate: '2026-03-31',
  startTimeMinutes: 22 * 60,
  endTimeMinutes: 2 * 60,
  timeZone: 'America/New_York',
  scheduledFieldIds: ['field-1'],
  divisions: ['division-1'],
  ...overrides,
});

describe('strict repeating Time Slot availability', () => {
  it('resolves an overnight interval on the next local date', () => {
    const resolved = resolveRepeatingTimeSlotOccurrence(slot(), '2026-02-28');

    expect(resolved.occurrenceDate).toBe('2026-02-28');
    expect(resolved.endDate).toBe('2026-03-01');
    expect(resolved.start.toISOString()).toBe('2026-03-01T03:00:00.000Z');
    expect(resolved.end.toISOString()).toBe('2026-03-01T07:00:00.000Z');
    expect(resolved.durationMinutes).toBe(240);
    expect(resolved.nextWeekday).toBe('Sunday');
  });

  it('preserves actual elapsed duration when an overnight interval crosses DST', () => {
    const resolved = resolveRepeatingTimeSlotOccurrence(slot({
      daysOfWeek: [5],
      startDate: '2026-03-07',
      endDate: '2026-03-09',
      startTimeMinutes: 23 * 60,
      endTimeMinutes: 4 * 60,
    }), '2026-03-07');

    expect(resolved.start.toISOString()).toBe('2026-03-08T04:00:00.000Z');
    expect(resolved.end.toISOString()).toBe('2026-03-08T08:00:00.000Z');
    expect(resolved.durationMinutes).toBe(240);
  });

  it('rejects a nonexistent local time during a DST gap', () => {
    expect(() => resolveRepeatingTimeSlotOccurrence(slot({
      daysOfWeek: [6],
      startDate: '2026-03-08',
      endDate: '2026-03-08',
      startTimeMinutes: 2 * 60 + 30,
      endTimeMinutes: 4 * 60,
    }), '2026-03-08')).toThrow(RepeatingTimeSlotValidationError);
    expect(() => resolveRepeatingTimeSlotOccurrence(slot({
      daysOfWeek: [6],
      startDate: '2026-03-08',
      endDate: '2026-03-08',
      startTimeMinutes: 2 * 60 + 30,
      endTimeMinutes: 4 * 60,
    }), '2026-03-08')).toThrow(/does not exist/);
  });

  it('rejects an ambiguous local time during a DST fold', () => {
    expect(() => resolveRepeatingTimeSlotOccurrence(slot({
      daysOfWeek: [6],
      startDate: '2026-11-01',
      endDate: '2026-11-01',
      startTimeMinutes: 1 * 60 + 30,
      endTimeMinutes: 3 * 60,
    }), '2026-11-01')).toThrow(/ambiguous/);
  });
  it('filters occurrences outside configured local date bounds', () => {
    const occurrences = enumerateRepeatingTimeSlotOccurrences({
      slot: slot({
        daysOfWeek: [1],
        startDate: '2026-03-10',
        endDate: '2026-03-31',
      }),
      windowStart: new Date('2026-03-01T00:00:00.000Z'),
      windowEnd: new Date('2026-04-10T00:00:00.000Z'),
    });

    expect(occurrences.map((occurrence) => occurrence.occurrenceDate)).toEqual([
      '2026-03-10',
      '2026-03-17',
      '2026-03-24',
      '2026-03-31',
    ]);
  });


  it('enumerates occurrences across a date range and keeps overnight windows', () => {
    const occurrences = enumerateRepeatingTimeSlotOccurrences({
      slot: slot({ endDate: '2026-03-31', daysOfWeek: [5], endTimeMinutes: 60 }),
      windowStart: new Date('2026-03-06T00:00:00.000Z'),
      windowEnd: new Date('2026-03-16T00:00:00.000Z'),
    });

    expect(occurrences.map((occurrence) => occurrence.occurrenceDate)).toEqual([
      '2026-03-07',
      '2026-03-14',
    ]);
  });

});
