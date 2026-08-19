import { buildEvent, buildTimeSlot } from '../../../../../../../test/factories';

import { buildWeeklyOccurrenceOptionsInRange } from '../helpers';

describe('weekly schedule occurrence options', () => {
  it('expands repeating slots but includes a fixed supplemental slot only once', () => {
    const event = buildEvent({
      eventType: 'WEEKLY_EVENT',
      parentEvent: null,
      timeSlots: [
        buildTimeSlot({
          $id: 'slot-weekly',
          repeating: true,
          dayOfWeek: undefined,
          daysOfWeek: [0],
          startDate: '2026-07-13',
          endDate: '2026-08-31',
        }),
        buildTimeSlot({
          $id: 'slot-fixed',
          repeating: false,
          dayOfWeek: undefined,
          daysOfWeek: [],
          startDate: '2026-07-15',
          endDate: '2026-07-15',
          startTimeMinutes: 11 * 60,
          endTimeMinutes: 12 * 60,
        }),
      ],
    });

    const occurrences = buildWeeklyOccurrenceOptionsInRange(
      event,
      new Date(2026, 6, 13),
      new Date(2026, 6, 31),
    );

    expect(occurrences.filter((occurrence) => occurrence.slotId === 'slot-weekly')).toHaveLength(3);
    expect(occurrences.filter((occurrence) => occurrence.slotId === 'slot-fixed')).toEqual([
      expect.objectContaining({
        id: 'slot-fixed:2026-07-15',
        occurrenceDate: '2026-07-15',
      }),
    ]);
  });
  it('keeps repeating overnight occurrences on their local start date', () => {
    const event = buildEvent({
      eventType: 'WEEKLY_EVENT',
      parentEvent: null,
      timeSlots: [
        buildTimeSlot({
          $id: 'slot-overnight',
          repeating: true,
          daysOfWeek: [0],
          dayOfWeek: 0,
          startDate: '2026-07-13',
          endDate: '2026-07-31',
          startTimeMinutes: 23 * 60,
          endTimeMinutes: 60,
          timeZone: 'UTC',
        }),
      ],
    });

    const occurrences = buildWeeklyOccurrenceOptionsInRange(
      event,
      new Date(2026, 6, 13),
      new Date(2026, 6, 19),
    );

    expect(occurrences).toEqual([
      expect.objectContaining({
        id: 'slot-overnight:2026-07-13',
        occurrenceDate: '2026-07-13',
        startMinutes: 23 * 60,
        endMinutes: 60,
      }),
    ]);
  });
});

