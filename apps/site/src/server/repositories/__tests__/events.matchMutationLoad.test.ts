/** @jest-environment node */

jest.mock('@/lib/prisma', () => ({
  prisma: {},
}));

import { loadEventForMatchMutation, saveMatches } from '@/server/repositories/events';

const createClient = () => {
  const eventMatches = [
    {
      id: 'match_target',
      eventId: 'event_1',
      matchId: 1,
      division: 'open',
      team1Id: 'team_1',
      team2Id: 'team_2',
      fieldId: 'field_1',
      start: new Date('2026-04-22T18:00:00.000Z'),
      end: new Date('2026-04-22T19:00:00.000Z'),
      team1Points: [25],
      team2Points: [21],
      locked: false,
      losersBracket: false,
      officialCheckedIn: false,
      officialIds: null,
      createdAt: null,
      updatedAt: null,
    },
    {
      id: 'match_other',
      eventId: 'event_1',
      matchId: 2,
      division: 'open',
      team1Id: 'team_2',
      team2Id: 'team_1',
      fieldId: 'field_1',
      start: new Date('2026-04-22T19:00:00.000Z'),
      end: new Date('2026-04-22T20:00:00.000Z'),
      team1Points: [0],
      team2Points: [0],
      locked: false,
      losersBracket: false,
      officialCheckedIn: false,
      officialIds: null,
      createdAt: null,
      updatedAt: null,
    },
  ];

  return {
    events: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'event_1',
        name: 'Test Event',
        start: new Date('2026-04-22T18:00:00.000Z'),
        end: new Date('2026-04-22T21:00:00.000Z'),
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
        leagueScoringConfigId: null,
      }),
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
          rentalSlotIds: [],
          createdAt: null,
          updatedAt: null,
        },
      ]),
    },
    teams: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'team_1',
          captainId: 'captain_1',
          division: 'open',
          name: 'Team One',
          playerIds: ['player_1', 'player_2'],
        },
        {
          id: 'team_2',
          captainId: 'captain_2',
          division: 'open',
          name: 'Team Two',
          playerIds: ['player_3', 'player_4'],
        },
      ]),
    },
    timeSlots: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    userData: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    matches: {
      findMany: jest.fn().mockImplementation((args?: Record<string, any>) => {
        if (args?.where?.eventId === 'event_1') {
          return Promise.resolve(eventMatches);
        }
        return Promise.resolve([]);
      }),
      upsert: jest.fn().mockResolvedValue(undefined),
    },
    leagueScoringConfigs: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    matchSegments: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'segment_target_1',
          matchId: 'match_target',
          sequence: 1,
          status: 'COMPLETE',
          scores: { team_1: 25, team_2: 21 },
          winnerEventTeamId: 'team_1',
          startedAt: new Date('2026-04-22T18:00:00.000Z'),
          endedAt: new Date('2026-04-22T18:20:00.000Z'),
          createdAt: new Date('2026-04-22T18:00:00.000Z'),
          updatedAt: new Date('2026-04-22T18:20:00.000Z'),
        },
      ]),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      upsert: jest.fn(),
    },
    matchIncidents: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'incident_target_1',
          matchId: 'match_target',
          segmentId: 'segment_target_1',
          eventTeamId: 'team_1',
          eventRegistrationId: 'registration_1',
          participantUserId: 'player_1',
          officialUserId: 'official_1',
          incidentType: 'POINT',
          sequence: 1,
          linkedPointDelta: 1,
          createdAt: new Date('2026-04-22T18:05:00.000Z'),
          updatedAt: new Date('2026-04-22T18:05:00.000Z'),
        },
      ]),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      upsert: jest.fn(),
    },
    eventRegistrations: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'team_registration_1',
          eventId: 'event_1',
          eventTeamId: 'team_1',
          registrantId: 'team_1',
          registrantType: 'TEAM',
          rosterRole: 'PARTICIPANT',
          status: 'ACTIVE',
          createdAt: new Date('2026-04-22T17:00:00.000Z'),
          jerseyNumber: null,
          position: null,
          isCaptain: false,
        },
        {
          id: 'team_registration_2',
          eventId: 'event_1',
          eventTeamId: 'team_2',
          registrantId: 'team_2',
          registrantType: 'TEAM',
          rosterRole: 'PARTICIPANT',
          status: 'ACTIVE',
          createdAt: new Date('2026-04-22T17:01:00.000Z'),
          jerseyNumber: null,
          position: null,
          isCaptain: false,
        },
      ]),
    },
    eventDivisionPhaseParticipants: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
};

describe('loadEventForMatchMutation', () => {
  it('hydrates the target match child rows and event teams while skipping user roster detail', async () => {
    const client = createClient();

    const loaded = await loadEventForMatchMutation('event_1', 'match_target', client as any);

    expect(client.matchSegments.findMany).toHaveBeenCalledWith({
      where: { matchId: { in: ['match_target'] } },
    });
    expect(client.matchIncidents.findMany).toHaveBeenCalledWith({
      where: { matchId: { in: ['match_target'] } },
    });
    expect(client.userData.findMany).not.toHaveBeenCalled();
    expect(client.eventRegistrations.findMany).toHaveBeenCalled();

    expect(loaded.matches.match_target.team1?.id).toBe('team_1');
    expect(loaded.matches.match_target.team2?.id).toBe('team_2');
    expect(loaded.matches.match_target.segments).toHaveLength(1);
    expect(loaded.matches.match_target.incidents).toHaveLength(1);
    expect(loaded.matches.match_other.segments).toEqual([]);
    expect(loaded.matches.match_other.incidents).toEqual([]);

    await saveMatches('event_1', Object.values(loaded.matches), client as any);

    expect(client.matchSegments.deleteMany).toHaveBeenCalledWith({
      where: { matchId: { in: ['match_target'] } },
    });
    expect(client.matchIncidents.deleteMany).toHaveBeenCalledWith({
      where: { matchId: { in: ['match_target'] } },
    });
  });
  it('hydrates phase-owned division participants and match phase identity', async () => {
    const client = createClient();
    const entryId = 'event__division__open';
    const phaseId = `${entryId}__phase__league`;
    const event = await client.events.findUnique();
    Object.assign(event, {
      eventType: 'LEAGUE',
      includePlayoffs: false,
    });
    client.divisions.findMany.mockResolvedValue([
      {
        id: entryId,
        key: 'open',
        name: 'Open Entry',
        kind: 'LEAGUE',
        role: 'ENTRY',
        phase: null,
        teamIds: ['team_1'],
        fieldIds: ['field_1'],
      },
      {
        id: phaseId,
        key: 'open__phase__league',
        name: 'Open — League',
        kind: 'LEAGUE',
        role: 'PHASE',
        phase: 'LEAGUE',
        sourceDivisionId: entryId,
        teamIds: [],
        fieldIds: ['field_1'],
      },
    ]);
    client.eventDivisionPhaseParticipants.findMany.mockResolvedValue([
      { phaseDivisionId: phaseId, eventTeamId: 'team_1' },
      { phaseDivisionId: phaseId, eventTeamId: 'team_2' },
    ]);
    const matches = await client.matches.findMany({ where: { eventId: 'event_1' } });
    matches.forEach((match: any) => {
      match.division = phaseId;
    });

    const loaded = await loadEventForMatchMutation('event_1', 'match_target', client as any);

    expect(loaded.divisions).toHaveLength(1);
    expect(loaded.divisions[0]).toEqual(expect.objectContaining({
      id: phaseId,
      role: 'PHASE',
      phase: 'LEAGUE',
      teamIds: ['team_1', 'team_2'],
    }));
    expect(loaded.teams.team_1.division?.id).toBe(phaseId);
    expect(loaded.matches.match_target.division.id).toBe(phaseId);
  });
  it('hydrates phase-specific official slots from the Match Division', async () => {
    const client = createClient();
    const event = await client.events.findUnique();
    const phaseId = 'event_1__division__open__phase__bracket';
    const phasePositions = [
      { id: 'bracket_referee', name: 'Bracket Referee', count: 2, order: 0 },
    ];
    const entryId = 'event_1__division__open';
    Object.assign(event, {
      eventType: 'TOURNAMENT',
      divisions: [entryId],
      officialPositions: [
        { id: 'event_referee', name: 'Event Referee', count: 1, order: 0 },
      ],
    });
    const matches = await client.matches.findMany({ where: { eventId: 'event_1' } });
    Object.assign(matches[0], {
      division: phaseId,
      officialIds: [{
        positionId: 'bracket_referee',
        slotIndex: 1,
        holderType: 'PLAYER',
        userId: 'player_1',
        eventOfficialId: null,
        checkedIn: true,
        hasConflict: false,
      }],
    });
    client.divisions.findMany.mockResolvedValue([
      {
        id: entryId,
        key: 'open',
        name: 'Open Entry',
        kind: 'LEAGUE',
        role: 'ENTRY',
        phase: null,
        teamIds: ['team_1', 'team_2'],
        fieldIds: ['field_1'],
      },
      {
        id: phaseId,
        key: 'open__phase__bracket',
        name: 'Open — Bracket',
        kind: 'PLAYOFF',
        role: 'PHASE',
        phase: 'BRACKET',
        sourceDivisionId: entryId,
        teamIds: ['team_1', 'team_2'],
        fieldIds: ['field_1'],
        phaseSettings: { BRACKET: { officialPositions: phasePositions } },
      },
    ]);

    const loaded = await loadEventForMatchMutation('event_1', 'match_target', client as any);

    expect(loaded.matches.match_target.officialAssignments).toEqual([
      expect.objectContaining({
        positionId: 'bracket_referee',
        slotIndex: 0,
        userId: null,
        holderType: 'OFFICIAL',
      }),
      expect.objectContaining({
        positionId: 'bracket_referee',
        slotIndex: 1,
        userId: 'player_1',
        holderType: 'PLAYER',
      }),
    ]);
  });

  it('maps single-division tournament teams to their persisted pool phases', async () => {
    const client = createClient();
    const event = await client.events.findUnique();
    const entryId = 'event_1__division__open';
    const poolAId = 'event_1__division__open_pool_a';
    const poolBId = 'event_1__division__open_pool_b';
    Object.assign(event, {
      eventType: 'TOURNAMENT',
      includePlayoffs: true,
      singleDivision: true,
      divisions: [entryId],
    });
    client.divisions.findMany.mockResolvedValue([
      {
        id: entryId,
        key: 'open',
        name: 'Open Entry',
        kind: 'LEAGUE',
        role: 'ENTRY',
        phase: null,
        teamIds: ['team_1', 'team_2'],
        fieldIds: ['field_1'],
      },
      {
        id: poolAId,
        key: 'open_pool_a',
        name: 'Open Entry — Pool A',
        kind: 'LEAGUE',
        role: 'PHASE',
        phase: 'POOL',
        sourceDivisionId: entryId,
        teamIds: [],
        fieldIds: ['field_1'],
      },
      {
        id: poolBId,
        key: 'open_pool_b',
        name: 'Open Entry — Pool B',
        kind: 'LEAGUE',
        role: 'PHASE',
        phase: 'POOL',
        sourceDivisionId: entryId,
        teamIds: [],
        fieldIds: ['field_1'],
      },
    ]);
    client.eventDivisionPhaseParticipants.findMany.mockResolvedValue([
      { phaseDivisionId: poolAId, eventTeamId: 'team_1' },
      { phaseDivisionId: poolBId, eventTeamId: 'team_2' },
    ]);

    const loaded = await loadEventForMatchMutation('event_1', 'match_target', client as any);

    expect(loaded.divisions.map((division) => division.id)).toEqual([poolAId, poolBId]);
    expect(loaded.teams.team_1.division?.id).toBe(poolAId);
    expect(loaded.teams.team_2.division?.id).toBe(poolBId);
  });


  it('keeps a tied best-of-three match unresolved after two completed sets', async () => {
    const client = createClient();
    const event = await client.events.findUnique();
    Object.assign(event, {
      usesSets: true,
      winnerSetCount: 3,
      winnerBracketPointsToVictory: [21, 21, 15],
    });
    const matches = await client.matches.findMany({ where: { eventId: 'event_1' } });
    Object.assign(matches[0], {
      winnerEventTeamId: null,
      team1Points: [19, 28, 0],
      team2Points: [21, 26, 0],
      matchRulesSnapshot: {
        scoringModel: 'SETS',
        segmentCount: 3,
        setPointTargets: [21, 21, 15],
      },
    });
    client.matchSegments.findMany.mockResolvedValue([
      {
        id: 'segment_target_1',
        matchId: 'match_target',
        sequence: 1,
        status: 'COMPLETE',
        scores: { team_1: 19, team_2: 21 },
        winnerEventTeamId: 'team_2',
      },
      {
        id: 'segment_target_2',
        matchId: 'match_target',
        sequence: 2,
        status: 'COMPLETE',
        scores: { team_1: 28, team_2: 26 },
        winnerEventTeamId: 'team_1',
      },
      {
        id: 'segment_target_3',
        matchId: 'match_target',
        sequence: 3,
        status: 'NOT_STARTED',
        scores: {},
        winnerEventTeamId: null,
      },
    ]);

    const loaded = await loadEventForMatchMutation('event_1', 'match_target', client as any);

    expect(loaded.matches.match_target.winnerEventTeamId).toBeNull();
  });

  it('derives a best-of-three winner after a team wins two sets', async () => {
    const client = createClient();
    const event = await client.events.findUnique();
    Object.assign(event, {
      usesSets: true,
      winnerSetCount: 3,
      winnerBracketPointsToVictory: [21, 21, 15],
    });
    const matches = await client.matches.findMany({ where: { eventId: 'event_1' } });
    Object.assign(matches[0], {
      winnerEventTeamId: null,
      team1Points: [19, 28, 15],
      team2Points: [21, 26, 10],
      matchRulesSnapshot: {
        scoringModel: 'SETS',
        segmentCount: 3,
        setPointTargets: [21, 21, 15],
      },
    });
    client.matchSegments.findMany.mockResolvedValue([
      {
        id: 'segment_target_1',
        matchId: 'match_target',
        sequence: 1,
        status: 'COMPLETE',
        scores: { team_1: 19, team_2: 21 },
        winnerEventTeamId: 'team_2',
      },
      {
        id: 'segment_target_2',
        matchId: 'match_target',
        sequence: 2,
        status: 'COMPLETE',
        scores: { team_1: 28, team_2: 26 },
        winnerEventTeamId: 'team_1',
      },
      {
        id: 'segment_target_3',
        matchId: 'match_target',
        sequence: 3,
        status: 'COMPLETE',
        scores: { team_1: 15, team_2: 10 },
        winnerEventTeamId: 'team_1',
      },
    ]);

    const loaded = await loadEventForMatchMutation('event_1', 'match_target', client as any);

    expect(loaded.matches.match_target.winnerEventTeamId).toBe('team_1');
  });
  it('exposes entry details while retaining phase divisions for scheduler hydration', async () => {
    const client = createClient();
    const event = await client.events.findUnique();
    const entryId = 'event_1__division__open';
    Object.assign(event, {
      eventType: 'LEAGUE',
      includePlayoffs: true,
      singleDivision: true,
      playoffTeamCount: 4,
      divisions: [entryId],
    });
    client.divisions.findMany.mockResolvedValue([
      {
        id: entryId,
        key: 'open',
        name: 'Open Entry',
        kind: 'LEAGUE',
        role: 'ENTRY',
        phase: null,
        sortOrder: 0,
        fieldIds: ['field_1'],
        teamIds: ['team_1', 'team_2'],
        maxParticipants: 8,
      },
      {
        id: `${entryId}__phase__league`,
        key: 'open__phase__league',
        name: 'Open Entry — League',
        kind: 'LEAGUE',
        role: 'PHASE',
        phase: 'LEAGUE',
        sourceDivisionId: entryId,
        sortOrder: 0,
        fieldIds: ['field_1'],
        teamIds: ['team_1', 'team_2'],
        maxParticipants: 8,
      },
      {
        id: `${entryId}__phase__playoff`,
        key: 'open__phase__playoff',
        name: 'Open Entry — Playoff',
        kind: 'PLAYOFF',
        role: 'PHASE',
        phase: 'PLAYOFF',
        sourceDivisionId: entryId,
        sortOrder: 1,
        fieldIds: ['field_1'],
        playoffTeamCount: 4,
        standingsOverrides: {
          doubleElimination: false,
          winnerSetCount: 1,
          loserSetCount: 1,
          fieldCount: 1,
          restTimeMinutes: 0,
        },
      },
    ]);

    const loaded = await loadEventForMatchMutation('event_1', 'match_target', client as any);

    expect(loaded.divisions.map((division) => division.id)).toEqual([
      `${entryId}__phase__league`,
    ]);
    expect(loaded.playoffDivisions.map((division) => division.id)).toEqual([
      `${entryId}__phase__playoff`,
    ]);
    expect((loaded as any).divisionDetails).toEqual([
      expect.objectContaining({
        id: entryId,
        name: 'Open Entry',
        role: 'ENTRY',
      }),
    ]);
    expect((loaded as any).playoffDivisionDetails).toEqual([]);
    expect(loaded.fields.field_1.divisions.map((division) => division.id)).toEqual([
      `${entryId}__phase__league`,
      `${entryId}__phase__playoff`,
    ]);
  });
});
