/** @jest-environment node */

import {
  syncEventDivisionPhases,
  syncEventPhaseParticipantsFromEntryDivisions,
} from '@/server/repositories/eventDivisionPhases';

const createClient = () => ({
  divisions: {
    findMany: jest.fn().mockResolvedValue([{ id: 'stale-phase' }]),
    deleteMany: jest.fn().mockResolvedValue(undefined),
    upsert: jest.fn().mockResolvedValue(undefined),
  },
  eventDivisionPhaseSources: {
    deleteMany: jest.fn().mockResolvedValue(undefined),
    upsert: jest.fn().mockResolvedValue(undefined),
  },
  eventDivisionPhaseParticipants: {
    deleteMany: jest.fn().mockResolvedValue(undefined),
    upsert: jest.fn().mockResolvedValue(undefined),
  },
});

describe('syncEventDivisionPhases', () => {
  it('persists league and playoff phase divisions with source and participant ownership', async () => {
    const client = createClient();
    const entry = {
      id: 'event__division__open',
      key: 'open',
      name: 'Open',
      kind: 'LEAGUE' as const,
      teamIds: ['team_1'],
      fieldIds: ['field_1'],
      maxParticipants: 8,
    };
    const playoff = {
      id: 'event__division__open_playoff',
      key: 'open_playoff',
      name: 'Open Playoff',
      kind: 'PLAYOFF' as const,
      playoffTeamCount: 4,
    };

    await syncEventDivisionPhases({
      client,
      eventId: 'event_1',
      eventType: 'LEAGUE',
      includePlayoffs: true,
      organizationId: 'org_1',
      entries: [entry, playoff],
    });

    expect(client.divisions.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['stale-phase'] } },
    });
    const phaseUpserts = client.divisions.upsert.mock.calls.map(([args]) => args);
    expect(phaseUpserts.map((args: any) => args.where.id)).toEqual([
      'event__division__open__phase__league',
      'event__division__open_playoff',
    ]);
    expect(phaseUpserts[0].create).toEqual(expect.objectContaining({
      role: 'PHASE',
      phase: 'LEAGUE',
      sourceDivisionId: entry.id,
      teamIds: entry.teamIds,
      organizationId: 'org_1',
    }));
    expect(phaseUpserts[1].update).toEqual(expect.objectContaining({
      role: 'PHASE',
      phase: 'PLAYOFF',
      sourceDivisionId: entry.id,
    }));
    expect(client.eventDivisionPhaseSources.deleteMany).toHaveBeenCalledWith({
      where: { eventId: 'event_1' },
    });
    expect(client.eventDivisionPhaseParticipants.deleteMany).toHaveBeenCalledWith({
      where: { eventId: 'event_1' },
    });
    expect(client.eventDivisionPhaseSources.upsert).toHaveBeenCalledTimes(2);
    expect(client.eventDivisionPhaseParticipants.upsert).toHaveBeenCalledTimes(2);
  });

  it('creates pool-owned phase rows and one shared bracket phase for tournaments', async () => {
    const client = createClient();
    const entries = [
      { id: 'pool_a', key: 'pool_a', name: 'Pool A', kind: 'LEAGUE' as const, teamIds: ['team_1'] },
      { id: 'pool_b', key: 'pool_b', name: 'Pool B', kind: 'LEAGUE' as const, teamIds: ['team_2'] },
    ];
    const bracket = {
      id: 'bracket_open',
      key: 'bracket_open',
      name: 'Open Bracket',
      kind: 'PLAYOFF' as const,
      playoffTeamCount: 4,
    };

    await syncEventDivisionPhases({
      client,
      eventId: 'event_1',
      eventType: 'TOURNAMENT',
      includePlayoffs: true,
      tournamentPoolPlayEnabled: true,
      entries: [...entries, bracket],
    });

    const phaseUpserts = client.divisions.upsert.mock.calls.map(([args]) => args);
    expect(phaseUpserts.map((args: any) => args.where.id)).toEqual([
      'pool_a__phase__pool',
      'pool_b__phase__pool',
      'bracket_open',
    ]);
    expect(phaseUpserts.slice(0, 2).map((args: any) => args.create.phase)).toEqual(['POOL', 'POOL']);
    expect(phaseUpserts[2].update).toEqual(expect.objectContaining({
      phase: 'BRACKET',
      role: 'PHASE',
      sourceDivisionId: entries[0].id,
    }));
    expect(client.eventDivisionPhaseParticipants.upsert).toHaveBeenCalledTimes(4);
  });

  it('stores generated playoff settings on the persisted playoff phase', async () => {
    const client = createClient();
    await syncEventDivisionPhases({
      client,
      eventId: 'event_1',
      eventType: 'LEAGUE',
      includePlayoffs: true,
      entries: [{
        id: 'entry_open',
        key: 'open',
        name: 'Open',
        kind: 'LEAGUE',
        playoffTeamCount: 4,
        playoffDoubleElimination: true,
        playoffWinnerSetCount: 3,
        playoffLoserSetCount: 1,
        playoffWinnerBracketPointsToVictory: [25, 25, 15],
        playoffLoserBracketPointsToVictory: [21],
        playoffFieldCount: 2,
        playoffRestTimeMinutes: 10,
      }],
    });

    const playoffUpsert = client.divisions.upsert.mock.calls
      .map(([args]) => args)
      .find((args: any) => args.where.id === 'entry_open__phase__playoff');

    expect(playoffUpsert?.create).toEqual(expect.objectContaining({
      phase: 'PLAYOFF',
      kind: 'PLAYOFF',
      standingsOverrides: expect.objectContaining({
        doubleElimination: true,
        winnerSetCount: 3,
        loserSetCount: 1,
        winnerBracketPointsToVictory: [25, 25, 15],
        loserBracketPointsToVictory: [21],
        fieldCount: 2,
        restTimeMinutes: 10,
      }),
    }));
  });
  it('does not create competition phases for non-competition events', async () => {
    const client = createClient();

    await syncEventDivisionPhases({
      client,
      eventId: 'event_1',
      eventType: 'ONE_TIME_EVENT',
      entries: [{ id: 'entry', kind: 'LEAGUE' }],
    });

    expect(client.divisions.upsert).not.toHaveBeenCalled();
    expect(client.eventDivisionPhaseSources.upsert).not.toHaveBeenCalled();
    expect(client.eventDivisionPhaseParticipants.upsert).not.toHaveBeenCalled();
  });
});
describe('syncEventPhaseParticipantsFromEntryDivisions', () => {
  it('rebuilds phase ownership from active entry team membership', async () => {
    const updateMock = jest.fn().mockResolvedValue(undefined);
    const deleteManyMock = jest.fn().mockResolvedValue(undefined);
    const upsertMock = jest.fn().mockResolvedValue(undefined);
    const client = {
      divisions: {
        findMany: jest.fn()
          .mockResolvedValueOnce([{ id: 'entry_a', teamIds: ['team_1', 'team_2'] }])
          .mockResolvedValueOnce([{
            id: 'phase_a',
            phase: 'LEAGUE',
            sourceDivisionId: 'entry_a',
            teamIds: ['stale_team'],
          }]),
        update: updateMock,
      },
      eventDivisionPhaseSources: {
        findMany: jest.fn().mockResolvedValue([
          { entryDivisionId: 'entry_a', phaseDivisionId: 'phase_a' },
        ]),
      },
      eventDivisionPhaseParticipants: {
        findMany: jest.fn().mockResolvedValue([
          { phaseDivisionId: 'phase_a', eventTeamId: 'stale_team' },
        ]),
        deleteMany: deleteManyMock,
        upsert: upsertMock,
      },
    };

    await syncEventPhaseParticipantsFromEntryDivisions({
      client,
      eventId: 'event_1',
    });

    expect(client.divisions.findMany).toHaveBeenNthCalledWith(1, {
      where: { eventId: 'event_1', role: 'ENTRY', status: 'ACTIVE' },
      select: { id: true, teamIds: true },
    });
    expect(client.divisions.findMany).toHaveBeenNthCalledWith(2, {
      where: { eventId: 'event_1', role: 'PHASE', status: 'ACTIVE' },
      select: { id: true, phase: true, sourceDivisionId: true, teamIds: true },
    });
    expect(deleteManyMock).toHaveBeenCalledWith({
      where: { eventId: 'event_1', phaseDivisionId: { in: ['phase_a'] } },
    });
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'phase_a' },
      data: expect.objectContaining({ teamIds: ['team_1', 'team_2'] }),
    }));
    expect(upsertMock).toHaveBeenCalledTimes(2);
    expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        phaseDivisionId: 'phase_a',
        eventTeamId: 'team_1',
        sourceEntryDivisionId: 'entry_a',
      }),
    }));
  });
});
