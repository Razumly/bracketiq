/** @jest-environment node */

import { scheduleEvent } from '@/server/scheduler/scheduleEvent';
import {
  Division,
  PlayingField,
  Team,
  TimeSlot,
  Tournament,
  UserData,
} from '@/server/scheduler/types';

const context = {
  log: () => {},
  error: () => {},
};

const buildDivision = () => new Division('OPEN', 'Open');

const buildField = (division: Division) =>
  new PlayingField({
    id: 'field_1',
    divisions: [division],
    matches: [],
    events: [],
    rentalSlots: [],
    name: 'Court A',
  });

const buildTimeSlots = (divisions: Division[] = []) => [
  new TimeSlot({
    id: 'weekly_monday',
    dayOfWeek: 0,
    startDate: new Date('2026-01-05T08:00:00.000Z'),
    repeating: true,
    startTimeMinutes: 8 * 60,
    endTimeMinutes: 14 * 60,
    field: 'field_1',
    divisions,
    timeZone: 'UTC',
  }),
  new TimeSlot({
    id: 'weekly_thursday',
    dayOfWeek: 3,
    startDate: new Date('2026-01-05T08:00:00.000Z'),
    repeating: true,
    startTimeMinutes: 12 * 60,
    endTimeMinutes: 18 * 60,
    field: 'field_1',
    divisions,
    timeZone: 'UTC',
  }),
  new TimeSlot({
    id: 'one_time_tuesday',
    dayOfWeek: 1,
    startDate: new Date('2026-01-06T08:00:00.000Z'),
    endDate: new Date('2026-01-06T18:00:00.000Z'),
    repeating: false,
    startTimeMinutes: 8 * 60,
    endTimeMinutes: 18 * 60,
    field: 'field_1',
    divisions,
    timeZone: 'UTC',
  }),
  new TimeSlot({
    id: 'one_time_wednesday',
    dayOfWeek: 2,
    startDate: new Date('2026-01-07T08:00:00.000Z'),
    endDate: new Date('2026-01-07T18:00:00.000Z'),
    repeating: false,
    startTimeMinutes: 8 * 60,
    endTimeMinutes: 18 * 60,
    field: 'field_1',
    divisions,
    timeZone: 'UTC',
  }),
];

const buildTeams = (
  count: number,
  division: Division,
  prefix = 'team',
) => {
  const teams: Record<string, Team> = {};
  for (let i = 1; i <= count; i += 1) {
    const id = `${prefix}_${i}`;
    teams[id] = new Team({
      id,
      captainId: `captain_${id}`,
      division,
      name: `Team ${id}`,
      matches: [],
    });
  }
  return teams;
};

const scheduleTournament = (
  teamCount: number,
  isDoubleElimination: boolean,
  restTimeMinutes = 0,
) => {
  const division = buildDivision();
  const field = buildField(division);
  const teams = buildTeams(teamCount, division);
  const tournament = new Tournament({
    id: `matrix_tournament_${isDoubleElimination ? 'double' : 'single'}_${teamCount}`,
    name: `Matrix Tournament ${teamCount}`,
    start: new Date(2026, 0, 5, 8, 0, 0),
    end: new Date(2026, 11, 31, 22, 0, 0),
    maxParticipants: teamCount,
    teamSignup: true,
    eventType: 'TOURNAMENT',
    teams,
    divisions: [division],
    fields: { [field.id]: field },
    timeSlots: buildTimeSlots([division]),
    doTeamsOfficiate: false,
    doubleElimination: isDoubleElimination,
    winnerSetCount: 1,
    loserSetCount: 1,
    usesSets: false,
    matchDurationMinutes: 60,
    restTimeMinutes,
  });
  return scheduleEvent({ event: tournament }, context);
};

type PoolScenario = {
  label: string;
  isDoubleElimination: boolean;
  isSetBased: boolean;
  officiating: 'STAFF' | 'TEAM';
  teamsPerPool: number;
};

const poolScenarios: PoolScenario[] = [
  {
    label: 'timed pools and single-elimination bracket with staff officials',
    isDoubleElimination: false,
    isSetBased: false,
    officiating: 'STAFF',
    teamsPerPool: 2,
  },
  {
    label: 'set-based pools and double-elimination bracket with Team officials',
    isDoubleElimination: true,
    isSetBased: true,
    officiating: 'TEAM',
    teamsPerPool: 3,
  },
];

const buildPoolTournament = (scenario: PoolScenario) => {
  const suffix = scenario.officiating.toLowerCase();
  const bracketDivision = new Division(
    `${suffix}_bracket`,
    'Open Bracket',
    [],
    null,
    scenario.teamsPerPool * 2,
    4,
    'PLAYOFF',
  );
  bracketDivision.playoffConfig = {
    doubleElimination: scenario.isDoubleElimination,
    winnerSetCount: scenario.isSetBased ? 3 : 1,
    loserSetCount: 1,
    winnerBracketPointsToVictory: scenario.isSetBased ? [21, 21, 15] : [],
    loserBracketPointsToVictory: scenario.isSetBased ? [21] : [],
    prize: 'Championship',
    fieldCount: 1,
    restTimeMinutes: 15,
    matchDurationMinutes: scenario.isSetBased ? null : 45,
    setDurationMinutes: scenario.isSetBased ? 15 : null,
  };
  const poolA = new Division(
    `${suffix}_pool_a`,
    'Pool A',
    [],
    null,
    scenario.teamsPerPool,
    null,
    'LEAGUE',
    [bracketDivision.id, bracketDivision.id],
  );
  const poolB = new Division(
    `${suffix}_pool_b`,
    'Pool B',
    [],
    null,
    scenario.teamsPerPool,
    null,
    'LEAGUE',
    [bracketDivision.id, bracketDivision.id],
  );
  const poolConfig = {
    gamesPerOpponent: 1,
    usesSets: scenario.isSetBased,
    matchDurationMinutes: scenario.isSetBased ? undefined : 45,
    setDurationMinutes: scenario.isSetBased ? 15 : undefined,
    setsPerMatch: scenario.isSetBased ? 3 : undefined,
    pointsToVictory: scenario.isSetBased ? [21, 21, 15] : undefined,
    restTimeMinutes: 15,
  };
  poolA.leagueConfig = { ...poolConfig };
  poolB.leagueConfig = { ...poolConfig };

  const divisions = [poolA, poolB, bracketDivision];
  const field = new PlayingField({
    id: 'field_1',
    divisions,
    matches: [],
    events: [],
    rentalSlots: [],
    name: 'Court A',
  });
  const teams = {
    ...buildTeams(scenario.teamsPerPool, poolA, 'pool_a_team'),
    ...buildTeams(scenario.teamsPerPool, poolB, 'pool_b_team'),
  };
  const officials = scenario.officiating === 'STAFF'
    ? [
      new UserData({ id: 'official_r1', divisions, matches: [] }),
      new UserData({ id: 'official_scorekeeper', divisions, matches: [] }),
    ]
    : [];
  const timeSlots = buildTimeSlots([bracketDivision]);
  const tournament = new Tournament({
    id: `pool_tournament_${suffix}`,
    name: `Pool Tournament ${scenario.label}`,
    start: new Date('2026-01-05T08:00:00.000Z'),
    end: new Date('2026-02-28T22:00:00.000Z'),
    maxParticipants: scenario.teamsPerPool * 2,
    teamSignup: true,
    teamCheckInMode: 'REQUIRED',
    teamCheckInOpenMinutesBefore: 45,
    allowMatchRosterEdits: true,
    allowTemporaryMatchPlayers: true,
    eventType: 'TOURNAMENT',
    registeredTeamIds: Object.keys(teams),
    teams,
    divisions: [poolA, poolB],
    playoffDivisions: [bracketDivision],
    includePlayoffs: true,
    playoffTeamCount: 4,
    fields: { [field.id]: field },
    timeSlots,
    officials,
    doTeamsOfficiate: scenario.officiating === 'TEAM',
    teamOfficialsMaySwap: scenario.officiating === 'TEAM',
    officialSchedulingMode: scenario.officiating === 'TEAM' ? 'TEAM_STAFFING' : 'STAFFING',
    staffingPriority: scenario.officiating === 'TEAM'
      ? 'BEST_AVAILABLE_COVERAGE'
      : 'OFFICIAL_COVERAGE_REQUIRED',
    officialPositions: scenario.officiating === 'STAFF'
      ? [
        { id: 'r1', name: 'R1', count: 1, order: 0 },
        { id: 'scorekeeper', name: 'Scorekeeper', count: 1, order: 1 },
      ]
      : [
        { id: 'referee', name: 'Referee', count: 1, order: 0 },
      ],
    eventOfficials: officials.map((official) => ({
      id: `event_${official.id}`,
      userId: official.id,
      positionIds: [official.id === 'official_r1' ? 'r1' : 'scorekeeper'],
      fieldIds: [field.id],
      isActive: true,
    })),
    doubleElimination: scenario.isDoubleElimination,
    winnerSetCount: scenario.isSetBased ? 3 : 1,
    loserSetCount: 1,
    winnerBracketPointsToVictory: scenario.isSetBased ? [21, 21, 15] : [],
    loserBracketPointsToVictory: scenario.isSetBased ? [21] : [],
    usesSets: scenario.isSetBased,
    matchDurationMinutes: scenario.isSetBased ? undefined : 45,
    setDurationMinutes: scenario.isSetBased ? 15 : undefined,
    restTimeMinutes: 15,
  });

  return {
    bracketDivision,
    poolDivisions: [poolA, poolB],
    timeSlots,
    tournament,
  };
};

describe('tournament bracket matrix', () => {
  jest.setTimeout(120000);

  it.each(poolScenarios)('schedules scenario: $label', (scenario) => {
    const {
      bracketDivision,
      poolDivisions,
      timeSlots,
      tournament,
    } = buildPoolTournament(scenario);
    const scheduled = scheduleEvent({
      event: tournament,
      includePlaceholderTeams: true,
    }, context);
    const poolDivisionIds = new Set(poolDivisions.map((division) => division.id));
    const poolMatches = scheduled.matches.filter((match) => (
      poolDivisionIds.has(match.division.id)
    ));
    const bracketMatches = scheduled.matches.filter((match) => (
      match.division.id === bracketDivision.id
    ));

    expect(new Set(poolMatches.map((match) => match.division.id))).toEqual(poolDivisionIds);
    expect(poolMatches).toHaveLength(
      scenario.teamsPerPool * (scenario.teamsPerPool - 1),
    );
    if (scenario.isDoubleElimination) {
      expect(bracketMatches.length).toBeGreaterThan(3);
      expect(bracketMatches.some((match) => match.losersBracket)).toBe(true);
    } else {
      expect(bracketMatches).toHaveLength(3);
    }
    expect(timeSlots.filter((slot) => slot.repeating)).toHaveLength(2);
    expect(timeSlots.filter((slot) => !slot.repeating)).toHaveLength(2);
    expect(timeSlots.every((slot) => (
      poolDivisions.every((division) => (
        slot.divisions.some((candidate) => candidate.id === division.id)
      ))
    ))).toBe(true);
    expect(scheduled.matches.every((match) => (
      match.field && match.start.getTime() < match.end.getTime()
    ))).toBe(true);

    if (scenario.officiating === 'STAFF') {
      expect(scheduled.matches.every((match) => (
        match.officialAssignments.filter((assignment) => (
          assignment.holderType === 'OFFICIAL' && assignment.userId
        )).length === 2
      ))).toBe(true);
    } else {
      expect(scheduled.matches.every((match) => match.requiresTeamOfficial)).toBe(true);
      expect(poolMatches.every((match) => match.teamOfficial)).toBe(true);
    }
  });

  it('builds a three-team bracket with one bye and two matches', () => {
    const scheduled = scheduleTournament(3, false);
    const final = scheduled.matches.find((match) => match.getDependencies().length === 1);
    const openingMatch = scheduled.matches.find((match) => match.getDependencies().length === 0);

    expect(scheduled.matches).toHaveLength(2);
    expect(final).toBeDefined();
    expect(openingMatch).toBeDefined();
    expect(final?.team1?.id).toBe('team_1');
    expect(final?.team1Seed).toBe(1);
    expect([openingMatch?.team1?.id, openingMatch?.team2?.id].sort()).toEqual([
      'team_2',
      'team_3',
    ]);
    expect(final?.getDependencies()).toEqual([openingMatch]);
  });

  it('does not build a bracket with fewer than three teams', () => {
    const scheduled = scheduleTournament(2, false);

    expect(scheduled.matches).toHaveLength(0);
  });

  it('places every double-elimination Match after all incoming dependencies and rest', () => {
    const scheduled = scheduleTournament(8, true, 30);
    const dependentMatches = scheduled.matches.filter(
      (match) => match.getDependencies().length > 0,
    );

    expect(dependentMatches.length).toBeGreaterThan(0);
    expect(
      dependentMatches.some((match) => match.losersBracket),
    ).toBe(true);
    for (const match of dependentMatches) {
      for (const dependency of match.getDependencies()) {
        expect(match.start.getTime()).toBeGreaterThanOrEqual(
          dependency.end.getTime() + dependency.bufferMs,
        );
      }
      for (const dependant of match.getDependants()) {
        expect(
          dependant
            .getDependencies()
            .some((dependency) => dependency.id === match.id),
        ).toBe(true);
      }
    }
    const resetFinal = dependentMatches.find(
      (match) =>
        match.previousLeftMatch !== null &&
        match.previousLeftMatch === match.previousRightMatch,
    );
    expect(resetFinal).toBeDefined();
    expect(resetFinal!.start.getTime()).toBeGreaterThanOrEqual(
      resetFinal!.previousLeftMatch!.end.getTime() +
        resetFinal!.previousLeftMatch!.bufferMs,
    );
  });

  it('keeps a Best Available Team-duty slot visible when automatic Team assignment is disabled', () => {
    const scheduled = scheduleTournament(4, false);

    expect(
      scheduled.matches.every(
        (match) =>
          match.requiresTeamOfficial &&
          !match.reservesTeamOfficial &&
          match.teamOfficial === null,
      ),
    ).toBe(true);
    expect(scheduled.warnings).toEqual([
      expect.objectContaining({
        code: 'UNRESOLVED_TEAM_DUTY',
        matchIds: expect.arrayContaining(
          scheduled.matches.map((match) => match.id),
        ),
      }),
    ]);
  });

  it('rebuilds a non-pool tournament with existing registered teams plus placeholder slots', () => {
    const division = buildDivision();
    const field = buildField(division);
    const teams = {
      team_registered: new Team({
        id: 'team_registered',
        captainId: 'captain_registered',
        division,
        name: 'Registered Team',
        matches: [],
      }),
    };
    const tournament = new Tournament({
      id: 'matrix_tournament_registered_plus_placeholders',
      name: 'Registered Plus Placeholders',
      start: new Date(2026, 0, 5, 8, 0, 0),
      end: new Date(2026, 0, 5, 22, 0, 0),
      maxParticipants: 4,
      teamSignup: true,
      eventType: 'TOURNAMENT',
      teams,
      registeredTeamIds: ['team_registered'],
      divisions: [division],
      fields: { [field.id]: field },
      timeSlots: buildTimeSlots(),
      doTeamsOfficiate: false,
      doubleElimination: false,
      winnerSetCount: 1,
      loserSetCount: 1,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
    });

    const scheduled = scheduleEvent({ event: tournament, includePlaceholderTeams: true }, context);
    const scheduledTeamIds = Object.keys(scheduled.event.teams);
    const placeholderTeams = Object.values(scheduled.event.teams)
      .filter((team) => team.captainId === '' && team.name.startsWith('Place Holder '));
    const firstRoundMatches = scheduled.matches.filter((match) => (
      !match.previousLeftMatch && !match.previousRightMatch
    ));
    const directlyAssignedTeamIds = firstRoundMatches.flatMap((match) => [
      match.team1?.id,
      match.team2?.id,
    ]).filter((teamId): teamId is string => Boolean(teamId));

    expect(scheduledTeamIds).toContain('team_registered');
    expect(placeholderTeams.map((team) => team.name).sort()).toEqual([
      'Place Holder 2',
      'Place Holder 3',
      'Place Holder 4',
    ]);
    expect(scheduled.matches).toHaveLength(3);
    expect(firstRoundMatches).toHaveLength(2);
    expect(new Set(directlyAssignedTeamIds)).toEqual(new Set(scheduledTeamIds));
  });
});
