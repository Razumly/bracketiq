/** @jest-environment node */

jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import type { Prisma } from '@/generated/prisma/client';
import { buildEventDivisionId } from '@/lib/divisionTypes';
import {
  assertEventRegistrationUnit,
  assertEventTypeRegistrationUnit,
  buildEventParticipantSnapshot,
  dedupeRegistrationCapacityRows,
  EventRegistrationDivisionError,
  EventRegistrationUnitError,
  getEventParticipantAggregates,
  getEventParticipantIdsForEvent,
  hasJoinedEventParticipant,
  isAcceptedParticipantRegistration,
  isRegistrationCapacityEntry,
  registrationUnitIdentityKey,
  syncDivisionTeamMembershipFromRegistrations,
  upsertEventRegistration,
} from '@/server/events/eventRegistrations';
import { syncEventParticipantRegistrationsFromCompatibilityIds } from '@/server/repositories/events';
import { resolveWeeklyOccurrence } from '@/server/events/weeklyOccurrences';

describe('resolveWeeklyOccurrence', () => {
  it('returns the strict DST resolver error for an invalid selected occurrence', async () => {
    const result = await resolveWeeklyOccurrence({
      event: {
        id: 'weekly_parent',
        eventType: 'WEEKLY_EVENT',
        timeSlotIds: ['slot_dst_gap'],
      },
      occurrence: {
        slotId: 'slot_dst_gap',
        occurrenceDate: '2026-03-08',
      },
    }, {
      timeSlots: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'slot_dst_gap',
          daysOfWeek: [6],
          startDate: new Date('2026-03-08T05:00:00.000Z'),
          endDate: new Date('2026-03-09T04:00:00.000Z'),
          startTimeMinutes: 2 * 60 + 30,
          endTimeMinutes: 4 * 60,
          timeZone: 'America/New_York',
          repeating: true,
        }),
      },
    } as any);

    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining('does not exist on 2026-03-08'),
    });
  });
});

describe('buildEventParticipantSnapshot', () => {
  const weeklySlot = {
    id: 'slot_1',
    divisions: ['div_a'],
    daysOfWeek: [1],
    startDate: '2026-04-01',
    endDate: '2026-04-30',
    startTimeMinutes: 10 * 60,
    endTimeMinutes: 11 * 60,
    timeZone: 'UTC',
    repeating: true,
  };

  const divisions = [
    {
      id: 'div_a',
      key: 'div_a',
      kind: 'LEAGUE',
      maxParticipants: 12,
    },
  ];

  it('returns a registered weekly team participant for the selected occurrence', async () => {
    const snapshot = await buildEventParticipantSnapshot({
      event: {
        id: 'weekly_parent',
        eventType: 'WEEKLY_EVENT',
        parentEvent: null,
        teamSignup: true,
        timeSlotIds: ['slot_1'],
        divisions: ['div_a'],
        maxParticipants: 12,
      },
      occurrence: {
        slotId: 'slot_1',
        occurrenceDate: '2026-04-14',
      },
    }, {
      eventRegistrations: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'weekly_parent__team__team_1__slot_1__2026-04-14',
            eventId: 'weekly_parent',
            registrantId: 'team_1',
            parentId: null,
            registrantType: 'TEAM',
            rosterRole: 'PARTICIPANT',
            status: 'ACTIVE',
            ageAtEvent: null,
            divisionId: 'div_a',
            divisionTypeId: null,
            divisionTypeKey: null,
            consentDocumentId: null,
            consentStatus: null,
            createdBy: 'user_1',
            slotId: 'slot_1',
            occurrenceDate: '2026-04-14',
            createdAt: new Date('2026-04-01T00:00:00.000Z'),
            updatedAt: new Date('2026-04-01T00:00:00.000Z'),
          },
        ]),
      },
      teams: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'team_1', name: 'Team One' },
        ]),
      },
      userData: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      timeSlots: {
        findUnique: jest.fn().mockResolvedValue(weeklySlot),
      },
      divisions: {
        findMany: jest.fn().mockResolvedValue(divisions),
      },
    } as any);

    expect(snapshot.participants.teamIds).toEqual(['team_1']);
    expect(snapshot.teams).toEqual([{ id: 'team_1', name: 'Team One' }]);
    expect(snapshot.participantCount).toBe(1);
    expect(snapshot.occurrence).toEqual({
      slotId: 'slot_1',
      occurrenceDate: '2026-04-14',
    });
  });

  it('does not expose started weekly checkout reservations as registered participants', async () => {
    const snapshot = await buildEventParticipantSnapshot({
      event: {
        id: 'weekly_parent',
        eventType: 'WEEKLY_EVENT',
        parentEvent: null,
        teamSignup: true,
        timeSlotIds: ['slot_1'],
        divisions: ['div_a'],
        maxParticipants: 12,
      },
      occurrence: {
        slotId: 'slot_1',
        occurrenceDate: '2026-04-14',
      },
    }, {
      eventRegistrations: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'weekly_parent__team__team_1__slot_1__2026-04-14',
            eventId: 'weekly_parent',
            registrantId: 'team_1',
            parentId: null,
            registrantType: 'TEAM',
            rosterRole: 'PARTICIPANT',
            status: 'STARTED',
            eventTeamId: 'team_1',
            ageAtEvent: null,
            divisionId: 'div_a',
            divisionTypeId: null,
            divisionTypeKey: null,
            consentDocumentId: null,
            consentStatus: null,
            createdBy: 'user_1',
            slotId: 'slot_1',
            occurrenceDate: '2026-04-14',
            createdAt: new Date('2026-04-01T00:00:00.000Z'),
            updatedAt: new Date('2026-04-01T00:00:00.000Z'),
          },
        ]),
      },
      teams: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'team_1', name: 'Team One' },
        ]),
      },
      userData: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      timeSlots: {
        findUnique: jest.fn().mockResolvedValue(weeklySlot),
      },
      divisions: {
        findMany: jest.fn().mockResolvedValue(divisions),
      },
    } as any);

    expect(snapshot.participants.teamIds).toEqual([]);
    expect(snapshot.teams).toEqual([]);
    expect(snapshot.participantCount).toBe(0);
    expect(snapshot.registrations).toBeUndefined();
    expect(snapshot.occurrence).toEqual({
      slotId: 'slot_1',
      occurrenceDate: '2026-04-14',
    });
  });

  it('returns a registered weekly self participant for the selected occurrence', async () => {
    const snapshot = await buildEventParticipantSnapshot({
      event: {
        id: 'weekly_parent',
        eventType: 'WEEKLY_EVENT',
        parentEvent: null,
        teamSignup: false,
        timeSlotIds: ['slot_1'],
        divisions: ['div_a'],
        maxParticipants: 12,
      },
      occurrence: {
        slotId: 'slot_1',
        occurrenceDate: '2026-04-14',
      },
    }, {
      eventRegistrations: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'weekly_parent__self__user_1__slot_1__2026-04-14',
            eventId: 'weekly_parent',
            registrantId: 'user_1',
            parentId: null,
            registrantType: 'SELF',
            rosterRole: 'PARTICIPANT',
            status: 'ACTIVE',
            ageAtEvent: null,
            divisionId: 'div_a',
            divisionTypeId: null,
            divisionTypeKey: null,
            consentDocumentId: null,
            consentStatus: null,
            createdBy: 'user_1',
            slotId: 'slot_1',
            occurrenceDate: '2026-04-14',
            createdAt: new Date('2026-04-01T00:00:00.000Z'),
            updatedAt: new Date('2026-04-01T00:00:00.000Z'),
          },
        ]),
      },
      teams: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      userData: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'user_1', firstName: 'Sam', teamIds: ['legacy_only'] },
        ]),
      },
      teamRegistrations: {
        findMany: jest.fn().mockResolvedValue([
          { userId: 'user_1', teamId: 'team_current' },
        ]),
      },
      teamStaffAssignments: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      timeSlots: {
        findUnique: jest.fn().mockResolvedValue(weeklySlot),
      },
      divisions: {
        findMany: jest.fn().mockResolvedValue(divisions),
      },
    } as any);

    expect(snapshot.participants.userIds).toEqual(['user_1']);
    expect(snapshot.users).toEqual([{
      id: 'user_1',
      firstName: 'Sam',
      teamIds: ['team_current'],
    }]);
    expect(snapshot.participantCount).toBe(1);
    expect(snapshot.occurrence).toEqual({
      slotId: 'slot_1',
      occurrenceDate: '2026-04-14',
    });
  });

  it('excludes placeholder slot registrations from registered team participants', async () => {
    const snapshot = await buildEventParticipantSnapshot({
      event: {
        id: 'event_1',
        eventType: 'LEAGUE',
        teamSignup: true,
        divisions: ['div_a'],
        maxParticipants: 12,
      },
    }, {
      eventRegistrations: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'event_1__team__registered_slot_1',
            eventId: 'event_1',
            registrantId: 'registered_slot_1',
            parentId: 'canonical_team_1',
            registrantType: 'TEAM',
            rosterRole: 'PARTICIPANT',
            status: 'ACTIVE',
            eventTeamId: 'registered_slot_1',
            ageAtEvent: null,
            divisionId: 'div_a',
            divisionTypeId: null,
            divisionTypeKey: null,
            consentDocumentId: null,
            consentStatus: null,
            createdBy: 'user_1',
            slotId: null,
            occurrenceDate: null,
            createdAt: new Date('2026-04-01T00:00:00.000Z'),
            updatedAt: new Date('2026-04-01T00:00:00.000Z'),
          },
          {
            id: 'event_1__team__registered_empty_identity',
            eventId: 'event_1',
            registrantId: 'registered_empty_identity',
            parentId: null,
            registrantType: 'TEAM',
            rosterRole: 'PARTICIPANT',
            status: 'ACTIVE',
            eventTeamId: 'registered_empty_identity',
            ageAtEvent: null,
            divisionId: 'div_a',
            divisionTypeId: null,
            divisionTypeKey: null,
            consentDocumentId: null,
            consentStatus: null,
            createdBy: 'user_2',
            slotId: null,
            occurrenceDate: null,
            createdAt: new Date('2026-04-01T00:00:00.000Z'),
            updatedAt: new Date('2026-04-01T00:00:00.000Z'),
          },
          {
            id: 'event_1__team__placeholder_slot_1',
            eventId: 'event_1',
            registrantId: 'placeholder_slot_1',
            parentId: null,
            registrantType: 'TEAM',
            rosterRole: 'PARTICIPANT',
            status: 'ACTIVE',
            eventTeamId: 'placeholder_slot_1',
            ageAtEvent: null,
            divisionId: 'div_a',
            divisionTypeId: null,
            divisionTypeKey: null,
            consentDocumentId: null,
            consentStatus: null,
            createdBy: 'user_1',
            slotId: null,
            occurrenceDate: null,
            createdAt: new Date('2026-04-01T00:00:00.000Z'),
            updatedAt: new Date('2026-04-01T00:00:00.000Z'),
          },
        ]),
      },
      teams: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'registered_slot_1',
            name: 'Registered Team',
            kind: 'REGISTERED',
            captainId: 'captain_1',
            parentTeamId: 'canonical_team_1',
          },
          {
            id: 'registered_empty_identity',
            name: 'Registration Pending Details',
            kind: 'REGISTERED',
            captainId: '',
            parentTeamId: null,
          },
          {
            id: 'placeholder_slot_1',
            name: 'Place Holder 1',
            kind: 'PLACEHOLDER',
            captainId: '',
            parentTeamId: null,
          },
        ]),
      },
      userData: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      divisions: {
        findMany: jest.fn().mockResolvedValue(divisions),
      },
    } as any);

    expect(snapshot.participants.teamIds).toEqual([
      'registered_slot_1',
      'registered_empty_identity',
    ]);
    expect(snapshot.teams).toEqual([
      expect.objectContaining({ id: 'registered_slot_1', name: 'Registered Team' }),
      expect.objectContaining({
        id: 'registered_empty_identity',
        name: 'Registration Pending Details',
      }),
    ]);
    expect(snapshot.participantCount).toBe(2);
  });

  it('uses canonical event division metadata for participant division groups', async () => {
    const openDivisionId = buildEventDivisionId('event_1', 'c_skill_open_age_18plus');
    const snapshot = await buildEventParticipantSnapshot({
      event: {
        id: 'event_1',
        eventType: 'LEAGUE',
        teamSignup: true,
        divisions: [openDivisionId],
        maxParticipants: 12,
      },
    }, {
      eventRegistrations: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'event_1__team__team_1',
            eventId: 'event_1',
            registrantId: 'team_1',
            parentId: 'canonical_team_1',
            registrantType: 'TEAM',
            rosterRole: 'PARTICIPANT',
            status: 'ACTIVE',
            eventTeamId: 'team_1',
            ageAtEvent: null,
            divisionId: openDivisionId,
            divisionTypeId: 'open',
            divisionTypeKey: 'c_skill_open',
            consentDocumentId: null,
            consentStatus: null,
            createdBy: 'user_1',
            slotId: null,
            occurrenceDate: null,
            createdAt: new Date('2026-04-01T00:00:00.000Z'),
            updatedAt: new Date('2026-04-01T00:00:00.000Z'),
          },
        ]),
      },
      teams: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'team_1',
            name: 'Registered Team',
            kind: 'REGISTERED',
            captainId: 'captain_1',
            parentTeamId: 'canonical_team_1',
          },
        ]),
      },
      userData: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      divisions: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: openDivisionId,
            key: 'c_skill_open_age_18plus',
            kind: 'LEAGUE',
            maxParticipants: 12,
            divisionTypeId: 'skill_open_age_18plus',
          },
        ]),
      },
    } as any);

    expect(snapshot.participants.divisions).toEqual([
      expect.objectContaining({
        divisionId: openDivisionId,
        divisionTypeId: 'skill_open_age_18plus',
        divisionTypeKey: 'c_skill_open_age_18plus',
        teamIds: ['team_1'],
      }),
    ]);
  });

  it('returns backend division warnings for overfilled and under-slotted team divisions', async () => {
    const snapshot = await buildEventParticipantSnapshot({
      event: {
        id: 'event_1',
        eventType: 'LEAGUE',
        teamSignup: true,
        singleDivision: false,
        divisions: ['div_over', 'div_missing'],
        maxParticipants: 6,
      },
    }, {
      eventRegistrations: {
        findMany: jest.fn().mockResolvedValue([
          ...['team_1', 'team_2', 'team_3'].map((teamId, index) => ({
            id: `event_1__team__${teamId}`,
            eventId: 'event_1',
            registrantId: teamId,
            parentId: `canonical_${teamId}`,
            registrantType: 'TEAM',
            rosterRole: 'PARTICIPANT',
            status: 'ACTIVE',
            eventTeamId: teamId,
            ageAtEvent: null,
            divisionId: 'div_over',
            divisionTypeId: null,
            divisionTypeKey: null,
            consentDocumentId: null,
            consentStatus: null,
            createdBy: 'user_1',
            slotId: null,
            occurrenceDate: null,
            createdAt: new Date(`2026-04-01T00:0${index}:00.000Z`),
            updatedAt: new Date(`2026-04-01T00:0${index}:00.000Z`),
          })),
          {
            id: 'event_1__team__team_4',
            eventId: 'event_1',
            registrantId: 'team_4',
            parentId: 'canonical_team_4',
            registrantType: 'TEAM',
            rosterRole: 'PARTICIPANT',
            status: 'ACTIVE',
            eventTeamId: 'team_4',
            ageAtEvent: null,
            divisionId: 'div_missing',
            divisionTypeId: null,
            divisionTypeKey: null,
            consentDocumentId: null,
            consentStatus: null,
            createdBy: 'user_1',
            slotId: null,
            occurrenceDate: null,
            createdAt: new Date('2026-04-01T00:04:00.000Z'),
            updatedAt: new Date('2026-04-01T00:04:00.000Z'),
          },
        ]),
      },
      teams: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'team_1', kind: 'REGISTERED', parentTeamId: 'canonical_team_1', captainId: 'captain_1' },
          { id: 'team_2', kind: 'REGISTERED', parentTeamId: 'canonical_team_2', captainId: 'captain_2' },
          { id: 'team_3', kind: 'REGISTERED', parentTeamId: 'canonical_team_3', captainId: 'captain_3' },
          { id: 'team_4', kind: 'REGISTERED', parentTeamId: 'canonical_team_4', captainId: 'captain_4' },
        ]),
      },
      userData: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      divisions: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'div_over',
            key: 'over',
            kind: 'LEAGUE',
            divisionTypeId: null,
            maxParticipants: 2,
            teamIds: ['team_1', 'team_2', 'team_3'],
          },
          {
            id: 'div_missing',
            key: 'missing',
            kind: 'LEAGUE',
            divisionTypeId: null,
            maxParticipants: 4,
            teamIds: ['team_4', 'placeholder_1'],
          },
        ]),
      },
    } as any);

    expect(snapshot.divisionWarnings).toEqual([
      expect.objectContaining({
        divisionId: 'div_over',
        code: 'OVER_CAPACITY',
        filledCount: 3,
        slotCount: 3,
        maxTeams: 2,
      }),
      expect.objectContaining({
        divisionId: 'div_missing',
        code: 'MISSING_PLACEHOLDERS',
        filledCount: 1,
        slotCount: 2,
        maxTeams: 4,
      }),
    ]);
  });

  it('dedupes active team registrations by canonical team identity', async () => {
    const openDivisionId = 'event_1__division__open';
    const mensDivisionId = 'event_1__division__mens';
    const oldRegistration = {
      id: 'event_1__team__old_event_team',
      eventId: 'event_1',
      registrantId: 'old_event_team',
      parentId: 'canonical_team_1',
      registrantType: 'TEAM',
      rosterRole: 'PARTICIPANT',
      status: 'ACTIVE',
      eventTeamId: 'old_event_team',
      sourceTeamRegistrationId: null,
      ageAtEvent: null,
      divisionId: openDivisionId,
      divisionTypeId: 'open',
      divisionTypeKey: 'open',
      jerseyNumber: null,
      position: null,
      isCaptain: false,
      consentDocumentId: null,
      consentStatus: null,
      createdBy: 'user_1',
      slotId: null,
      occurrenceDate: null,
      createdAt: new Date('2026-04-01T00:00:00.000Z'),
      updatedAt: new Date('2026-04-01T00:00:00.000Z'),
    };
    const freshRegistration = {
      ...oldRegistration,
      id: 'event_1__team__fresh_event_team',
      registrantId: 'fresh_event_team',
      eventTeamId: 'fresh_event_team',
      divisionId: mensDivisionId,
      divisionTypeId: 'mens',
      divisionTypeKey: 'mens',
      updatedAt: new Date('2026-04-02T00:00:00.000Z'),
    };

    const snapshot = await buildEventParticipantSnapshot({
      event: {
        id: 'event_1',
        eventType: 'LEAGUE',
        teamSignup: true,
        singleDivision: false,
        divisions: [openDivisionId, mensDivisionId],
        maxParticipants: 12,
      },
    }, {
      eventRegistrations: {
        findMany: jest.fn().mockResolvedValue([oldRegistration, freshRegistration]),
      },
      teams: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'old_event_team',
            name: 'Sea Glass Smash',
            kind: 'REGISTERED',
            parentTeamId: 'canonical_team_1',
            captainId: 'captain_1',
          },
          {
            id: 'fresh_event_team',
            name: 'Sea Glass Smash',
            kind: 'REGISTERED',
            parentTeamId: 'canonical_team_1',
            captainId: 'captain_1',
          },
        ]),
      },
      userData: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      divisions: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: openDivisionId,
            key: 'open',
            kind: 'LEAGUE',
            divisionTypeId: 'open',
            maxParticipants: 12,
            teamIds: ['old_event_team'],
          },
          {
            id: mensDivisionId,
            key: 'mens',
            kind: 'LEAGUE',
            divisionTypeId: 'mens',
            maxParticipants: 12,
            teamIds: ['fresh_event_team'],
          },
        ]),
      },
    } as any);

    expect(snapshot.participants.teamIds).toEqual(['fresh_event_team']);
    expect(snapshot.participants.divisions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        divisionId: openDivisionId,
        teamIds: [],
      }),
      expect.objectContaining({
        divisionId: mensDivisionId,
        teamIds: ['fresh_event_team'],
      }),
    ]));
    expect(snapshot.teams.map((team) => team.id)).toEqual(['fresh_event_team']);
    expect(snapshot.participantCount).toBe(1);
  });
});

describe('getEventParticipantIdsForEvent', () => {
  it('excludes active placeholder slot registrations from derived team ids', async () => {
    const ids = await getEventParticipantIdsForEvent('event_1', {
      eventRegistrations: {
        findMany: jest.fn().mockResolvedValue([
          {
            eventId: 'event_1',
            registrantId: 'team_1',
            eventTeamId: 'team_1',
            registrantType: 'TEAM',
            rosterRole: 'PARTICIPANT',
            status: 'ACTIVE',
            acceptedAt: new Date('2026-04-01T00:00:00.000Z'),
            createdAt: new Date('2026-04-01T00:00:00.000Z'),
            id: 'event_1__team__team_1',
          },
          {
            eventId: 'event_1',
            registrantId: 'slot_1',
            eventTeamId: 'slot_1',
            registrantType: 'TEAM',
            rosterRole: 'PARTICIPANT',
            status: 'ACTIVE',
            acceptedAt: new Date('2026-04-01T00:00:00.000Z'),
            createdAt: new Date('2026-04-01T00:00:00.000Z'),
            id: 'event_1__team__slot_1',
          },
        ]),
      },
      teams: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'team_1',
            kind: 'REGISTERED',
            captainId: 'captain_1',
            parentTeamId: 'canonical_team_1',
          },
          {
            id: 'slot_1',
            kind: 'PLACEHOLDER',
            captainId: '',
            parentTeamId: null,
          },
        ]),
      },
    } as any);

    expect(ids.teamIds).toEqual(['team_1']);
  });

  it('derives ids for the selected weekly occurrence when occurrence context is provided', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        eventId: 'weekly_parent',
        registrantId: 'user_1',
        eventTeamId: null,
        registrantType: 'SELF',
        rosterRole: 'PARTICIPANT',
        status: 'ACTIVE',
        acceptedAt: new Date('2026-04-01T00:00:00.000Z'),
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
        id: 'weekly_parent__self__user_1__slot_1__2026-08-05',
      },
    ]);

    const ids = await getEventParticipantIdsForEvent('weekly_parent', {
      eventRegistrations: {
        findMany,
      },
      teams: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as any, {
      slotId: 'slot_1',
      occurrenceDate: '2026-08-05',
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        eventId: { in: ['weekly_parent'] },
        status: { in: ['PENDING', 'ACTIVE', 'BLOCKED'] },
        slotId: 'slot_1',
        occurrenceDate: '2026-08-05',
      }),
    }));
    expect(ids.userIds).toEqual(['user_1']);
  });
});

describe('syncDivisionTeamMembershipFromRegistrations', () => {
  it('uses the exact selected division when split divisions share a type token', async () => {
    const firstDivisionId = buildEventDivisionId('event_1', 'c_skill_open');
    const secondDivisionId = buildEventDivisionId('event_1_2', 'c_skill_open');
    const updateMock = jest.fn().mockResolvedValue({});

    const activeTeamIds = await syncDivisionTeamMembershipFromRegistrations({
      id: 'event_1',
      eventType: 'LEAGUE',
      teamSignup: true,
      singleDivision: false,
      divisions: [firstDivisionId, secondDivisionId],
    }, {
      divisions: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: firstDivisionId,
            key: 'c_skill_open',
            kind: 'LEAGUE',
            teamIds: ['stale_team_1'],
          },
          {
            id: secondDivisionId,
            key: 'c_skill_open',
            kind: 'LEAGUE',
            teamIds: ['stale_team_2'],
          },
        ]),
        update: updateMock,
      },
      eventRegistrations: {
        findMany: jest.fn().mockResolvedValue([
          {
            registrantId: 'event_team_1',
            divisionId: secondDivisionId,
          },
        ]),
      },
    } as any);

    expect(activeTeamIds).toEqual(['event_team_1']);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: firstDivisionId },
      data: expect.objectContaining({
        teamIds: [],
      }),
    }));
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: secondDivisionId },
      data: expect.objectContaining({
        teamIds: ['event_team_1'],
      }),
    }));
  });
  it('keeps phase divisions out of registration-owned team membership', async () => {
    const entryDivisionId = buildEventDivisionId('event_1', 'c_skill_open');
    const phaseDivisionId = 'event_1__division__pool__open';
    const updateMock = jest.fn().mockResolvedValue({});
    const entryDivision = {
      id: entryDivisionId,
      key: 'c_skill_open',
      kind: 'LEAGUE',
      role: 'ENTRY',
      status: 'ACTIVE',
      teamIds: ['stale_entry_team'],
    };
    const phaseDivision = {
      id: phaseDivisionId,
      key: 'pool_open',
      kind: 'LEAGUE',
      role: 'PHASE',
      status: 'ACTIVE',
      teamIds: ['phase_team'],
    };
    const findManyMock = jest.fn().mockImplementation(({ where }: { where?: { role?: string } }) => (
      Promise.resolve(where?.role === 'ENTRY' ? [entryDivision] : [entryDivision, phaseDivision])
    ));

    const activeTeamIds = await syncDivisionTeamMembershipFromRegistrations({
      id: 'event_1',
      eventType: 'LEAGUE',
      teamSignup: true,
      singleDivision: true,
      divisions: [entryDivisionId],
    }, {
      divisions: {
        findMany: findManyMock,
        update: updateMock,
      },
      eventRegistrations: {
        findMany: jest.fn().mockResolvedValue([
          {
            registrantId: 'entry_team_1',
            divisionId: entryDivisionId,
          },
        ]),
      },
    } as any);

    expect(activeTeamIds).toEqual(['entry_team_1']);
    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { eventId: 'event_1', role: 'ENTRY', status: 'ACTIVE' },
    }));
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: entryDivisionId },
      data: expect.objectContaining({ teamIds: ['entry_team_1'] }),
    }));
    expect(updateMock).not.toHaveBeenCalledWith(expect.objectContaining({
      where: { id: phaseDivisionId },
    }));
  });


  it('preserves placeholder slots when syncing registered team assignments', async () => {
    const firstDivisionId = buildEventDivisionId('event_1', 'c_skill_open');
    const secondDivisionId = buildEventDivisionId('event_1', 'c_skill_advanced');
    const updateMock = jest.fn().mockResolvedValue({});

    const activeTeamIds = await syncDivisionTeamMembershipFromRegistrations({
      id: 'event_1',
      eventType: 'LEAGUE',
      teamSignup: true,
      singleDivision: false,
      divisions: [firstDivisionId, secondDivisionId],
    }, {
      divisions: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: firstDivisionId,
            key: 'c_skill_open',
            kind: 'LEAGUE',
            teamIds: ['slot_1', 'slot_2', 'stale_event_team'],
          },
          {
            id: secondDivisionId,
            key: 'c_skill_advanced',
            kind: 'LEAGUE',
            teamIds: ['slot_3'],
          },
        ]),
        update: updateMock,
      },
      eventRegistrations: {
        findMany: jest.fn().mockResolvedValue([
          {
            registrantId: 'slot_1',
            divisionId: firstDivisionId,
          },
          {
            registrantId: 'slot_2',
            divisionId: firstDivisionId,
          },
        ]),
      },
      teams: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'slot_1',
            kind: 'REGISTERED',
            captainId: 'captain_1',
            parentTeamId: 'canonical_team_1',
          },
          {
            id: 'slot_2',
            kind: 'PLACEHOLDER',
            captainId: '',
            parentTeamId: null,
          },
          {
            id: 'slot_3',
            kind: 'PLACEHOLDER',
            captainId: '',
            parentTeamId: null,
          },
          {
            id: 'stale_event_team',
            kind: 'REGISTERED',
            captainId: 'captain_2',
            parentTeamId: 'canonical_team_2',
          },
        ]),
      },
    } as any);

    expect(activeTeamIds).toEqual(['slot_1']);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: firstDivisionId },
      data: expect.objectContaining({
        teamIds: ['slot_1', 'slot_2'],
      }),
    }));
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: secondDivisionId },
      data: expect.objectContaining({
        teamIds: ['slot_3'],
      }),
    }));
  });
});
describe('accepted registration history and capacity', () => {
  it('keeps accepted history after cancellation while excluding non-accepted rows', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'registration_1' });
    // The helper only reads eventRegistrations.findFirst in this seam.
    const client = { eventRegistrations: { findFirst } } as unknown as Prisma.TransactionClient;

    await expect(hasJoinedEventParticipant('event_1', client)).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        eventId: 'event_1',
        rosterRole: 'PARTICIPANT',
      }),
    }));
    expect(isAcceptedParticipantRegistration({
      rosterRole: 'PARTICIPANT',
      status: 'CANCELLED',
      acceptedAt: new Date('2026-08-20T10:00:00.000Z'),
      registrantType: 'SELF',
      eventTeamId: null,
      sourceTeamRegistrationId: null,
    } satisfies Parameters<typeof isAcceptedParticipantRegistration>[0])).toBe(true);
    expect(isRegistrationCapacityEntry({
      rosterRole: 'PARTICIPANT',
      status: 'CANCELLED',
      acceptedAt: new Date('2026-08-20T10:00:00.000Z'),
      registrantType: 'SELF',
      eventTeamId: null,
      sourceTeamRegistrationId: null,
    } satisfies Parameters<typeof isRegistrationCapacityEntry>[0])).toBe(false);
    expect(isRegistrationCapacityEntry({
      rosterRole: 'PARTICIPANT',
      status: 'STARTED',
      acceptedAt: null,
      registrantType: 'SELF',
      eventTeamId: null,
      sourceTeamRegistrationId: null,
    } satisfies Parameters<typeof isRegistrationCapacityEntry>[0])).toBe(false);
  });

  it('counts one accepted team registration but not team roster members', () => {
    const acceptedTeam = {
      rosterRole: 'PARTICIPANT',
      status: 'ACTIVE',
      acceptedAt: new Date('2026-08-20T10:00:00.000Z'),
      registrantType: 'TEAM',
      eventTeamId: 'event_team_1',
      sourceTeamRegistrationId: null,
    } satisfies Parameters<typeof isRegistrationCapacityEntry>[0];
    const acceptedRosterMember = {
      ...acceptedTeam,
      registrantType: 'SELF',
      sourceTeamRegistrationId: 'team_registration_1',
    } satisfies Parameters<typeof isRegistrationCapacityEntry>[0];
    expect(isRegistrationCapacityEntry(acceptedTeam)).toBe(true);
    expect(isRegistrationCapacityEntry(acceptedRosterMember)).toBe(false);
  });
  it('dedupes individual capacity rows by registrant identity', () => {
    const rows = [
      {
        id: 'registration_1',
        registrantId: 'user_1',
        parentId: null,
        registrantType: 'SELF',
        rosterRole: 'PARTICIPANT',
        status: 'ACTIVE',
        acceptedAt: new Date('2026-08-20T10:00:00.000Z'),
        eventTeamId: null,
        sourceTeamRegistrationId: null,
      },
      {
        id: 'registration_1_duplicate',
        registrantId: 'user_1',
        parentId: null,
        registrantType: 'SELF',
        rosterRole: 'PARTICIPANT',
        status: 'ACTIVE',
        acceptedAt: new Date('2026-08-20T10:01:00.000Z'),
        eventTeamId: null,
        sourceTeamRegistrationId: null,
      },
      {
        id: 'registration_2',
        registrantId: 'user_2',
        parentId: null,
        registrantType: 'CHILD',
        rosterRole: 'PARTICIPANT',
        status: 'ACTIVE',
        acceptedAt: new Date('2026-08-20T10:02:00.000Z'),
        eventTeamId: null,
        sourceTeamRegistrationId: null,
      },
    ] as any;

    expect(dedupeRegistrationCapacityRows({ teamSignup: false }, rows)).toHaveLength(2);
    expect(registrationUnitIdentityKey({ teamSignup: false }, rows[0])).toBe('USER:user_1');
  });

  it('dedupes team capacity rows by canonical team identity', () => {
    const rows = [
      {
        id: 'registration_1',
        registrantId: 'event_team_1',
        parentId: 'canonical_team_1',
        registrantType: 'TEAM',
        rosterRole: 'PARTICIPANT',
        status: 'ACTIVE',
        acceptedAt: new Date('2026-08-20T10:00:00.000Z'),
        eventTeamId: 'event_team_1',
        sourceTeamRegistrationId: null,
      },
      {
        id: 'registration_2',
        registrantId: 'event_team_2',
        parentId: 'canonical_team_1',
        registrantType: 'TEAM',
        rosterRole: 'PARTICIPANT',
        status: 'ACTIVE',
        acceptedAt: new Date('2026-08-20T10:01:00.000Z'),
        eventTeamId: 'event_team_2',
        sourceTeamRegistrationId: null,
      },
      {
        id: 'registration_roster',
        registrantId: 'player_1',
        parentId: 'guardian_1',
        registrantType: 'SELF',
        rosterRole: 'PARTICIPANT',
        status: 'ACTIVE',
        acceptedAt: new Date('2026-08-20T10:02:00.000Z'),
        eventTeamId: 'event_team_1',
        sourceTeamRegistrationId: 'team_registration_1',
      },
    ] as any;

    expect(dedupeRegistrationCapacityRows({ teamSignup: true }, rows)).toHaveLength(1);
    expect(registrationUnitIdentityKey({ teamSignup: true }, rows[0])).toBe('TEAM:canonical_team_1');
    expect(registrationUnitIdentityKey({ teamSignup: true }, rows[2])).toBeNull();
  });

  it('aggregates one capacity unit per accepted participant identity', async () => {
    const aggregates = await getEventParticipantAggregates([{
      id: 'event_1',
      eventType: 'EVENT',
      teamSignup: false,
      maxParticipants: 2,
    }], {
      eventRegistrations: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'registration_1',
            eventId: 'event_1',
            registrantId: 'user_1',
            parentId: null,
            registrantType: 'SELF',
            rosterRole: 'PARTICIPANT',
            status: 'ACTIVE',
            acceptedAt: new Date('2026-08-20T10:00:00.000Z'),
            eventTeamId: null,
            sourceTeamRegistrationId: null,
            slotId: null,
            occurrenceDate: null,
          },
          {
            id: 'registration_1_duplicate',
            eventId: 'event_1',
            registrantId: 'user_1',
            parentId: null,
            registrantType: 'SELF',
            rosterRole: 'PARTICIPANT',
            status: 'ACTIVE',
            acceptedAt: new Date('2026-08-20T10:01:00.000Z'),
            eventTeamId: null,
            sourceTeamRegistrationId: null,
            slotId: null,
            occurrenceDate: null,
          },
        ]),
      },
      divisions: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as any);

    expect(aggregates.get('event_1')).toEqual({
      participantCount: 1,
      participantCapacity: 2,
    });
  });
  it('loads capacities for a collection of events with one division query', async () => {
    const divisionsFindMany = jest.fn().mockResolvedValue([
      {
        eventId: 'event_1',
        id: 'event_1__division__a',
        key: 'a',
        kind: 'LEAGUE',
        maxParticipants: 2,
      },
      {
        eventId: 'event_1',
        id: 'event_1__division__b',
        key: 'b',
        kind: 'LEAGUE',
        maxParticipants: 3,
      },
      {
        eventId: 'event_2',
        id: 'event_2__division__open',
        key: 'open',
        kind: 'LEAGUE',
        maxParticipants: 4,
      },
    ]);
    const aggregates = await getEventParticipantAggregates([
      {
        id: 'event_1',
        eventType: 'EVENT',
        teamSignup: false,
        singleDivision: false,
        maxParticipants: 10,
      },
      {
        id: 'event_2',
        eventType: 'EVENT',
        teamSignup: false,
        singleDivision: true,
        maxParticipants: 10,
      },
    ], {
      eventRegistrations: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      divisions: {
        findMany: divisionsFindMany,
      },
    } as any);

    expect(divisionsFindMany).toHaveBeenCalledTimes(1);
    expect(divisionsFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        eventId: { in: ['event_1', 'event_2'] },
      }),
    }));
    expect(aggregates.get('event_1')?.participantCapacity).toBe(5);
    expect(aggregates.get('event_2')?.participantCapacity).toBe(4);
  });

});
describe('event registration unit validation', () => {
  it.each([
    ['LEAGUE', false],
    ['TOURNAMENT', false],
    ['TRYOUT', true],
  ] as const)('rejects %s with the wrong registration unit', (eventType, teamSignup) => {
    expect(() => assertEventTypeRegistrationUnit(eventType, teamSignup)).toThrow(
      expect.objectContaining({
        code: 'INVALID_EVENT_REGISTRATION_UNIT',
        status: 400,
      }),
    );
    try {
      assertEventTypeRegistrationUnit(eventType, teamSignup);
    } catch (error) {
      expect(error).toBeInstanceOf(EventRegistrationUnitError);
    }
  });

  it.each([
    ['EVENT', false],
    ['EVENT', true],
    ['WEEKLY_EVENT', false],
    ['WEEKLY_EVENT', true],
    ['LEAGUE', true],
    ['TOURNAMENT', true],
    ['TRYOUT', false],
  ] as const)('allows %s with registration unit %s', (eventType, teamSignup) => {
    expect(() => assertEventTypeRegistrationUnit(eventType, teamSignup)).not.toThrow();
  });
  it('rejects a participant row that does not match the event unit', () => {
    expect(() => assertEventRegistrationUnit({
      id: 'league_1',
      eventType: 'LEAGUE',
      teamSignup: true,
    }, {
      registrantType: 'SELF',
      rosterRole: 'PARTICIPANT',
      eventTeamId: null,
      sourceTeamRegistrationId: null,
    })).toThrow(expect.objectContaining({
      code: 'INVALID_EVENT_REGISTRATION_UNIT',
    }));

    expect(() => assertEventRegistrationUnit({
      id: 'tryout_1',
      eventType: 'TRYOUT',
      teamSignup: false,
    }, {
      registrantType: 'TEAM',
      rosterRole: 'PARTICIPANT',
      eventTeamId: null,
      sourceTeamRegistrationId: null,
    })).toThrow(expect.objectContaining({
      code: 'INVALID_EVENT_REGISTRATION_UNIT',
    }));
  });
});

describe('registration capacity enforcement', () => {
  it('dedupes existing identities before enforcing event capacity', async () => {
    const upsert = jest.fn().mockResolvedValue({ id: 'event_1__self__user_2' });
    const existingRows = [
      {
        id: 'event_1__self__user_1',
        eventId: 'event_1',
        registrantId: 'user_1',
        parentId: null,
        registrantType: 'SELF',
        rosterRole: 'PARTICIPANT',
        status: 'ACTIVE',
        acceptedAt: new Date('2026-08-20T10:00:00.000Z'),
        eventTeamId: null,
        sourceTeamRegistrationId: null,
        slotId: null,
        occurrenceDate: null,
        divisionId: 'div_a',
      },
      {
        id: 'event_1__self__user_1_duplicate',
        eventId: 'event_1',
        registrantId: 'user_1',
        parentId: null,
        registrantType: 'SELF',
        rosterRole: 'PARTICIPANT',
        status: 'ACTIVE',
        acceptedAt: new Date('2026-08-20T10:01:00.000Z'),
        eventTeamId: null,
        sourceTeamRegistrationId: null,
        slotId: null,
        occurrenceDate: null,
        divisionId: 'div_a',
      },
    ];
    const client = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      events: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'event_1',
          eventType: 'EVENT',
          teamSignup: false,
          maxParticipants: 2,
          singleDivision: true,
        }),
      },
      divisions: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'div_a',
          key: 'div_a',
          kind: 'LEAGUE',
          maxParticipants: null,
          divisionTypeId: null,
        }]),
      },
      eventRegistrations: {
        findMany: jest.fn().mockResolvedValue(existingRows),
        upsert,
      },
    } as any;

    await upsertEventRegistration({
      eventId: 'event_1',
      registrantType: 'SELF',
      registrantId: 'user_2',
      rosterRole: 'PARTICIPANT',
      status: 'ACTIVE',
      createdBy: 'user_2',
      divisionId: 'div_a',
    }, client);

    expect(upsert).toHaveBeenCalled();
  });
});

describe('participant registration division canonicalization', () => {
  const event = {
    id: 'event_1',
    eventType: 'EVENT',
    teamSignup: false,
    maxParticipants: null,
    singleDivision: true,
  };
  const entryDivision = {
    id: 'event_1__division__open',
    key: 'open',
    divisionTypeId: 'skill_open',
    maxParticipants: null,
  };

  it('canonicalizes an Entry Division alias and its type metadata before persistence', async () => {
    const upsert = jest.fn().mockResolvedValue({ id: 'registration_1' });
    const client = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      events: {
        findUnique: jest.fn().mockResolvedValue(event),
      },
      divisions: {
        findMany: jest.fn().mockResolvedValue([entryDivision]),
      },
      eventRegistrations: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert,
      },
    } as any;

    await upsertEventRegistration({
      eventId: 'event_1',
      registrantType: 'SELF',
      registrantId: 'user_1',
      rosterRole: 'PARTICIPANT',
      status: 'ACTIVE',
      createdBy: 'user_1',
      divisionId: 'open',
      divisionTypeId: 'stale_type',
      divisionTypeKey: 'stale_key',
    }, client);

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        divisionId: entryDivision.id,
        divisionTypeId: entryDivision.divisionTypeId,
        divisionTypeKey: entryDivision.key,
      }),
      update: expect.objectContaining({
        divisionId: entryDivision.id,
        divisionTypeId: entryDivision.divisionTypeId,
        divisionTypeKey: entryDivision.key,
      }),
    }));
  });
  it('uses an active legacy Entry Division before persisting a participant', async () => {
    const legacyDivisionId = buildEventDivisionId('event_1', 'legacy_division');
    const registrationUpsert = jest.fn().mockResolvedValue({ id: 'registration_1' });
    const divisionUpsert = jest.fn().mockResolvedValue({ id: legacyDivisionId });
    const client = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      events: {
        findUnique: jest.fn().mockResolvedValue(event),
      },
      divisions: {
        findMany: jest.fn().mockResolvedValue([{
          id: legacyDivisionId,
          key: 'legacy_division',
          kind: 'LEAGUE',
          role: 'ENTRY',
          status: 'ACTIVE',
          maxParticipants: null,
          divisionTypeId: null,
        }]),
        upsert: divisionUpsert,
      },
      eventRegistrations: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: registrationUpsert,
      },
    } as any;

    await upsertEventRegistration({
      eventId: 'event_1',
      registrantType: 'SELF',
      registrantId: 'user_1',
      rosterRole: 'PARTICIPANT',
      status: 'ACTIVE',
      createdBy: 'user_1',
    }, client);

    expect(divisionUpsert).not.toHaveBeenCalled();
    expect(registrationUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        divisionId: legacyDivisionId,
        divisionTypeKey: 'legacy_division',
      }),
    }));
  });
  it('creates an Open Entry Division when a legacy event has no division rows', async () => {
    const registrationUpsert = jest.fn().mockResolvedValue({ id: 'registration_1' });
    const divisionUpsert = jest.fn().mockResolvedValue({
      id: buildEventDivisionId('event_1', 'open'),
    });
    const client = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      events: {
        findUnique: jest.fn().mockResolvedValue(event),
      },
      divisions: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: divisionUpsert,
      },
      eventRegistrations: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: registrationUpsert,
      },
    } as any;

    await upsertEventRegistration({
      eventId: 'event_1',
      registrantType: 'SELF',
      registrantId: 'user_1',
      rosterRole: 'PARTICIPANT',
      status: 'ACTIVE',
      createdBy: 'user_1',
    }, client);

    const openDivisionId = buildEventDivisionId('event_1', 'open');
    expect(divisionUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: openDivisionId },
      create: expect.objectContaining({
        id: openDivisionId,
        key: 'open',
        role: 'ENTRY',
        status: 'ACTIVE',
      }),
    }));
    expect(registrationUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        divisionId: openDivisionId,
        divisionTypeKey: 'open',
      }),
    }));
  });
  it('backfills an Open Entry Division during compatibility participant sync', async () => {
    const registrationUpsert = jest.fn().mockResolvedValue({ id: 'registration_1' });
    const divisionUpsert = jest.fn().mockResolvedValue({
      id: buildEventDivisionId('event_1', 'open'),
    });
    const client = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      events: {
        findUnique: jest.fn().mockResolvedValue(event),
      },
      divisions: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: divisionUpsert,
      },
      eventRegistrations: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: registrationUpsert,
      },
    } as any;

    await syncEventParticipantRegistrationsFromCompatibilityIds(client, {
      eventId: 'event_1',
      createdBy: 'user_1',
      teamIds: [],
      userIds: ['user_1'],
      waitListIds: [],
      freeAgentIds: [],
      syncTeams: false,
      syncUsers: true,
      syncWaitList: false,
      syncFreeAgents: false,
    });

    const openDivisionId = buildEventDivisionId('event_1', 'open');
    expect(divisionUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: openDivisionId },
    }));
    expect(registrationUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        divisionId: openDivisionId,
        divisionTypeKey: 'open',
      }),
    }));
  });



  it('rejects a participant division that does not resolve to one Entry Division', async () => {
    const client = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      events: {
        findUnique: jest.fn().mockResolvedValue(event),
      },
      divisions: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      eventRegistrations: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
      },
    } as any;

    await expect(upsertEventRegistration({
      eventId: 'event_1',
      registrantType: 'SELF',
      registrantId: 'user_1',
      rosterRole: 'PARTICIPANT',
      status: 'ACTIVE',
      createdBy: 'user_1',
      divisionId: 'missing',
    }, client)).rejects.toBeInstanceOf(EventRegistrationDivisionError);
    expect(client.eventRegistrations.upsert).not.toHaveBeenCalled();
  });

  it('clears legacy team references when compatibility sync promotes a SELF participant', async () => {
    const existing = {
      id: 'event_1__self__user_1',
      eventId: 'event_1',
      registrantId: 'user_1',
      parentId: null,
      registrantType: 'SELF',
      rosterRole: 'PARTICIPANT',
      status: 'ACTIVE',
      acceptedAt: new Date('2026-08-20T10:00:00.000Z'),
      eventTeamId: 'legacy_event_team',
      sourceTeamRegistrationId: 'legacy_team_registration',
      ageAtEvent: null,
      divisionId: 'legacy_division',
      divisionTypeId: 'legacy_type',
      divisionTypeKey: 'legacy_key',
      jerseyNumber: '42',
      position: 'setter',
      isCaptain: true,
      consentDocumentId: null,
      consentStatus: null,
      createdBy: 'user_1',
      slotId: null,
      occurrenceDate: null,
      createdAt: new Date('2026-08-01T10:00:00.000Z'),
      updatedAt: new Date('2026-08-01T10:00:00.000Z'),
    };
    const upsert = jest.fn().mockResolvedValue(existing);
    const client = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      events: {
        findUnique: jest.fn().mockResolvedValue(event),
      },
      divisions: {
        findMany: jest.fn().mockResolvedValue([entryDivision]),
      },
      eventRegistrations: {
        findUnique: jest.fn().mockResolvedValue(existing),
        findMany: jest.fn().mockResolvedValue([existing]),
        upsert,
      },
    } as any;

    await syncEventParticipantRegistrationsFromCompatibilityIds(client, {
      eventId: 'event_1',
      createdBy: 'user_1',
      teamIds: [],
      userIds: ['user_1'],
      waitListIds: [],
      freeAgentIds: [],
      syncTeams: false,
      syncUsers: true,
      syncWaitList: false,
      syncFreeAgents: false,
      divisionIdByRegistrantId: { user_1: 'open' },
    });

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        eventTeamId: null,
        sourceTeamRegistrationId: null,
        divisionId: entryDivision.id,
        divisionTypeId: entryDivision.divisionTypeId,
        divisionTypeKey: entryDivision.key,
        jerseyNumber: existing.jerseyNumber,
      }),
      update: expect.objectContaining({
        eventTeamId: null,
        sourceTeamRegistrationId: null,
        divisionId: entryDivision.id,
        divisionTypeId: entryDivision.divisionTypeId,
        divisionTypeKey: entryDivision.key,
        jerseyNumber: existing.jerseyNumber,
      }),
    }));
  });
});
