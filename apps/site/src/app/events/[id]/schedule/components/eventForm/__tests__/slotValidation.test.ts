import type { LeagueSlotForm } from '@/app/discover/components/LeagueFields';

import {
  computeOneTimeSlotBoundsError,
  computeSlotError,
} from '../slotValidation';

const buildSlot = (overrides: Partial<LeagueSlotForm> = {}): LeagueSlotForm => ({
  key: 'slot-1',
  scheduledFieldId: 'resource-1',
  scheduledFieldIds: ['resource-1'],
  dayOfWeek: 0,
  daysOfWeek: [0],
  divisions: ['division-1'],
  startDate: '2026-08-17T09:00:00',
  endDate: '2026-08-17T10:00:00',
  startTimeMinutes: 9 * 60,
  endTimeMinutes: 10 * 60,
  timeZone: 'UTC',
  repeating: false,
  conflicts: [],
  checking: false,
  error: undefined,
  ...overrides,
});

describe('One-Time Time Slot editor validation', () => {
  it('identifies the conflicting Resource, local date, and both intervals', () => {
    const slots = [
      buildSlot(),
      buildSlot({
        key: 'slot-2',
        startDate: '2026-08-17T09:30:00',
        endDate: '2026-08-17T10:30:00',
        startTimeMinutes: 9 * 60 + 30,
        endTimeMinutes: 10 * 60 + 30,
      }),
    ];

    expect(computeSlotError(slots, 0, 'LEAGUE')).toMatch(
      /Resource "resource-1".*2026-08-17 09:00–10:00.*2026-08-17 09:30–10:30/,
    );
  });

  it('allows adjacency but rejects shared-Resource overlaps across disjoint Division scopes', () => {
    expect(computeSlotError([
      buildSlot(),
      buildSlot({
        key: 'adjacent',
        startDate: '2026-08-17T10:00:00',
        endDate: '2026-08-17T11:00:00',
        startTimeMinutes: 10 * 60,
        endTimeMinutes: 11 * 60,
      }),
    ], 0, 'LEAGUE')).toBeUndefined();

    expect(computeSlotError([
      buildSlot(),
      buildSlot({ key: 'other-division', divisions: ['division-2'] }),
    ], 0, 'LEAGUE')).toMatch(/Resource "resource-1".*disjoint Division scopes/);
  });

  it('reports fixed Event-bound violations instead of clipping', () => {
    expect(computeOneTimeSlotBoundsError({
      slot: buildSlot(),
      eventStart: new Date('2026-08-17T09:30:00.000Z'),
      eventEnd: new Date('2026-08-17T11:00:00.000Z'),
    })).toMatch(/outside the Event boundary.*rejected rather than clipped/);
  });

  it('surfaces strict repeating resolver errors during conflict validation', () => {
    const invalidRepeatingSlot = buildSlot({
      key: 'slot-dst-gap',
      daysOfWeek: [6],
      startDate: '2026-03-08T05:00:00.000Z',
      endDate: '2026-03-09T04:00:00.000Z',
      timeZone: 'America/New_York',
      startTimeMinutes: 2 * 60 + 30,
      endTimeMinutes: 4 * 60,
      repeating: true,
    });
    const comparableRepeatingSlot = buildSlot({
      key: 'slot-comparable',
      daysOfWeek: [6],
      startDate: '2026-03-08T05:00:00.000Z',
      endDate: '2026-03-09T04:00:00.000Z',
      timeZone: 'America/New_York',
      startTimeMinutes: 5 * 60,
      endTimeMinutes: 6 * 60,
      repeating: true,
    });

    expect(computeSlotError(
      [invalidRepeatingSlot, comparableRepeatingSlot],
      0,
      'LEAGUE',
      null,
      {
        eventStart: new Date('2026-03-08T00:00:00.000Z'),
        eventEnd: new Date('2026-03-09T00:00:00.000Z'),
      },
    )).toMatch(/does not exist on 2026-03-08/);
  });
});
