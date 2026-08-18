/** @jest-environment node */

import { scheduleEvent } from '@/server/scheduler/scheduleEvent';
import { Division, League, PlayingField, Team, TimeSlot } from '@/server/scheduler/types';

const context = {
  log: () => {},
  error: () => {},
};

const buildDivision = () => new Division('open', 'Open');

const buildTeams = (count: number, division: Division) => {
  const teams: Record<string, Team> = {};
  for (let index = 1; index <= count; index += 1) {
    const id = `team_${index}`;
    teams[id] = new Team({
      id,
      captainId: `captain_${index}`,
      division,
      name: `Team ${index}`,
      matches: [],
    });
  }
  return teams;
};

const buildFields = (division: Division, count: number): Record<string, PlayingField> => {
  const fields: Record<string, PlayingField> = {};
  for (let index = 1; index <= count; index += 1) {
    const id = `field_${index}`;
    fields[id] = new PlayingField({
      id,
      divisions: [division],
      matches: [],
      events: [],
      rentalSlots: [],
      name: `Field ${index}`,
    });
  }
  return fields;
};

const buildTimeSlots = (fieldIds: string[]): TimeSlot[] => {
  const startDate = new Date(2026, 0, 5, 8, 0, 0); // Monday
  const slots: TimeSlot[] = [];
  for (const fieldId of fieldIds) {
    for (let day = 0; day <= 6; day += 1) {
      slots.push(
        new TimeSlot({
          id: `${fieldId}_day_${day}`,
          dayOfWeek: day, // Monday-based index
          startDate,
          repeating: true,
          startTimeMinutes: 8 * 60,
          endTimeMinutes: 22 * 60,
          field: fieldId,
        }),
      );
    }
  }
  return slots;
};

const buildKnownTeamRestLeague = (): League => {
  const division = buildDivision();
  const teams = buildTeams(5, division);
  const fields = buildFields(division, 2);
  const start = new Date(2026, 0, 5, 8, 0, 0);
  const timeSlots = [
    new TimeSlot({
      id: 'field_1_monday',
      dayOfWeek: 0,
      startDate: start,
      repeating: true,
      startTimeMinutes: 8 * 60,
      endTimeMinutes: 22 * 60,
      field: 'field_1',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
    new TimeSlot({
      id: 'field_2_monday',
      dayOfWeek: 0,
      startDate: start,
      repeating: true,
      startTimeMinutes: 10 * 60,
      endTimeMinutes: 22 * 60,
      field: 'field_2',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  ];
  return new League({
    id: 'league_known_team_readiness',
    name: 'Known Team Readiness',
    start,
    end: new Date(2026, 11, 31, 22, 0, 0),
    maxParticipants: 5,
    teamSignup: true,
    eventType: 'LEAGUE',
    teams,
    divisions: [division],
    officials: [],
    fields,
    timeSlots,
    doTeamsOfficiate: false,
    gamesPerOpponent: 1,
    includePlayoffs: false,
    playoffTeamCount: 0,
    doubleElimination: false,
    usesSets: false,
    matchDurationMinutes: 60,
    restTimeMinutes: 30,
    leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
  });
};

const projectedTeamCount = (teamCount: number): number => {
  // Scheduler always pads to at least 2 participants.
  return Math.max(teamCount, 2);
};

const regularMatchCount = (teamCount: number, gamesPerOpponent: number): number => {
  const projected = projectedTeamCount(teamCount);
  return Math.floor((projected * (projected - 1) / 2) * gamesPerOpponent);
};

const playoffMatchCount = (teamCount: number, includePlayoffs: boolean, playoffTeamCount: number): number => {
  if (!includePlayoffs) return 0;

  const projected = projectedTeamCount(teamCount);
  const seededCount = Math.min(Math.max(playoffTeamCount, 0), projected);

  // Bracket builder intentionally skips divisions with fewer than 3 teams.
  if (seededCount < 3) return 0;

  return seededCount - 1;
};

type Scenario = {
  label: string;
  teamCount: number;
  gamesPerOpponent: number;
  includePlayoffs: boolean;
  playoffTeamCount: number;
  usesSets: boolean;
  restTimeMinutes: number;
};

const scenarios: Scenario[] = [
  { label: '1-team no playoffs timed', teamCount: 1, gamesPerOpponent: 1, includePlayoffs: false, playoffTeamCount: 0, usesSets: false, restTimeMinutes: 0 },
  { label: '2-team no playoffs timed', teamCount: 2, gamesPerOpponent: 1, includePlayoffs: false, playoffTeamCount: 0, usesSets: false, restTimeMinutes: 0 },
  { label: '4-team round robin x2 timed', teamCount: 4, gamesPerOpponent: 2, includePlayoffs: false, playoffTeamCount: 0, usesSets: false, restTimeMinutes: 15 },
  { label: '8-team no playoffs set-based', teamCount: 8, gamesPerOpponent: 1, includePlayoffs: false, playoffTeamCount: 0, usesSets: true, restTimeMinutes: 0 },
  { label: '16-team round robin x2 set-based', teamCount: 16, gamesPerOpponent: 2, includePlayoffs: false, playoffTeamCount: 0, usesSets: true, restTimeMinutes: 20 },
  { label: '32-team no playoffs timed', teamCount: 32, gamesPerOpponent: 1, includePlayoffs: false, playoffTeamCount: 0, usesSets: false, restTimeMinutes: 5 },
  { label: '2-team playoffs count 1 (no playoffs generated)', teamCount: 2, gamesPerOpponent: 1, includePlayoffs: true, playoffTeamCount: 1, usesSets: false, restTimeMinutes: 0 },
  { label: '2-team playoffs count 2', teamCount: 2, gamesPerOpponent: 1, includePlayoffs: true, playoffTeamCount: 2, usesSets: false, restTimeMinutes: 0 },
  { label: '5-team playoffs count 4 set-based', teamCount: 5, gamesPerOpponent: 1, includePlayoffs: true, playoffTeamCount: 4, usesSets: true, restTimeMinutes: 10 },
  { label: '8-team playoffs count 4 timed', teamCount: 8, gamesPerOpponent: 2, includePlayoffs: true, playoffTeamCount: 4, usesSets: false, restTimeMinutes: 0 },
  { label: '8-team playoffs count 8 set-based', teamCount: 8, gamesPerOpponent: 1, includePlayoffs: true, playoffTeamCount: 8, usesSets: true, restTimeMinutes: 15 },
  { label: '16-team playoffs count 16 timed', teamCount: 16, gamesPerOpponent: 1, includePlayoffs: true, playoffTeamCount: 16, usesSets: false, restTimeMinutes: 30 },
  { label: '16-team playoffs count over cap clamps to 16', teamCount: 16, gamesPerOpponent: 2, includePlayoffs: true, playoffTeamCount: 20, usesSets: true, restTimeMinutes: 20 },
  { label: '32-team playoffs count 16 timed', teamCount: 32, gamesPerOpponent: 1, includePlayoffs: true, playoffTeamCount: 16, usesSets: false, restTimeMinutes: 10 },
];

describe('league schedule matrix', () => {
  jest.setTimeout(120000);

  it.each(scenarios)('schedules scenario: $label', (scenario) => {
    const division = buildDivision();
    const teams = buildTeams(scenario.teamCount, division);
    const fields = buildFields(division, 4);
    const timeSlots = buildTimeSlots(Object.keys(fields));

    const start = new Date(2026, 0, 5, 8, 0, 0);
    const end = new Date(2026, 11, 31, 22, 0, 0);

    const league = new League({
      id: `league_${scenario.teamCount}_${scenario.gamesPerOpponent}_${scenario.playoffTeamCount}_${scenario.usesSets ? 'sets' : 'timed'}`,
      name: `Matrix ${scenario.label}`,
      start,
      end,
      maxParticipants: scenario.teamCount,
      teamSignup: true,
      eventType: 'LEAGUE',
      teams,
      divisions: [division],
      officials: [],
      fields,
      timeSlots,
      doTeamsOfficiate: false,
      gamesPerOpponent: scenario.gamesPerOpponent,
      includePlayoffs: scenario.includePlayoffs,
      playoffTeamCount: scenario.playoffTeamCount,
      doubleElimination: false,
      usesSets: scenario.usesSets,
      matchDurationMinutes: scenario.usesSets ? undefined : 60,
      setDurationMinutes: scenario.usesSets ? 20 : undefined,
      setsPerMatch: scenario.usesSets ? 3 : undefined,
      restTimeMinutes: scenario.restTimeMinutes,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const expectedRegularMatches = regularMatchCount(scenario.teamCount, scenario.gamesPerOpponent);
    const expectedPlayoffMatches = playoffMatchCount(
      scenario.teamCount,
      scenario.includePlayoffs,
      scenario.playoffTeamCount,
    );
    const expectedTotal = expectedRegularMatches + expectedPlayoffMatches;

    const scheduled = scheduleEvent({ event: league }, context);
    expect(scheduled.matches.length).toBe(expectedTotal);

    for (const match of scheduled.matches) {
      expect(match.field).toBeTruthy();
      expect(match.start.getTime()).toBeLessThan(match.end.getTime());
    }
  });

  it('places known-Team Matches at per-Team rest bounds without a global round barrier', () => {
    const firstSchedule = scheduleEvent(
      { event: buildKnownTeamRestLeague() },
      context,
    );
    const secondSchedule = scheduleEvent(
      { event: buildKnownTeamRestLeague() },
      context,
    );
    const matchesById = [...firstSchedule.matches].sort(
      (left, right) => (left.matchId ?? 0) - (right.matchId ?? 0),
    );
    const [earlyOpening, delayedOpening, readyMatch, restLimitedMatch] =
      matchesById;
    const restMs = 30 * 60 * 1000;

    expect([
      earlyOpening.team1!.id,
      earlyOpening.team2!.id,
    ].sort()).toEqual(['team_2', 'team_5']);
    expect([
      delayedOpening.team1!.id,
      delayedOpening.team2!.id,
    ].sort()).toEqual(['team_3', 'team_4']);
    expect([
      readyMatch.team1!.id,
      readyMatch.team2!.id,
    ].sort()).toEqual(['team_1', 'team_5']);
    expect([
      restLimitedMatch.team1!.id,
      restLimitedMatch.team2!.id,
    ].sort()).toEqual(['team_2', 'team_3']);
    expect(earlyOpening.start).toEqual(new Date(2026, 0, 5, 8, 0, 0));
    expect(delayedOpening.start).toEqual(new Date(2026, 0, 5, 9, 0, 0));
    expect(readyMatch.start).toEqual(new Date(2026, 0, 5, 10, 0, 0));
    expect(readyMatch.start.getTime()).toBe(delayedOpening.end.getTime());
    expect(readyMatch.start.getTime()).toBeLessThan(
      delayedOpening.end.getTime() + restMs,
    );

    const delayedTeamIds = [
      delayedOpening.team1!.id,
      delayedOpening.team2!.id,
    ];
    expect(
      [readyMatch.team1!.id, readyMatch.team2!.id].some((teamId) =>
        delayedTeamIds.includes(teamId),
      ),
    ).toBe(false);
    expect(restLimitedMatch.start.getTime()).toBe(
      delayedOpening.end.getTime() + restMs,
    );
    expect(restLimitedMatch.start.getTime()).toBeLessThan(
      readyMatch.end.getTime(),
    );
    expect(restLimitedMatch.end.getTime()).toBeGreaterThan(
      readyMatch.start.getTime(),
    );
    expect(
      [restLimitedMatch.team1!.id, restLimitedMatch.team2!.id].some(
        (teamId) =>
          teamId === readyMatch.team1!.id || teamId === readyMatch.team2!.id,
      ),
    ).toBe(false);

    for (let earlierIndex = 0; earlierIndex < matchesById.length; earlierIndex += 1) {
      const earlier = matchesById[earlierIndex];
      const earlierTeamIds = [earlier.team1?.id, earlier.team2?.id].filter(
        (teamId): teamId is string => Boolean(teamId),
      );
      for (
        let laterIndex = earlierIndex + 1;
        laterIndex < matchesById.length;
        laterIndex += 1
      ) {
        const later = matchesById[laterIndex];
        const laterTeamIds = [later.team1?.id, later.team2?.id].filter(
          (teamId): teamId is string => Boolean(teamId),
        );
        if (!laterTeamIds.some((teamId) => earlierTeamIds.includes(teamId))) {
          continue;
        }
        expect(later.start.getTime()).toBeGreaterThanOrEqual(
          earlier.end.getTime() + restMs,
        );
      }
    }

    expect(
      [...secondSchedule.matches]
        .sort((left, right) => (left.matchId ?? 0) - (right.matchId ?? 0))
        .map((match) => ({
          matchId: match.matchId,
          start: match.start.toISOString(),
          end: match.end.toISOString(),
          fieldId: match.field?.id ?? null,
          teamIds: [match.team1?.id ?? null, match.team2?.id ?? null],
        })),
    ).toEqual(
      matchesById.map((match) => ({
        matchId: match.matchId,
        start: match.start.toISOString(),
        end: match.end.toISOString(),
        fieldId: match.field?.id ?? null,
        teamIds: [match.team1?.id ?? null, match.team2?.id ?? null],
      })),
    );
  });

  it('preserves direct seed slots on carried-through bye matches', () => {
    const division = buildDivision();
    const teams = buildTeams(9, division);
    const fields = buildFields(division, 4);
    const timeSlots = buildTimeSlots(Object.keys(fields));

    const league = new League({
      id: 'league_bye_seed_slots',
      name: 'Bye Seed Slots',
      start: new Date(2026, 0, 5, 8, 0, 0),
      end: new Date(2026, 11, 31, 22, 0, 0),
      maxParticipants: 9,
      teamSignup: true,
      eventType: 'LEAGUE',
      teams,
      divisions: [division],
      officials: [],
      fields,
      timeSlots,
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: true,
      playoffTeamCount: 9,
      doubleElimination: false,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league }, context);
    const playoffMatches = scheduled.matches.filter((match) => (
      Boolean(match.previousLeftMatch || match.previousRightMatch || match.winnerNextMatch || match.loserNextMatch)
    ));

    const carriedSeedMatch = playoffMatches.find((match) => {
      const previousCount = Number(Boolean(match.previousLeftMatch)) + Number(Boolean(match.previousRightMatch));
      const directSeedCount = Number(typeof match.team1Seed === 'number') + Number(typeof match.team2Seed === 'number');
      return previousCount === 1 && directSeedCount === 1;
    });

    expect(carriedSeedMatch).toBeTruthy();
    expect([carriedSeedMatch?.team1Seed ?? null, carriedSeedMatch?.team2Seed ?? null]).toContain(1);
  });
});
