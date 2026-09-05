/** @jest-environment node */

import { serializeEvent, serializeMatches } from '../serialize';
import { Division, League, Match, PlayingField, Team, Tournament, UserData } from '../types';
import { eventEditorCreateProposalGraphSchema } from "@/contracts/eventEditor";

describe('scheduler API serialization', () => {
  it('includes roster players and registrations for match scoring dialogs', () => {
    const division = new Division('open', 'Open');
    const player = new UserData({
      id: 'player_1',
      firstName: 'Alex',
      lastName: 'Morgan',
      userName: 'alexm',
      divisions: [division],
    });
    const team = new Team({
      id: 'team_1',
      captainId: 'player_1',
      division,
      name: 'Aces',
      playerIds: ['player_1'],
      players: [player],
      playerRegistrations: [{
        id: 'registration_1',
        teamId: 'team_1',
        userId: 'player_1',
        status: 'ACTIVE',
        jerseyNumber: '9',
        position: 'Forward',
      }],
    });
    const match = new Match({
      id: 'match_1',
      matchId: 1,
      start: new Date('2026-03-01T10:00:00.000Z'),
      end: new Date('2026-03-01T11:00:00.000Z'),
      division,
      team1: team,
      team2: null,
      team1Points: [0],
      team2Points: [0],
      bufferMs: 0,
      eventId: 'event_1',
    });
    match.segments = [{
      id: 'segment_1',
      $id: 'obsolete_segment_alias',
      eventId: 'event_1',
      matchId: 'match_1',
      sequence: 1,
      status: 'NOT_STARTED',
      scores: {},
      winnerEventTeamId: null,
    }];
    match.incidents = [{
      id: 'incident_1',
      $id: 'obsolete_incident_alias',
      eventId: 'event_1',
      matchId: 'match_1',
      segmentId: 'segment_1',
      sequence: 1,
      type: 'NOTE',
      occurredAt: '2026-03-01T10:00:00.000Z',
    }];

    const [serialized] = serializeMatches([match]);

    expect(serialized.team1).toEqual(expect.objectContaining({
      id: 'team_1',
      playerIds: ['player_1'],
      players: [expect.objectContaining({
        id: 'player_1',
        firstName: 'Alex',
        lastName: 'Morgan',
      })],
      playerRegistrations: [expect.objectContaining({
        id: 'registration_1',
        userId: 'player_1',
        jerseyNumber: '9',
        position: 'Forward',
      })],
    }));
    expect(serialized).not.toHaveProperty('$id');
    expect(serialized.team1).not.toHaveProperty('$id');
    expect(serialized.team1?.players[0]).not.toHaveProperty('$id');
    expect(serialized.segments[0]).toEqual(expect.objectContaining({ id: 'segment_1' }));
    expect(serialized.segments[0]).not.toHaveProperty('$id');
    expect(serialized.incidents[0]).toEqual(expect.objectContaining({ id: 'incident_1' }));
    expect(serialized.incidents[0]).not.toHaveProperty('$id');
  });

  it('serializes phase ownership and explicit graph placement state', () => {
    const division = new Division('phase', 'Phase');
    division.role = 'PHASE';
    division.phase = 'POOL';
    division.sourceDivisionId = 'entry';
    const match = new Match({
      id: 'match_phase',
      matchId: 3,
      start: new Date('2026-03-01T14:00:00.000Z'),
      end: new Date('2026-03-01T15:00:00.000Z'),
      division,
      bufferMs: 0,
      eventId: 'event_1',
    });
    match.placementState = 'UNPLACED';

    const [serialized] = serializeMatches([match]);

    expect(serialized).toEqual(expect.objectContaining({
      placementState: 'UNPLACED',
      start: null,
      end: null,
      phase: 'POOL',
      sourceDivisionId: 'entry',
      phaseDivisionId: 'phase',
      division: 'entry',
      fieldId: null,
    }));
  });
  it('does not synthesize officiating slots for an unplaced match', () => {
    const division = new Division('phase', 'Phase');
    division.phase = 'POOL';
    const match = new Match({
      id: 'match_unplaced_staffing',
      start: new Date('2026-03-01T14:00:00.000Z'),
      end: new Date('2026-03-01T15:00:00.000Z'),
      division,
      bufferMs: 0,
      eventId: 'event_1',
    });
    match.placementState = 'UNPLACED';
    match.officialAssignments = [{
      positionId: 'r1',
      slotIndex: 0,
      holderType: 'OFFICIAL',
      userId: 'official_1',
      eventOfficialId: null,
      checkedIn: false,
      hasConflict: false,
    }];

    const [serialized] = serializeMatches([match], [
      { id: 'r1', name: 'R1', count: 1, order: 0 },
    ]);

    expect(serialized.officialAssignments).toEqual([]);
    expect(serialized.officialIds).toEqual([]);
  });


  it('serializes every named assignment slot with stable nullable official identities', () => {
    const division = new Division('open', 'Open');
    const match = new Match({
      id: 'match_staffing',
      matchId: 2,
      start: new Date('2026-03-01T12:00:00.000Z'),
      end: new Date('2026-03-01T13:00:00.000Z'),
      division,
      team1: null,
      team2: null,
      team1Points: [],
      team2Points: [],
      bufferMs: 0,
      eventId: 'event_1',
    });
    match.placementState = 'PLACED';
    match.officialAssignments = [{
      positionId: 'r1',
      slotIndex: 0,
      holderType: 'OFFICIAL',
      userId: 'official_1',
      eventOfficialId: 'event_official_1',
      checkedIn: true,
      hasConflict: false,
    }];

    const [serialized] = serializeMatches([match], [
      { id: 'r1', name: 'R1', count: 1, order: 0 },
      { id: 'line_judge', name: 'Line Judge', count: 2, order: 1 },
    ]);

    expect(serialized.officialIds).toEqual([
      {
        positionId: 'r1',
        slotIndex: 0,
        holderType: 'OFFICIAL',
        userId: 'official_1',
        eventOfficialId: 'event_official_1',
        checkedIn: true,
        hasConflict: false,
      },
    ]);
    expect(serialized.officialAssignments).toEqual([
      {
        positionId: 'r1',
        slotIndex: 0,
        holderType: 'OFFICIAL',
        userId: 'official_1',
        eventOfficialId: 'event_official_1',
        checkedIn: true,
        hasConflict: false,
      },
      {
        positionId: 'line_judge',
        slotIndex: 0,
        holderType: 'OFFICIAL',
        userId: null,
        eventOfficialId: null,
        checkedIn: false,
        hasConflict: false,
      },
      {
        positionId: 'line_judge',
        slotIndex: 1,
        holderType: 'OFFICIAL',
        userId: null,
        eventOfficialId: null,
        checkedIn: false,
        hasConflict: false,
      },
    ]);
  });

  it('preserves placeholder identity and bound PLAYER holders in canonical slots', () => {
    const division = new Division('open', 'Open');
    division.isSystemGenerated = true;
    const field = new PlayingField({
      id: 'field_stable_slots',
      name: 'Stable Court',
      divisions: [division],
    });
    const placeholder = new Team({
      id: 'event_team_slot_1',
      captainId: '',
      kind: 'PLACEHOLDER',
      division,
    });
    const officialPositions = [
      { id: 'line_judge', name: 'Line Judge', count: 2, order: 0 },
    ];
    const match = new Match({
      id: 'match_stable_slots',
      start: new Date('2026-03-01T10:00:00.000Z'),
      end: new Date('2026-03-01T11:00:00.000Z'),
      placementState: 'PLACED',
      division,
      field,
      team1: placeholder,
      bufferMs: 0,
      eventId: 'event_stable_slots',
      officialAssignments: [{
        positionId: 'line_judge',
        slotIndex: 1,
        holderType: 'PLAYER',
        userId: 'player_1',
        eventOfficialId: null,
        checkedIn: true,
        hasConflict: true,
      }],
    });
    const event = new Tournament({
      id: 'event_stable_slots',
      name: 'Stable slots',
      start: new Date('2026-03-01T09:00:00.000Z'),
      end: new Date('2026-03-01T12:00:00.000Z'),
      maxParticipants: 3,
      teamSignup: true,
      eventType: 'TOURNAMENT',
      registeredTeamIds: [placeholder.id],
      teams: { [placeholder.id]: placeholder },
      divisions: [division],
      matches: { [match.id]: match },
      fields: { [field.id]: field },
      officialPositions,
    });

    const serialized = serializeEvent(event);
    const proposalGraph = eventEditorCreateProposalGraphSchema.parse({
      event: serialized,
      matches: serializeMatches([match], officialPositions),
    });
    expect(proposalGraph.matches[0]).toEqual(
      expect.objectContaining({
        id: match.id,
        placementState: 'PLACED',
        start: match.start.toISOString(),
        end: match.end.toISOString(),
        fieldId: field.id,
        field: expect.objectContaining({ id: field.id }),
        officialAssignments: expect.arrayContaining([
          expect.objectContaining({
            positionId: "line_judge",
            slotIndex: 1,
            holderType: "PLAYER",
            userId: "player_1",
          }),
        ]),
      }),
    );

    expect(serialized.teams).toEqual([
      expect.objectContaining({ id: placeholder.id, kind: 'PLACEHOLDER' }),
    ]);
    expect(serialized.teamIds).toEqual([placeholder.id]);
    expect(serialized.divisionDetails).toEqual([
      expect.objectContaining({
        id: division.id,
        isSystemGenerated: true,
      }),
    ]);
    expect(serialized.matches[0]?.officialIds).toEqual([
      expect.objectContaining({
        positionId: 'line_judge',
        slotIndex: 1,
        holderType: 'PLAYER',
        userId: 'player_1',
        eventOfficialId: null,
        checkedIn: true,
        hasConflict: true,
      }),
    ]);
    expect(serialized.matches[0]?.officialAssignments).toEqual([
      expect.objectContaining({
        positionId: 'line_judge',
        slotIndex: 0,
        holderType: 'OFFICIAL',
        userId: null,
        eventOfficialId: null,
        checkedIn: false,
        hasConflict: false,
      }),
      expect.objectContaining({
        positionId: 'line_judge',
        slotIndex: 1,
        holderType: 'PLAYER',
        userId: 'player_1',
        eventOfficialId: null,
        checkedIn: true,
        hasConflict: true,
      }),
    ]);
  });

  it('serializes phase-owned named official slots instead of event defaults', () => {
    const division = new Division('league', 'League');
    division.phase = 'LEAGUE';
    division.phaseSettings = {
      LEAGUE: {
        officialPositions: [
          { id: 'phase_referee', name: 'Phase Referee', count: 1, order: 0 },
        ],
      },
    };
    const match = new Match({
      id: 'match_phase_slots',
      start: new Date('2026-03-01T10:00:00.000Z'),
      end: new Date('2026-03-01T11:00:00.000Z'),
      division,
      eventId: 'event_phase_slots',
      officialAssignments: [{
        positionId: 'phase_referee',
        slotIndex: 0,
        holderType: 'OFFICIAL',
        userId: 'official_1',
        eventOfficialId: 'event_official_1',
        checkedIn: false,
        hasConflict: false,
      }],
    });
    match.placementState = 'PLACED';
    const event = new Tournament({
      id: 'event_phase_slots',
      name: 'Phase slots',
      start: new Date('2026-03-01T09:00:00.000Z'),
      end: new Date('2026-03-01T12:00:00.000Z'),
      maxParticipants: 3,
      teamSignup: true,
      eventType: 'TOURNAMENT',
      divisions: [division],
      matches: { [match.id]: match },
      officialPositions: [
        { id: 'event_referee', name: 'Event Referee', count: 1, order: 0 },
      ],
    });

    const serialized = serializeEvent(event);

    expect(serialized.matches[0]?.officialIds).toEqual([
      expect.objectContaining({
        positionId: 'phase_referee',
        userId: 'official_1',
      }),
    ]);
  });

  it('keeps canonical Team-duty policy independent from a stale legacy staffing mode', () => {
    const event = new Tournament({
      id: 'event_canonical_staffing',
      name: 'Canonical staffing',
      start: new Date('2026-03-01T09:00:00.000Z'),
      end: new Date('2026-03-01T12:00:00.000Z'),
      maxParticipants: 3,
      teamSignup: true,
      eventType: 'TOURNAMENT',
      officialSchedulingMode: 'TEAM_STAFFING',
      staffingPriority: 'BEST_AVAILABLE_COVERAGE',
      doTeamsOfficiate: false,
      teamOfficialsMaySwap: true,
    });

    const serialized = serializeEvent(event);

    expect(event.doTeamsOfficiate).toBe(false);
    expect(serialized.staffingPriority).toBe('BEST_AVAILABLE_COVERAGE');
    expect(serialized.officialSchedulingMode).toBe('SCHEDULE');
    expect(serialized.doTeamsOfficiate).toBe(false);
    expect(serialized.teamOfficialsMaySwap).toBe(false);
  });

  it('preserves Tournament competition settings in the proposal graph and League defaults', () => {
    const tournament = new Tournament({
      id: 'event_tournament_competition_serialization',
      name: 'Tournament competition',
      start: new Date('2026-03-01T09:00:00.000Z'),
      end: new Date('2026-03-01T12:00:00.000Z'),
      maxParticipants: 8,
      teamSignup: true,
      eventType: 'TOURNAMENT',
      gamesPerOpponent: 3,
      includePlayoffs: true,
      playoffTeamCount: 6,
      pointsToVictory: [25, 25, 15],
    });

    const tournamentGraph = eventEditorCreateProposalGraphSchema.parse({
      event: serializeEvent(tournament),
      matches: [],
    });

    expect(tournamentGraph.event).toEqual(expect.objectContaining({
      gamesPerOpponent: 3,
      includePlayoffs: true,
      playoffTeamCount: 6,
      pointsToVictory: [25, 25, 15],
    }));

    const league = new League({
      id: 'event_league_competition_serialization',
      name: 'League competition',
      start: new Date('2026-03-01T09:00:00.000Z'),
      end: new Date('2026-03-01T12:00:00.000Z'),
      maxParticipants: 8,
      teamSignup: true,
      eventType: 'LEAGUE',
    });

    expect(serializeEvent(league)).toEqual(expect.objectContaining({
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      pointsToVictory: [],
    }));
  });

  it('includes Tournament playoff divisions in canonical graph resources without duplicates', () => {
    const entryDivision = new Division('tournament_entry', 'Entry');
    const playoffDivision = new Division(
      'tournament_playoff',
      'Playoffs',
      [],
      null,
      4,
      4,
      'PLAYOFF',
    );
    playoffDivision.role = 'PHASE';
    playoffDivision.phase = 'BRACKET';
    playoffDivision.sourceDivisionId = entryDivision.id;
    const event = new Tournament({
      id: 'event_tournament_playoff_serialization',
      name: 'Tournament playoffs',
      start: new Date('2026-03-01T09:00:00.000Z'),
      end: new Date('2026-03-01T12:00:00.000Z'),
      maxParticipants: 4,
      teamSignup: true,
      eventType: 'TOURNAMENT',
      divisions: [entryDivision, playoffDivision],
      playoffDivisions: [playoffDivision],
    });

    const serialized = serializeEvent(event);
    const divisionDetailIds = serialized.divisionDetails.map((division) => division.id);

    expect(serialized.divisions).toEqual([entryDivision.id, playoffDivision.id]);
    expect(divisionDetailIds).toEqual([entryDivision.id, playoffDivision.id]);
    expect(new Set(divisionDetailIds).size).toBe(divisionDetailIds.length);
    expect(serialized.playoffDivisionDetails).toEqual([
      expect.objectContaining({
        id: playoffDivision.id,
        sourceDivisionId: entryDivision.id,
        phase: 'BRACKET',
      }),
    ]);
  });

  it('rejects conflicting duplicate Division definitions before graph serialization', () => {
    const eventDivision = new Division('duplicate_division', 'Entry');
    const conflictingPlayoffDivision = new Division(
      'duplicate_division',
      'Conflicting playoffs',
    );
    const event = new Tournament({
      id: 'event_conflicting_division_serialization',
      name: 'Conflicting divisions',
      start: new Date('2026-03-01T09:00:00.000Z'),
      end: new Date('2026-03-01T12:00:00.000Z'),
      maxParticipants: 4,
      teamSignup: true,
      eventType: 'TOURNAMENT',
      divisions: [eventDivision],
      playoffDivisions: [conflictingPlayoffDivision],
    });

    expect(() => serializeEvent(event)).toThrow(
      'Cannot serialize event: conflicting Division definitions for "duplicate_division".',
    );
  });

});
