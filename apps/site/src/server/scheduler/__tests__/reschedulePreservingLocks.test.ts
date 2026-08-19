import {
  rescheduleEventMatchesPreservingLocks,
  type TeamDutyReflowContext,
} from '../reschedulePreservingLocks';
import {
  Division,
  League,
  Match,
  MINUTE_MS,
  PlayingField,
  Team,
  TimeSlot,
  Tournament,
  UserData,
} from '../types';

const createMatch = (params: {
  id: string;
  matchId: number;
  start: Date;
  end: Date;
  locked?: boolean;
  field: PlayingField;
  division: Division;
  team1: Team;
  team2: Team;
  eventId: string;
}) =>
  new Match({
    id: params.id,
    matchId: params.matchId,
    locked: params.locked ?? false,
    team1: params.team1,
    team2: params.team2,
    team1Points: [0, 0, 0],
    team2Points: [0, 0, 0],
    start: params.start,
    end: params.end,
    losersBracket: false,
    division: params.division,
    field: params.field,
    bufferMs: 5 * MINUTE_MS,
    side: null,
    officialCheckedIn: false,
    eventId: params.eventId,
  });


type TeamDutyReflowFixture = {
  tournament: Tournament;
  target: Match;
  teams: Record<string, Team>;
  sourceDivision: Division;
  playoffDivision: Division;
  fields: Record<string, PlayingField>;
};

const createTeamDutyReflowFixture = (existingTeamOfficialId?: string): TeamDutyReflowFixture => {
  const sourceDivision = new Division(
    'source_pool',
    'Source Pool',
    [],
    null,
    null,
    null,
    'LEAGUE',
    ['playoff'],
  );
  const playoffDivision = new Division('playoff', 'Playoff', [], null, null, null, 'PLAYOFF');
  const outsideDivision = new Division('outside', 'Outside');
  const divisions = [sourceDivision, playoffDivision, outsideDivision];
  const fields = Object.fromEntries(
    ['target', 'playing_conflict', 'officiating_conflict', 'history', 'imminent'].map((suffix) => {
      const field = new PlayingField({
        id: `field_${suffix}`,
        divisions,
        matches: [],
        events: [],
        rentalSlots: [],
        name: suffix,
      });
      return [field.id, field];
    }),
  );
  const makeTeam = (id: string, division: Division) => new Team({
    id,
    captainId: `captain_${id}`,
    division,
    name: id,
    matches: [],
    playerIds: [],
  });
  const teams = {
    entrant_1: makeTeam('entrant_1', playoffDivision),
    entrant_2: makeTeam('entrant_2', playoffDivision),
    existing_unchecked: makeTeam('existing_unchecked', sourceDivision),
    eligible_mapped: makeTeam('eligible_mapped', sourceDivision),
    eligible_same_phase: makeTeam('eligible_same_phase', playoffDivision),
    unchecked_mapped: makeTeam('unchecked_mapped', sourceDivision),
    outside_checked: makeTeam('outside_checked', outsideDivision),
    playing_conflict: makeTeam('playing_conflict', sourceDivision),
    officiating_conflict: makeTeam('officiating_conflict', sourceDivision),
    insufficient_rest: makeTeam('insufficient_rest', sourceDivision),
    imminent_match: makeTeam('imminent_match', sourceDivision),
    opponent_1: makeTeam('opponent_1', sourceDivision),
    opponent_2: makeTeam('opponent_2', sourceDivision),
  };
  sourceDivision.teamIds = Object.values(teams)
    .filter((team) => team.division.id === sourceDivision.id)
    .map((team) => team.id);
  playoffDivision.teamIds = Object.values(teams)
    .filter((team) => team.division.id === playoffDivision.id)
    .map((team) => team.id);
  outsideDivision.teamIds = [teams.outside_checked.id];

  const target = createMatch({
    id: 'target_team_duty',
    matchId: 10,
    locked: true,
    start: new Date('2026-03-02T12:00:00.000Z'),
    end: new Date('2026-03-02T13:00:00.000Z'),
    field: fields.field_target,
    division: playoffDivision,
    team1: teams.entrant_1,
    team2: teams.entrant_2,
    eventId: 'team_duty_reflow',
  });
  target.requiresTeamOfficial = true;
  target.teamOfficial = existingTeamOfficialId
    ? Object.values(teams).find((team) => team.id === existingTeamOfficialId) ?? null
    : null;

  const playingConflict = createMatch({
    id: 'playing_conflict_match',
    matchId: 11,
    locked: true,
    start: new Date('2026-03-02T12:00:00.000Z'),
    end: new Date('2026-03-02T13:00:00.000Z'),
    field: fields.field_playing_conflict,
    division: sourceDivision,
    team1: teams.playing_conflict,
    team2: teams.opponent_1,
    eventId: 'team_duty_reflow',
  });
  playingConflict.requiresTeamOfficial = true;
  playingConflict.teamOfficial = teams.existing_unchecked;
  const officiatingConflict = createMatch({
    id: 'officiating_conflict_match',
    matchId: 12,
    locked: true,
    start: new Date('2026-03-02T12:00:00.000Z'),
    end: new Date('2026-03-02T13:00:00.000Z'),
    field: fields.field_officiating_conflict,
    division: sourceDivision,
    team1: teams.opponent_1,
    team2: teams.opponent_2,
    eventId: 'team_duty_reflow',
  });
  officiatingConflict.requiresTeamOfficial = true;
  officiatingConflict.teamOfficial = teams.officiating_conflict;
  const recentMatch = createMatch({
    id: 'insufficient_rest_match',
    matchId: 13,
    locked: true,
    start: new Date('2026-03-02T10:50:00.000Z'),
    end: new Date('2026-03-02T11:50:00.000Z'),
    field: fields.field_history,
    division: sourceDivision,
    team1: teams.insufficient_rest,
    team2: teams.opponent_1,
    eventId: 'team_duty_reflow',
  });
  recentMatch.requiresTeamOfficial = true;
  recentMatch.teamOfficial = teams.existing_unchecked;
  const imminentMatch = createMatch({
    id: 'imminent_match_conflict',
    matchId: 14,
    locked: true,
    start: new Date('2026-03-02T13:10:00.000Z'),
    end: new Date('2026-03-02T14:10:00.000Z'),
    field: fields.field_imminent,
    division: sourceDivision,
    team1: teams.imminent_match,
    team2: teams.opponent_2,
    eventId: 'team_duty_reflow',
  });
  imminentMatch.requiresTeamOfficial = true;
  imminentMatch.teamOfficial = teams.existing_unchecked;

  const tournament = new Tournament({
    id: 'team_duty_reflow',
    name: 'Team duty reflow',
    start: new Date('2026-03-02T10:00:00.000Z'),
    end: new Date('2026-03-02T16:00:00.000Z'),
    maxParticipants: Object.keys(teams).length,
    teamSignup: true,
    eventType: 'TOURNAMENT',
    teams,
    divisions: [sourceDivision, outsideDivision],
    fields,
    matches: {
      [target.id]: target,
      [playingConflict.id]: playingConflict,
      [officiatingConflict.id]: officiatingConflict,
      [recentMatch.id]: recentMatch,
      [imminentMatch.id]: imminentMatch,
    },
    officials: [],
    doTeamsOfficiate: true,
    officialSchedulingMode: 'TEAM_STAFFING',
    includePlayoffs: true,
    playoffDivisions: [playoffDivision],
    doubleElimination: false,
    usesSets: false,
    matchDurationMinutes: 60,
    setDurationMinutes: 0,
    restTimeMinutes: 30,
    noFixedEndDateTime: false,
    timeSlots: [],
  });
  (tournament as Tournament & { staffingPriority: 'TEAM_COVERAGE_REQUIRED' }).staffingPriority =
    'TEAM_COVERAGE_REQUIRED';

  return { tournament, target, teams, sourceDivision, playoffDivision, fields };
};

const addTeamHistoryMatch = (
  fixture: TeamDutyReflowFixture,
  {
    id,
    team,
    opponent,
    start,
    end,
    field,
    winner,
    teamOfficial,
  }: {
    id: string;
    team: Team;
    opponent: Team;
    start: string;
    end: string;
    field: PlayingField;
    winner?: Team;
    teamOfficial?: Team;
  },
) => {
  const match = createMatch({
    id,
    matchId: Object.keys(fixture.tournament.matches).length + 100,
    locked: true,
    start: new Date(start),
    end: new Date(end),
    field,
    division: fixture.sourceDivision,
    team1: team,
    team2: opponent,
    eventId: fixture.tournament.id,
  });
  match.status = 'COMPLETED';
  match.resultStatus = 'FINAL';
  match.actualEnd = new Date(end);
  match.winnerEventTeamId = winner?.id ?? opponent.id;
  match.requiresTeamOfficial = true;
  match.teamOfficial = teamOfficial ?? fixture.teams.existing_unchecked;
  fixture.tournament.matches[match.id] = match;
  return match;
};

describe('rescheduleEventMatchesPreservingLocks', () => {
  it('keeps locked matches fixed and warns when they are outside the updated window', () => {
    const division = new Division('open', 'Open');
    const field = new PlayingField({
      id: 'field_1',
      divisions: [division],
      matches: [],
      events: [],
      rentalSlots: [],
      name: 'Court 1',
    });
    const team1 = new Team({
      id: 'team_1',
      captainId: 'captain_1',
      division,
      name: 'Team 1',
      matches: [],
      playerIds: [],
    });
    const team2 = new Team({
      id: 'team_2',
      captainId: 'captain_2',
      division,
      name: 'Team 2',
      matches: [],
      playerIds: [],
    });
    const team3 = new Team({
      id: 'team_3',
      captainId: 'captain_3',
      division,
      name: 'Team 3',
      matches: [],
      playerIds: [],
    });
    const team4 = new Team({
      id: 'team_4',
      captainId: 'captain_4',
      division,
      name: 'Team 4',
      matches: [],
      playerIds: [],
    });

    const eventStart = new Date('2026-03-02T10:00:00.000Z');
    const eventEnd = new Date('2026-03-02T18:00:00.000Z');
    const lockedStart = new Date('2026-03-02T08:00:00.000Z');
    const lockedEnd = new Date('2026-03-02T09:00:00.000Z');

    const lockedMatch = createMatch({
      id: 'match_locked',
      matchId: 1,
      start: lockedStart,
      end: lockedEnd,
      locked: true,
      field,
      division,
      team1,
      team2,
      eventId: 'event_1',
    });
    const unlockedMatchOne = createMatch({
      id: 'match_2',
      matchId: 2,
      start: new Date('2026-03-02T10:00:00.000Z'),
      end: new Date('2026-03-02T11:00:00.000Z'),
      field,
      division,
      team1: team3,
      team2: team4,
      eventId: 'event_1',
    });
    const unlockedMatchTwo = createMatch({
      id: 'match_3',
      matchId: 3,
      start: new Date('2026-03-02T11:05:00.000Z'),
      end: new Date('2026-03-02T12:05:00.000Z'),
      field,
      division,
      team1,
      team2: team3,
      eventId: 'event_1',
    });

    const event = new League({
      id: 'event_1',
      name: 'Test League',
      description: '',
      start: eventStart,
      end: eventEnd,
      location: '',
      organizationId: null,
      teams: {
        [team1.id]: team1,
        [team2.id]: team2,
        [team3.id]: team3,
        [team4.id]: team4,
      },
      players: [],
      waitListIds: [],
      freeAgentIds: [],
      maxParticipants: 4,
      teamSignup: true,
      divisions: [division],
      fields: { [field.id]: field },
      matches: {
        [lockedMatch.id]: lockedMatch,
        [unlockedMatchOne.id]: unlockedMatchOne,
        [unlockedMatchTwo.id]: unlockedMatchTwo,
      },
      officials: [],
      eventType: 'LEAGUE',
      doubleElimination: false,
      winnerSetCount: null,
      loserSetCount: null,
      matchDurationMinutes: 60,
      usesSets: false,
      setDurationMinutes: 0,
      setsPerMatch: 3,
      pointsToVictory: [],
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      doTeamsOfficiate: false,
      staffingPriority: 'OFFICIAL_COVERAGE_REQUIRED',
      noFixedEndDateTime: false,
      restTimeMinutes: 5,
      timeSlots: [
        new TimeSlot({
          id: 'slot_1',
          dayOfWeek: 0,
          startDate: eventStart,
          endDate: eventEnd,
          repeating: true,
          startTimeMinutes: 10 * 60,
          endTimeMinutes: 18 * 60,
          field: field.id,
          divisions: [division],
        }),
      ],
    });

    const result = rescheduleEventMatchesPreservingLocks(event);
    const matchMap = new Map(result.matches.map((match) => [match.id, match]));
    const locked = matchMap.get('match_locked');
    const match2 = matchMap.get('match_2');
    const match3 = matchMap.get('match_3');

    expect(locked).toBeDefined();
    expect(match2).toBeDefined();
    expect(match3).toBeDefined();
    expect(locked?.start.toISOString()).toBe(lockedStart.toISOString());
    expect(locked?.end.toISOString()).toBe(lockedEnd.toISOString());
    expect(locked?.locked).toBe(true);
    expect(locked?.field?.id).toBe('field_1');

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.code).toBe('LOCKED_MATCH_OUTSIDE_WINDOW');
    expect(result.warnings[0]?.matchIds).toEqual(['match_locked']);

    expect(match2!.start.getTime()).toBeGreaterThanOrEqual(eventStart.getTime());
    expect(match3!.start.getTime()).toBeGreaterThanOrEqual(eventStart.getTime());
    expect(match2!.end.getTime()).toBeLessThanOrEqual(eventEnd.getTime());
    expect(match3!.end.getTime()).toBeLessThanOrEqual(eventEnd.getTime());
  });

  it('reschedules non-repeating slots when field rental slots mirror event availability', () => {
    const division = new Division('open', 'Open');
    const field = new PlayingField({
      id: 'field_non_repeating',
      divisions: [division],
      matches: [],
      events: [],
      rentalSlots: [],
      name: 'Court Non-Repeating',
    });

    const team1 = new Team({
      id: 'nr_team_1',
      captainId: 'nr_captain_1',
      division,
      name: 'Team 1',
      matches: [],
      playerIds: [],
    });
    const team2 = new Team({
      id: 'nr_team_2',
      captainId: 'nr_captain_2',
      division,
      name: 'Team 2',
      matches: [],
      playerIds: [],
    });
    const team3 = new Team({
      id: 'nr_team_3',
      captainId: 'nr_captain_3',
      division,
      name: 'Team 3',
      matches: [],
      playerIds: [],
    });
    const team4 = new Team({
      id: 'nr_team_4',
      captainId: 'nr_captain_4',
      division,
      name: 'Team 4',
      matches: [],
      playerIds: [],
    });

    const intendedSlotStart = new Date('2026-07-11T20:00:00.000Z');
    const intendedSlotEnd = new Date('2026-07-12T02:00:00.000Z');
    const slotStart = new Date('2026-07-12T03:00:00.000Z');
    const slotEnd = new Date('2026-07-12T09:00:00.000Z');
    const mirroredSlot = new TimeSlot({
      id: 'slot_non_repeating',
      dayOfWeek: 5,
      daysOfWeek: [5],
      startDate: slotStart,
      endDate: slotEnd,
      repeating: false,
      startTimeMinutes: 13 * 60,
      endTimeMinutes: 19 * 60,
      field: field.id,
      fieldIds: [field.id],
      divisions: [division],
      timeZone: 'America/Los_Angeles',
    });
    field.rentalSlots = [mirroredSlot];

    const unscheduledStart = new Date('2026-07-11T08:18:00.000Z');
    const matchOne = createMatch({
      id: 'nr_match_1',
      matchId: 1,
      start: unscheduledStart,
      end: unscheduledStart,
      field,
      division,
      team1,
      team2,
      eventId: 'event_non_repeating',
    });
    const matchTwo = createMatch({
      id: 'nr_match_2',
      matchId: 2,
      start: unscheduledStart,
      end: unscheduledStart,
      field,
      division,
      team1: team3,
      team2: team4,
      eventId: 'event_non_repeating',
    });

    const event = new League({
      id: 'event_non_repeating',
      name: 'Non-Repeating League',
      description: '',
      start: new Date('2026-07-11T08:00:00.000Z'),
      end: unscheduledStart,
      location: '',
      organizationId: null,
      teams: {
        [team1.id]: team1,
        [team2.id]: team2,
        [team3.id]: team3,
        [team4.id]: team4,
      },
      players: [],
      waitListIds: [],
      freeAgentIds: [],
      maxParticipants: 4,
      teamSignup: true,
      divisions: [division],
      fields: { [field.id]: field },
      matches: {
        [matchOne.id]: matchOne,
        [matchTwo.id]: matchTwo,
      },
      officials: [],
      eventType: 'LEAGUE',
      doubleElimination: false,
      winnerSetCount: null,
      loserSetCount: null,
      matchDurationMinutes: 60,
      usesSets: false,
      setDurationMinutes: 0,
      setsPerMatch: 3,
      pointsToVictory: [],
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      doTeamsOfficiate: false,
      staffingPriority: 'OFFICIAL_COVERAGE_REQUIRED',
      noFixedEndDateTime: true,
      restTimeMinutes: 5,
      timeSlots: [mirroredSlot],
    });

    const result = rescheduleEventMatchesPreservingLocks(event);
    expect(result.warnings).toEqual([]);
    expect(result.matches).toHaveLength(2);
    expect(result.matches.every((match) => match.field?.id === field.id)).toBe(true);
    expect(result.matches.every((match) => match.end.getTime() - match.start.getTime() >= 5 * MINUTE_MS)).toBe(true);
    expect(result.matches.every((match) => match.start.getTime() >= intendedSlotStart.getTime())).toBe(true);
    expect(result.matches.every((match) => match.end.getTime() <= intendedSlotEnd.getTime())).toBe(true);
  });

  it('does not warn when a locked match is within a secondary day in daysOfWeek', () => {
    const division = new Division('open', 'Open');
    const field = new PlayingField({
      id: 'field_multi_day',
      divisions: [division],
      matches: [],
      events: [],
      rentalSlots: [],
      name: 'Court Multi Day',
    });
    const team1 = new Team({
      id: 'multi_day_team_1',
      captainId: 'multi_day_captain_1',
      division,
      name: 'Team 1',
      matches: [],
      playerIds: [],
    });
    const team2 = new Team({
      id: 'multi_day_team_2',
      captainId: 'multi_day_captain_2',
      division,
      name: 'Team 2',
      matches: [],
      playerIds: [],
    });
    const team3 = new Team({
      id: 'multi_day_team_3',
      captainId: 'multi_day_captain_3',
      division,
      name: 'Team 3',
      matches: [],
      playerIds: [],
    });
    const team4 = new Team({
      id: 'multi_day_team_4',
      captainId: 'multi_day_captain_4',
      division,
      name: 'Team 4',
      matches: [],
      playerIds: [],
    });

    const eventStart = new Date(2026, 2, 2, 9, 0, 0);
    const eventEnd = new Date(2026, 2, 4, 18, 0, 0);

    const lockedMatch = createMatch({
      id: 'match_locked_multi_day',
      matchId: 1,
      start: new Date(2026, 2, 3, 10, 0, 0),
      end: new Date(2026, 2, 3, 11, 0, 0),
      locked: true,
      field,
      division,
      team1,
      team2,
      eventId: 'event_multi_day',
    });
    const unlockedMatch = createMatch({
      id: 'match_unlocked_multi_day',
      matchId: 2,
      start: new Date(2026, 2, 2, 10, 0, 0),
      end: new Date(2026, 2, 2, 11, 0, 0),
      field,
      division,
      team1: team3,
      team2: team4,
      eventId: 'event_multi_day',
    });

    const event = new League({
      id: 'event_multi_day',
      name: 'Multi-day lock league',
      description: '',
      start: eventStart,
      end: eventEnd,
      location: '',
      organizationId: null,
      teams: {
        [team1.id]: team1,
        [team2.id]: team2,
        [team3.id]: team3,
        [team4.id]: team4,
      },
      players: [],
      waitListIds: [],
      freeAgentIds: [],
      maxParticipants: 4,
      teamSignup: true,
      divisions: [division],
      fields: { [field.id]: field },
      matches: {
        [lockedMatch.id]: lockedMatch,
        [unlockedMatch.id]: unlockedMatch,
      },
      officials: [],
      eventType: 'LEAGUE',
      doubleElimination: false,
      winnerSetCount: null,
      loserSetCount: null,
      matchDurationMinutes: 60,
      usesSets: false,
      setDurationMinutes: 0,
      setsPerMatch: 3,
      pointsToVictory: [],
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      doTeamsOfficiate: false,
      staffingPriority: 'OFFICIAL_COVERAGE_REQUIRED',
      noFixedEndDateTime: false,
      restTimeMinutes: 5,
      timeSlots: [
        new TimeSlot({
          id: 'slot_multi_day',
          dayOfWeek: 0,
          daysOfWeek: [0, 1],
          startDate: eventStart,
          endDate: eventEnd,
          repeating: true,
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 18 * 60,
          field: field.id,
          divisions: [division],
        }),
      ],
    });

    const result = rescheduleEventMatchesPreservingLocks(event);
    expect(result.warnings).toHaveLength(0);
  });

  it('does not warn when a locked match is within a secondary field in slot fieldIds', () => {
    const division = new Division('open', 'Open');
    const fieldOne = new PlayingField({
      id: 'field_multi_1',
      divisions: [division],
      matches: [],
      events: [],
      rentalSlots: [],
      name: 'Court A',
    });
    const fieldTwo = new PlayingField({
      id: 'field_multi_2',
      divisions: [division],
      matches: [],
      events: [],
      rentalSlots: [],
      name: 'Court B',
    });
    const team1 = new Team({
      id: 'multi_field_team_1',
      captainId: 'multi_field_captain_1',
      division,
      name: 'Team 1',
      matches: [],
      playerIds: [],
    });
    const team2 = new Team({
      id: 'multi_field_team_2',
      captainId: 'multi_field_captain_2',
      division,
      name: 'Team 2',
      matches: [],
      playerIds: [],
    });
    const team3 = new Team({
      id: 'multi_field_team_3',
      captainId: 'multi_field_captain_3',
      division,
      name: 'Team 3',
      matches: [],
      playerIds: [],
    });
    const team4 = new Team({
      id: 'multi_field_team_4',
      captainId: 'multi_field_captain_4',
      division,
      name: 'Team 4',
      matches: [],
      playerIds: [],
    });

    const eventStart = new Date(2026, 2, 2, 9, 0, 0);
    const eventEnd = new Date(2026, 2, 2, 18, 0, 0);

    const lockedMatch = createMatch({
      id: 'match_locked_multi_field',
      matchId: 1,
      start: new Date(2026, 2, 2, 10, 0, 0),
      end: new Date(2026, 2, 2, 11, 0, 0),
      locked: true,
      field: fieldTwo,
      division,
      team1,
      team2,
      eventId: 'event_multi_field',
    });
    const unlockedMatch = createMatch({
      id: 'match_unlocked_multi_field',
      matchId: 2,
      start: new Date(2026, 2, 2, 11, 5, 0),
      end: new Date(2026, 2, 2, 12, 5, 0),
      field: fieldOne,
      division,
      team1: team3,
      team2: team4,
      eventId: 'event_multi_field',
    });

    const event = new League({
      id: 'event_multi_field',
      name: 'Multi-field lock league',
      description: '',
      start: eventStart,
      end: eventEnd,
      location: '',
      organizationId: null,
      teams: {
        [team1.id]: team1,
        [team2.id]: team2,
        [team3.id]: team3,
        [team4.id]: team4,
      },
      players: [],
      waitListIds: [],
      freeAgentIds: [],
      maxParticipants: 4,
      teamSignup: true,
      divisions: [division],
      fields: {
        [fieldOne.id]: fieldOne,
        [fieldTwo.id]: fieldTwo,
      },
      matches: {
        [lockedMatch.id]: lockedMatch,
        [unlockedMatch.id]: unlockedMatch,
      },
      officials: [],
      eventType: 'LEAGUE',
      doubleElimination: false,
      winnerSetCount: null,
      loserSetCount: null,
      matchDurationMinutes: 60,
      usesSets: false,
      setDurationMinutes: 0,
      setsPerMatch: 3,
      pointsToVictory: [],
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      doTeamsOfficiate: false,
      staffingPriority: 'OFFICIAL_COVERAGE_REQUIRED',
      noFixedEndDateTime: false,
      restTimeMinutes: 5,
      timeSlots: [
        new TimeSlot({
          id: 'slot_multi_field',
          dayOfWeek: 0,
          startDate: eventStart,
          endDate: eventEnd,
          repeating: true,
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 18 * 60,
          fieldIds: [fieldOne.id, fieldTwo.id],
          divisions: [division],
        }),
      ],
    });

    const result = rescheduleEventMatchesPreservingLocks(event);
    expect(result.warnings).toHaveLength(0);
  });

  it('reschedules split-playoff matches when playoff slots are inherited from source divisions', () => {
    const playoffDivisionId = 'e7c5bb6f-1529-46c3-ab2b-9d35d135427d__division__playoff_2';
    const regularDivision = new Division(
      'e7c5bb6f-1529-46c3-ab2b-9d35d135427d',
      'Regular',
      [],
      null,
      4,
      2,
      'LEAGUE',
      [playoffDivisionId],
    );
    const playoffDivision = new Division(
      playoffDivisionId,
      'Playoff 2',
      [],
      null,
      4,
      null,
      'PLAYOFF',
    );

    const field = new PlayingField({
      id: 'field_split_playoff',
      divisions: [regularDivision, playoffDivision],
      matches: [],
      events: [],
      rentalSlots: [],
      name: 'Court Split',
    });

    const team1 = new Team({
      id: 'split_team_1',
      captainId: 'split_captain_1',
      division: playoffDivision,
      name: 'Split Team 1',
      matches: [],
      playerIds: [],
    });
    const team2 = new Team({
      id: 'split_team_2',
      captainId: 'split_captain_2',
      division: playoffDivision,
      name: 'Split Team 2',
      matches: [],
      playerIds: [],
    });

    const eventStart = new Date('2026-03-02T10:00:00.000Z');
    const eventEnd = new Date('2026-03-30T20:00:00.000Z');

    const playoffMatch = createMatch({
      id: 'match_split_playoff',
      matchId: 1,
      start: new Date('2026-03-03T10:00:00.000Z'),
      end: new Date('2026-03-03T11:00:00.000Z'),
      field,
      division: playoffDivision,
      team1,
      team2,
      eventId: 'event_split_playoff',
    });

    const event = new League({
      id: 'event_split_playoff',
      name: 'Split Playoff Reschedule',
      description: '',
      start: eventStart,
      end: eventEnd,
      location: '',
      organizationId: null,
      teams: {
        [team1.id]: team1,
        [team2.id]: team2,
      },
      players: [],
      waitListIds: [],
      freeAgentIds: [],
      maxParticipants: 2,
      teamSignup: true,
      divisions: [regularDivision],
      playoffDivisions: [playoffDivision],
      splitLeaguePlayoffDivisions: true,
      fields: { [field.id]: field },
      matches: {
        [playoffMatch.id]: playoffMatch,
      },
      officials: [],
      eventType: 'LEAGUE',
      doubleElimination: false,
      winnerSetCount: null,
      loserSetCount: null,
      matchDurationMinutes: 60,
      usesSets: false,
      setDurationMinutes: 0,
      setsPerMatch: 3,
      pointsToVictory: [],
      gamesPerOpponent: 1,
      includePlayoffs: true,
      playoffTeamCount: 3,
      doTeamsOfficiate: false,
      staffingPriority: 'OFFICIAL_COVERAGE_REQUIRED',
      noFixedEndDateTime: false,
      restTimeMinutes: 5,
      timeSlots: [
        new TimeSlot({
          id: 'slot_regular_only',
          dayOfWeek: 0,
          startDate: eventStart,
          endDate: eventEnd,
          repeating: true,
          startTimeMinutes: 10 * 60,
          endTimeMinutes: 20 * 60,
          field: field.id,
          divisions: [regularDivision],
        }),
      ],
    });

    const result = rescheduleEventMatchesPreservingLocks(event);
    const scheduled = result.matches.find((match) => match.id === playoffMatch.id);

    expect(scheduled).toBeDefined();
    expect(scheduled?.field?.id).toBe(field.id);
    expect(scheduled?.start.getTime()).toBeGreaterThanOrEqual(eventStart.getTime());
    expect(result.warnings).toHaveLength(0);
    expect(event.timeSlots[0]?.divisions.some((division) => division.id === playoffDivisionId)).toBe(true);
  });

  it('reschedules tournament pool and bracket matches using bracket division slots', () => {
    const bracketDivision = new Division(
      'tournament_reschedule_bracket_open',
      'Open',
      [],
      null,
      4,
      4,
      'PLAYOFF',
    );
    const poolDivision = new Division(
      'tournament_reschedule_bracket_open_pool_a',
      'Open Pool A',
      [],
      null,
      4,
      2,
      'LEAGUE',
      [bracketDivision.id, bracketDivision.id],
    );
    const field = new PlayingField({
      id: 'field_tournament_pool_reschedule',
      divisions: [bracketDivision, poolDivision],
      matches: [],
      events: [],
      rentalSlots: [],
      name: 'Court Pool',
    });
    const poolTeam1 = new Team({
      id: 'pool_team_1',
      captainId: 'pool_captain_1',
      division: poolDivision,
      name: 'Pool Team 1',
      matches: [],
      playerIds: [],
    });
    const poolTeam2 = new Team({
      id: 'pool_team_2',
      captainId: 'pool_captain_2',
      division: poolDivision,
      name: 'Pool Team 2',
      matches: [],
      playerIds: [],
    });
    const bracketTeam1 = new Team({
      id: 'bracket_team_1',
      captainId: '',
      division: bracketDivision,
      name: 'Seed 1',
      matches: [],
      playerIds: [],
    });
    const bracketTeam2 = new Team({
      id: 'bracket_team_2',
      captainId: '',
      division: bracketDivision,
      name: 'Seed 2',
      matches: [],
      playerIds: [],
    });
    const eventStart = new Date('2026-03-02T10:00:00.000Z');
    const eventEnd = new Date('2026-03-30T20:00:00.000Z');
    const poolMatch = createMatch({
      id: 'match_tournament_pool_reschedule',
      matchId: 1,
      start: new Date('2026-03-03T10:00:00.000Z'),
      end: new Date('2026-03-03T11:00:00.000Z'),
      field,
      division: poolDivision,
      team1: poolTeam1,
      team2: poolTeam2,
      eventId: 'event_tournament_pool_reschedule',
    });
    const bracketMatch = createMatch({
      id: 'match_tournament_bracket_reschedule',
      matchId: 2,
      start: new Date('2026-03-03T11:00:00.000Z'),
      end: new Date('2026-03-03T12:00:00.000Z'),
      field,
      division: bracketDivision,
      team1: bracketTeam1,
      team2: bracketTeam2,
      eventId: 'event_tournament_pool_reschedule',
    });

    const event = new Tournament({
      id: 'event_tournament_pool_reschedule',
      name: 'Tournament Pool Reschedule',
      description: '',
      start: eventStart,
      end: eventEnd,
      location: '',
      organizationId: null,
      teams: {
        [poolTeam1.id]: poolTeam1,
        [poolTeam2.id]: poolTeam2,
        [bracketTeam1.id]: bracketTeam1,
        [bracketTeam2.id]: bracketTeam2,
      },
      players: [],
      waitListIds: [],
      freeAgentIds: [],
      maxParticipants: 4,
      teamSignup: true,
      divisions: [poolDivision],
      playoffDivisions: [bracketDivision],
      fields: { [field.id]: field },
      matches: {
        [poolMatch.id]: poolMatch,
        [bracketMatch.id]: bracketMatch,
      },
      officials: [],
      eventType: 'TOURNAMENT',
      doubleElimination: false,
      winnerSetCount: null,
      loserSetCount: null,
      matchDurationMinutes: 60,
      usesSets: false,
      setDurationMinutes: 0,
      includePlayoffs: true,
      playoffTeamCount: 4,
      doTeamsOfficiate: false,
      staffingPriority: 'OFFICIAL_COVERAGE_REQUIRED',
      noFixedEndDateTime: false,
      restTimeMinutes: 5,
      timeSlots: [
        new TimeSlot({
          id: 'slot_tournament_bracket_only',
          dayOfWeek: 0,
          startDate: eventStart,
          endDate: eventEnd,
          repeating: true,
          startTimeMinutes: 10 * 60,
          endTimeMinutes: 20 * 60,
          field: field.id,
          divisions: [bracketDivision],
        }),
      ],
    });

    const result = rescheduleEventMatchesPreservingLocks(event);

    expect(result.matches.find((match) => match.id === poolMatch.id)?.division.id).toBe(poolDivision.id);
    expect(result.matches.find((match) => match.id === bracketMatch.id)?.division.id).toBe(bracketDivision.id);
    expect(event.timeSlots[0]?.divisions.map((division) => division.id)).toEqual([
      bracketDivision.id,
      poolDivision.id,
    ]);
  });

  it('preserves dependent assignments when upstream winners are unresolved', () => {
    const division = new Division('open', 'Open');
    const field = new PlayingField({
      id: 'field_dependency',
      divisions: [division],
      matches: [],
      events: [],
      rentalSlots: [],
      name: 'Court Dependency',
    });

    const teamA = new Team({
      id: 'team_a',
      captainId: 'captain_a',
      division,
      name: 'Team A',
      matches: [],
      playerIds: [],
    });
    const teamB = new Team({
      id: 'team_b',
      captainId: 'captain_b',
      division,
      name: 'Team B',
      matches: [],
      playerIds: [],
    });
    const teamC = new Team({
      id: 'team_c',
      captainId: 'captain_c',
      division,
      name: 'Team C',
      matches: [],
      playerIds: [],
    });
    const teamD = new Team({
      id: 'team_d',
      captainId: 'captain_d',
      division,
      name: 'Team D',
      matches: [],
      playerIds: [],
    });

    const eventStart = new Date('2026-03-02T10:00:00.000Z');
    const eventEnd = new Date('2026-03-02T16:00:00.000Z');

    const lockedMatch = createMatch({
      id: 'match_locked_dependency',
      matchId: 1,
      start: new Date('2026-03-02T10:00:00.000Z'),
      end: new Date('2026-03-02T11:00:00.000Z'),
      locked: true,
      field,
      division,
      team1: teamA,
      team2: teamB,
      eventId: 'event_dependency',
    });

    const qualifierMatch = createMatch({
      id: 'match_qualifier',
      matchId: 2,
      start: new Date('2026-03-02T11:00:00.000Z'),
      end: new Date('2026-03-02T12:00:00.000Z'),
      field,
      division,
      team1: teamC,
      team2: teamD,
      eventId: 'event_dependency',
    });

    const dependentMatch = createMatch({
      id: 'match_dependent',
      matchId: 3,
      start: new Date('2026-03-02T12:00:00.000Z'),
      end: new Date('2026-03-02T13:00:00.000Z'),
      field,
      division,
      team1: teamA,
      team2: teamB,
      eventId: 'event_dependency',
    });
    dependentMatch.team1Seed = 11;
    dependentMatch.team2Seed = 12;
    dependentMatch.previousLeftMatch = qualifierMatch;
    qualifierMatch.winnerNextMatch = dependentMatch;

    const event = new League({
      id: 'event_dependency',
      name: 'Dependency Cleanup League',
      description: '',
      start: eventStart,
      end: eventEnd,
      location: '',
      organizationId: null,
      teams: {
        [teamA.id]: teamA,
        [teamB.id]: teamB,
        [teamC.id]: teamC,
        [teamD.id]: teamD,
      },
      players: [],
      waitListIds: [],
      freeAgentIds: [],
      maxParticipants: 4,
      teamSignup: true,
      divisions: [division],
      fields: { [field.id]: field },
      matches: {
        [lockedMatch.id]: lockedMatch,
        [qualifierMatch.id]: qualifierMatch,
        [dependentMatch.id]: dependentMatch,
      },
      officials: [],
      eventType: 'LEAGUE',
      doubleElimination: false,
      winnerSetCount: null,
      loserSetCount: null,
      matchDurationMinutes: 60,
      usesSets: false,
      setDurationMinutes: 0,
      setsPerMatch: 3,
      pointsToVictory: [],
      gamesPerOpponent: 1,
      includePlayoffs: true,
      playoffTeamCount: 3,
      doTeamsOfficiate: false,
      staffingPriority: 'OFFICIAL_COVERAGE_REQUIRED',
      noFixedEndDateTime: false,
      restTimeMinutes: 5,
      timeSlots: [
        new TimeSlot({
          id: 'slot_dependency',
          dayOfWeek: 0,
          startDate: eventStart,
          endDate: eventEnd,
          repeating: true,
          startTimeMinutes: 10 * 60,
          endTimeMinutes: 16 * 60,
          field: field.id,
          divisions: [division],
        }),
      ],
    });

    const result = rescheduleEventMatchesPreservingLocks(event);
    const rescheduledDependent = result.matches.find((match) => match.id === dependentMatch.id);

    expect(rescheduledDependent).toBeDefined();
    expect(rescheduledDependent?.team1?.id).toBe(teamA.id);
    expect(rescheduledDependent?.team2?.id).toBe(teamB.id);
    expect(rescheduledDependent?.team1Seed).toBe(11);
    expect(rescheduledDependent?.team2Seed).toBe(12);
  });

  it('moves a carried playoff seed back onto the open entrant slot when rescheduling', () => {
    const division = new Division('open', 'Open');
    const field = new PlayingField({
      id: 'field_playoff_seed_normalization',
      divisions: [division],
      matches: [],
      events: [],
      rentalSlots: [],
      name: 'Court Playoff',
    });
    const teamA = new Team({
      id: 'team_a',
      captainId: 'captain_a',
      division,
      name: 'Team A',
      matches: [],
      playerIds: [],
    });
    const teamB = new Team({
      id: 'team_b',
      captainId: 'captain_b',
      division,
      name: 'Team B',
      matches: [],
      playerIds: [],
    });
    const teamC = new Team({
      id: 'team_c',
      captainId: 'captain_c',
      division,
      name: 'Team C',
      matches: [],
      playerIds: [],
    });
    const teamD = new Team({
      id: 'team_d',
      captainId: 'captain_d',
      division,
      name: 'Team D',
      matches: [],
      playerIds: [],
    });

    const eventStart = new Date('2026-03-02T10:00:00.000Z');
    const eventEnd = new Date('2026-03-02T16:00:00.000Z');

    const qualifierMatch = createMatch({
      id: 'match_playin',
      matchId: 1,
      start: new Date('2026-03-02T10:00:00.000Z'),
      end: new Date('2026-03-02T11:00:00.000Z'),
      field,
      division,
      team1: teamA,
      team2: teamB,
      eventId: 'event_playoff_seed_normalization',
    });
    qualifierMatch.team1Seed = 8;
    qualifierMatch.team2Seed = 9;

    const carriedMatch = createMatch({
      id: 'match_carry',
      matchId: 2,
      start: new Date('2026-03-02T12:00:00.000Z'),
      end: new Date('2026-03-02T13:00:00.000Z'),
      field,
      division,
      team1: teamC,
      team2: teamD,
      eventId: 'event_playoff_seed_normalization',
    });
    carriedMatch.team1 = null;
    carriedMatch.team2 = null;
    carriedMatch.team1Seed = 1;
    carriedMatch.team2Seed = null;
    carriedMatch.previousLeftMatch = qualifierMatch;
    qualifierMatch.winnerNextMatch = carriedMatch;

    const event = new League({
      id: 'event_playoff_seed_normalization',
      name: 'Playoff Seed Normalization League',
      description: '',
      start: eventStart,
      end: eventEnd,
      location: '',
      organizationId: null,
      teams: {
        [teamA.id]: teamA,
        [teamB.id]: teamB,
        [teamC.id]: teamC,
        [teamD.id]: teamD,
      },
      players: [],
      waitListIds: [],
      freeAgentIds: [],
      maxParticipants: 4,
      teamSignup: true,
      divisions: [division],
      fields: { [field.id]: field },
      matches: {
        [qualifierMatch.id]: qualifierMatch,
        [carriedMatch.id]: carriedMatch,
      },
      officials: [],
      eventType: 'LEAGUE',
      doubleElimination: false,
      winnerSetCount: null,
      loserSetCount: null,
      matchDurationMinutes: 60,
      usesSets: false,
      setDurationMinutes: 0,
      setsPerMatch: 3,
      pointsToVictory: [],
      gamesPerOpponent: 1,
      includePlayoffs: true,
      playoffTeamCount: 4,
      doTeamsOfficiate: false,
      staffingPriority: 'OFFICIAL_COVERAGE_REQUIRED',
      noFixedEndDateTime: false,
      restTimeMinutes: 5,
      timeSlots: [
        new TimeSlot({
          id: 'slot_playoff_seed_normalization',
          dayOfWeek: 0,
          startDate: eventStart,
          endDate: eventEnd,
          repeating: true,
          startTimeMinutes: 10 * 60,
          endTimeMinutes: 16 * 60,
          field: field.id,
          divisions: [division],
        }),
      ],
    });

    const result = rescheduleEventMatchesPreservingLocks(event);
    const rescheduledCarry = result.matches.find((match) => match.id === carriedMatch.id);

    expect(rescheduledCarry).toBeDefined();
    expect(rescheduledCarry?.team1Seed).toBeNull();
    expect(rescheduledCarry?.team2Seed).toBe(1);
    expect(rescheduledCarry?.previousLeftMatch?.id).toBe(qualifierMatch.id);
  });

  it('normalizes carried playoff seeds for non-split multi-division leagues when rescheduling', () => {
    const open = new Division('open', 'CoEd Open • 18+');
    const premier = new Division('premier', 'CoEd Premier • 18+');
    const field = new PlayingField({
      id: 'field_multi_division_playoff_seed_normalization',
      divisions: [open, premier],
      matches: [],
      events: [],
      rentalSlots: [],
      name: 'Court Multi Division',
    });
    const makeTeam = (id: string, division: Division) => new Team({
      id,
      captainId: `captain_${id}`,
      division,
      name: id,
      matches: [],
      playerIds: [],
    });
    const openTeam1 = makeTeam('open_team_1', open);
    const openTeam2 = makeTeam('open_team_2', open);
    const premierTeam1 = makeTeam('premier_team_1', premier);
    const premierTeam2 = makeTeam('premier_team_2', premier);

    const eventStart = new Date('2026-03-02T10:00:00.000Z');
    const eventEnd = new Date('2026-03-02T18:00:00.000Z');

    const openQualifier = createMatch({
      id: 'match_open_playin',
      matchId: 91,
      start: new Date('2026-03-02T10:00:00.000Z'),
      end: new Date('2026-03-02T11:00:00.000Z'),
      field,
      division: open,
      team1: openTeam1,
      team2: openTeam2,
      eventId: 'event_multi_division_playoff_seed_normalization',
    });
    openQualifier.team1Seed = 8;
    openQualifier.team2Seed = 9;

    const openCarry = createMatch({
      id: 'match_open_carry',
      matchId: 95,
      start: new Date('2026-03-02T12:00:00.000Z'),
      end: new Date('2026-03-02T13:00:00.000Z'),
      field,
      division: open,
      team1: openTeam1,
      team2: openTeam2,
      eventId: 'event_multi_division_playoff_seed_normalization',
    });
    openCarry.team1 = null;
    openCarry.team2 = null;
    openCarry.team1Seed = 1;
    openCarry.team2Seed = null;
    openCarry.previousLeftMatch = openQualifier;
    openQualifier.winnerNextMatch = openCarry;

    const premierQualifier = createMatch({
      id: 'match_premier_playin',
      matchId: 92,
      start: new Date('2026-03-02T11:00:00.000Z'),
      end: new Date('2026-03-02T12:00:00.000Z'),
      field,
      division: premier,
      team1: premierTeam1,
      team2: premierTeam2,
      eventId: 'event_multi_division_playoff_seed_normalization',
    });
    premierQualifier.team1Seed = 8;
    premierQualifier.team2Seed = 9;

    const premierCarry = createMatch({
      id: 'match_premier_carry',
      matchId: 96,
      start: new Date('2026-03-02T13:00:00.000Z'),
      end: new Date('2026-03-02T14:00:00.000Z'),
      field,
      division: premier,
      team1: premierTeam1,
      team2: premierTeam2,
      eventId: 'event_multi_division_playoff_seed_normalization',
    });
    premierCarry.team1 = null;
    premierCarry.team2 = null;
    premierCarry.team1Seed = 1;
    premierCarry.team2Seed = null;
    premierCarry.previousLeftMatch = premierQualifier;
    premierQualifier.winnerNextMatch = premierCarry;

    const event = new League({
      id: 'event_multi_division_playoff_seed_normalization',
      name: 'Multi Division Playoff Seed Normalization League',
      description: '',
      start: eventStart,
      end: eventEnd,
      location: '',
      organizationId: null,
      teams: {
        [openTeam1.id]: openTeam1,
        [openTeam2.id]: openTeam2,
        [premierTeam1.id]: premierTeam1,
        [premierTeam2.id]: premierTeam2,
      },
      players: [],
      waitListIds: [],
      freeAgentIds: [],
      maxParticipants: 4,
      teamSignup: true,
      divisions: [open, premier],
      playoffDivisions: [],
      splitLeaguePlayoffDivisions: false,
      fields: { [field.id]: field },
      matches: {
        [openQualifier.id]: openQualifier,
        [openCarry.id]: openCarry,
        [premierQualifier.id]: premierQualifier,
        [premierCarry.id]: premierCarry,
      },
      officials: [],
      eventType: 'LEAGUE',
      doubleElimination: false,
      winnerSetCount: null,
      loserSetCount: null,
      matchDurationMinutes: 60,
      usesSets: false,
      setDurationMinutes: 0,
      setsPerMatch: 3,
      pointsToVictory: [],
      gamesPerOpponent: 1,
      includePlayoffs: true,
      playoffTeamCount: 10,
      doTeamsOfficiate: false,
      staffingPriority: 'OFFICIAL_COVERAGE_REQUIRED',
      noFixedEndDateTime: false,
      restTimeMinutes: 5,
      timeSlots: [
        new TimeSlot({
          id: 'slot_multi_division_playoff_seed_normalization',
          dayOfWeek: 0,
          startDate: eventStart,
          endDate: eventEnd,
          repeating: true,
          startTimeMinutes: 10 * 60,
          endTimeMinutes: 18 * 60,
          field: field.id,
          divisions: [open, premier],
        }),
      ],
    });

    const result = rescheduleEventMatchesPreservingLocks(event);
    const rescheduledOpenCarry = result.matches.find((match) => match.id === openCarry.id);
    const rescheduledPremierCarry = result.matches.find((match) => match.id === premierCarry.id);

    expect(rescheduledOpenCarry?.team1Seed).toBeNull();
    expect(rescheduledOpenCarry?.team2Seed).toBe(1);
    expect(rescheduledPremierCarry?.team1Seed).toBeNull();
    expect(rescheduledPremierCarry?.team2Seed).toBe(1);
  });

  it('extends open-ended reschedule windows so matches can spill into later weeks', () => {
    const division = new Division('open', 'Open');
    const field = new PlayingField({
      id: 'field_open_ended',
      divisions: [division],
      matches: [],
      events: [],
      rentalSlots: [],
      name: 'Court Open Ended',
    });

    const team1 = new Team({
      id: 'open_team_1',
      captainId: 'open_captain_1',
      division,
      name: 'Open Team 1',
      matches: [],
      playerIds: [],
    });
    const team2 = new Team({
      id: 'open_team_2',
      captainId: 'open_captain_2',
      division,
      name: 'Open Team 2',
      matches: [],
      playerIds: [],
    });
    const team3 = new Team({
      id: 'open_team_3',
      captainId: 'open_captain_3',
      division,
      name: 'Open Team 3',
      matches: [],
      playerIds: [],
    });
    const team4 = new Team({
      id: 'open_team_4',
      captainId: 'open_captain_4',
      division,
      name: 'Open Team 4',
      matches: [],
      playerIds: [],
    });

    const eventStart = new Date('2026-03-02T10:00:00.000Z');
    const originalEventEnd = new Date('2026-03-02T18:00:00.000Z');

    const matchOne = createMatch({
      id: 'match_open_1',
      matchId: 1,
      start: new Date('2026-03-02T10:00:00.000Z'),
      end: new Date('2026-03-02T11:00:00.000Z'),
      field,
      division,
      team1,
      team2,
      eventId: 'event_open_ended',
    });
    const matchTwo = createMatch({
      id: 'match_open_2',
      matchId: 2,
      start: new Date('2026-03-02T11:00:00.000Z'),
      end: new Date('2026-03-02T12:00:00.000Z'),
      field,
      division,
      team1: team3,
      team2: team4,
      eventId: 'event_open_ended',
    });

    const event = new League({
      id: 'event_open_ended',
      name: 'Open Ended League',
      description: '',
      start: eventStart,
      end: originalEventEnd,
      location: '',
      organizationId: null,
      teams: {
        [team1.id]: team1,
        [team2.id]: team2,
        [team3.id]: team3,
        [team4.id]: team4,
      },
      players: [],
      waitListIds: [],
      freeAgentIds: [],
      maxParticipants: 4,
      teamSignup: true,
      divisions: [division],
      fields: { [field.id]: field },
      matches: {
        [matchOne.id]: matchOne,
        [matchTwo.id]: matchTwo,
      },
      officials: [],
      eventType: 'LEAGUE',
      doubleElimination: false,
      winnerSetCount: null,
      loserSetCount: null,
      matchDurationMinutes: 60,
      usesSets: false,
      setDurationMinutes: 0,
      setsPerMatch: 3,
      pointsToVictory: [],
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      doTeamsOfficiate: false,
      staffingPriority: 'OFFICIAL_COVERAGE_REQUIRED',
      noFixedEndDateTime: true,
      restTimeMinutes: 5,
      timeSlots: [
        new TimeSlot({
          id: 'slot_open_ended',
          dayOfWeek: 0,
          startDate: eventStart,
          endDate: null,
          repeating: true,
          startTimeMinutes: 10 * 60,
          endTimeMinutes: 11 * 60,
          field: field.id,
          divisions: [division],
        }),
      ],
    });

    const result = rescheduleEventMatchesPreservingLocks(event);
    const sorted = [...result.matches].sort((left, right) => (left.matchId ?? 0) - (right.matchId ?? 0));

    expect(sorted).toHaveLength(2);
    expect(sorted[0]?.start.getTime()).toBeGreaterThanOrEqual(eventStart.getTime());
    expect((sorted[0]?.end.getTime() ?? 0) - (sorted[0]?.start.getTime() ?? 0)).toBe(60 * MINUTE_MS);
    const matchGapMs = (sorted[1]?.start.getTime() ?? 0) - (sorted[0]?.start.getTime() ?? 0);
    expect(matchGapMs).toBeGreaterThanOrEqual(6 * 24 * 60 * MINUTE_MS);
    expect(matchGapMs).toBeLessThanOrEqual(8 * 24 * 60 * MINUTE_MS);
    expect(result.event.end.getTime()).toBe(sorted[1]?.end.getTime());
    expect(result.event.end.getTime()).toBeGreaterThan(originalEventEnd.getTime());
    expect(result.warnings).toHaveLength(0);
  });

  it('reassigns missing named officials and checked-in Team duties before moving matches during explicit reflow', () => {
    const division = new Division('open', 'Open');
    const field = new PlayingField({
      id: 'field_tournament_refs',
      divisions: [division],
      matches: [],
      events: [],
      rentalSlots: [],
      name: 'Court Tournament',
    });

    const makeTeam = (id: string, name: string) => new Team({
      id,
      captainId: '',
      division,
      name,
      matches: [],
      playerIds: [],
    });

    const team1 = makeTeam('team_1', 'Team 1');
    const team2 = makeTeam('team_2', 'Team 2');
    const team3 = makeTeam('team_3', 'Team 3');
    const team4 = makeTeam('team_4', 'Team 4');
    const team5 = makeTeam('team_5', 'Team 5');
    const team6 = makeTeam('team_6', 'Team 6');

    const official1 = new UserData({
      id: 'official_1',
      firstName: 'Official',
      lastName: 'One',
      matches: [],
      divisions: [division],
    });
    const official2 = new UserData({
      id: 'official_2',
      firstName: 'Official',
      lastName: 'Two',
      matches: [],
      divisions: [division],
    });

    const eventStart = new Date('2026-03-02T10:00:00.000Z');
    const eventEnd = new Date('2026-03-02T15:00:00.000Z');

    const match1 = createMatch({
      id: 'match_tourny_1',
      matchId: 1,
      start: new Date('2026-03-02T10:00:00.000Z'),
      end: new Date('2026-03-02T11:00:00.000Z'),
      field,
      division,
      team1,
      team2,
      eventId: 'event_tourny',
    });
    const match2 = createMatch({
      id: 'match_tourny_2',
      matchId: 2,
      start: new Date('2026-03-02T11:00:00.000Z'),
      end: new Date('2026-03-02T12:00:00.000Z'),
      field,
      division,
      team1: team3,
      team2: team4,
      eventId: 'event_tourny',
    });
    const match3 = createMatch({
      id: 'match_tourny_3',
      matchId: 3,
      start: new Date('2026-03-02T12:00:00.000Z'),
      end: new Date('2026-03-02T13:00:00.000Z'),
      field,
      division,
      team1: team5,
      team2: team6,
      eventId: 'event_tourny',
    });

    const tournament = new Tournament({
      id: 'event_tourny',
      name: 'Tournament Reschedule',
      description: '',
      start: eventStart,
      end: eventEnd,
      location: '',
      organizationId: null,
      teams: {
        [team1.id]: team1,
        [team2.id]: team2,
        [team3.id]: team3,
        [team4.id]: team4,
        [team5.id]: team5,
        [team6.id]: team6,
      },
      players: [],
      waitListIds: [],
      freeAgentIds: [],
      maxParticipants: 6,
      teamSignup: true,
      divisions: [division],
      fields: { [field.id]: field },
      matches: {
        [match1.id]: match1,
        [match2.id]: match2,
        [match3.id]: match3,
      },
      officials: [official1, official2],
      eventType: 'TOURNAMENT',
      doubleElimination: false,
      winnerSetCount: null,
      loserSetCount: null,
      matchDurationMinutes: 60,
      usesSets: false,
      setDurationMinutes: 0,
      doTeamsOfficiate: true,
      noFixedEndDateTime: false,
      restTimeMinutes: 5,
      timeSlots: [
        new TimeSlot({
          id: 'slot_tournament_refs',
          dayOfWeek: 0,
          startDate: eventStart,
          endDate: eventEnd,
          repeating: true,
          startTimeMinutes: 10 * 60,
          endTimeMinutes: 15 * 60,
          field: field.id,
          divisions: [division],
        }),
      ],
    });

    const originalPlacements = [match1, match2, match3].map((match) => ({
      id: match.id,
      fieldId: match.field?.id ?? null,
      start: match.start.getTime(),
      end: match.end.getTime(),
    }));
    const checkedInTeamIds = new Set(Object.keys(tournament.teams));
    const result = rescheduleEventMatchesPreservingLocks(tournament, {
      eventCheckedInTeamIds: checkedInTeamIds,
      checkedInTeamIdsByMatch: new Map(),
    });
    expect(result.warnings).toHaveLength(0);

    const validOfficialIds = new Set(['official_1', 'official_2']);
    for (const match of result.matches) {
      expect(match.official?.id).toBeTruthy();
      expect(validOfficialIds.has(match.official?.id ?? '')).toBe(true);
      expect(match.teamOfficial?.id).toBeTruthy();
      expect(match.teamOfficial?.id).not.toBe(match.team1?.id);
      expect(match.teamOfficial?.id).not.toBe(match.team2?.id);
    }
    expect(result.matches.map((match) => ({
      id: match.id,
      fieldId: match.field?.id ?? null,
      start: match.start.getTime(),
      end: match.end.getTime(),
    }))).toEqual(originalPlacements);
  });

  it('legacy SCHEDULE clears stale conflicts and preserves the unbound named-position slot', () => {
    const division = new Division('open', 'Open');
    const field1 = new PlayingField({
      id: 'field_schedule_mode_1',
      divisions: [division],
      matches: [],
      events: [],
      rentalSlots: [],
      name: 'Court 1',
    });
    const field2 = new PlayingField({
      id: 'field_schedule_mode_2',
      divisions: [division],
      matches: [],
      events: [],
      rentalSlots: [],
      name: 'Court 2',
    });

    const makeTeam = (id: string) => new Team({
      id,
      captainId: `captain_${id}`,
      division,
      name: id,
      matches: [],
      playerIds: [],
    });

    const teams = {
      team_1: makeTeam('team_1'),
      team_2: makeTeam('team_2'),
      team_3: makeTeam('team_3'),
      team_4: makeTeam('team_4'),
    };

    const official = new UserData({
      id: 'official_schedule_mode',
      firstName: 'Schedule',
      lastName: 'Official',
      matches: [],
      divisions: [division],
    });

    const eventStart = new Date('2026-03-04T10:00:00.000Z');
    const eventEnd = new Date('2026-03-04T11:00:00.000Z');

    const match1 = createMatch({
      id: 'schedule_mode_match_1',
      matchId: 1,
      start: new Date('2026-03-04T10:00:00.000Z'),
      end: new Date('2026-03-04T11:00:00.000Z'),
      field: field1,
      division,
      team1: teams.team_1,
      team2: teams.team_2,
      eventId: 'event_schedule_mode',
    });
    const match2 = createMatch({
      id: 'schedule_mode_match_2',
      matchId: 2,
      start: new Date('2026-03-04T10:00:00.000Z'),
      end: new Date('2026-03-04T11:00:00.000Z'),
      field: field2,
      division,
      team1: teams.team_3,
      team2: teams.team_4,
      eventId: 'event_schedule_mode',
    });

    match1.official = official;
    match1.officialAssignments = [{
      positionId: 'r1',
      slotIndex: 0,
      holderType: 'OFFICIAL',
      userId: official.id,
      eventOfficialId: 'event_official_schedule_mode',
      checkedIn: false,
      hasConflict: false,
    }];
    match2.official = official;
    match2.officialAssignments = [{
      positionId: 'r1',
      slotIndex: 0,
      holderType: 'OFFICIAL',
      userId: official.id,
      eventOfficialId: 'event_official_schedule_mode',
      checkedIn: false,
      hasConflict: false,
    }];

    const tournament = new Tournament({
      id: 'event_schedule_mode',
      name: 'Schedule Mode Reschedule',
      description: '',
      start: eventStart,
      end: eventEnd,
      location: '',
      organizationId: null,
      teams,
      players: [],
      waitListIds: [],
      freeAgentIds: [],
      maxParticipants: 4,
      teamSignup: true,
      divisions: [division],
      fields: {
        [field1.id]: field1,
        [field2.id]: field2,
      },
      matches: {
        [match1.id]: match1,
        [match2.id]: match2,
      },
      officials: [official],
      eventType: 'TOURNAMENT',
      doubleElimination: false,
      winnerSetCount: null,
      loserSetCount: null,
      matchDurationMinutes: 60,
      usesSets: false,
      setDurationMinutes: 0,
      doTeamsOfficiate: false,
      officialSchedulingMode: 'SCHEDULE',
      officialPositions: [{ id: 'r1', name: 'R1', count: 1, order: 0 }],
      eventOfficials: [{
        id: 'event_official_schedule_mode',
        userId: official.id,
        positionIds: ['r1'],
        fieldIds: [],
        isActive: true,
      }],
      noFixedEndDateTime: false,
      restTimeMinutes: 5,
      timeSlots: [
        new TimeSlot({
          id: 'slot_schedule_mode',
          dayOfWeek: 2,
          startDate: eventStart,
          endDate: eventEnd,
          repeating: true,
          startTimeMinutes: 10 * 60,
          endTimeMinutes: 11 * 60,
          fieldIds: [field1.id, field2.id],
          divisions: [division],
        }),
      ],
    });

    const result = rescheduleEventMatchesPreservingLocks(tournament);
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      'UNRESOLVED_TEAM_DUTY',
      'UNRESOLVED_NAMED_OFFICIAL_POSITION',
    ]);

    const assignmentTotal = result.matches.reduce(
      (total, match) => total + match.officialAssignments.filter((assignment) => assignment.userId !== null).length,
      0,
    );
    expect(assignmentTotal).toBe(1);
    expect(result.matches.every((match) => match.officialAssignments.length === 1)).toBe(true);
    expect(result.matches.some((match) => match.officialAssignments[0].userId === null)).toBe(true);
    expect(result.matches.some((match) => match.officialAssignments.some((assignment) => assignment.hasConflict))).toBe(false);
  });

  it('OFF mode reassigns overlaps and marks conflicts during lock-preserving reschedule', () => {
    const division = new Division('open', 'Open');
    const field1 = new PlayingField({
      id: 'field_off_mode_1',
      divisions: [division],
      matches: [],
      events: [],
      rentalSlots: [],
      name: 'Court 1',
    });
    const field2 = new PlayingField({
      id: 'field_off_mode_2',
      divisions: [division],
      matches: [],
      events: [],
      rentalSlots: [],
      name: 'Court 2',
    });

    const makeTeam = (id: string) => new Team({
      id,
      captainId: `captain_${id}`,
      division,
      name: id,
      matches: [],
      playerIds: [],
    });

    const teams = {
      team_1: makeTeam('off_team_1'),
      team_2: makeTeam('off_team_2'),
      team_3: makeTeam('off_team_3'),
      team_4: makeTeam('off_team_4'),
    };

    const official = new UserData({
      id: 'official_off_mode',
      firstName: 'Off',
      lastName: 'Official',
      matches: [],
      divisions: [division],
    });

    const eventStart = new Date('2026-03-05T10:00:00.000Z');
    const eventEnd = new Date('2026-03-05T11:00:00.000Z');

    const match1 = createMatch({
      id: 'off_mode_match_1',
      matchId: 1,
      start: new Date('2026-03-05T10:00:00.000Z'),
      end: new Date('2026-03-05T11:00:00.000Z'),
      field: field1,
      division,
      team1: teams.team_1,
      team2: teams.team_2,
      eventId: 'event_off_mode',
    });
    const match2 = createMatch({
      id: 'off_mode_match_2',
      matchId: 2,
      start: new Date('2026-03-05T10:00:00.000Z'),
      end: new Date('2026-03-05T11:00:00.000Z'),
      field: field2,
      division,
      team1: teams.team_3,
      team2: teams.team_4,
      eventId: 'event_off_mode',
    });

    const tournament = new Tournament({
      id: 'event_off_mode',
      name: 'Off Mode Reschedule',
      description: '',
      start: eventStart,
      end: eventEnd,
      location: '',
      organizationId: null,
      teams,
      players: [],
      waitListIds: [],
      freeAgentIds: [],
      maxParticipants: 4,
      teamSignup: true,
      divisions: [division],
      fields: {
        [field1.id]: field1,
        [field2.id]: field2,
      },
      matches: {
        [match1.id]: match1,
        [match2.id]: match2,
      },
      officials: [official],
      eventType: 'TOURNAMENT',
      doubleElimination: false,
      winnerSetCount: null,
      loserSetCount: null,
      matchDurationMinutes: 60,
      usesSets: false,
      setDurationMinutes: 0,
      doTeamsOfficiate: false,
      officialSchedulingMode: 'OFF',
      officialPositions: [{ id: 'r1', name: 'R1', count: 1, order: 0 }],
      eventOfficials: [{
        id: 'event_official_off_mode',
        userId: official.id,
        positionIds: ['r1'],
        fieldIds: [],
        isActive: true,
      }],
      noFixedEndDateTime: false,
      restTimeMinutes: 5,
      timeSlots: [
        new TimeSlot({
          id: 'slot_off_mode',
          dayOfWeek: 3,
          startDate: eventStart,
          endDate: eventEnd,
          repeating: true,
          startTimeMinutes: 10 * 60,
          endTimeMinutes: 11 * 60,
          fieldIds: [field1.id, field2.id],
          divisions: [division],
        }),
      ],
    });

    const result = rescheduleEventMatchesPreservingLocks(tournament);
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      'UNRESOLVED_TEAM_DUTY',
    ]);

    const assignmentTotal = result.matches.reduce(
      (total, match) => total + match.officialAssignments.filter((assignment) => assignment.userId !== null).length,
      0,
    );
    expect(assignmentTotal).toBe(2);
    expect(result.matches.some((match) => match.officialAssignments.some((assignment) => assignment.hasConflict))).toBe(true);
  });

  it('STAFFING mode fills all required official positions when rescheduling existing matches', () => {
    const division = new Division('open', 'Open');
    const field = new PlayingField({
      id: 'field_staffing_reschedule',
      divisions: [division],
      matches: [],
      events: [],
      rentalSlots: [],
      name: 'Court Staffing',
    });

    const makeTeam = (id: string, name: string) => new Team({
      id,
      captainId: `captain_${id}`,
      division,
      name,
      matches: [],
      playerIds: [],
    });

    const teams = {
      team_1: makeTeam('team_1', 'Team 1'),
      team_2: makeTeam('team_2', 'Team 2'),
      team_3: makeTeam('team_3', 'Team 3'),
      team_4: makeTeam('team_4', 'Team 4'),
    };

    const official1 = new UserData({
      id: 'official_staffing_1',
      firstName: 'Official',
      lastName: 'One',
      matches: [],
      divisions: [division],
    });
    const official2 = new UserData({
      id: 'official_staffing_2',
      firstName: 'Official',
      lastName: 'Two',
      matches: [],
      divisions: [division],
    });
    const official3 = new UserData({
      id: 'official_staffing_3',
      firstName: 'Official',
      lastName: 'Three',
      matches: [],
      divisions: [division],
    });

    const eventStart = new Date('2026-03-03T10:00:00.000Z');
    const eventEnd = new Date('2026-03-03T13:00:00.000Z');

    const match1 = createMatch({
      id: 'match_staffing_1',
      matchId: 1,
      locked: true,
      start: new Date('2026-03-03T10:00:00.000Z'),
      end: new Date('2026-03-03T11:00:00.000Z'),
      field,
      division,
      team1: teams.team_1,
      team2: teams.team_2,
      eventId: 'event_staffing_reschedule',
    });
    const match2 = createMatch({
      id: 'match_staffing_2',
      matchId: 2,
      start: new Date('2026-03-03T11:00:00.000Z'),
      end: new Date('2026-03-03T12:00:00.000Z'),
      field,
      division,
      team1: teams.team_3,
      team2: teams.team_4,
      eventId: 'event_staffing_reschedule',
    });

    // Simulate legacy persisted assignments where only one position was filled.
    match1.official = official1;
    match1.officialAssignments = [{
      positionId: 'r1',
      slotIndex: 0,
      holderType: 'OFFICIAL',
      userId: official1.id,
      eventOfficialId: 'event_official_staffing_1',
      checkedIn: false,
      hasConflict: false,
    }];
    match2.official = official2;
    match2.officialAssignments = [{
      positionId: 'r1',
      slotIndex: 0,
      holderType: 'OFFICIAL',
      userId: official2.id,
      eventOfficialId: 'event_official_staffing_2',
      checkedIn: false,
      hasConflict: false,
    }];

    const tournament = new Tournament({
      id: 'event_staffing_reschedule',
      name: 'Staffing Reschedule',
      description: '',
      start: eventStart,
      end: eventEnd,
      location: '',
      organizationId: null,
      teams,
      players: [],
      waitListIds: [],
      freeAgentIds: [],
      maxParticipants: 4,
      teamSignup: true,
      divisions: [division],
      fields: { [field.id]: field },
      matches: {
        [match1.id]: match1,
        [match2.id]: match2,
      },
      officials: [official1, official2, official3],
      eventType: 'TOURNAMENT',
      doubleElimination: false,
      winnerSetCount: null,
      loserSetCount: null,
      matchDurationMinutes: 60,
      usesSets: false,
      setDurationMinutes: 0,
      doTeamsOfficiate: false,
      officialSchedulingMode: 'STAFFING',
      officialPositions: [
        { id: 'r1', name: 'R1', count: 1, order: 0 },
        { id: 'r2', name: 'R2', count: 1, order: 1 },
      ],
      eventOfficials: [
        {
          id: 'event_official_staffing_1',
          userId: official1.id,
          positionIds: ['r1', 'r2'],
          fieldIds: [],
          isActive: true,
        },
        {
          id: 'event_official_staffing_2',
          userId: official2.id,
          positionIds: ['r1', 'r2'],
          fieldIds: [],
          isActive: true,
        },
        {
          id: 'event_official_staffing_3',
          userId: official3.id,
          positionIds: ['r1', 'r2'],
          fieldIds: [],
          isActive: true,
        },
      ],
      noFixedEndDateTime: false,
      restTimeMinutes: 5,
      timeSlots: [
        new TimeSlot({
          id: 'slot_staffing_reschedule',
          dayOfWeek: 1,
          startDate: eventStart,
          endDate: eventEnd,
          repeating: true,
          startTimeMinutes: 10 * 60,
          endTimeMinutes: 13 * 60,
          field: field.id,
          divisions: [division],
        }),
      ],
    });
    const lockedPlacement = {
      fieldId: match1.field?.id ?? null,
      start: match1.start.getTime(),
      end: match1.end.getTime(),
    };

    const result = rescheduleEventMatchesPreservingLocks(tournament);
    expect(result.warnings).toHaveLength(0);

    for (const match of result.matches) {
      expect(match.officialAssignments).toHaveLength(2);
      const slotIds = new Set(match.officialAssignments.map((assignment) => assignment.positionId));
      expect(slotIds).toEqual(new Set(['r1', 'r2']));
      const userIds = match.officialAssignments.map((assignment) => assignment.userId);
      expect(new Set(userIds).size).toBe(2);
      expect(match.official?.id).toBeTruthy();
      expect(userIds).toContain(match.official?.id ?? '');
    }
    const rescheduledLockedMatch = result.matches.find((match) => match.id === match1.id);
    expect({
      fieldId: rescheduledLockedMatch?.field?.id ?? null,
      start: rescheduledLockedMatch?.start.getTime(),
      end: rescheduledLockedMatch?.end.getTime(),
    }).toEqual(lockedPlacement);
  });

  it('keeps an unchecked existing Team duty unchanged and check-in context alone causes no reflow', () => {
    const uncheckedFixture = createTeamDutyReflowFixture('existing_unchecked');
    const uncheckedContext: TeamDutyReflowContext = {
      eventCheckedInTeamIds: new Set(['eligible_mapped']),
      checkedInTeamIdsByMatch: new Map([
        [uncheckedFixture.target.id, new Set(['eligible_mapped'])],
      ]),
    };
    const originalPlacement = {
      fieldId: uncheckedFixture.target.field?.id,
      start: uncheckedFixture.target.start.getTime(),
      end: uncheckedFixture.target.end.getTime(),
    };

    const uncheckedResult = rescheduleEventMatchesPreservingLocks(
      uncheckedFixture.tournament,
      uncheckedContext,
    );
    const uncheckedTarget = uncheckedResult.matches.find((match) => match.id === uncheckedFixture.target.id);

    expect(uncheckedTarget?.teamOfficial?.id).toBe('existing_unchecked');
    expect({
      fieldId: uncheckedTarget?.field?.id,
      start: uncheckedTarget?.start.getTime(),
      end: uncheckedTarget?.end.getTime(),
    }).toEqual(originalPlacement);

    const checkedFixture = createTeamDutyReflowFixture('existing_unchecked');
    const checkedResult = rescheduleEventMatchesPreservingLocks(checkedFixture.tournament, {
      eventCheckedInTeamIds: new Set(['existing_unchecked', 'eligible_mapped']),
      checkedInTeamIdsByMatch: new Map([
        [checkedFixture.target.id, new Set(['existing_unchecked', 'eligible_mapped'])],
      ]),
    });
    const checkedTarget = checkedResult.matches.find((match) => match.id === checkedFixture.target.id);

    expect({
      teamOfficialId: checkedTarget?.teamOfficial?.id,
      fieldId: checkedTarget?.field?.id,
      start: checkedTarget?.start.getTime(),
      end: checkedTarget?.end.getTime(),
    }).toEqual({
      teamOfficialId: uncheckedTarget?.teamOfficial?.id,
      fieldId: uncheckedTarget?.field?.id,
      start: uncheckedTarget?.start.getTime(),
      end: uncheckedTarget?.end.getTime(),
    });
  });

  it('replaces a missing Team duty only with a checked-in mapped-source Team that has no play, duty, rest, or imminent-Match conflict', () => {
    const fixture = createTeamDutyReflowFixture();
    const checkedInIds = new Set([
      'eligible_mapped',
      'outside_checked',
      'playing_conflict',
      'officiating_conflict',
      'insufficient_rest',
      'imminent_match',
    ]);

    const result = rescheduleEventMatchesPreservingLocks(fixture.tournament, {
      eventCheckedInTeamIds: checkedInIds,
      checkedInTeamIdsByMatch: new Map([[fixture.target.id, checkedInIds]]),
    });
    const target = result.matches.find((match) => match.id === fixture.target.id);

    expect(target?.teamOfficial?.id).toBe('eligible_mapped');
    expect(target?.field?.id).toBe('field_target');
    expect(target?.start.toISOString()).toBe('2026-03-02T12:00:00.000Z');
  });

  it('allows a checked-in Team from the Match Phase Division as a replacement Team duty', () => {
    const fixture = createTeamDutyReflowFixture();
    const checkedInIds = new Set(['eligible_same_phase']);

    const result = rescheduleEventMatchesPreservingLocks(fixture.tournament, {
      eventCheckedInTeamIds: checkedInIds,
      checkedInTeamIdsByMatch: new Map([[fixture.target.id, checkedInIds]]),
    });

    expect(result.matches.find((match) => match.id === fixture.target.id)?.teamOfficial?.id)
      .toBe('eligible_same_phase');
  });
  it('reuses a Match check-in for reachable downstream bracket Team duty', () => {
    const fixture = createTeamDutyReflowFixture();
    const source = createMatch({
      id: 'checked_in_source',
      matchId: 9,
      locked: true,
      start: new Date('2026-03-02T08:00:00.000Z'),
      end: new Date('2026-03-02T09:00:00.000Z'),
      field: fixture.fields.field_history,
      division: fixture.sourceDivision,
      team1: fixture.teams.eligible_mapped,
      team2: fixture.teams.opponent_1,
      eventId: fixture.tournament.id,
    });
    source.requiresTeamOfficial = true;
    source.teamOfficial = fixture.teams.opponent_2;
    source.winnerNextMatch = fixture.target;
    fixture.target.previousLeftMatch = source;
    fixture.tournament.matches[source.id] = source;

    const result = rescheduleEventMatchesPreservingLocks(fixture.tournament, {
      eventCheckedInTeamIds: new Set(),
      checkedInTeamIdsByMatch: new Map([
        [source.id, new Set([fixture.teams.eligible_mapped.id])],
      ]),
    });

    expect(result.matches.find((match) => match.id === fixture.target.id)?.teamOfficial?.id)
      .toBe(fixture.teams.eligible_mapped.id);
  });


  it('does not select a Team-duty replacement outside an explicit reflow context', () => {
    const fixture = createTeamDutyReflowFixture();
    fixture.tournament.staffingPriority = 'BEST_AVAILABLE_COVERAGE';
    fixture.tournament.doTeamsOfficiate = false;

    const result = rescheduleEventMatchesPreservingLocks(fixture.tournament);
    const target = result.matches.find((match) => match.id === fixture.target.id);

    expect(target?.teamOfficial).toBeNull();
    expect(target?.requiresTeamOfficial).toBe(true);
    expect(target?.reservesTeamOfficial).toBe(false);
    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: 'UNRESOLVED_TEAM_DUTY',
      matchIds: [fixture.target.id],
    }));
  });

  it('uses event-level or target-Match check-in independently for replacement eligibility', () => {
    const eventFixture = createTeamDutyReflowFixture();
    const eventResult = rescheduleEventMatchesPreservingLocks(eventFixture.tournament, {
      eventCheckedInTeamIds: new Set(['eligible_mapped']),
      checkedInTeamIdsByMatch: new Map([
        ['unrelated_match', new Set(['outside_checked'])],
      ]),
    });
    expect(eventResult.matches.find((match) => match.id === eventFixture.target.id)?.teamOfficial?.id)
      .toBe('eligible_mapped');

    const matchFixture = createTeamDutyReflowFixture();
    const matchResult = rescheduleEventMatchesPreservingLocks(matchFixture.tournament, {
      eventCheckedInTeamIds: new Set(),
      checkedInTeamIdsByMatch: new Map([
        [matchFixture.target.id, new Set(['eligible_same_phase'])],
      ]),
    });
    expect(matchResult.matches.find((match) => match.id === matchFixture.target.id)?.teamOfficial?.id)
      .toBe('eligible_same_phase');
  });

  it('derives Team-duty slots from Staffing Priority while doTeamsOfficiate only controls candidates', () => {
    const officialOnlyFixture = createTeamDutyReflowFixture();
    officialOnlyFixture.tournament.staffingPriority = 'OFFICIAL_COVERAGE_REQUIRED';
    const officialOnlyResult = rescheduleEventMatchesPreservingLocks(
      officialOnlyFixture.tournament,
      {
        eventCheckedInTeamIds: new Set(['eligible_mapped']),
        checkedInTeamIdsByMatch: new Map(),
      },
    );
    const officialOnlyTarget = officialOnlyResult.matches.find(
      (match) => match.id === officialOnlyFixture.target.id,
    );
    expect(officialOnlyTarget?.requiresTeamOfficial).toBe(false);
    expect(officialOnlyTarget?.reservesTeamOfficial).toBe(false);
    expect(officialOnlyTarget?.teamOfficial).toBeNull();

    const hardTeamFixture = createTeamDutyReflowFixture();
    hardTeamFixture.tournament.doTeamsOfficiate = false;
    const originalState = {
      eventEnd: hardTeamFixture.tournament.end.getTime(),
      matches: Object.values(hardTeamFixture.tournament.matches).map((match) => ({
        id: match.id,
        fieldId: match.field?.id ?? null,
        start: match.start.getTime(),
        end: match.end.getTime(),
        placementState: match.placementState,
        teamOfficialId: match.teamOfficial?.id ?? null,
        requiresTeamOfficial: match.requiresTeamOfficial,
        reservesTeamOfficial: match.reservesTeamOfficial,
      })),
    };

    expect(() => rescheduleEventMatchesPreservingLocks(hardTeamFixture.tournament, {
      eventCheckedInTeamIds: new Set(['eligible_mapped']),
      checkedInTeamIdsByMatch: new Map(),
    })).toThrow('requires a Team duty assignment');
    expect({
      eventEnd: hardTeamFixture.tournament.end.getTime(),
      matches: Object.values(hardTeamFixture.tournament.matches).map((match) => ({
        id: match.id,
        fieldId: match.field?.id ?? null,
        start: match.start.getTime(),
        end: match.end.getTime(),
        placementState: match.placementState,
        teamOfficialId: match.teamOfficial?.id ?? null,
        requiresTeamOfficial: match.requiresTeamOfficial,
        reservesTeamOfficial: match.reservesTeamOfficial,
      })),
    }).toEqual(originalState);
  });

  it('prefers the most recent loss when multiple eliminated Teams are eligible', () => {
    const fixture = createTeamDutyReflowFixture();
    addTeamHistoryMatch(fixture, {
      id: 'older_eliminated_loss',
      team: fixture.teams.eligible_mapped,
      opponent: fixture.teams.opponent_1,
      start: '2026-03-02T08:00:00.000Z',
      end: '2026-03-02T09:00:00.000Z',
      field: fixture.fields.field_playing_conflict,
    });
    addTeamHistoryMatch(fixture, {
      id: 'newer_eliminated_loss',
      team: fixture.teams.unchecked_mapped,
      opponent: fixture.teams.opponent_2,
      start: '2026-03-02T10:00:00.000Z',
      end: '2026-03-02T11:00:00.000Z',
      field: fixture.fields.field_officiating_conflict,
    });
    const checkedInTeamIds = new Set(['eligible_mapped', 'unchecked_mapped']);

    const result = rescheduleEventMatchesPreservingLocks(fixture.tournament, {
      eventCheckedInTeamIds: checkedInTeamIds,
      checkedInTeamIdsByMatch: new Map(),
    });

    expect(result.matches.find((match) => match.id === fixture.target.id)?.teamOfficial?.id)
      .toBe('unchecked_mapped');
  });

  it('ranks eliminated and recent losers before other mapped Teams, then assignment count, longest rest, and stable ID', () => {
    const eliminatedFixture = createTeamDutyReflowFixture();
    addTeamHistoryMatch(eliminatedFixture, {
      id: 'eliminated_loss',
      team: eliminatedFixture.teams.eligible_mapped,
      opponent: eliminatedFixture.teams.opponent_1,
      start: '2026-03-02T09:00:00.000Z',
      end: '2026-03-02T10:00:00.000Z',
      field: eliminatedFixture.fields.field_playing_conflict,
    });
    addTeamHistoryMatch(eliminatedFixture, {
      id: 'recent_loss',
      team: eliminatedFixture.teams.unchecked_mapped,
      opponent: eliminatedFixture.teams.opponent_2,
      start: '2026-03-02T10:00:00.000Z',
      end: '2026-03-02T11:00:00.000Z',
      field: eliminatedFixture.fields.field_officiating_conflict,
    });
    const remainingMatch = addTeamHistoryMatch(eliminatedFixture, {
      id: 'recent_loser_remaining_match',
      team: eliminatedFixture.teams.unchecked_mapped,
      opponent: eliminatedFixture.teams.opponent_1,
      start: '2026-03-02T14:30:00.000Z',
      end: '2026-03-02T15:30:00.000Z',
      field: eliminatedFixture.fields.field_history,
    });
    remainingMatch.status = 'SCHEDULED';
    remainingMatch.resultStatus = null;
    remainingMatch.actualEnd = null;
    remainingMatch.winnerEventTeamId = null;
    const categoryIds = new Set(['eligible_mapped', 'unchecked_mapped', 'eligible_same_phase']);

    const eliminatedResult = rescheduleEventMatchesPreservingLocks(eliminatedFixture.tournament, {
      eventCheckedInTeamIds: categoryIds,
      checkedInTeamIdsByMatch: new Map([[eliminatedFixture.target.id, categoryIds]]),
    });
    expect(eliminatedResult.matches.find((match) => match.id === eliminatedFixture.target.id)?.teamOfficial?.id)
      .toBe('eligible_mapped');

    const recentLoserFixture = createTeamDutyReflowFixture();
    addTeamHistoryMatch(recentLoserFixture, {
      id: 'recent_loss',
      team: recentLoserFixture.teams.unchecked_mapped,
      opponent: recentLoserFixture.teams.opponent_2,
      start: '2026-03-02T10:00:00.000Z',
      end: '2026-03-02T11:00:00.000Z',
      field: recentLoserFixture.fields.field_officiating_conflict,
    });
    const futureMatch = addTeamHistoryMatch(recentLoserFixture, {
      id: 'recent_loser_remaining_match',
      team: recentLoserFixture.teams.unchecked_mapped,
      opponent: recentLoserFixture.teams.opponent_1,
      start: '2026-03-02T14:30:00.000Z',
      end: '2026-03-02T15:30:00.000Z',
      field: recentLoserFixture.fields.field_history,
    });
    futureMatch.status = 'SCHEDULED';
    futureMatch.resultStatus = null;
    futureMatch.actualEnd = null;
    futureMatch.winnerEventTeamId = null;
    const recentLoserIds = new Set(['unchecked_mapped', 'eligible_same_phase']);
    const recentLoserResult = rescheduleEventMatchesPreservingLocks(recentLoserFixture.tournament, {
      eventCheckedInTeamIds: recentLoserIds,
      checkedInTeamIdsByMatch: new Map([[recentLoserFixture.target.id, recentLoserIds]]),
    });
    expect(recentLoserResult.matches.find((match) => match.id === recentLoserFixture.target.id)?.teamOfficial?.id)
      .toBe('unchecked_mapped');

    const assignmentCountFixture = createTeamDutyReflowFixture();
    addTeamHistoryMatch(assignmentCountFixture, {
      id: 'prior_team_duty',
      team: assignmentCountFixture.teams.opponent_1,
      opponent: assignmentCountFixture.teams.opponent_2,
      start: '2026-03-02T09:00:00.000Z',
      end: '2026-03-02T10:00:00.000Z',
      field: assignmentCountFixture.fields.field_history,
      winner: assignmentCountFixture.teams.opponent_1,
      teamOfficial: assignmentCountFixture.teams.eligible_mapped,
    });
    const assignmentIds = new Set(['eligible_mapped', 'unchecked_mapped']);
    const assignmentCountResult = rescheduleEventMatchesPreservingLocks(assignmentCountFixture.tournament, {
      eventCheckedInTeamIds: assignmentIds,
      checkedInTeamIdsByMatch: new Map([[assignmentCountFixture.target.id, assignmentIds]]),
    });
    expect(assignmentCountResult.matches.find((match) => match.id === assignmentCountFixture.target.id)?.teamOfficial?.id)
      .toBe('unchecked_mapped');

    const restFixture = createTeamDutyReflowFixture();
    addTeamHistoryMatch(restFixture, {
      id: 'longer_rest_win',
      team: restFixture.teams.eligible_mapped,
      opponent: restFixture.teams.opponent_1,
      start: '2026-03-02T08:00:00.000Z',
      end: '2026-03-02T09:00:00.000Z',
      field: restFixture.fields.field_playing_conflict,
      winner: restFixture.teams.eligible_mapped,
    });
    addTeamHistoryMatch(restFixture, {
      id: 'shorter_rest_win',
      team: restFixture.teams.unchecked_mapped,
      opponent: restFixture.teams.opponent_2,
      start: '2026-03-02T10:00:00.000Z',
      end: '2026-03-02T11:00:00.000Z',
      field: restFixture.fields.field_officiating_conflict,
      winner: restFixture.teams.unchecked_mapped,
    });
    const restIds = new Set(['eligible_mapped', 'unchecked_mapped']);
    const restResult = rescheduleEventMatchesPreservingLocks(restFixture.tournament, {
      eventCheckedInTeamIds: restIds,
      checkedInTeamIdsByMatch: new Map([[restFixture.target.id, restIds]]),
    });
    expect(restResult.matches.find((match) => match.id === restFixture.target.id)?.teamOfficial?.id)
      .toBe('eligible_mapped');

    const stableIdFixture = createTeamDutyReflowFixture();
    const stableIds = new Set(['eligible_mapped', 'unchecked_mapped']);
    const stableIdResult = rescheduleEventMatchesPreservingLocks(stableIdFixture.tournament, {
      eventCheckedInTeamIds: stableIds,
      checkedInTeamIdsByMatch: new Map([[stableIdFixture.target.id, stableIds]]),
    });
    expect(stableIdResult.matches.find((match) => match.id === stableIdFixture.target.id)?.teamOfficial?.id)
      .toBe('eligible_mapped');
  });
});
