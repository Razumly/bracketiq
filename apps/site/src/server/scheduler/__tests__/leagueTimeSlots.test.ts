/** @jest-environment node */

import { scheduleEvent } from '@/server/scheduler/scheduleEvent';
import { Division, League, MINUTE_MS, PlayingField, Team, TimeSlot } from '@/server/scheduler/types';

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

const buildFieldById = (id: string, division: Division) =>
  new PlayingField({
    id,
    divisions: [division],
    matches: [],
    events: [],
    rentalSlots: [],
    name: id,
  });

const buildTeams = (count: number, division: Division) => {
  const teams: Record<string, Team> = {};
  for (let i = 1; i <= count; i += 1) {
    const id = `team_${i}`;
    teams[id] = new Team({
      id,
      captainId: 'captain',
      division,
      name: `Team ${i}`,
      matches: [],
    });
  }
  return teams;
};

const buildTeamsForDivision = (prefix: string, count: number, division: Division) => {
  const teams: Record<string, Team> = {};
  for (let i = 1; i <= count; i += 1) {
    const id = `${prefix}_team_${i}`;
    teams[id] = new Team({
      id,
      captainId: `captain_${prefix}_${i}`,
      division,
      name: `${prefix} Team ${i}`,
      matches: [],
    });
  }
  return teams;
};

const isPlayoffMatch = (match: {
  previousLeftMatch?: unknown;
  previousRightMatch?: unknown;
  winnerNextMatch?: unknown;
  loserNextMatch?: unknown;
}): boolean => (
  Boolean(
    match.previousLeftMatch
    || match.previousRightMatch
    || match.winnerNextMatch
    || match.loserNextMatch
  )
);

const buildLeagueForSlot = (slot: TimeSlot, start: Date, end: Date, id: string) => {
  const division = buildDivision();
  const field = buildField(division);
  const teams = buildTeams(2, division);
  return new League({
    id,
    name: id,
    start,
    end,
    maxParticipants: 2,
    teamSignup: true,
    eventType: 'LEAGUE',
    teams,
    divisions: [division],
    fields: { [field.id]: field },
    timeSlots: [slot],
    noFixedEndDateTime: false,
    matchDurationMinutes: 60,
    gamesPerOpponent: 1,
    includePlayoffs: false,
    usesSets: false,
    restTimeMinutes: 0,
  });
};

describe('league scheduling (time slots)', () => {
  it('places a match inside an overnight local-time slot', () => {
    const slot = new TimeSlot({
      id: 'slot_overnight_scheduler',
      dayOfWeek: 0,
      daysOfWeek: [0],
      startDate: new Date('2026-03-02T05:00:00.000Z'),
      endDate: new Date('2026-03-09T04:00:00.000Z'),
      repeating: true,
      startTimeMinutes: 22 * 60,
      endTimeMinutes: 2 * 60,
      field: 'field_1',
      fieldIds: ['field_1'],
      divisions: [],
      timeZone: 'America/New_York',
    });
    const scheduled = scheduleEvent({
      event: buildLeagueForSlot(
        slot,
        new Date('2026-03-02T20:00:00.000Z'),
        new Date('2026-03-03T08:00:00.000Z'),
        'league_overnight_scheduler',
      ),
    }, context);

    expect(scheduled.matches).toHaveLength(1);
    expect(scheduled.matches[0].start.toISOString()).toBe('2026-03-03T03:00:00.000Z');
    expect(scheduled.matches[0].end.toISOString()).toBe('2026-03-03T04:00:00.000Z');
  });

  it('rejects a repeating slot whose overnight end falls in a daylight-saving gap', () => {
    const slot = new TimeSlot({
      id: 'slot_dst_gap_scheduler',
      dayOfWeek: 5,
      daysOfWeek: [5],
      startDate: new Date('2026-03-07T05:00:00.000Z'),
      endDate: new Date('2026-03-09T04:00:00.000Z'),
      repeating: true,
      startTimeMinutes: 22 * 60,
      endTimeMinutes: 2 * 60,
      field: 'field_1',
      fieldIds: ['field_1'],
      divisions: [],
      timeZone: 'America/New_York',
    });
    const league = buildLeagueForSlot(
      slot,
      new Date('2026-03-07T20:00:00.000Z'),
      new Date('2026-03-08T08:00:00.000Z'),
      'league_dst_gap_scheduler',
    );

    expect(() => scheduleEvent({ event: league }, context)).toThrow(
      /does not exist on 2026-03-08/,
    );
  });
});

describe('league scheduling (time slots)', () => {
  it('chooses an immediately available Resource before a later Time Slot', () => {
    const division = buildDivision();
    const earlyField = buildFieldById('field_early', division);
    const laterField = buildFieldById('field_later', division);
    const teams = buildTeams(2, division);
    const earlySlot = new TimeSlot({
      id: 'slot_early',
      dayOfWeek: 3,
      daysOfWeek: [3],
      startDate: new Date('2026-08-27T14:00:00.000Z'),
      endDate: new Date('2026-08-27T16:00:00.000Z'),
      repeating: false,
      startTimeMinutes: 14 * 60,
      endTimeMinutes: 16 * 60,
      field: earlyField.id,
      fieldIds: [earlyField.id],
      divisions: [division],
      timeZone: 'UTC',
    });
    const laterSlot = new TimeSlot({
      id: 'slot_later',
      dayOfWeek: 5,
      daysOfWeek: [5],
      startDate: new Date('2026-08-29T16:00:00.000Z'),
      endDate: new Date('2026-08-29T18:00:00.000Z'),
      repeating: true,
      startTimeMinutes: 16 * 60,
      endTimeMinutes: 18 * 60,
      field: laterField.id,
      fieldIds: [laterField.id],
      divisions: [division],
      timeZone: 'UTC',
    });
    const league = new League({
      id: 'league_prefers_earliest_slot',
      name: 'Earliest Slot League',
      start: new Date('2026-08-27T14:00:00.000Z'),
      end: new Date('2026-08-30T18:00:00.000Z'),
      maxParticipants: 2,
      teamSignup: true,
      eventType: 'LEAGUE',
      teams,
      divisions: [division],
      fields: {
        [laterField.id]: laterField,
        [earlyField.id]: earlyField,
      },
      timeSlots: [laterSlot, earlySlot],
      noFixedEndDateTime: false,
      matchDurationMinutes: 60,
      gamesPerOpponent: 1,
      includePlayoffs: false,
      usesSets: false,
      restTimeMinutes: 0,
    });

    const scheduled = scheduleEvent({ event: league }, context);

    expect(scheduled.matches).toHaveLength(1);
    expect(scheduled.matches[0].field?.id).toBe(earlyField.id);
    expect(scheduled.matches[0].start.toISOString()).toBe('2026-08-27T14:00:00.000Z');
  });
  it('uses division-owned league config for split regular-season divisions', () => {
    const rec = new Division(
      'rec',
      'Rec',
      [],
      null,
      2,
      null,
      'LEAGUE',
      [],
      null,
      null,
      null,
      null,
      [],
      {
        gamesPerOpponent: 2,
        usesSets: true,
        setDurationMinutes: 10,
        setsPerMatch: 3,
        pointsToVictory: [21, 21, 15],
        restTimeMinutes: 5,
      },
    );
    const open = new Division(
      'open',
      'Open',
      [],
      null,
      2,
      null,
      'LEAGUE',
      [],
      null,
      null,
      null,
      null,
      [],
      {
        gamesPerOpponent: 1,
        usesSets: false,
        matchDurationMinutes: 45,
        restTimeMinutes: 20,
      },
    );
    const field = new PlayingField({
      id: 'field_division_config',
      divisions: [rec, open],
      matches: [],
      events: [],
      rentalSlots: [],
      name: 'Court A',
    });
    const start = new Date(2026, 0, 3, 9, 0, 0);
    const end = new Date(2026, 0, 3, 18, 0, 0);
    const league = new League({
      id: 'league_division_owned_config',
      name: 'Division Owned Config League',
      start,
      end,
      maxParticipants: 4,
      teamSignup: true,
      singleDivision: false,
      eventType: 'LEAGUE',
      teams: {
        ...buildTeamsForDivision('rec', 2, rec),
        ...buildTeamsForDivision('open', 2, open),
      },
      divisions: [rec, open],
      officials: [],
      fields: { [field.id]: field },
      timeSlots: [
        new TimeSlot({
          id: 'slot_division_owned_config',
          dayOfWeek: 5,
          startDate: new Date(2026, 0, 3),
          repeating: true,
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 18 * 60,
          divisions: [rec, open],
        }),
      ],
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league }, context);
    const regularMatches = scheduled.matches.filter((match) => !isPlayoffMatch(match));
    const recMatches = regularMatches.filter((match) => match.division.id === rec.id);
    const openMatches = regularMatches.filter((match) => match.division.id === open.id);

    expect(recMatches).toHaveLength(2);
    expect(openMatches).toHaveLength(1);
    recMatches.forEach((match) => {
      expect(match.end.getTime() - match.start.getTime()).toBe(30 * MINUTE_MS);
      expect(match.bufferMs).toBe(5 * MINUTE_MS);
      expect(match.team1Points).toHaveLength(3);
    });
    openMatches.forEach((match) => {
      expect(match.end.getTime() - match.start.getTime()).toBe(45 * MINUTE_MS);
      expect(match.bufferMs).toBe(20 * MINUTE_MS);
      expect(match.team1Points).toHaveLength(1);
    });
  });

  it('uses event playoff rest time for non-split single-division league playoffs', () => {
    const division = new Division(
      'OPEN',
      'Open',
      [],
      null,
      4,
      4,
      'LEAGUE',
      [],
      null,
      null,
      null,
      null,
      [],
      {
        gamesPerOpponent: 1,
        usesSets: false,
        matchDurationMinutes: 30,
        restTimeMinutes: 0,
      },
    );
    const field = buildField(division);
    const start = new Date(2026, 0, 3, 9, 0, 0);
    const end = new Date(2026, 0, 3, 20, 0, 0);
    const league = new League({
      id: 'league_single_division_playoff_rest',
      name: 'Single Division Playoff Rest League',
      start,
      end,
      maxParticipants: 4,
      teamSignup: true,
      singleDivision: true,
      eventType: 'LEAGUE',
      teams: buildTeams(4, division),
      divisions: [division],
      officials: [],
      fields: { [field.id]: field },
      timeSlots: [
        new TimeSlot({
          id: 'slot_single_division_playoff_rest',
          dayOfWeek: 5,
          startDate: new Date(2026, 0, 3),
          repeating: true,
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 20 * 60,
        }),
      ],
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: true,
      playoffTeamCount: 4,
      usesSets: false,
      matchDurationMinutes: 30,
      restTimeMinutes: 25,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league }, context);
    const playoffMatches = scheduled.matches.filter((match) => isPlayoffMatch(match));

    expect(playoffMatches.length).toBeGreaterThan(0);
    playoffMatches.forEach((match) => {
      expect(match.bufferMs).toBe(25 * MINUTE_MS);
    });
  });

  it('uses zero rest time as-is without applying an implicit default gap', () => {
    const division = buildDivision();
    const field = buildField(division);
    const teams = buildTeams(2, division);
    const start = new Date(2026, 0, 3, 9, 0, 0);
    const end = new Date(2026, 0, 3, 14, 0, 0);
    const timeSlots = [
      new TimeSlot({
        id: 'slot_no_default_rest',
        dayOfWeek: 5, // Saturday
        startDate: new Date(2026, 0, 3),
        repeating: true,
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 14 * 60,
      }),
    ];

    const league = new League({
      id: 'league_no_default_rest_gap',
      name: 'No Default Rest Gap League',
      start,
      end,
      maxParticipants: 2,
      teamSignup: true,
      eventType: 'LEAGUE',
      teams,
      divisions: [division],
      officials: [],
      fields: { [field.id]: field },
      timeSlots,
      doTeamsOfficiate: false,
      gamesPerOpponent: 2,
      includePlayoffs: false,
      playoffTeamCount: 0,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league }, context);
    expect(scheduled.matches.length).toBe(2);

    const matchesByStart = [...scheduled.matches]
      .sort((a, b) => a.start.getTime() - b.start.getTime());
    const gapMs = matchesByStart[1].start.getTime() - matchesByStart[0].end.getTime();
    expect(gapMs).toBe(0 * MINUTE_MS);
  });

  it('forces single-set playoff matches for timed leagues even when playoff set config is higher', () => {
    const division = buildDivision();
    const field = buildField(division);
    const teams = buildTeams(4, division);
    const start = new Date(2026, 0, 3, 9, 0, 0);
    const end = new Date(2026, 0, 3, 22, 0, 0);
    const timeSlots = [
      new TimeSlot({
        id: 'slot_timed_single_set_playoffs',
        dayOfWeek: 5,
        startDate: new Date(2026, 0, 3),
        repeating: true,
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 22 * 60,
      }),
    ];

    const league = new League({
      id: 'league_timed_single_set_playoffs',
      name: 'Timed Single Set Playoffs',
      start,
      end,
      maxParticipants: 4,
      teamSignup: true,
      eventType: 'LEAGUE',
      teams,
      divisions: [division],
      officials: [],
      fields: { [field.id]: field },
      timeSlots,
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: true,
      playoffTeamCount: 4,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      winnerSetCount: 3,
      loserSetCount: 3,
      winnerBracketPointsToVictory: [21, 21, 15],
      loserBracketPointsToVictory: [21, 21, 15],
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league }, context);
    const playoffMatches = scheduled.matches.filter((match) => isPlayoffMatch(match));
    expect(playoffMatches.length).toBeGreaterThan(0);
    expect(playoffMatches.every((match) => match.team1Points.length === 1)).toBe(true);
    expect(playoffMatches.every((match) => match.team2Points.length === 1)).toBe(true);
  });

  it('rejects schedulable events with fixed end windows when end is not after start', () => {
    const division = buildDivision();
    const field = buildField(division);
    const teams = buildTeams(4, division);
    const start = new Date(2026, 0, 3, 9, 0, 0);

    const league = new League({
      id: 'league_fixed_invalid_window',
      name: 'Invalid Fixed Window League',
      start,
      end: start,
      noFixedEndDateTime: false,
      maxParticipants: 4,
      teamSignup: true,
      eventType: 'LEAGUE',
      teams,
      divisions: [division],
      officials: [],
      fields: { [field.id]: field },
      timeSlots: [],
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    expect(() => scheduleEvent({ event: league }, context)).toThrow(
      'End date/time must be after start date/time',
    );
  });

  it('keeps fixed end windows unchanged after scheduling', () => {
    const division = buildDivision();
    const field = buildField(division);
    const teams = buildTeams(2, division);
    const start = new Date(2026, 0, 3, 9, 0, 0);
    const end = new Date(2026, 0, 3, 14, 0, 0);
    const timeSlots = [
      new TimeSlot({
        id: 'slot_fixed_equal_window',
        dayOfWeek: 5,
        startDate: new Date(2026, 0, 3),
        repeating: true,
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 12 * 60,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    ];

    const league = new League({
      id: 'league_fixed_window_end_unchanged',
      name: 'Fixed Window End Unchanged',
      start,
      end,
      noFixedEndDateTime: false,
      maxParticipants: 2,
      teamSignup: true,
      eventType: 'LEAGUE',
      teams,
      divisions: [division],
      officials: [],
      fields: { [field.id]: field },
      timeSlots,
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league }, context);
    expect(scheduled.matches.length).toBeGreaterThan(0);
    expect(scheduled.event.end.getTime()).toBe(end.getTime());
  });

  it('allows open-ended schedules to continue past the stored end date/time when enabled', () => {
    const division = buildDivision();
    const field = buildField(division);
    const teams = buildTeams(4, division);
    const start = new Date(2026, 0, 3, 9, 0, 0);
    const end = new Date(2026, 0, 3, 11, 0, 0);

    const timeSlots = [
      new TimeSlot({
        id: 'slot_open_ended',
        dayOfWeek: 5,
        startDate: new Date(2026, 0, 3),
        repeating: true,
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 13 * 60,
      }),
    ];

    const league = new League({
      id: 'league_open_ended_window',
      name: 'Open Ended Window League',
      start,
      end,
      noFixedEndDateTime: true,
      maxParticipants: 4,
      teamSignup: true,
      eventType: 'LEAGUE',
      teams,
      divisions: [division],
      officials: [],
      fields: { [field.id]: field },
      timeSlots,
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league }, context);
    expect(scheduled.matches.length).toBe(6);
    const latestStart = Math.max(...scheduled.matches.map((match) => match.start.getTime()));
    expect(scheduled.event.generatedScheduleEnd?.getTime()).toBe(scheduled.event.end.getTime());
    expect(latestStart).toBeGreaterThan(end.getTime());
  });

  it('schedules matches within explicit non-repeating start/end datetime slots', () => {
    const division = buildDivision();
    const field = buildField(division);
    const teams = buildTeams(2, division);
    const eventStart = new Date('2026-01-03T08:00:00.000Z');
    const eventEnd = new Date('2026-01-03T20:00:00.000Z');
    const slotStart = new Date('2026-01-03T10:00:00.000Z');
    const slotEnd = new Date('2026-01-03T12:00:00.000Z');

    const league = new League({
      id: 'league_non_repeating_window_fit',
      name: 'Non Repeating Window Fit',
      start: eventStart,
      end: eventEnd,
      noFixedEndDateTime: false,
      maxParticipants: 2,
      teamSignup: true,
      eventType: 'LEAGUE',
      teams,
      divisions: [division],
      officials: [],
      fields: { [field.id]: field },
      timeSlots: [
        new TimeSlot({
          id: 'slot_non_repeat_fit',
          dayOfWeek: 5,
          startDate: slotStart,
          endDate: slotEnd,
          repeating: false,
          startTimeMinutes: 10 * 60,
          endTimeMinutes: 12 * 60,
          timeZone: 'UTC',
        }),
      ],
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league }, context);
    expect(scheduled.matches).toHaveLength(1);
    const [match] = scheduled.matches;
    expect(match.start.getTime()).toBeGreaterThanOrEqual(slotStart.getTime());
    expect(match.end.getTime()).toBeLessThanOrEqual(slotEnd.getTime());
  });

  it('aligns the next match to a later explicit window after a one-hour gap', () => {
    const division = buildDivision();
    const field = buildField(division);
    const teams = buildTeams(3, division);
    const eventStart = new Date('2026-01-03T08:00:00.000Z');
    const eventEnd = new Date('2026-01-03T15:00:00.000Z');
    const firstSlotStart = new Date('2026-01-03T09:00:00.000Z');
    const firstSlotEnd = new Date('2026-01-03T11:00:00.000Z');
    const secondSlotStart = new Date('2026-01-03T12:00:00.000Z');
    const secondSlotEnd = new Date('2026-01-03T14:00:00.000Z');
    const league = new League({
      id: 'league_explicit_window_gap',
      name: 'Explicit Window Gap League',
      start: eventStart,
      end: eventEnd,
      noFixedEndDateTime: false,
      maxParticipants: 3,
      teamSignup: true,
      eventType: 'LEAGUE',
      teams,
      divisions: [division],
      officials: [],
      fields: { [field.id]: field },
      timeSlots: [
        new TimeSlot({
          id: 'slot_gap_first',
          dayOfWeek: 5,
          startDate: firstSlotStart,
          endDate: firstSlotEnd,
          repeating: false,
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 11 * 60,
          timeZone: 'UTC',
        }),
        new TimeSlot({
          id: 'slot_gap_second',
          dayOfWeek: 5,
          startDate: secondSlotStart,
          endDate: secondSlotEnd,
          repeating: false,
          startTimeMinutes: 12 * 60,
          endTimeMinutes: 14 * 60,
          timeZone: 'UTC',
        }),
      ],
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league }, context);
    expect(scheduled.matches).toHaveLength(3);
    const starts = scheduled.matches.map((match) => match.start.getTime()).sort((a, b) => a - b);
    expect(starts[0]).toBe(firstSlotStart.getTime());
    expect(starts[1]).toBe(firstSlotStart.getTime() + 60 * MINUTE_MS);
    expect(starts[2]).toBe(secondSlotStart.getTime());
    expect(scheduled.matches.every((match) => (
      (match.start.getTime() >= firstSlotStart.getTime() && match.end.getTime() <= firstSlotEnd.getTime())
      || (match.start.getTime() >= secondSlotStart.getTime() && match.end.getTime() <= secondSlotEnd.getTime())
    ))).toBe(true);
  });

  it('does not treat field rental slots as blockers when scheduling matches', () => {
    const division = buildDivision();
    const field = buildField(division);
    const teams = buildTeams(2, division);
    const eventStart = new Date('2026-01-03T08:00:00.000Z');
    const eventEnd = new Date('2026-01-03T20:00:00.000Z');
    const slotStart = new Date('2026-01-03T10:00:00.000Z');
    const slotEnd = new Date('2026-01-03T12:00:00.000Z');

    field.rentalSlots = [
      new TimeSlot({
        id: 'external_rental_slot',
        dayOfWeek: 5,
        startDate: slotStart,
        endDate: slotEnd,
        repeating: false,
        startTimeMinutes: 10 * 60,
        endTimeMinutes: 12 * 60,
        timeZone: 'UTC',
        field: field.id,
        fieldIds: [field.id],
        divisions: [division],
      }),
    ];

    const league = new League({
      id: 'league_rental_slot_not_blocking',
      name: 'Rental Slot Not Blocking',
      start: eventStart,
      end: eventEnd,
      noFixedEndDateTime: false,
      maxParticipants: 2,
      teamSignup: true,
      eventType: 'LEAGUE',
      teams,
      divisions: [division],
      officials: [],
      fields: { [field.id]: field },
      timeSlots: [
        new TimeSlot({
          id: 'slot_rental_overlap_allowed',
          dayOfWeek: 5,
          startDate: slotStart,
          endDate: slotEnd,
          repeating: false,
          startTimeMinutes: 10 * 60,
          endTimeMinutes: 12 * 60,
          timeZone: 'UTC',
          field: field.id,
          fieldIds: [field.id],
          divisions: [division],
        }),
      ],
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league }, context);

    expect(scheduled.matches).toHaveLength(1);
    const [match] = scheduled.matches;
    expect(match.field?.id).toBe(field.id);
    expect(match.start.getTime()).toBe(slotStart.getTime());
    expect(match.end.getTime()).toBeLessThanOrEqual(slotEnd.getTime());
  });

  it('errors when matches cannot fit within a non-repeating slot hard end datetime', () => {
    const division = buildDivision();
    const field = buildField(division);
    const teams = buildTeams(4, division);
    const eventStart = new Date('2026-01-03T08:00:00.000Z');
    const eventEnd = new Date('2026-01-03T20:00:00.000Z');
    const slotStart = new Date('2026-01-03T10:00:00.000Z');
    const slotEnd = new Date('2026-01-03T12:00:00.000Z');

    const league = new League({
      id: 'league_non_repeating_window_overflow',
      name: 'Non Repeating Window Overflow',
      start: eventStart,
      end: eventEnd,
      noFixedEndDateTime: false,
      maxParticipants: 4,
      teamSignup: true,
      eventType: 'LEAGUE',
      teams,
      divisions: [division],
      officials: [],
      fields: { [field.id]: field },
      timeSlots: [
        new TimeSlot({
          id: 'slot_non_repeat_overflow',
          dayOfWeek: 5,
          startDate: slotStart,
          endDate: slotEnd,
          repeating: false,
          startTimeMinutes: 10 * 60,
          endTimeMinutes: 12 * 60,
          timeZone: 'UTC',
        }),
      ],
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const runSchedule = () => scheduleEvent({ event: league }, context);
    expect(runSchedule).toThrow(/not enough time is allotted/i);
    expect(runSchedule).toThrow(/provided time slots/i);
    expect(runSchedule).toThrow(/Approximate capacity from weekly repeating timeslots: 0 matches\/week because no weekly repeating timeslots are configured; only explicit one-time windows are available\./i);
    expect(runSchedule).toThrow(/Approximate total capacity across the event schedule window:/i);
  });

  it('errors when weekly slots have a fixed end date and the schedule overruns that window', () => {
    const division = buildDivision();
    const field = buildField(division);
    const teams = buildTeams(4, division);
    const eventStart = new Date(2026, 0, 3, 8, 0, 0);
    const eventEnd = new Date(2026, 0, 25, 20, 0, 0);
    const slotStartDate = new Date(2026, 0, 3, 0, 0, 0);
    const slotEndDate = new Date(2026, 0, 4, 0, 0, 0);

    const league = new League({
      id: 'league_weekly_fixed_end_overflow',
      name: 'Weekly Slot Fixed End Overflow',
      start: eventStart,
      end: eventEnd,
      noFixedEndDateTime: false,
      maxParticipants: 4,
      teamSignup: true,
      eventType: 'LEAGUE',
      teams,
      divisions: [division],
      officials: [],
      fields: { [field.id]: field },
      timeSlots: [
        new TimeSlot({
          id: 'slot_weekly_fixed_end',
          dayOfWeek: 5,
          startDate: slotStartDate,
          endDate: slotEndDate,
          repeating: true,
          startTimeMinutes: 10 * 60,
          endTimeMinutes: 12 * 60,
        }),
      ],
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    expect(() => scheduleEvent({ event: league }, context)).toThrow(/not enough time is allotted/i);
  });

  it('schedules weekend-only league matches across multiple weekends when weekend slots are limited', () => {
    const division = buildDivision();
    const field = buildField(division);
    const teams = buildTeams(8, division);

    // Jan 3, 2026 is a Saturday.
    const start = new Date(2026, 0, 3, 9, 0, 0);
    const end = new Date(2026, 0, 4, 13, 0, 0);

    // Weekend-only, 4 hours/day. With 8 teams and 60-minute matches, each round consumes a full day.
    // Round robin needs 7 rounds, so we should span multiple weekends (multiple weeks).
    const slotStart = 9 * 60;
    const slotEnd = 13 * 60;
    const saturdaySlotDay = 5; // Monday-based index (0=Mon ... 6=Sun)
    const sundaySlotDay = 6;
    const timeSlots = [
      new TimeSlot({
        id: 'slot_sat',
        dayOfWeek: saturdaySlotDay,
        startDate: new Date(2026, 0, 3),
        repeating: true,
        startTimeMinutes: slotStart,
        endTimeMinutes: slotEnd,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
      new TimeSlot({
        id: 'slot_sun',
        dayOfWeek: sundaySlotDay,
        startDate: new Date(2026, 0, 3),
        repeating: true,
        startTimeMinutes: slotStart,
        endTimeMinutes: slotEnd,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    ];

    const league = new League({
      id: 'league_slots',
      name: 'Weekend League',
      start,
      end,
      maxParticipants: 8,
      teamSignup: true,
      eventType: 'LEAGUE',
      teams,
      divisions: [division],
      officials: [],
      fields: { [field.id]: field },
      timeSlots,
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      usesSets: true,
      setDurationMinutes: 20,
      setsPerMatch: 3,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league }, context);
    expect(scheduled.matches.length).toBe(28);

    const weekendDays = new Set([6, 0]); // JS Date#getDay() indexes (0=Sun ... 6=Sat)
    for (const match of scheduled.matches) {
      expect(match.field).toBeTruthy();
      expect(weekendDays.has(match.start.getDay())).toBe(true);
      expect(match.start.getHours()).toBeGreaterThanOrEqual(9);
      const endHour = match.end.getHours();
      const endMinute = match.end.getMinutes();
      expect(endHour < 13 || (endHour === 13 && endMinute === 0)).toBe(true);
    }

    const threeWeeksMs = 3 * 7 * 24 * 60 * 60 * 1000;
    const maxStart = Math.max(...scheduled.matches.map((match) => match.start.getTime()));
    expect(maxStart).toBeGreaterThanOrEqual(start.getTime() + threeWeeksMs);
  });

  it('supports multi-day weekly slot input via daysOfWeek on a single slot row', () => {
    const division = buildDivision();
    const field = buildField(division);
    const teams = buildTeams(4, division);

    // Jan 3, 2026 is a Saturday.
    const start = new Date(2026, 0, 3, 9, 0, 0);
    const end = new Date(2026, 0, 10, 13, 0, 0);

    const saturdaySlotDay = 5; // Monday-based index (0=Mon ... 6=Sun)
    const sundaySlotDay = 6;
    const multiDaySlot = new TimeSlot({
      id: 'slot_multi',
      dayOfWeek: saturdaySlotDay,
      startDate: new Date(2026, 0, 3),
      repeating: true,
      startTimeMinutes: 9 * 60,
      endTimeMinutes: 13 * 60,
    }) as TimeSlot & { daysOfWeek?: number[] };
    multiDaySlot.daysOfWeek = [sundaySlotDay, saturdaySlotDay];

    const league = new League({
      id: 'league_multi_day_slot',
      name: 'Weekend Multi-Day League',
      start,
      end,
      maxParticipants: 4,
      teamSignup: true,
      eventType: 'LEAGUE',
      teams,
      divisions: [division],
      officials: [],
      fields: { [field.id]: field },
      timeSlots: [multiDaySlot],
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league }, context);
    expect(scheduled.matches.length).toBe(6);

    const scheduledDays = new Set(scheduled.matches.map((match) => match.start.getDay()));
    expect(scheduledDays.has(6)).toBe(true);
    expect(scheduledDays.has(0)).toBe(true);
  });

  it('supports timeslots that reference multiple fields via scheduledFieldIds', () => {
    const division = buildDivision();
    const fieldA = buildFieldById('field_1', division);
    const fieldB = buildFieldById('field_2', division);
    const teams = buildTeams(4, division);

    const start = new Date(2026, 0, 3, 9, 0, 0);
    const end = new Date(2026, 0, 10, 13, 0, 0);

    const multiFieldSlot = new TimeSlot({
      id: 'slot_multi_field',
      dayOfWeek: 5,
      startDate: new Date(2026, 0, 3),
      repeating: true,
      startTimeMinutes: 9 * 60,
      endTimeMinutes: 13 * 60,
    }) as TimeSlot & { scheduledFieldIds?: string[] };
    multiFieldSlot.field = null;
    multiFieldSlot.scheduledFieldIds = ['field_1', 'field_2'];

    const league = new League({
      id: 'league_multi_field_slot',
      name: 'Multi-field Slot League',
      start,
      end,
      maxParticipants: 4,
      teamSignup: true,
      eventType: 'LEAGUE',
      teams,
      divisions: [division],
      officials: [],
      fields: { [fieldA.id]: fieldA, [fieldB.id]: fieldB },
      timeSlots: [multiFieldSlot],
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league }, context);
    expect(scheduled.matches.length).toBe(6);
    const usedFields = new Set(scheduled.matches.map((match) => match.field?.id).filter(Boolean));
    expect(usedFields.has('field_1')).toBe(true);
    expect(usedFields.has('field_2')).toBe(true);
  });

  it('schedules regular-season matches within each division when singleDivision is disabled', () => {
    const beginner = new Division('beginner', 'Beginner');
    const intermediate = new Division('intermediate', 'Intermediate');
    const advanced = new Division('advanced', 'Advanced');

    const fieldBeginner = buildFieldById('field_beginner', beginner);
    const fieldIntermediate = buildFieldById('field_intermediate', intermediate);
    const fieldAdvanced = buildFieldById('field_advanced', advanced);

    const teams = {
      ...buildTeamsForDivision('beginner', 2, beginner),
      ...buildTeamsForDivision('intermediate', 2, intermediate),
      ...buildTeamsForDivision('advanced', 2, advanced),
    };

    const start = new Date(2026, 0, 3, 9, 0, 0);
    const end = new Date(2026, 1, 28, 13, 0, 0);

    const timeSlots = [
      new TimeSlot({
        id: 'slot_beginner',
        dayOfWeek: 5,
        startDate: new Date(2026, 0, 3),
        repeating: true,
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 13 * 60,
        field: 'field_beginner',
        divisions: [beginner],
      }),
      new TimeSlot({
        id: 'slot_intermediate',
        dayOfWeek: 5,
        startDate: new Date(2026, 0, 3),
        repeating: true,
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 13 * 60,
        field: 'field_intermediate',
        divisions: [intermediate],
      }),
      new TimeSlot({
        id: 'slot_advanced',
        dayOfWeek: 5,
        startDate: new Date(2026, 0, 3),
        repeating: true,
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 13 * 60,
        field: 'field_advanced',
        divisions: [advanced],
      }),
    ];

    const league = new League({
      id: 'league_multi_division_regular_season',
      name: 'Multi Division League',
      start,
      end,
      maxParticipants: 6,
      teamSignup: true,
      eventType: 'LEAGUE',
      singleDivision: false,
      teams,
      divisions: [beginner, intermediate, advanced],
      officials: [],
      fields: {
        [fieldBeginner.id]: fieldBeginner,
        [fieldIntermediate.id]: fieldIntermediate,
        [fieldAdvanced.id]: fieldAdvanced,
      },
      timeSlots,
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league }, context);
    expect(scheduled.matches.length).toBe(3);

    const divisionCounts = new Map<string, number>();
    for (const match of scheduled.matches) {
      const team1Division = match.team1?.division.id;
      const team2Division = match.team2?.division.id;
      expect(team1Division).toBeTruthy();
      expect(team2Division).toBeTruthy();
      expect(team1Division).toBe(team2Division);
      expect(match.division.id).toBe(team1Division);
      divisionCounts.set(match.division.id, (divisionCounts.get(match.division.id) ?? 0) + 1);
    }

    expect(divisionCounts.get('beginner')).toBe(1);
    expect(divisionCounts.get('intermediate')).toBe(1);
    expect(divisionCounts.get('advanced')).toBe(1);
  });

  it('schedules complete regular-season Division batches in stable order while using eligible fields concurrently', () => {
    const rec = new Division('rec', 'Rec');
    const open = new Division('open', 'Open');

    const recFieldA = buildFieldById('field_rec_a', rec);
    const recFieldB = buildFieldById('field_rec_b', rec);
    const openFieldA = buildFieldById('field_open_a', open);
    const openFieldB = buildFieldById('field_open_b', open);

    const teams = {
      ...buildTeamsForDivision('rec', 4, rec),
      ...buildTeamsForDivision('open', 4, open),
    };

    const start = new Date('2026-01-05T08:00:00.000Z');
    const end = new Date('2026-01-05T20:00:00.000Z');
    const slotStart = new Date('2026-01-05T09:00:00.000Z');
    const slotEnd = new Date('2026-01-05T18:00:00.000Z');

    const league = new League({
      id: 'league_complete_division_sequence',
      name: 'Complete Division Sequence',
      start,
      end,
      maxParticipants: 8,
      teamSignup: true,
      eventType: 'LEAGUE',
      singleDivision: false,
      teams,
      divisions: [rec, open],
      officials: [],
      fields: {
        [recFieldA.id]: recFieldA,
        [recFieldB.id]: recFieldB,
        [openFieldA.id]: openFieldA,
        [openFieldB.id]: openFieldB,
      },
      timeSlots: [
        new TimeSlot({
          id: 'slot_rec_complete_division',
          dayOfWeek: 0,
          startDate: slotStart,
          endDate: slotEnd,
          repeating: false,
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 18 * 60,
          fieldIds: [recFieldA.id, recFieldB.id],
          divisions: [rec],
          timeZone: 'UTC',
        }),
        new TimeSlot({
          id: 'slot_open_complete_division',
          dayOfWeek: 0,
          startDate: slotStart,
          endDate: slotEnd,
          repeating: false,
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 18 * 60,
          fieldIds: [openFieldA.id, openFieldB.id],
          divisions: [open],
          timeZone: 'UTC',
        }),
      ],
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league }, context);
    const recMatches = scheduled.matches.filter((match) => match.division.id === rec.id);
    const openMatches = scheduled.matches.filter((match) => match.division.id === open.id);

    expect(scheduled.matches).toHaveLength(12);
    expect(recMatches).toHaveLength(6);
    expect(openMatches).toHaveLength(6);

    const latestRecEnd = Math.max(...recMatches.map((match) => match.end.getTime()));
    const earliestOpenStart = Math.min(...openMatches.map((match) => match.start.getTime()));
    expect(latestRecEnd).toBeLessThanOrEqual(earliestOpenStart);

    const fieldsByRecStart = new Map<number, Set<string>>();
    for (const match of recMatches) {
      const fieldId = match.field?.id;
      if (!fieldId) continue;
      const fieldsAtStart = fieldsByRecStart.get(match.start.getTime()) ?? new Set<string>();
      fieldsAtStart.add(fieldId);
      fieldsByRecStart.set(match.start.getTime(), fieldsAtStart);
    }
    expect([...fieldsByRecStart.values()].some((fieldIds) => fieldIds.size > 1)).toBe(true);
  });

  it('distributes placeholder teams across divisions when singleDivision is disabled', () => {
    const beginner = new Division('beginner', 'Beginner');
    const intermediate = new Division('intermediate', 'Intermediate');
    const advanced = new Division('advanced', 'Advanced');

    const fieldBeginner = buildFieldById('field_beginner', beginner);
    const fieldIntermediate = buildFieldById('field_intermediate', intermediate);
    const fieldAdvanced = buildFieldById('field_advanced', advanced);

    const start = new Date(2026, 0, 3, 9, 0, 0);
    const end = new Date(2026, 1, 28, 13, 0, 0);

    const timeSlots = [
      new TimeSlot({
        id: 'slot_beginner_empty',
        dayOfWeek: 5,
        startDate: new Date(2026, 0, 3),
        repeating: true,
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 13 * 60,
        field: 'field_beginner',
        divisions: [beginner],
      }),
      new TimeSlot({
        id: 'slot_intermediate_empty',
        dayOfWeek: 5,
        startDate: new Date(2026, 0, 3),
        repeating: true,
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 13 * 60,
        field: 'field_intermediate',
        divisions: [intermediate],
      }),
      new TimeSlot({
        id: 'slot_advanced_empty',
        dayOfWeek: 5,
        startDate: new Date(2026, 0, 3),
        repeating: true,
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 13 * 60,
        field: 'field_advanced',
        divisions: [advanced],
      }),
    ];

    const league = new League({
      id: 'league_multi_division_placeholders',
      name: 'Multi Division Placeholders League',
      start,
      end,
      maxParticipants: 6,
      teamSignup: true,
      eventType: 'LEAGUE',
      singleDivision: false,
      teams: {},
      divisions: [beginner, intermediate, advanced],
      officials: [],
      fields: {
        [fieldBeginner.id]: fieldBeginner,
        [fieldIntermediate.id]: fieldIntermediate,
        [fieldAdvanced.id]: fieldAdvanced,
      },
      timeSlots,
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league }, context);
    expect(scheduled.matches.length).toBe(3);

    const divisionCounts = new Map<string, number>();
    for (const match of scheduled.matches) {
      divisionCounts.set(match.division.id, (divisionCounts.get(match.division.id) ?? 0) + 1);
    }

    expect(divisionCounts.get('beginner')).toBe(1);
    expect(divisionCounts.get('intermediate')).toBe(1);
    expect(divisionCounts.get('advanced')).toBe(1);
  });

  it('uses division max participants for placeholder capacity in multi-division leagues', () => {
    const beginner = new Division('beginner', 'Beginner', [], null, 4);
    const advanced = new Division('advanced', 'Advanced', [], null, 2);

    const fieldBeginner = buildFieldById('field_beginner_targeted', beginner);
    const fieldAdvanced = buildFieldById('field_advanced_targeted', advanced);

    const start = new Date(2026, 0, 3, 9, 0, 0);
    const end = new Date(2026, 2, 31, 21, 0, 0);

    const league = new League({
      id: 'league_multi_division_capacity_targets',
      name: 'Division Capacity Targets League',
      start,
      end,
      maxParticipants: 40,
      teamSignup: true,
      eventType: 'LEAGUE',
      singleDivision: false,
      teams: {},
      divisions: [beginner, advanced],
      officials: [],
      fields: {
        [fieldBeginner.id]: fieldBeginner,
        [fieldAdvanced.id]: fieldAdvanced,
      },
      timeSlots: [
        new TimeSlot({
          id: 'slot_beginner_targeted',
          dayOfWeek: 5,
          startDate: new Date(2026, 0, 3),
          repeating: true,
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 13 * 60,
          field: fieldBeginner.id,
          divisions: [beginner],
        }),
        new TimeSlot({
          id: 'slot_advanced_targeted',
          dayOfWeek: 5,
          startDate: new Date(2026, 0, 3),
          repeating: true,
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 13 * 60,
          field: fieldAdvanced.id,
          divisions: [advanced],
        }),
      ],
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league }, context);
    expect(scheduled.matches.length).toBe(7);

    const divisionCounts = new Map<string, number>();
    for (const match of scheduled.matches) {
      divisionCounts.set(match.division.id, (divisionCounts.get(match.division.id) ?? 0) + 1);
    }

    expect(divisionCounts.get('beginner')).toBe(6);
    expect(divisionCounts.get('advanced')).toBe(1);
  });

  it('only yields missing-team league matches for divisions below configured capacity', () => {
    const rec = new Division('rec_capacity', 'Rec Capacity', [], null, 4);
    const open = new Division('open_capacity', 'Open Capacity', [], null, 4);
    const fieldRec = buildFieldById('field_rec_capacity', rec);
    const fieldOpen = buildFieldById('field_open_capacity', open);

    const teams = {
      ...buildTeamsForDivision('rec_capacity', 3, rec),
      ...buildTeamsForDivision('open_capacity', 4, open),
    };

    const league = new League({
      id: 'league_capacity_missing_team_rule',
      name: 'League Capacity Missing Team Rule',
      start: new Date(2026, 0, 5, 8, 0, 0),
      end: new Date(2026, 2, 30, 22, 0, 0),
      noFixedEndDateTime: false,
      maxParticipants: 8,
      teamSignup: true,
      eventType: 'LEAGUE',
      singleDivision: false,
      teams,
      divisions: [rec, open],
      officials: [],
      fields: {
        [fieldRec.id]: fieldRec,
        [fieldOpen.id]: fieldOpen,
      },
      timeSlots: [
        new TimeSlot({
          id: 'slot_rec_capacity',
          dayOfWeek: 0,
          startDate: new Date(2026, 0, 5),
          repeating: true,
          startTimeMinutes: 8 * 60,
          endTimeMinutes: 20 * 60,
          field: fieldRec.id,
          divisions: [rec],
        }),
        new TimeSlot({
          id: 'slot_open_capacity',
          dayOfWeek: 0,
          startDate: new Date(2026, 0, 5),
          repeating: true,
          startTimeMinutes: 8 * 60,
          endTimeMinutes: 20 * 60,
          field: fieldOpen.id,
          divisions: [open],
        }),
      ],
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      doubleElimination: false,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league }, context);
    const recMatches = scheduled.matches.filter((match) => match.division.id === rec.id);
    const openMatches = scheduled.matches.filter((match) => match.division.id === open.id);

    const involvesPlaceholder = (match: (typeof scheduled.matches)[number]) => (
      (match.team1?.captainId ?? '').trim().length === 0 || (match.team2?.captainId ?? '').trim().length === 0
    );

    expect(recMatches.some(involvesPlaceholder)).toBe(true);
    expect(openMatches.some(involvesPlaceholder)).toBe(false);
  });

  it('uses per-division playoff team count when divisions are separate', () => {
    const rec = new Division('rec', 'Rec', [], null, 4, 3);
    const open = new Division('open', 'Open', [], null, 4, 4);
    const fieldRec = buildFieldById('field_rec_playoff_counts', rec);
    const fieldOpen = buildFieldById('field_open_playoff_counts', open);

    const start = new Date(2026, 0, 5, 8, 0, 0); // Monday
    const end = new Date(2026, 0, 26, 22, 0, 0);

    const league = new League({
      id: 'league_per_division_playoff_count',
      name: 'Per Division Playoff Count',
      start,
      end,
      noFixedEndDateTime: false,
      maxParticipants: 8,
      teamSignup: true,
      eventType: 'LEAGUE',
      singleDivision: false,
      teams: {},
      divisions: [rec, open],
      officials: [],
      fields: { [fieldRec.id]: fieldRec, [fieldOpen.id]: fieldOpen },
      timeSlots: [
        new TimeSlot({
          id: 'slot_rec_playoff_counts',
          dayOfWeek: 0,
          startDate: new Date(2026, 0, 5),
          repeating: true,
          startTimeMinutes: 8 * 60,
          endTimeMinutes: 20 * 60,
          field: fieldRec.id,
          divisions: [rec],
        }),
        new TimeSlot({
          id: 'slot_open_playoff_counts',
          dayOfWeek: 0,
          startDate: new Date(2026, 0, 5),
          repeating: true,
          startTimeMinutes: 8 * 60,
          endTimeMinutes: 20 * 60,
          field: fieldOpen.id,
          divisions: [open],
        }),
      ],
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: true,
      playoffTeamCount: 10,
      doubleElimination: false,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league }, context);
    expect(scheduled.matches.length).toBe(17);

    const divisionCounts = new Map<string, number>();
    for (const match of scheduled.matches) {
      divisionCounts.set(match.division.id, (divisionCounts.get(match.division.id) ?? 0) + 1);
    }

    expect(divisionCounts.get('rec')).toBe(8);
    expect(divisionCounts.get('open')).toBe(9);
  });

  it('uses each league division playoff config for non-split multi-division playoffs', () => {
    const rec = new Division(
      'rec',
      'Rec',
      [],
      null,
      4,
      4,
      'LEAGUE',
      [],
      null,
      null,
      null,
      {
        doubleElimination: false,
        winnerSetCount: 3,
        loserSetCount: 1,
        winnerBracketPointsToVictory: [25, 25, 15],
        loserBracketPointsToVictory: [25],
        prize: '',
        fieldCount: 1,
        restTimeMinutes: 7,
        setDurationMinutes: 10,
      },
    );
    const open = new Division(
      'open',
      'Open',
      [],
      null,
      4,
      4,
      'LEAGUE',
      [],
      null,
      null,
      null,
      {
        doubleElimination: false,
        winnerSetCount: 1,
        loserSetCount: 1,
        winnerBracketPointsToVictory: [21],
        loserBracketPointsToVictory: [21],
        prize: '',
        fieldCount: 1,
        restTimeMinutes: 19,
        setDurationMinutes: 15,
      },
    );
    const fieldRec = buildFieldById('field_rec_playoff_config', rec);
    const fieldOpen = buildFieldById('field_open_playoff_config', open);
    const teams = {
      ...buildTeamsForDivision('rec', 4, rec),
      ...buildTeamsForDivision('open', 4, open),
    };

    const league = new League({
      id: 'league_per_division_playoff_config',
      name: 'Per Division Playoff Config',
      start: new Date(2026, 0, 5, 8, 0, 0),
      end: new Date(2026, 0, 26, 22, 0, 0),
      noFixedEndDateTime: false,
      maxParticipants: 8,
      teamSignup: true,
      eventType: 'LEAGUE',
      singleDivision: false,
      teams,
      divisions: [rec, open],
      officials: [],
      fields: { [fieldRec.id]: fieldRec, [fieldOpen.id]: fieldOpen },
      timeSlots: [
        new TimeSlot({
          id: 'slot_rec_playoff_config',
          dayOfWeek: 0,
          startDate: new Date(2026, 0, 5),
          repeating: true,
          startTimeMinutes: 8 * 60,
          endTimeMinutes: 20 * 60,
          field: fieldRec.id,
          divisions: [rec],
        }),
        new TimeSlot({
          id: 'slot_open_playoff_config',
          dayOfWeek: 0,
          startDate: new Date(2026, 0, 5),
          repeating: true,
          startTimeMinutes: 8 * 60,
          endTimeMinutes: 20 * 60,
          field: fieldOpen.id,
          divisions: [open],
        }),
      ],
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: true,
      playoffTeamCount: 4,
      doubleElimination: false,
      usesSets: true,
      matchDurationMinutes: 60,
      setDurationMinutes: 20,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league }, context);
    const playoffMatches = scheduled.matches.filter((match) => isPlayoffMatch(match));
    const recPlayoffMatches = playoffMatches.filter((match) => match.division.id === rec.id);
    const openPlayoffMatches = playoffMatches.filter((match) => match.division.id === open.id);

    expect(recPlayoffMatches).toHaveLength(3);
    expect(openPlayoffMatches).toHaveLength(3);
    expect(recPlayoffMatches.every((match) => match.bufferMs === 7 * MINUTE_MS)).toBe(true);
    expect(openPlayoffMatches.every((match) => match.bufferMs === 19 * MINUTE_MS)).toBe(true);
    expect(recPlayoffMatches.every((match) => match.team1Points.length === 3)).toBe(true);
    expect(openPlayoffMatches.every((match) => match.team1Points.length === 1)).toBe(true);
    expect(recPlayoffMatches.every((match) => match.end.getTime() - match.start.getTime() === 30 * MINUTE_MS)).toBe(true);
    expect(openPlayoffMatches.every((match) => match.end.getTime() - match.start.getTime() === 15 * MINUTE_MS)).toBe(true);
  });

  it('schedules playoffs for odd per-division team counts derived from placeholder capacity', () => {
    const rec = new Division('rec', 'Rec');
    const open = new Division('open', 'Open');
    const fieldRec = buildFieldById('field_rec', rec);
    const fieldOpen = buildFieldById('field_open', open);

    const start = new Date(2026, 0, 5, 8, 0, 0); // Monday
    const end = new Date(2026, 0, 26, 22, 0, 0);

    const league = new League({
      id: 'league_odd_division_playoffs',
      name: 'Odd Division Playoffs',
      start,
      end,
      noFixedEndDateTime: false,
      maxParticipants: 10,
      teamSignup: true,
      eventType: 'LEAGUE',
      singleDivision: false,
      teams: {},
      divisions: [rec, open],
      officials: [],
      fields: { [fieldRec.id]: fieldRec, [fieldOpen.id]: fieldOpen },
      timeSlots: [
        new TimeSlot({
          id: 'slot_rec',
          dayOfWeek: 0,
          startDate: new Date(2026, 0, 5),
          repeating: true,
          startTimeMinutes: 8 * 60,
          endTimeMinutes: 20 * 60,
          field: fieldRec.id,
          divisions: [rec],
        }),
        new TimeSlot({
          id: 'slot_open',
          dayOfWeek: 0,
          startDate: new Date(2026, 0, 5),
          repeating: true,
          startTimeMinutes: 8 * 60,
          endTimeMinutes: 20 * 60,
          field: fieldOpen.id,
          divisions: [open],
        }),
      ],
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: true,
      playoffTeamCount: 10,
      doubleElimination: false,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league }, context);
    expect(scheduled.matches.length).toBe(28);
    expect(scheduled.matches.every((match) => match.division.id === 'rec' || match.division.id === 'open')).toBe(true);
  });

  it('places split playoff matches after the regular-season Division batch completes', () => {
    const mixedAge = new Division(
      'mixed_age',
      'Mixed Age',
      [],
      null,
      4,
      4,
      'LEAGUE',
      ['mixed_age_playoff', 'mixed_age_playoff', 'mixed_age_playoff', 'mixed_age_playoff'],
    );
    const mixedAgePlayoff = new Division('mixed_age_playoff', 'Mixed Age Playoff', [], null, 4, null, 'PLAYOFF');
    const fieldRegular = buildFieldById('field_mixed_age_regular', mixedAge);
    const fieldPlayoff = buildFieldById('field_mixed_age_playoff', mixedAgePlayoff);
    const teams = buildTeams(4, mixedAge);

    const league = new League({
      id: 'league_split_playoff_division_timeslots',
      name: 'Split Playoff Division Timeslots',
      start: new Date(2026, 0, 5, 8, 0, 0),
      end: new Date(2026, 2, 30, 22, 0, 0),
      noFixedEndDateTime: false,
      maxParticipants: 4,
      teamSignup: true,
      eventType: 'LEAGUE',
      singleDivision: false,
      teams,
      divisions: [mixedAge],
      playoffDivisions: [mixedAgePlayoff],
      splitLeaguePlayoffDivisions: true,
      officials: [],
      fields: {
        [fieldRegular.id]: fieldRegular,
        [fieldPlayoff.id]: fieldPlayoff,
      },
      timeSlots: [
        new TimeSlot({
          id: 'slot_mixed_age_regular',
          dayOfWeek: 0,
          startDate: new Date(2026, 0, 5),
          repeating: true,
          startTimeMinutes: 8 * 60,
          endTimeMinutes: 20 * 60,
          field: fieldRegular.id,
          divisions: [mixedAge],
        }),
        new TimeSlot({
          id: 'slot_mixed_age_playoff',
          dayOfWeek: 0,
          startDate: new Date(2026, 0, 5),
          repeating: true,
          startTimeMinutes: 8 * 60,
          endTimeMinutes: 20 * 60,
          field: fieldPlayoff.id,
          divisions: [mixedAgePlayoff],
        }),
      ],
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: true,
      playoffTeamCount: 3,
      doubleElimination: false,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league }, context);
    const regularMatches = scheduled.matches.filter((match) => match.division.id === mixedAge.id);
    const playoffMatches = scheduled.matches.filter((match) => match.division.id === mixedAgePlayoff.id);

    expect(regularMatches.length).toBeGreaterThan(0);
    expect(regularMatches.every((match) => Boolean(match.team1 && match.team2))).toBe(true);
    expect(playoffMatches.length).toBeGreaterThan(0);
    expect(playoffMatches.every((match) => match.field?.id === fieldPlayoff.id)).toBe(true);
    const latestRegularEnd = Math.max(...regularMatches.map((match) => match.end.getTime()));
    const earliestPlayoffStart = Math.min(...playoffMatches.map((match) => match.start.getTime()));
    expect(earliestPlayoffStart).toBeGreaterThanOrEqual(latestRegularEnd);
  });

  it('reuses mapped regular-season slots for split playoffs when explicit playoff slots are missing', () => {
    const mixedAge = new Division(
      'mixed_age_mapped_slots',
      'Mixed Age',
      [],
      null,
      8,
      8,
      'LEAGUE',
      [
        'mixed_age_playoff_mapped_slots',
        'mixed_age_playoff_mapped_slots',
        'mixed_age_playoff_mapped_slots',
        'mixed_age_playoff_mapped_slots',
        'mixed_age_playoff_mapped_slots',
        'mixed_age_playoff_mapped_slots',
        'mixed_age_playoff_mapped_slots',
        'mixed_age_playoff_mapped_slots',
      ],
    );
    const mixedAgePlayoff = new Division('mixed_age_playoff_mapped_slots', 'Mixed Age Playoff', [], null, 8, null, 'PLAYOFF');
    const fieldRegular = buildFieldById('field_mixed_age_regular_mapped', mixedAge);
    const teams = buildTeams(8, mixedAge);

    const league = new League({
      id: 'league_split_playoff_mapped_slot_fallback',
      name: 'Split Playoff Mapped Slot Fallback',
      start: new Date(2026, 0, 5, 8, 0, 0),
      end: new Date(2026, 2, 30, 22, 0, 0),
      noFixedEndDateTime: false,
      maxParticipants: 8,
      teamSignup: true,
      eventType: 'LEAGUE',
      singleDivision: false,
      teams,
      divisions: [mixedAge],
      playoffDivisions: [mixedAgePlayoff],
      splitLeaguePlayoffDivisions: true,
      officials: [],
      fields: {
        [fieldRegular.id]: fieldRegular,
      },
      timeSlots: [
        new TimeSlot({
          id: 'slot_mixed_age_regular_mapped',
          dayOfWeek: 0,
          startDate: new Date(2026, 0, 5),
          repeating: true,
          startTimeMinutes: 8 * 60,
          endTimeMinutes: 20 * 60,
          field: fieldRegular.id,
          divisions: [mixedAge],
        }),
      ],
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: true,
      playoffTeamCount: 3,
      doubleElimination: false,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league }, context);
    const playoffMatches = scheduled.matches.filter((match) => match.division.id === mixedAgePlayoff.id);

    expect(playoffMatches.length).toBeGreaterThan(0);
    expect(playoffMatches.every((match) => match.field?.id === fieldRegular.id)).toBe(true);
  });

  it('ignores persisted playoff seeds when validating split league team assignments', () => {
    const open = new Division(
      'open_with_persisted_playoff_seeds',
      'Open',
      [],
      null,
      8,
      8,
      'LEAGUE',
      [
        'gold_with_persisted_seeds',
        'silver_with_persisted_seeds',
        'gold_with_persisted_seeds',
        'silver_with_persisted_seeds',
        'gold_with_persisted_seeds',
        'silver_with_persisted_seeds',
        'gold_with_persisted_seeds',
        'silver_with_persisted_seeds',
      ],
    );
    const gold = new Division(
      'gold_with_persisted_seeds',
      'Gold',
      [],
      null,
      4,
      null,
      'PLAYOFF',
    );
    const silver = new Division(
      'silver_with_persisted_seeds',
      'Silver',
      [],
      null,
      4,
      null,
      'PLAYOFF',
    );
    const registeredTeams = buildTeamsForDivision('registered', 8, open);
    open.teamIds = Object.keys(registeredTeams);
    const persistedPlayoffSeeds: Record<string, Team> = {};
    for (const division of [gold, silver]) {
      for (let seed = 1; seed <= 4; seed += 1) {
        const safeDivisionId = division.id
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-');
        const id = `playoff-${safeDivisionId}-${seed}`;
        persistedPlayoffSeeds[id] = new Team({
          id,
          captainId: '',
          kind: 'PLACEHOLDER',
          division: open,
          name: `Seed ${seed}`,
          matches: [],
        });
        division.teamIds.push(id);
      }
    }
    const teams = {
      ...registeredTeams,
      ...persistedPlayoffSeeds,
    };
    const regularField = buildFieldById('field_open_with_persisted_seeds', open);
    const goldField = buildFieldById('field_gold_with_persisted_seeds', gold);
    const silverField = buildFieldById('field_silver_with_persisted_seeds', silver);
    const league = new League({
      id: 'league_with_persisted_playoff_seeds',
      name: 'League With Persisted Playoff Seeds',
      start: new Date(2026, 0, 5, 8, 0, 0),
      end: new Date(2026, 2, 30, 22, 0, 0),
      noFixedEndDateTime: false,
      maxParticipants: 8,
      teamSignup: true,
      eventType: 'LEAGUE',
      singleDivision: false,
      teams,
      registeredTeamIds: [],
      divisions: [open],
      playoffDivisions: [gold, silver],
      splitLeaguePlayoffDivisions: true,
      officials: [],
      fields: {
        [regularField.id]: regularField,
        [goldField.id]: goldField,
        [silverField.id]: silverField,
      },
      timeSlots: [
        new TimeSlot({
          id: 'slot_open_with_persisted_seeds',
          dayOfWeek: 0,
          startDate: new Date(2026, 0, 5),
          repeating: true,
          startTimeMinutes: 8 * 60,
          endTimeMinutes: 20 * 60,
          field: regularField.id,
          divisions: [open],
        }),
        new TimeSlot({
          id: 'slot_gold_with_persisted_seeds',
          dayOfWeek: 1,
          startDate: new Date(2026, 0, 5),
          repeating: true,
          startTimeMinutes: 8 * 60,
          endTimeMinutes: 20 * 60,
          field: goldField.id,
          divisions: [gold],
        }),
        new TimeSlot({
          id: 'slot_silver_with_persisted_seeds',
          dayOfWeek: 1,
          startDate: new Date(2026, 0, 5),
          repeating: true,
          startTimeMinutes: 8 * 60,
          endTimeMinutes: 20 * 60,
          field: silverField.id,
          divisions: [silver],
        }),
      ],
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: true,
      playoffTeamCount: 8,
      doubleElimination: false,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent(
      { event: league, includePlaceholderTeams: true },
      context,
    );
    const goldMatches = scheduled.matches.filter((match) => match.division.id === gold.id);
    const silverMatches = scheduled.matches.filter((match) => match.division.id === silver.id);

    expect(scheduled.matches).toHaveLength(34);
    expect(goldMatches).toHaveLength(3);
    expect(silverMatches).toHaveLength(3);
  });

  it('fails fast when split playoffs are enabled without playoff divisions', () => {
    const mixedAge = new Division('mixed_age_missing_split', 'Mixed Age Missing Split', [], null, 4, 2, 'LEAGUE');
    const fieldRegular = buildFieldById('field_mixed_age_missing_split_regular', mixedAge);
    const teams = buildTeams(4, mixedAge);

    const league = new League({
      id: 'league_split_playoff_missing_divisions',
      name: 'Split Playoff Missing Divisions',
      start: new Date(2026, 0, 5, 8, 0, 0),
      end: new Date(2026, 2, 30, 22, 0, 0),
      noFixedEndDateTime: false,
      maxParticipants: 4,
      teamSignup: true,
      eventType: 'LEAGUE',
      singleDivision: false,
      teams,
      divisions: [mixedAge],
      playoffDivisions: [],
      splitLeaguePlayoffDivisions: true,
      officials: [],
      fields: {
        [fieldRegular.id]: fieldRegular,
      },
      timeSlots: [
        new TimeSlot({
          id: 'slot_mixed_age_missing_split_regular',
          dayOfWeek: 0,
          startDate: new Date(2026, 0, 5),
          repeating: true,
          startTimeMinutes: 8 * 60,
          endTimeMinutes: 20 * 60,
          field: fieldRegular.id,
          divisions: [mixedAge],
        }),
      ],
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: true,
      playoffTeamCount: 3,
      doubleElimination: false,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    expect(() => scheduleEvent({ event: league }, context)).toThrow(
      'Split playoff divisions are enabled but no playoff divisions are configured',
    );
  });

  it('schedules split playoff divisions in stable order when they share the same playoff window', () => {
    const mixedAge = new Division(
      'mixed_age_sequence',
      'Mixed Age',
      [],
      null,
      8,
      8,
      'LEAGUE',
      [
        'mixed_age_playoff_a',
        'mixed_age_playoff_a',
        'mixed_age_playoff_a',
        'mixed_age_playoff_a',
        'mixed_age_playoff_b',
        'mixed_age_playoff_b',
        'mixed_age_playoff_b',
        'mixed_age_playoff_b',
      ],
    );
    const playoffA = new Division('mixed_age_playoff_a', 'Mixed Age Playoff A', [], null, 4, null, 'PLAYOFF');
    const playoffB = new Division('mixed_age_playoff_b', 'Mixed Age Playoff B', [], null, 4, null, 'PLAYOFF');
    const fieldRegular = buildFieldById('field_mixed_age_regular_sequence', mixedAge);
    const fieldPlayoffA = buildFieldById('field_mixed_age_playoff_a_sequence', playoffA);
    const fieldPlayoffB = buildFieldById('field_mixed_age_playoff_b_sequence', playoffB);
    const teams = buildTeams(8, mixedAge);

    const league = new League({
      id: 'league_split_playoff_sequence',
      name: 'Split Playoff Stable Sequence',
      start: new Date(2026, 0, 5, 8, 0, 0),
      end: new Date(2026, 2, 30, 22, 0, 0),
      noFixedEndDateTime: false,
      maxParticipants: 8,
      teamSignup: true,
      eventType: 'LEAGUE',
      singleDivision: false,
      teams,
      divisions: [mixedAge],
      playoffDivisions: [playoffA, playoffB],
      splitLeaguePlayoffDivisions: true,
      officials: [],
      fields: {
        [fieldRegular.id]: fieldRegular,
        [fieldPlayoffA.id]: fieldPlayoffA,
        [fieldPlayoffB.id]: fieldPlayoffB,
      },
      timeSlots: [
        new TimeSlot({
          id: 'slot_mixed_age_regular_sequence',
          dayOfWeek: 0, // Monday
          startDate: new Date(2026, 0, 5),
          repeating: true,
          startTimeMinutes: 8 * 60,
          endTimeMinutes: 20 * 60,
          field: fieldRegular.id,
          divisions: [mixedAge],
        }),
        new TimeSlot({
          id: 'slot_mixed_age_playoff_a_sequence',
          dayOfWeek: 1, // Tuesday
          startDate: new Date(2026, 0, 5),
          repeating: true,
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 10 * 60,
          field: fieldPlayoffA.id,
          divisions: [playoffA],
        }),
        new TimeSlot({
          id: 'slot_mixed_age_playoff_b_sequence',
          dayOfWeek: 1, // Tuesday
          startDate: new Date(2026, 0, 5),
          repeating: true,
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 10 * 60,
          field: fieldPlayoffB.id,
          divisions: [playoffB],
        }),
      ],
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: true,
      playoffTeamCount: 3,
      doubleElimination: false,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league }, context);
    const playoffAMatches = scheduled.matches.filter((match) => match.division.id === playoffA.id);
    const playoffBMatches = scheduled.matches.filter((match) => match.division.id === playoffB.id);

    expect(playoffAMatches.length).toBeGreaterThan(0);
    expect(playoffBMatches.length).toBeGreaterThan(0);

    const firstPlayoffBStart = Math.min(...playoffBMatches.map((match) => match.start.getTime()));
    const latestPlayoffAEnd = Math.max(...playoffAMatches.map((match) => match.end.getTime()));
    expect(latestPlayoffAEnd).toBeLessThanOrEqual(firstPlayoffBStart);
  });

  it('surfaces a configuration error when selected divisions have no available fields', () => {
    const openDivision = new Division('OPEN', 'Open');
    const advancedDivision = new Division('ADVANCED', 'Advanced');
    const field = buildField(advancedDivision);
    const teams = buildTeams(4, openDivision);

    const league = new League({
      id: 'league_missing_fields',
      name: 'Missing Fields League',
      start: new Date(2026, 0, 3, 9, 0, 0),
      end: new Date(2026, 0, 10, 13, 0, 0),
      maxParticipants: 4,
      teamSignup: true,
      eventType: 'LEAGUE',
      teams,
      divisions: [openDivision],
      officials: [],
      fields: { [field.id]: field },
      timeSlots: [
        new TimeSlot({
          id: 'slot_open',
          dayOfWeek: 5,
          startDate: new Date(2026, 0, 3),
          repeating: true,
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 13 * 60,
          divisions: [advancedDivision],
        }),
      ],
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    expect(() => scheduleEvent({ event: league }, context)).toThrow(
      /no fields are available.*OPEN/i,
    );
  });

  it('surfaces division names (not ids) in no-field scheduling errors', () => {
    const playoffDivisionId = '1bc2cc2d-0ef5-4b83-839b-dcce8e7e0bd3__division__playoff_1';
    const playoffDivision = new Division(playoffDivisionId, 'Playoff Division 1');
    const advancedDivision = new Division('ADVANCED', 'Advanced');
    const field = buildField(advancedDivision);
    const teams = buildTeams(4, playoffDivision);

    const league = new League({
      id: 'league_missing_fields_named',
      name: 'Missing Fields Named League',
      start: new Date(2026, 0, 3, 9, 0, 0),
      end: new Date(2026, 0, 10, 13, 0, 0),
      maxParticipants: 4,
      teamSignup: true,
      eventType: 'LEAGUE',
      teams,
      divisions: [playoffDivision],
      officials: [],
      fields: { [field.id]: field },
      timeSlots: [
        new TimeSlot({
          id: 'slot_named',
          dayOfWeek: 5,
          startDate: new Date(2026, 0, 3),
          repeating: true,
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 13 * 60,
          divisions: [advancedDivision],
        }),
      ],
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    try {
      scheduleEvent({ event: league }, context);
      fail('Expected scheduleEvent to throw a no-field configuration error.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain('Playoff Division 1');
      expect(message).not.toContain(playoffDivisionId);
    }
  });

  it('preserves placeholder-backed multi-division leagues through placement', () => {
    const rec = new Division('rec', 'Rec');
    const open = new Division('open', 'Open');
    const fieldRec = buildFieldById('field_rec', rec);
    const fieldOpen = buildFieldById('field_open', open);
    const start = new Date(2026, 0, 5, 8, 0, 0); // Monday
    const end = new Date(2026, 0, 26, 22, 0, 0);

    const league = new League({
      id: 'league_retry_placeholder_growth',
      name: 'Retry Placeholder Growth',
      start,
      end,
      maxParticipants: 10,
      teamSignup: true,
      eventType: 'LEAGUE',
      singleDivision: false,
      teams: {},
      divisions: [rec, open],
      officials: [],
      fields: { [fieldRec.id]: fieldRec, [fieldOpen.id]: fieldOpen },
      timeSlots: [
        new TimeSlot({
          id: 'slot_rec',
          dayOfWeek: 0,
          startDate: new Date(2026, 0, 5),
          repeating: true,
          startTimeMinutes: 8 * 60,
          endTimeMinutes: 20 * 60,
          field: fieldRec.id,
          divisions: [rec],
        }),
        new TimeSlot({
          id: 'slot_open',
          dayOfWeek: 0,
          startDate: new Date(2026, 0, 5),
          repeating: true,
          startTimeMinutes: 8 * 60,
          endTimeMinutes: 20 * 60,
          field: fieldOpen.id,
          divisions: [open],
        }),
      ],
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: true,
      playoffTeamCount: 10,
      doubleElimination: false,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league }, context);
    expect(scheduled.matches.length).toBe(28);
    const scheduledLeague = scheduled.event as League;
    const rosterTeamIds = Object.keys(scheduledLeague.teams);
    expect(rosterTeamIds).toHaveLength(20);
    expect(
      Object.values(scheduledLeague.teams).every(
        (team) =>
          String(team.kind ?? '').toUpperCase() === 'PLACEHOLDER'
          && team.captainId.trim().length === 0,
      ),
    ).toBe(true);
    expect(rosterTeamIds.filter((teamId) => teamId.startsWith('playoff-'))).toHaveLength(10);

    const isBracketMatch = (match: (typeof scheduled.matches)[number]) => Boolean(
      match.previousLeftMatch || match.previousRightMatch || match.winnerNextMatch || match.loserNextMatch,
    );
    const regularSeasonMatches = scheduled.matches.filter((match) => !isBracketMatch(match));
    const playoffMatches = scheduled.matches.filter(isBracketMatch);

    expect(regularSeasonMatches.every((match) => match.team1 && match.team2)).toBe(true);
    expect(playoffMatches.some((match) => Boolean(match.team1 && match.team2))).toBe(true);
    expect(playoffMatches.some((match) => !match.team1 && !match.team2)).toBe(true);
  });

  it('uses placeholder-backed Team-duty slots during full rebuilds', () => {
    const division = buildDivision();
    const fields = {
      field_1: buildFieldById('field_1', division),
      field_2: buildFieldById('field_2', division),
      field_3: buildFieldById('field_3', division),
    };
    const teams = buildTeams(8, division);
    const start = new Date(2026, 4, 10, 13, 0, 0); // Sunday
    const end = new Date(2026, 4, 10, 22, 0, 0);

    const league = new League({
      id: 'league_team_staffing_playoff_capacity',
      name: 'Team Staffing Playoff Capacity',
      start,
      end,
      maxParticipants: 8,
      teamSignup: true,
      eventType: 'LEAGUE',
      singleDivision: true,
      teams,
      divisions: [division],
      officials: [],
      fields,
      timeSlots: [
        new TimeSlot({
          id: 'slot_team_staffing_playoff_capacity',
          dayOfWeek: 6,
          startDate: start,
          repeating: true,
          startTimeMinutes: 13 * 60,
          endTimeMinutes: 22 * 60,
          divisions: [division],
        }),
      ],
      doTeamsOfficiate: true,
      staffingPriority: 'TEAM_COVERAGE_REQUIRED',
      gamesPerOpponent: 1,
      includePlayoffs: true,
      playoffTeamCount: 8,
      doubleElimination: false,
      usesSets: false,
      matchDurationMinutes: 20,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league, includePlaceholderTeams: true }, context);
    const playoffMatches = scheduled.matches.filter(isPlayoffMatch);
    expect(playoffMatches.length).toBeGreaterThan(0);

    const matchesByStart = new Map<number, number>();
    for (const match of playoffMatches) {
      matchesByStart.set(match.start.getTime(), (matchesByStart.get(match.start.getTime()) ?? 0) + 1);
    }

    expect(Math.max(...matchesByStart.values())).toBeLessThanOrEqual(Object.keys(fields).length);
    expect(playoffMatches.every((match) => Boolean(match.teamOfficial))).toBe(true);
  });

  it('rebuilds with registered teams only when placeholders are disabled', () => {
    const division = buildDivision();
    const field = buildField(division);
    const teams = {
      ...buildTeams(2, division),
      placeholder_1: new Team({
        id: 'placeholder_1',
        captainId: '',
        kind: 'PLACEHOLDER',
        division,
        name: 'Place Holder 3',
        matches: [],
      }),
      placeholder_2: new Team({
        id: 'placeholder_2',
        captainId: '',
        kind: 'PLACEHOLDER',
        division,
        name: 'Place Holder 4',
        matches: [],
      }),
    };

    const league = new League({
      id: 'league_without_placeholders',
      name: 'No Placeholder League',
      start: new Date('2026-01-05T08:00:00.000Z'),
      end: new Date('2026-01-05T12:00:00.000Z'),
      maxParticipants: 4,
      teamSignup: true,
      eventType: 'LEAGUE',
      teams,
      registeredTeamIds: Object.keys(teams),
      divisions: [division],
      officials: [],
      fields: { [field.id]: field },
      timeSlots: [
        new TimeSlot({
          id: 'slot_registered_only',
          dayOfWeek: 0,
          startDate: new Date('2026-01-05T00:00:00.000Z'),
          repeating: false,
          startTimeMinutes: 8 * 60,
          endTimeMinutes: 12 * 60,
          field: field.id,
          divisions: [division],
        }),
      ],
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league, includePlaceholderTeams: false }, context);
    const scheduledLeague = scheduled.event as League;

    expect(Object.keys(scheduledLeague.teams).sort()).toEqual(['team_1', 'team_2']);
    expect(scheduledLeague.registeredTeamIds.sort()).toEqual(['team_1', 'team_2']);
    expect(scheduled.matches).toHaveLength(1);
    expect(scheduled.matches[0].team1?.id).toMatch(/^team_/);
    expect(scheduled.matches[0].team2?.id).toMatch(/^team_/);
  });

  it('allows a no-placeholder rebuild to clear the schedule when fewer than two real teams remain', () => {
    const division = buildDivision();
    const field = buildField(division);
    const teams = {
      team_1: new Team({
        id: 'team_1',
        captainId: 'captain_1',
        division,
        name: 'Team 1',
        matches: [],
      }),
      placeholder_1: new Team({
        id: 'placeholder_1',
        captainId: '',
        kind: 'PLACEHOLDER',
        division,
        name: 'Place Holder 2',
        matches: [],
      }),
    };

    const league = new League({
      id: 'league_without_enough_registered_teams',
      name: 'Not Enough Registered Teams',
      start: new Date('2026-01-05T08:00:00.000Z'),
      end: new Date('2026-01-05T12:00:00.000Z'),
      maxParticipants: 2,
      teamSignup: true,
      eventType: 'LEAGUE',
      teams,
      registeredTeamIds: Object.keys(teams),
      divisions: [division],
      officials: [],
      fields: { [field.id]: field },
      timeSlots: [
        new TimeSlot({
          id: 'slot_clear_placeholders',
          dayOfWeek: 0,
          startDate: new Date('2026-01-05T00:00:00.000Z'),
          repeating: false,
          startTimeMinutes: 8 * 60,
          endTimeMinutes: 12 * 60,
          field: field.id,
          divisions: [division],
        }),
      ],
      doTeamsOfficiate: false,
      gamesPerOpponent: 1,
      includePlayoffs: false,
      playoffTeamCount: 0,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      leagueScoringConfig: { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 },
    });

    const scheduled = scheduleEvent({ event: league, includePlaceholderTeams: false }, context);
    const scheduledLeague = scheduled.event as League;

    expect(Object.keys(scheduledLeague.teams)).toEqual(['team_1']);
    expect(scheduledLeague.registeredTeamIds).toEqual(['team_1']);
    expect(scheduled.matches).toEqual([]);
  });
});
