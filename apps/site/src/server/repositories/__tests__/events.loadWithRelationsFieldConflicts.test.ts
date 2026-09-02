/** @jest-environment node */

jest.mock('@/lib/prisma', () => ({
  prisma: {},
}));

import {
  assertNoEventFieldSchedulingConflicts,
  loadEventWithRelations,
  saveEventSchedule,
} from '@/server/repositories/events';
import { ensureSplitPlayoffTimeSlotCoverage } from '@/server/scheduler/timeSlotCoverage';
import { getTimeSlotExplicitDivisionIds } from '@/server/scheduler/types';

type LoadClient = {
  $executeRaw: jest.Mock;
  events: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
  };
  divisions: {
    findMany: jest.Mock;
  };
  fields: {
    findMany: jest.Mock;
  };
  teams: {
    findMany: jest.Mock;
  };
  timeSlots: {
    findMany: jest.Mock;
  };
  eventDivisionPhaseSources?: {
    findMany: jest.Mock;
  };
  userData: {
    findMany: jest.Mock;
  };
  matches: {
    findMany: jest.Mock;
  };
  leagueScoringConfigs: {
    findUnique: jest.Mock;
  };
};

const baseEventRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'event_sched',
  name: 'Scheduling Event',
  start: new Date('2026-03-01T10:00:00.000Z'),
  end: new Date('2026-03-01T12:00:00.000Z'),
  eventType: 'TOURNAMENT',
  state: 'PUBLISHED',
  divisions: ['open'],
  fieldIds: ['field_1'],
  teamIds: [],
  timeSlotIds: [],
  officialIds: [],
  waitListIds: [],
  freeAgentIds: [],
  requiredTemplateIds: [],
  organizationId: null,
  sportIds: [],
  teamSignup: true,
  doubleElimination: false,
  usesSets: false,
  setDurationMinutes: 0,
  matchDurationMinutes: 60,
  restTimeMinutes: 0,
  ...overrides,
});

const createClient = (eventOverrides: Record<string, unknown> = {}): LoadClient => {
  const eventRow = baseEventRow(eventOverrides);
  return {
    $executeRaw: jest.fn().mockResolvedValue(1),
    events: {
      findUnique: jest.fn().mockResolvedValue(eventRow),
      findMany: jest.fn().mockResolvedValue([]),
    },
    divisions: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    fields: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'field_1',
          organizationId: null,
          divisions: ['open'],
          name: 'Court A',
          createdAt: null,
          updatedAt: null,
        },
      ]),
    },
    teams: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    timeSlots: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    userData: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    matches: {
      findMany: jest.fn().mockImplementation((args?: Record<string, any>) => {
        if (args?.where?.eventId === 'event_sched') {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      }),
    },
    leagueScoringConfigs: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };
};

describe('loadEventWithRelations field conflict hydration', () => {
  it('does not persist scheduler-mutated end dates for fixed-end events', async () => {
    const client = {
      events: {
        update: jest.fn().mockResolvedValue({}),
      },
    };

    await saveEventSchedule({
      id: 'event_fixed',
      end: new Date('2026-07-12T03:00:00.000Z'),
      noFixedEndDateTime: false,
    } as any, client as any);

    expect(client.events.update).toHaveBeenCalledWith({
      where: { id: 'event_fixed' },
      data: {
        updatedAt: expect.any(Date),
      },
    });
  });

  it('persists scheduler end dates for open-ended events', async () => {
    const client = {
      events: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const end = new Date('2026-07-12T03:00:00.000Z');

    await saveEventSchedule({
      id: 'event_open',
      end,
      noFixedEndDateTime: true,
    } as any, client as any);

    expect(client.events.update).toHaveBeenCalledWith({
      where: { id: 'event_open' },
      data: {
        end,
        generatedScheduleEnd: end,
        updatedAt: expect.any(Date),
      },
    });
  });

  it('hydrates event time slot time zones for scheduler rebuilds', async () => {
    const client = createClient({
      timeSlotIds: ['slot_event_1'],
    });
    client.timeSlots.findMany.mockResolvedValue([
      {
        id: 'slot_event_1',
        dayOfWeek: 5,
        daysOfWeek: [5],
        startTimeMinutes: 780,
        endTimeMinutes: 1140,
        startDate: new Date('2026-07-11T20:00:00.000Z'),
        endDate: new Date('2026-07-12T02:00:00.000Z'),
        timeZone: 'America/Los_Angeles',
        repeating: false,
        scheduledFieldId: 'field_1',
        scheduledFieldIds: ['field_1'],
      },
    ]);

    const loaded = await loadEventWithRelations('event_sched', client as any);

    expect(client.timeSlots.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        timeZone: true,
      }),
    }));
    expect(loaded.timeSlots).toHaveLength(1);
    expect(loaded.timeSlots[0].timeZone).toBe('America/Los_Angeles');
  });

  it('uses persisted field divisions when no event division mapping is available', async () => {
    const client = createClient({
      eventType: 'LEAGUE',
      divisions: [],
    });
    client.fields.findMany.mockResolvedValue([
      {
        id: 'field_1',
        organizationId: null,
        divisions: ['legacy_division'],
        name: 'Court A',
        createdAt: null,
        updatedAt: null,
      },
    ]);

    const loaded = await loadEventWithRelations(
      'event_sched',
      client as unknown as Parameters<typeof loadEventWithRelations>[1],
    );

    expect(loaded.fields.field_1.divisions.map((division) => division.id)).toEqual([
      'legacy_division',
    ]);
  });

  it('retains every Phase Division scoped by a shared Bracket', async () => {
    const client = createClient({
      divisions: ['entry_a', 'entry_b'],
      fieldIds: ['field_1'],
      timeSlotIds: ['slot_bracket'],
    });
    client.divisions.findMany.mockResolvedValue([
      {
        id: 'entry_a',
        key: 'entry_a',
        name: 'Entry A',
        kind: 'LEAGUE',
        role: 'ENTRY',
        status: 'ACTIVE',
        scope: 'EVENT',
        fieldIds: ['field_1'],
        teamIds: [],
      },
      {
        id: 'entry_b',
        key: 'entry_b',
        name: 'Entry B',
        kind: 'LEAGUE',
        role: 'ENTRY',
        status: 'ACTIVE',
        scope: 'EVENT',
        fieldIds: ['field_1'],
        teamIds: [],
      },
      {
        id: 'entry_a__phase__pool',
        key: 'entry_a__phase__pool',
        name: 'Pool A',
        kind: 'LEAGUE',
        role: 'PHASE',
        phase: 'POOL',
        sourceDivisionId: 'entry_a',
        status: 'ACTIVE',
        scope: 'EVENT',
        fieldIds: ['field_1'],
        teamIds: [],
      },
      {
        id: 'entry_b__phase__pool',
        key: 'entry_b__phase__pool',
        name: 'Pool B',
        kind: 'LEAGUE',
        role: 'PHASE',
        phase: 'POOL',
        sourceDivisionId: 'entry_b',
        status: 'ACTIVE',
        scope: 'EVENT',
        fieldIds: ['field_1'],
        teamIds: [],
      },
      {
        id: 'bracket_open',
        key: 'bracket_open',
        name: 'Open Bracket',
        kind: 'PLAYOFF',
        role: 'PHASE',
        phase: 'BRACKET',
        sourceDivisionId: 'entry_a',
        status: 'ACTIVE',
        scope: 'EVENT',
        fieldIds: ['field_1'],
        teamIds: [],
      },
      {
        id: 'bracket_closed',
        key: 'bracket_closed',
        name: 'Closed Bracket',
        kind: 'PLAYOFF',
        role: 'PHASE',
        phase: 'BRACKET',
        sourceDivisionId: 'entry_a',
        status: 'ACTIVE',
        scope: 'EVENT',
        fieldIds: ['field_1'],
        teamIds: [],
      },
    ]);
    client.eventDivisionPhaseSources = {
      findMany: jest.fn().mockResolvedValue([
        { phaseDivisionId: 'entry_a__phase__pool', entryDivisionId: 'entry_a' },
        { phaseDivisionId: 'entry_b__phase__pool', entryDivisionId: 'entry_b' },
        { phaseDivisionId: 'bracket_open', entryDivisionId: 'entry_a' },
        { phaseDivisionId: 'bracket_open', entryDivisionId: 'entry_b' },
        { phaseDivisionId: 'bracket_closed', entryDivisionId: 'entry_a' },
      ]),
    };
    client.fields.findMany.mockResolvedValue([
      {
        id: 'field_1',
        organizationId: null,
        divisions: ['entry_a', 'entry_b', 'bracket_open'],
        name: 'Court A',
        createdAt: null,
        updatedAt: null,
      },
    ]);
    client.timeSlots.findMany.mockResolvedValue([
      {
        id: 'slot_bracket',
        dayOfWeek: 5,
        daysOfWeek: [5],
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 17 * 60,
        startDate: new Date('2026-08-29T09:00:00.000Z'),
        endDate: new Date('2026-08-29T17:00:00.000Z'),
        repeating: true,
        scheduledFieldId: 'field_1',
        scheduledFieldIds: ['field_1'],
        divisions: ['bracket_open'],
        timeZone: 'UTC',
      },
    ]);

    const loaded = await loadEventWithRelations(
      'event_sched',
      client as unknown as Parameters<typeof loadEventWithRelations>[1],
    );

    expect(loaded.timeSlots[0].divisions.map((division) => division.id).sort()).toEqual([
      'bracket_open',
      'entry_a__phase__pool',
      'entry_b__phase__pool',
    ]);
    const reloaded = await loadEventWithRelations(
      'event_sched',
      client as unknown as Parameters<typeof loadEventWithRelations>[1],
    );
    expect(reloaded.timeSlots[0].divisions.map((division) => division.id).sort()).toEqual([
      'bracket_open',
      'entry_a__phase__pool',
      'entry_b__phase__pool',
    ]);
  });

  it('hydrates a retained Match against its inactive Division instead of falling back', async () => {
    const client = createClient({
      divisions: ['entry'],
      fieldIds: [],
      teamIds: [],
    });
    client.divisions.findMany.mockResolvedValue([
      {
        id: 'entry',
        key: 'entry',
        name: 'Entry',
        kind: 'LEAGUE',
        role: 'ENTRY',
        status: 'ACTIVE',
        scope: 'EVENT',
        fieldIds: [],
        teamIds: [],
      },
      {
        id: 'removed_phase',
        key: 'removed_phase',
        name: 'Removed Phase',
        kind: 'LEAGUE',
        role: 'PHASE',
        phase: 'POOL',
        sourceDivisionId: 'entry',
        status: 'ARCHIVED',
        scope: 'EVENT',
        fieldIds: [],
        teamIds: [],
      },
    ]);
    const protectedMatchRow = {
      id: 'match_protected',
      eventId: 'event_sched',
      division: 'removed_phase',
      fieldId: null,
      team1Id: null,
      team2Id: null,
      teamOfficialId: null,
      start: null,
      end: null,
      locked: true,
      status: 'STARTED',
      resultStatus: null,
      resultType: null,
      team1Points: [],
      team2Points: [],
      placementState: 'PLACED',
    };
    client.matches.findMany.mockImplementation(async (args?: Record<string, unknown>) => {
      const select = args?.select;
      const isRetainedDivisionLookup =
        typeof select === 'object'
        && select !== null
        && 'division' in select;
      return isRetainedDivisionLookup
        ? [{ division: 'removed_phase' }]
        : [protectedMatchRow];
    });

    const loaded = await loadEventWithRelations(
      'event_sched',
      client as unknown as Parameters<typeof loadEventWithRelations>[1],
      { retainedMatchIds: ['match_protected'] },
    );

    expect(client.divisions.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: [
          { status: 'ACTIVE' },
          { id: { in: ['removed_phase'] } },
        ],
      }),
    }));
    expect(loaded.matches.match_protected.division.id).toBe('removed_phase');
  });

  it('keeps hydrated regular scope narrow when an explicit Playoff slot exists', async () => {
    const client = createClient({
      eventType: 'LEAGUE',
      includePlayoffs: true,
      splitLeaguePlayoffDivisions: true,
      divisions: ['entry_a'],
      timeSlotIds: ['slot_regular', 'slot_playoff'],
    });
    client.divisions.findMany.mockResolvedValue([
      {
        id: 'entry_a',
        key: 'entry_a',
        name: 'Entry A',
        kind: 'LEAGUE',
        role: 'ENTRY',
        fieldIds: ['field_1'],
        teamIds: [],
      },
      {
        id: 'entry_a__phase__league',
        key: 'entry_a__phase__league',
        name: 'Entry A League',
        kind: 'LEAGUE',
        role: 'PHASE',
        phase: 'LEAGUE',
        sourceDivisionId: 'entry_a',
        fieldIds: ['field_1'],
        playoffPlacementDivisionIds: ['bracket_open'],
        teamIds: [],
      },
      {
        id: 'bracket_open',
        key: 'bracket_open',
        name: 'Open Bracket',
        kind: 'PLAYOFF',
        role: 'PHASE',
        phase: 'PLAYOFF',
        sourceDivisionId: 'entry_a',
        fieldIds: [],
        teamIds: [],
      },
    ]);
    client.eventDivisionPhaseSources = {
      findMany: jest.fn().mockResolvedValue([
        { phaseDivisionId: 'entry_a__phase__league', entryDivisionId: 'entry_a' },
        { phaseDivisionId: 'bracket_open', entryDivisionId: 'entry_a' },
      ]),
    };
    client.fields.findMany.mockResolvedValue([
      {
        id: 'field_1',
        organizationId: null,
        divisions: ['entry_a'],
        name: 'Court A',
        createdAt: null,
        updatedAt: null,
      },
    ]);
    client.timeSlots.findMany.mockResolvedValue([
      {
        id: 'slot_regular',
        dayOfWeek: 5,
        daysOfWeek: [5],
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 17 * 60,
        startDate: new Date('2026-08-29T09:00:00.000Z'),
        endDate: new Date('2026-08-29T17:00:00.000Z'),
        repeating: true,
        scheduledFieldId: 'field_1',
        scheduledFieldIds: ['field_1'],
        divisions: ['entry_a'],
        timeZone: 'UTC',
      },
      {
        id: 'slot_playoff',
        dayOfWeek: 6,
        daysOfWeek: [6],
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 17 * 60,
        startDate: new Date('2026-08-30T09:00:00.000Z'),
        endDate: new Date('2026-08-30T17:00:00.000Z'),
        repeating: true,
        scheduledFieldId: 'field_1',
        scheduledFieldIds: ['field_1'],
        divisions: ['bracket_open'],
        timeZone: 'UTC',
      },
    ]);

    const loaded = await loadEventWithRelations(
      'event_sched',
      client as unknown as Parameters<typeof loadEventWithRelations>[1],
    );
    const regularSlot = loaded.timeSlots.find((slot) => slot.id === 'slot_regular');
    const playoffSlot = loaded.timeSlots.find((slot) => slot.id === 'slot_playoff');
    expect(getTimeSlotExplicitDivisionIds(regularSlot)).toEqual(['entry_a']);
    expect(getTimeSlotExplicitDivisionIds(playoffSlot)).toEqual(['bracket_open']);
    expect(regularSlot?.divisions.map((division) => division.id)).toContain('bracket_open');
    expect(loaded.fields.field_1.divisions.map((division) => division.id)).toContain('bracket_open');

    ensureSplitPlayoffTimeSlotCoverage(loaded);

    expect(regularSlot?.divisions.map((division) => division.id)).not.toContain('bracket_open');
    expect(regularSlot?.divisions.map((division) => division.id)).toEqual(['entry_a__phase__league']);
    expect(loaded.fields.field_1.divisions.map((division) => division.id)).toEqual(['entry_a__phase__league']);
    expect(playoffSlot?.divisions.map((division) => division.id)).toContain('bracket_open');
    expect(playoffSlot?.divisions.map((division) => division.id)).not.toContain('entry_a__phase__league');
    expect(loaded.fields.field_1.divisions.map((division) => division.id)).not.toContain('bracket_open');
  });


  it('hydrates field blocking windows from external regular events and matches', async () => {
    const client = createClient();

    client.matches.findMany.mockImplementation((args?: Record<string, any>) => {
      if (args?.where?.eventId === 'event_sched') {
        return Promise.resolve([]);
      }
      return Promise.resolve([
        {
          id: 'match_external_1',
          eventId: 'event_other_tournament',
          fieldId: 'field_1',
          start: new Date('2026-03-01T10:30:00.000Z'),
          end: new Date('2026-03-01T11:15:00.000Z'),
        },
      ]);
    });

    client.events.findMany.mockResolvedValue([
      {
        id: 'event_regular_1',
        eventType: 'EVENT',
        start: new Date('2026-03-01T11:20:00.000Z'),
        end: new Date('2026-03-01T11:50:00.000Z'),
        fieldIds: ['field_1'],
      },
      {
        id: 'event_other_league',
        eventType: 'LEAGUE',
        start: new Date('2026-03-01T10:20:00.000Z'),
        end: new Date('2026-03-01T10:45:00.000Z'),
        fieldIds: ['field_1'],
      },
    ]);

    const loaded = await loadEventWithRelations('event_sched', client as any);
    const field = loaded.fields.field_1;

    expect(field).toBeDefined();
    expect(field.events.map((event) => event.id).sort()).toEqual([
      '__field_event_block__event_regular_1__field_1',
      '__field_match_block__match_external_1',
    ]);
    expect(field.events.map((event) => event.start.toISOString())).toEqual([
      '2026-03-01T10:30:00.000Z',
      '2026-03-01T11:20:00.000Z',
    ]);
    expect(field.events.map((event) => event.end.toISOString())).toEqual([
      '2026-03-01T11:15:00.000Z',
      '2026-03-01T11:50:00.000Z',
    ]);
  });

  it('queries external conflicts using open-ended lookahead when noFixedEndDateTime is enabled', async () => {
    const start = new Date('2026-03-01T10:00:00.000Z');
    const end = new Date('2026-03-01T10:15:00.000Z');
    const client = createClient({
      start,
      end,
      noFixedEndDateTime: true,
    });

    await loadEventWithRelations('event_sched', client as any);

    expect(client.matches.findMany).toHaveBeenCalledTimes(2);
    expect(client.events.findMany).toHaveBeenCalledTimes(1);

    const matchConflictWhere = client.matches.findMany.mock.calls[1][0].where;
    const eventConflictWhere = client.events.findMany.mock.calls[0][0].where;
    expect(matchConflictWhere.start).toEqual({ not: null });
    expect(matchConflictWhere.start).not.toHaveProperty("lt");
    expect(matchConflictWhere.end.gt.toISOString()).toBe(start.toISOString());
    expect(eventConflictWhere).not.toHaveProperty("start");
    expect(eventConflictWhere).not.toHaveProperty("end");
  });

  it('does not hydrate rental-slot blocking windows when event and field organizations match', async () => {
    const client = createClient({
      organizationId: 'org_1',
    });
    client.fields.findMany.mockResolvedValue([
      {
        id: 'field_1',
        organizationId: 'org_1',
        divisions: ['open'],
        name: 'Court A',
        rentalSlotIds: ['slot_rental_1'],
        createdAt: null,
        updatedAt: null,
      },
    ]);
    client.timeSlots.findMany.mockImplementation((args?: Record<string, any>) => {
      const ids = args?.where?.id?.in;
      if (Array.isArray(ids) && ids.includes('slot_rental_1')) {
        return Promise.resolve([
          {
            id: 'slot_rental_1',
            dayOfWeek: 6,
            daysOfWeek: [6],
            startTimeMinutes: 630,
            endTimeMinutes: 690,
            startDate: new Date('2026-03-01T10:30:00.000Z'),
            endDate: new Date('2026-03-01T11:30:00.000Z'),
            repeating: false,
            scheduledFieldId: 'field_1',
            scheduledFieldIds: ['field_1'],
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const loaded = await loadEventWithRelations('event_sched', client as any);
    const field = loaded.fields.field_1;

    expect(field.events).toHaveLength(0);
  });

  it('allows event field validation to overlap rental slots', async () => {
    const client = createClient({
      organizationId: 'org_1',
    });
    client.fields.findMany.mockResolvedValue([
      {
        id: 'field_1',
        organizationId: 'org_1',
        divisions: ['open'],
        name: 'Court A',
        rentalSlotIds: ['slot_rental_1'],
        createdAt: null,
        updatedAt: null,
      },
    ]);
    client.timeSlots.findMany.mockImplementation((args?: Record<string, any>) => {
      const ids = args?.where?.id?.in;
      if (Array.isArray(ids) && ids.includes('slot_rental_1')) {
        return Promise.resolve([
          {
            id: 'slot_rental_1',
            dayOfWeek: 6,
            daysOfWeek: [6],
            startTimeMinutes: 630,
            endTimeMinutes: 690,
            startDate: new Date('2026-03-01T10:30:00.000Z'),
            endDate: new Date('2026-03-01T11:30:00.000Z'),
            repeating: false,
            scheduledFieldId: 'field_1',
            scheduledFieldIds: ['field_1'],
          },
        ]);
      }
      return Promise.resolve([]);
    });

    await expect(assertNoEventFieldSchedulingConflicts({
      client: client as any,
      eventId: 'event_sched',
      organizationId: 'org_1',
      fieldIds: ['field_1'],
      start: new Date('2026-03-01T10:00:00.000Z'),
      end: new Date('2026-03-01T12:00:00.000Z'),
      noFixedEndDateTime: false,
      eventType: 'EVENT',
      parentEvent: null,
    })).resolves.toBeUndefined();
  });

  it('rejects event field validation when rental checkout overlaps a league time slot', async () => {
    const client = createClient({
      organizationId: 'org_1',
    });
    client.events.findMany.mockResolvedValue([
      {
        id: 'event_league_1',
        eventType: 'LEAGUE',
        parentEvent: null,
        start: new Date('2026-03-01T10:00:00.000Z'),
        end: new Date('2026-03-01T12:00:00.000Z'),
        fieldIds: ['field_1'],
        timeSlotIds: ['slot_league_1'],
      },
    ]);
    client.timeSlots.findMany.mockResolvedValue([
      {
        id: 'slot_league_1',
        dayOfWeek: 6,
        daysOfWeek: [6],
        startTimeMinutes: 630,
        endTimeMinutes: 690,
        startDate: new Date('2026-03-01T10:30:00.000Z'),
        endDate: new Date('2026-03-01T11:30:00.000Z'),
        repeating: false,
        scheduledFieldId: 'field_1',
        scheduledFieldIds: ['field_1'],
      },
    ]);

    await expect(assertNoEventFieldSchedulingConflicts({
      client: client as any,
      eventId: 'rental_event_1',
      organizationId: 'org_1',
      fieldIds: ['field_1'],
      start: new Date('2026-03-01T10:45:00.000Z'),
      end: new Date('2026-03-01T11:15:00.000Z'),
      noFixedEndDateTime: false,
      eventType: 'EVENT',
      parentEvent: null,
    })).rejects.toMatchObject({
      name: 'EventFieldConflictError',
      conflicts: [
        expect.objectContaining({
          fieldId: 'field_1',
          parentId: 'event_league_1',
        }),
      ],
    });
  });

  it('does not hydrate rental-slot blocking windows when event rents from a different field organization', async () => {
    const client = createClient({
      organizationId: null,
    });
    client.fields.findMany.mockResolvedValue([
      {
        id: 'field_1',
        organizationId: 'facility_org',
        divisions: ['open'],
        name: 'Court A',
        rentalSlotIds: ['slot_rental_1'],
        createdAt: null,
        updatedAt: null,
      },
    ]);
    client.timeSlots.findMany.mockImplementation((args?: Record<string, any>) => {
      const ids = args?.where?.id?.in;
      if (Array.isArray(ids) && ids.includes('slot_rental_1')) {
        return Promise.resolve([
          {
            id: 'slot_rental_1',
            dayOfWeek: 6,
            daysOfWeek: [6],
            startTimeMinutes: 630,
            endTimeMinutes: 690,
            startDate: new Date('2026-03-01T10:30:00.000Z'),
            endDate: new Date('2026-03-01T11:30:00.000Z'),
            repeating: false,
            scheduledFieldId: 'field_1',
            scheduledFieldIds: ['field_1'],
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const loaded = await loadEventWithRelations('event_sched', client as any);
    const field = loaded.fields.field_1;

    expect(field.events).toHaveLength(0);
  });
});
