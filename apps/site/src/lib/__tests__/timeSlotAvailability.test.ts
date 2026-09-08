import {
  assertOneTimeTimeSlotFutureEnd,
  assertValidOneTimeTimeSlots,
  findOneTimeTimeSlotConflicts,
  resolveOneTimeTimeSlot,
  TimeSlotValidationError,
} from '../timeSlotAvailability';

const slot = (overrides: Record<string, unknown> = {}) => ({
  id: 'slot-1',
  repeating: false,
  startDate: '2026-08-17T00:00:00',
  endDate: '2026-08-17T00:00:00',
  startTimeMinutes: 9 * 60,
  endTimeMinutes: 10 * 60,
  timeZone: 'America/New_York',
  scheduledFieldIds: ['resource-1'],
  divisions: ['division-1'],
  ...overrides,
});

describe('canonical One-Time Time Slot availability', () => {
  it('rejects an interval longer than one local day even by seconds', () => {
    expect(() => resolveOneTimeTimeSlot(slot({
      startDate: '2035-06-11T09:00:00Z', endDate: '2035-06-12T09:00:01Z',
      startTimeMinutes: 540, endTimeMinutes: 540, timeZone: 'UTC',
    }))).toThrow(/one local day/);
  });

  it('rejects expired saves but keeps historical intervals readable', () => {
    const resolved = resolveOneTimeTimeSlot(slot());
    expect(() => assertOneTimeTimeSlotFutureEnd(resolved, resolved.end)).toThrow(/in the future/);
    expect(() => assertOneTimeTimeSlotFutureEnd(resolved, new Date('2026-08-18T00:00:00Z'))).toThrow(/in the future/);
    expect(() => assertOneTimeTimeSlotFutureEnd(resolved, new Date('2026-08-17T13:30:00Z'))).not.toThrow();
  });

  it('keeps a full local day across a daylight-saving change', () => {
    const resolved = resolveOneTimeTimeSlot(slot({
      startDate: '2026-10-31T12:00:00', endDate: '2026-11-01T12:00:00',
      startTimeMinutes: 720, endTimeMinutes: 720,
    }));
    expect(resolved.end.getTime() - resolved.start.getTime()).toBe(25 * 60 * 60 * 1000);
  });

  it('resolves an overnight clock range on the next local date', () => {
    const resolved = resolveOneTimeTimeSlot(slot({ startTimeMinutes: 22 * 60, endTimeMinutes: 2 * 60 }));
    expect(resolved.start.toISOString()).toBe('2026-08-18T02:00:00.000Z');
    expect(resolved.end.toISOString()).toBe('2026-08-18T06:00:00.000Z');
  });

  it('resolves equal clock times as one full local day', () => {
    const resolved = resolveOneTimeTimeSlot(slot({ endTimeMinutes: 9 * 60 }));
    expect(resolved.end.toISOString()).toBe('2026-08-18T13:00:00.000Z');
  });

  it('rejects an explicit multi-day range instead of silently shortening it', () => {
    expect(() => resolveOneTimeTimeSlot(slot({ endDate: '2026-08-19T10:00:00' })))
      .toThrow(/one local day/);
  });

  it('resolves one local date and exact start/end times in the slot time zone', () => {
    const resolved = resolveOneTimeTimeSlot(slot());

    expect(resolved.localDate).toBe('2026-08-17');
    expect(resolved.start.toISOString()).toBe('2026-08-17T13:00:00.000Z');
    expect(resolved.end.toISOString()).toBe('2026-08-17T14:00:00.000Z');
    expect(resolved.resourceIds).toEqual(['resource-1']);
    expect(resolved.divisionIds).toEqual(['division-1']);
  });

  it('preserves explicit matching instants exactly, including seconds', () => {
    const resolved = resolveOneTimeTimeSlot(slot({
      startDate: '2026-08-17T13:00:17.000Z',
      endDate: '2026-08-17T14:00:43.000Z',
    }));

    expect(resolved.start.toISOString()).toBe('2026-08-17T13:00:17.000Z');
    expect(resolved.end.toISOString()).toBe('2026-08-17T14:00:43.000Z');
  });

  it('rejects a One-Time Time Slot outside either fixed Event bound without clipping', () => {
    expect(() => assertValidOneTimeTimeSlots({
      slots: [slot()],
      eventStart: new Date('2026-08-17T13:30:00.000Z'),
      eventEnd: new Date('2026-08-17T15:00:00.000Z'),
      eligibleResourceIds: ['resource-1'],
      eligibleDivisionIds: ['division-1'],
    })).toThrow(/outside the Event boundary.*rejected rather than clipped/);

    expect(() => assertValidOneTimeTimeSlots({
      slots: [slot()],
      eventStart: new Date('2026-08-17T12:00:00.000Z'),
      eventEnd: new Date('2026-08-17T13:30:00.000Z'),
      eligibleResourceIds: ['resource-1'],
      eligibleDivisionIds: ['division-1'],
    })).toThrow(/outside the Event boundary.*rejected rather than clipped/);
  });

  it('accepts adjacent intervals while rejecting a true overlap on a shared Resource', () => {
    const adjacent = [
      resolveOneTimeTimeSlot(slot()),
      resolveOneTimeTimeSlot(slot({
        id: 'slot-2',
        startTimeMinutes: 10 * 60,
        endTimeMinutes: 11 * 60,
      })),
    ];
    expect(findOneTimeTimeSlotConflicts(adjacent, {
      eligibleResourceIds: ['resource-1'],
      eligibleDivisionIds: ['division-1'],
    })).toEqual([]);

    expect(() => assertValidOneTimeTimeSlots({
      slots: [slot(), slot({
        id: 'slot-2',
        startTimeMinutes: 9 * 60 + 30,
        endTimeMinutes: 11 * 60,
      })],
      eventStart: new Date('2026-08-17T12:00:00.000Z'),
      eventEnd: new Date('2026-08-17T16:00:00.000Z'),
      eligibleResourceIds: ['resource-1'],
      eligibleDivisionIds: ['division-1'],
    })).toThrow(TimeSlotValidationError);
  });

  it('keeps disjoint Resources independent but rejects shared-Resource overlaps across Division scopes', () => {
    const base = resolveOneTimeTimeSlot(slot());
    const differentResource = resolveOneTimeTimeSlot(slot({
      id: 'slot-resource-2',
      scheduledFieldIds: ['resource-2'],
    }));
    const differentDivision = resolveOneTimeTimeSlot(slot({
      id: 'slot-division-2',
      divisions: ['division-2'],
    }));

    expect(findOneTimeTimeSlotConflicts([base, differentResource], {
      eligibleResourceIds: ['resource-1', 'resource-2'],
      eligibleDivisionIds: ['division-1'],
    })).toEqual([]);
    expect(findOneTimeTimeSlotConflicts([base, differentDivision], {
      eligibleResourceIds: ['resource-1'],
      eligibleDivisionIds: ['division-1', 'division-2'],
    })).toEqual([expect.objectContaining({
      resourceId: 'resource-1',
      divisionId: null,
      divisionScopes: [['division-1'], ['division-2']],
    })]);
  });

  it('expands global and multi-Resource scopes once and reports precise conflict evidence', () => {
    const conflicts = findOneTimeTimeSlotConflicts([
      resolveOneTimeTimeSlot(slot({
        id: 'slot-global',
        scheduledFieldIds: [],
        scheduledFieldId: null,
        divisions: [],
      })),
      resolveOneTimeTimeSlot(slot({
        id: 'slot-multi',
        scheduledFieldIds: ['resource-1', 'resource-2'],
        divisions: ['division-1'],
        startTimeMinutes: 9 * 60 + 30,
        endTimeMinutes: 10 * 60 + 30,
      })),
    ], {
      eligibleResourceIds: ['resource-1', 'resource-2'],
      eligibleDivisionIds: ['division-1'],
    });

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      resourceId: 'resource-1',
      divisionId: 'division-1',
      first: {
        localDate: '2026-08-17',
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 10 * 60,
      },
      second: {
        localDate: '2026-08-17',
        startTimeMinutes: 9 * 60 + 30,
        endTimeMinutes: 10 * 60 + 30,
      },
    });
  });
});
