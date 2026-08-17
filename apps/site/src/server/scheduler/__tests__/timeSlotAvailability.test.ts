/** @jest-environment node */

import {
  calculateOneTimeAvailabilityMinutes,
  type SchedulerAvailabilityEvent,
} from '@/server/scheduler/timeSlotAvailability';

const eventFor = (timeSlots: Array<Record<string, unknown>>): SchedulerAvailabilityEvent => {
  const eventShape = {
    start: new Date('2026-08-17T08:00:00.000Z'),
    end: new Date('2026-08-17T18:00:00.000Z'),
    scheduleEndConstraint: null,
    noFixedEndDateTime: false,
    fields: {
      'resource-1': { id: 'resource-1' },
      'resource-2': { id: 'resource-2' },
    },
    divisions: [{ id: 'division-1' }, { id: 'division-2' }],
    playoffDivisions: [],
    timeSlots,
  };
  // The calculator intentionally consumes only this structural availability projection.
  return eventShape as unknown as SchedulerAvailabilityEvent;
};

const slot = (overrides: Record<string, unknown> = {}) => ({
  id: 'slot-1',
  repeating: false,
  startDate: new Date('2026-08-17T09:00:00.000Z'),
  endDate: new Date('2026-08-17T10:00:00.000Z'),
  startTimeMinutes: 9 * 60,
  endTimeMinutes: 10 * 60,
  timeZone: 'UTC',
  fieldIds: ['resource-1'],
  divisions: [{ id: 'division-1' }],
  ...overrides,
});

describe('One-Time scheduler availability diagnostics', () => {
  it('unions global and multi-Resource windows per stable Resource id without double counting', () => {
    const event = eventFor([
      slot({ id: 'global', fieldIds: [], field: null }),
      slot({
        id: 'multi',
        fieldIds: ['resource-1', 'resource-2'],
        divisions: [{ id: 'division-2' }],
        startDate: new Date('2026-08-17T10:00:00.000Z'),
        endDate: new Date('2026-08-17T11:00:00.000Z'),
        startTimeMinutes: 10 * 60,
        endTimeMinutes: 11 * 60,
      }),
      slot({
        id: 'adjacent-resource-1',
        startDate: new Date('2026-08-17T11:00:00.000Z'),
        endDate: new Date('2026-08-17T12:00:00.000Z'),
        startTimeMinutes: 11 * 60,
        endTimeMinutes: 12 * 60,
      }),
    ]);

    expect(calculateOneTimeAvailabilityMinutes(event)).toBe(300);
  });
});
