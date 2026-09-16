/** @jest-environment node */

jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import {
  findFieldConflictsForDraftSlot,
  findFieldConflictsForInterval,
  loadFieldBlockerCatalog,
} from '@/server/repositories/fieldSchedulingConflicts';

const lowerBound = new Date('2026-06-01T09:00:00.000Z');

const createClient = () => ({
  matches: { findMany: jest.fn().mockResolvedValue([]) },
  events: { findMany: jest.fn().mockResolvedValue([]) },
  timeSlots: { findMany: jest.fn().mockResolvedValue([]) },
  rentalBookingItems: { findMany: jest.fn().mockResolvedValue([]) },
});

describe('field scheduling blocker catalog', () => {
  it('loads a concrete blocker that starts before the lower bound and ends after it', async () => {
    const client = createClient();
    client.matches.findMany.mockResolvedValue([
      {
        id: 'match_1',
        eventId: 'event_1',
        fieldId: 'field_1',
        start: new Date('2026-06-01T08:30:00.000Z'),
        end: new Date('2026-06-01T09:30:00.000Z'),
        placementState: 'PLACED',
      },
    ]);

    const catalog = await loadFieldBlockerCatalog({
      client,
      fieldIds: ['field_1'],
      lowerBound,
      excludeEventId: 'draft_event',
    });

    expect(client.matches.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        start: { not: null },
        end: { not: null, gt: lowerBound },
      }),
    }));
    expect(findFieldConflictsForInterval(
      catalog,
      ['field_1'],
      new Date('2026-06-01T09:10:00.000Z'),
      new Date('2026-06-01T09:20:00.000Z'),
    )).toHaveLength(1);
  });

  it('keeps an unbounded recurring blocker as a rule and finds a far-future draft overlap', async () => {
    const client = createClient();
    client.events.findMany.mockResolvedValue([
      {
        id: 'weekly_1',
        eventType: 'WEEKLY_EVENT',
        parentEvent: null,
        start: new Date('2026-01-01T00:00:00.000Z'),
        end: null,
        noFixedEndDateTime: true,
        fieldIds: ['field_1'],
        timeSlotIds: ['slot_1'],
      },
    ]);
    client.timeSlots.findMany.mockResolvedValue([
      {
        id: 'slot_1',
        daysOfWeek: [0],
        startTimeMinutes: 10 * 60,
        endTimeMinutes: 11 * 60,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: null,
        timeZone: 'UTC',
        repeating: true,
        scheduledFieldIds: ['field_1'],
      },
    ]);

    const catalog = await loadFieldBlockerCatalog({
      client,
      fieldIds: ['field_1'],
      lowerBound,
    });

    expect(catalog.recurringByFieldId.get('field_1')).toHaveLength(1);
    const conflicts = findFieldConflictsForDraftSlot(
      catalog,
      {
        key: 'draft_slot',
        scheduledFieldIds: ['field_1'],
        daysOfWeek: [0],
        startDate: '2028-06-04',
        endDate: undefined,
        timeZone: 'UTC',
        startTimeMinutes: 10 * 60 + 15,
        endTimeMinutes: 10 * 60 + 45,
        repeating: true,
      },
      {
        eventStart: '2028-06-04T00:00:00.000Z',
        eventEnd: null,
        hasNoFixedEventEnd: true,
      },
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.source.kind).toBe('EVENT_TIME_SLOT');
  });
});
