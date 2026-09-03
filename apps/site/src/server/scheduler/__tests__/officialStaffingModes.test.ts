/** @jest-environment node */

import { OfficialStaffingPlanner } from '@/server/scheduler/officialStaffing';
import { ScheduleError, scheduleEvent, type ScheduleResult } from '@/server/scheduler/scheduleEvent';
import { rankTeamDutyCandidates } from '@/server/scheduler/teamDutyRanking';
import { Division, Match, PlayingField, Team, Tournament, UserData } from '@/server/scheduler/types';

const context = {
  log: () => {},
  error: () => {},
};

const buildDivision = () => new Division('OPEN', 'Open');

const buildField = (id: string, labelNumber: number, division: Division) => new PlayingField({
  id,
  divisions: [division],
  matches: [],
  events: [],
  rentalSlots: [],
  name: `Court ${labelNumber}`,
});

const buildTeams = (count: number, division: Division) => {
  const teams: Record<string, Team> = {};
  for (let i = 1; i <= count; i += 1) {
    const id = `team_${i}`;
    teams[id] = new Team({
      id,
      captainId: `captain_${i}`,
      division,
      name: `Team ${i}`,
      matches: [],
    });
  }
  return teams;
};

const buildTournament = (mode: 'STAFFING' | 'TEAM_STAFFING' | 'SCHEDULE' | 'OFF') => {
  const division = buildDivision();
  const fields = {
    field_1: buildField('field_1', 1, division),
    field_2: buildField('field_2', 2, division),
  };
  const official = new UserData({
    id: 'official_1',
    divisions: [division],
    matches: [],
  });

  return new Tournament({
    id: `tournament_${mode.toLowerCase()}`,
    name: `Tournament ${mode}`,
    start: new Date(2026, 0, 3, 9, 0, 0),
    end: new Date(2026, 0, 3, 13, 0, 0),
    maxParticipants: 4,
    teamSignup: true,
    eventType: 'TOURNAMENT',
    teams: buildTeams(4, division),
    divisions: [division],
    fields,
    officials: [official],
    doTeamsOfficiate: false,
    doubleElimination: false,
    usesSets: false,
    matchDurationMinutes: 60,
    restTimeMinutes: 0,
    officialSchedulingMode: mode,
    officialPositions: [
      { id: 'referee', name: 'Referee', count: 1, order: 0 },
    ],
    eventOfficials: [
      {
        id: 'event_official_1',
        userId: official.id,
        positionIds: ['referee'],
        fieldIds: [],
        isActive: true,
      },
    ],
  });
};

type StaffingPriority =
  | 'FULL_COVERAGE_REQUIRED'
  | 'TEAM_COVERAGE_REQUIRED'
  | 'OFFICIAL_COVERAGE_REQUIRED'
  | 'BEST_AVAILABLE_COVERAGE'
  | 'FULL_COVERAGE_WITH_CONFLICTS_ALLOWED';

const buildPriorityTournament = ({
  priority,
  doTeamsOfficiate,
  officialPositions = [
    { id: 'r1', name: 'R1', count: 1, order: 0 },
    { id: 'r2', name: 'R2', count: 1, order: 1 },
  ],
  officialEligibility,
  eventHours = 2,
  teamCount = 4,
}: {
  priority: StaffingPriority;
  doTeamsOfficiate: boolean;
  officialPositions?: Array<{ id: string; name: string; count: number; order: number }>;
  officialEligibility: string[][];
  eventHours?: number;
  teamCount?: number;
}) => {
  const division = buildDivision();
  const teams = buildTeams(teamCount, division);
  const fields = {
    field_1: buildField('field_1', 1, division),
    field_2: buildField('field_2', 2, division),
  };
  const officials = officialEligibility.map((_, index) => new UserData({
    id: `official_${index + 1}`,
    divisions: [division],
    matches: [],
  }));
  return new Tournament({
    id: `priority_${priority.toLowerCase()}`,
    name: priority,
    start: new Date(2026, 0, 3, 9, 0, 0),
    end: new Date(2026, 0, 3, 9 + eventHours, 0, 0),
    noFixedEndDateTime: false,
    maxParticipants: 4,
    teamSignup: true,
    eventType: 'TOURNAMENT',
    teams,
    divisions: [division],
    fields,
    officials,
    doTeamsOfficiate,
    doubleElimination: false,
    usesSets: false,
    matchDurationMinutes: 60,
    restTimeMinutes: 0,
    staffingPriority: priority,
    officialPositions,
    eventOfficials: officials.map((official, index) => ({
      id: `event_${official.id}`,
      userId: official.id,
      positionIds: officialEligibility[index],
      fieldIds: [],
      isActive: true,
    })),
  });
};

const assignmentSlots = (match: Match) => match.officialAssignments.map((assignment) => ({
  positionId: assignment.positionId,
  slotIndex: assignment.slotIndex,
  userId: assignment.userId,
  hasConflict: assignment.hasConflict,
}));

const buildPlannerMatch = (
  id: string,
  division: Division,
  field: PlayingField,
  team1: Team,
  team2: Team,
  startHour: number,
) => new Match({
  id,
  start: new Date(2026, 0, 3, startHour, 0, 0),
  end: new Date(2026, 0, 3, startHour + 1, 0, 0),
  division,
  field,
  bufferMs: 0,
  eventId: 'planner_event',
  team1,
  team2,
});

const overlappingAssignments = (scheduled: ReturnType<typeof scheduleEvent>['event']) => {
  const matches = Object.values(scheduled.matches).sort((left, right) => left.start.getTime() - right.start.getTime());
  const conflicts: Array<[string, string]> = [];
  for (let index = 0; index < matches.length; index += 1) {
    for (let compareIndex = index + 1; compareIndex < matches.length; compareIndex += 1) {
      const left = matches[index];
      const right = matches[compareIndex];
      if (left.end.getTime() <= right.start.getTime() || right.end.getTime() <= left.start.getTime()) {
        continue;
      }
      const leftUsers = new Set(
        left.officialAssignments.map((assignment) => assignment.userId).filter((userId) => typeof userId === 'string'),
      );
      const rightUsers = new Set(
        right.officialAssignments.map((assignment) => assignment.userId).filter((userId) => typeof userId === 'string'),
      );
      for (const userId of leftUsers) {
        if (rightUsers.has(userId)) {
          conflicts.push([left.id, right.id]);
        }
      }
    }
  }
  return conflicts;
};

describe('official staffing modes', () => {
  it('legacy STAFFING serializes matches only when the same official identity would overlap', () => {
    const tournament = buildTournament('STAFFING');

    const scheduled = scheduleEvent({ event: tournament }, context).event as Tournament;
    const firstRoundMatches = Object.values(scheduled.matches).filter((match) => match.winnerNextMatch);

    expect(firstRoundMatches).toHaveLength(2);
    expect(firstRoundMatches[0].end.getTime()).toBeLessThanOrEqual(firstRoundMatches[1].start.getTime());
    expect(overlappingAssignments(scheduled)).toHaveLength(0);
  });

  it('TEAM_STAFFING enforces only team-official capacity', () => {
    const division = buildDivision();
    const fields = {
      field_1: buildField('field_1', 1, division),
      field_2: buildField('field_2', 2, division),
    };
    const official = new UserData({
      id: 'official_1',
      divisions: [division],
      matches: [],
    });
    const tournament = new Tournament({
      id: 'tournament_team_staffing',
      name: 'Tournament Team Staffing',
      start: new Date(2026, 0, 3, 9, 0, 0),
      end: new Date(2026, 0, 3, 13, 0, 0),
      maxParticipants: 4,
      teamSignup: true,
      eventType: 'TOURNAMENT',
      teams: buildTeams(4, division),
      divisions: [division],
      fields,
      officials: [official],
      doTeamsOfficiate: false,
      doubleElimination: false,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      officialSchedulingMode: 'TEAM_STAFFING',
      officialPositions: [
        { id: 'referee', name: 'Referee', count: 1, order: 0 },
      ],
      eventOfficials: [
        {
          id: 'event_official_1',
          userId: official.id,
          positionIds: ['referee'],
          fieldIds: [],
          isActive: true,
        },
      ],
    });

    const scheduled = scheduleEvent({ event: tournament }, context).event as Tournament;
    const matches = Object.values(scheduled.matches);
    const firstRoundMatches = matches
      .filter((match) => match.winnerNextMatch && match.team1 && match.team2)
      .sort((left, right) => left.start.getTime() - right.start.getTime());

    expect(matches).toHaveLength(3);
    expect(matches.every((match) => match.officialAssignments.length === 1)).toBe(true);
    expect(firstRoundMatches).toHaveLength(2);
    expect(firstRoundMatches.every((match) => Boolean(match.teamOfficial))).toBe(true);
    expect(firstRoundMatches[0].end.getTime()).toBeLessThanOrEqual(firstRoundMatches[1].start.getTime());
  });

  it('legacy SCHEDULE preserves match timing and exposes unbound named slots when needed', () => {
    const tournament = buildTournament('SCHEDULE');

    const scheduled = scheduleEvent({ event: tournament }, context).event as Tournament;
    const matches = Object.values(scheduled.matches);
    const firstRoundMatches = matches.filter((match) => match.winnerNextMatch);

    expect(firstRoundMatches).toHaveLength(2);
    const distinctStartTimes = new Set(firstRoundMatches.map((match) => match.start.getTime()));
    expect(distinctStartTimes.size).toBe(1);
    expect(matches.every((match) => match.officialAssignments.length === 1)).toBe(true);
    expect(matches.some((match) => match.officialAssignments[0].userId === null)).toBe(true);
    expect(overlappingAssignments(scheduled)).toHaveLength(0);
  });

  it('SCHEDULE does not default omitted team officiating to on', () => {
    const division = buildDivision();
    const fields = {
      field_1: buildField('field_1', 1, division),
      field_2: buildField('field_2', 2, division),
    };
    const official = new UserData({
      id: 'official_1',
      divisions: [division],
      matches: [],
    });
    const tournament = new Tournament({
      id: 'tournament_schedule_omitted_team_officiating',
      name: 'Tournament Schedule Omitted Team Officiating',
      start: new Date(2026, 0, 3, 9, 0, 0),
      end: new Date(2026, 0, 3, 13, 0, 0),
      maxParticipants: 4,
      teamSignup: true,
      eventType: 'TOURNAMENT',
      teams: buildTeams(4, division),
      divisions: [division],
      fields,
      officials: [official],
      doubleElimination: false,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      officialSchedulingMode: 'SCHEDULE',
      officialPositions: [
        { id: 'referee', name: 'Referee', count: 1, order: 0 },
      ],
      eventOfficials: [
        {
          id: 'event_official_1',
          userId: official.id,
          positionIds: ['referee'],
          fieldIds: [],
          isActive: true,
        },
      ],
    });

    expect(tournament.doTeamsOfficiate).toBe(false);

    const scheduled = scheduleEvent({ event: tournament }, context).event as Tournament;
    const firstRoundMatches = Object.values(scheduled.matches).filter((match) => match.winnerNextMatch);
    const distinctStartTimes = new Set(firstRoundMatches.map((match) => match.start.getTime()));

    expect(firstRoundMatches).toHaveLength(2);
    expect(distinctStartTimes.size).toBe(1);
    expect(firstRoundMatches.every((match) => !match.teamOfficial)).toBe(true);
  });

  it('legacy OFF normalizes to conflict-allowed named Official coverage', () => {
    const tournament = buildTournament('OFF');
    const teams = Object.values(tournament.teams);
    const first = buildPlannerMatch(
      'legacy_off_first',
      tournament.divisions[0],
      tournament.fields.field_1,
      teams[0],
      teams[1],
      9,
    );
    const second = buildPlannerMatch(
      'legacy_off_second',
      tournament.divisions[0],
      tournament.fields.field_2,
      teams[2],
      teams[3],
      9,
    );
    const planner = new OfficialStaffingPlanner(tournament);

    planner.assignMatches([second, first]);

    expect(planner.priority).toBe('FULL_COVERAGE_WITH_CONFLICTS_ALLOWED');
    expect(first.officialAssignments).toEqual([
      expect.objectContaining({ userId: 'official_1', hasConflict: false }),
    ]);
    expect(second.officialAssignments).toEqual([
      expect.objectContaining({ userId: 'official_1', hasConflict: true }),
    ]);
  });

  it('balances exact position assignments across sequential matches', () => {
    const division = buildDivision();
    const field = buildField('field_1', 1, division);
    const teams = Object.values(buildTeams(4, division));
    const official1 = new UserData({ id: 'official_1', divisions: [division] });
    const official2 = new UserData({ id: 'official_2', divisions: [division] });
    const tournament = new Tournament({
      id: 'planner_fairness',
      name: 'Planner Fairness',
      start: new Date(2026, 0, 3, 9, 0, 0),
      end: new Date(2026, 0, 3, 13, 0, 0),
      maxParticipants: 4,
      teamSignup: true,
      eventType: 'TOURNAMENT',
      teams: Object.fromEntries(teams.map((team) => [team.id, team])),
      divisions: [division],
      fields: { [field.id]: field },
      officials: [official1, official2],
      doTeamsOfficiate: false,
      doubleElimination: false,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      officialSchedulingMode: 'SCHEDULE',
      officialPositions: [
        { id: 'r1', name: 'R1', count: 1, order: 0 },
        { id: 'r2', name: 'R2', count: 1, order: 1 },
      ],
      eventOfficials: [
        {
          id: 'event_official_1',
          userId: official1.id,
          positionIds: ['r1', 'r2'],
          fieldIds: [],
          isActive: true,
        },
        {
          id: 'event_official_2',
          userId: official2.id,
          positionIds: ['r1', 'r2'],
          fieldIds: [],
          isActive: true,
        },
      ],
    });
    const planner = new OfficialStaffingPlanner(tournament);
    const firstMatch = buildPlannerMatch('match_1', division, field, teams[0], teams[1], 9);
    const secondMatch = buildPlannerMatch('match_2', division, field, teams[2], teams[3], 10);

    planner.assignMatches([firstMatch, secondMatch]);

    expect(firstMatch.officialAssignments).toEqual([
      expect.objectContaining({ positionId: 'r1', userId: 'official_1' }),
      expect.objectContaining({ positionId: 'r2', userId: 'official_2' }),
    ]);
    expect(secondMatch.officialAssignments).toEqual([
      expect.objectContaining({ positionId: 'r1', userId: 'official_2' }),
      expect.objectContaining({ positionId: 'r2', userId: 'official_1' }),
    ]);
  });

  it('uses the configured match duration when a committed match is missing its end time', () => {
    const tournament = buildTournament('SCHEDULE');
    const division = tournament.divisions[0];
    const field = tournament.fields.field_1;
    const teams = Object.values(tournament.teams);
    const committed = buildPlannerMatch('committed_match', division, field, teams[0], teams[1], 9);
    committed.officialAssignments = [{
      positionId: 'referee',
      slotIndex: 0,
      holderType: 'OFFICIAL',
      userId: 'official_1',
      eventOfficialId: 'event_official_1',
      checkedIn: false,
      hasConflict: false,
    }];
    (committed as Match & { end: Date | null }).end = null;
    const overlapping = buildPlannerMatch('overlapping_match', division, field, teams[2], teams[3], 9);
    const planner = new OfficialStaffingPlanner(tournament);

    expect(() => planner.seedCommittedMatches([committed])).not.toThrow();
    planner.assignMatch(overlapping);

    expect(overlapping.officialAssignments).toEqual([
      expect.objectContaining({ positionId: 'referee', slotIndex: 0, userId: null }),
    ]);
  });

  it('honors the committed assignment buffer when evaluating the next official window', () => {
    const tournament = buildTournament('SCHEDULE');
    const division = tournament.divisions[0];
    const field = tournament.fields.field_1;
    const teams = Object.values(tournament.teams);
    const committed = buildPlannerMatch(
      'buffered_committed_match',
      division,
      field,
      teams[0],
      teams[1],
      9,
    );
    committed.bufferMs = 30 * 60 * 1000;
    committed.officialAssignments = [{
      positionId: 'referee',
      slotIndex: 0,
      holderType: 'OFFICIAL',
      userId: 'official_1',
      eventOfficialId: 'event_official_1',
      checkedIn: false,
      hasConflict: false,
    }];
    const next = buildPlannerMatch(
      'next_match',
      division,
      field,
      teams[2],
      teams[3],
      10,
    );
    const planner = new OfficialStaffingPlanner(tournament);

    planner.seedCommittedMatches([committed]);
    planner.assignMatch(next);

    expect(next.officialAssignments).toEqual([
      expect.objectContaining({ positionId: 'referee', slotIndex: 0, userId: null }),
    ]);
  });

  it('SCHEDULE keeps assignable single-position officials when another slot has no candidates', () => {
    const division = buildDivision();
    const field = buildField('field_1', 1, division);
    const teams = Object.values(buildTeams(3, division));
    const official1 = new UserData({ id: 'official_1', divisions: [division] });
    const official2 = new UserData({ id: 'official_2', divisions: [division] });
    const tournament = new Tournament({
      id: 'planner_single_position_candidates',
      name: 'Planner Single Position Candidates',
      start: new Date(2026, 0, 3, 9, 0, 0),
      end: new Date(2026, 0, 3, 10, 0, 0),
      maxParticipants: 3,
      teamSignup: true,
      eventType: 'TOURNAMENT',
      teams: Object.fromEntries(teams.map((team) => [team.id, team])),
      divisions: [division],
      fields: { [field.id]: field },
      officials: [official1, official2],
      doTeamsOfficiate: false,
      doubleElimination: false,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      officialSchedulingMode: 'SCHEDULE',
      officialPositions: [
        { id: 'r1', name: 'R1', count: 1, order: 0 },
        { id: 'r2', name: 'R2', count: 1, order: 1 },
      ],
      eventOfficials: [
        {
          id: 'event_official_1',
          userId: official1.id,
          positionIds: ['r1'],
          fieldIds: [],
          isActive: true,
        },
        {
          id: 'event_official_2',
          userId: official2.id,
          positionIds: ['r1'],
          fieldIds: [],
          isActive: true,
        },
      ],
    });
    const planner = new OfficialStaffingPlanner(tournament);
    const match = buildPlannerMatch('match_1', division, field, teams[0], teams[1], 9);

    planner.assignMatch(match);

    expect(match.officialAssignments).toHaveLength(2);
    expect(match.officialAssignments[0]).toEqual(expect.objectContaining({ positionId: 'r1' }));
    expect(['official_1', 'official_2']).toContain(match.officialAssignments[0].userId);
    expect(match.officialAssignments[1]).toEqual(expect.objectContaining({
      positionId: 'r2',
      userId: null,
    }));
  });

  it('assigns officials from position-specific pools per slot', () => {
    const division = buildDivision();
    const field = buildField('field_1', 1, division);
    const teams = Object.values(buildTeams(3, division));
    const official1 = new UserData({ id: 'official_1', divisions: [division] });
    const official2 = new UserData({ id: 'official_2', divisions: [division] });
    const tournament = new Tournament({
      id: 'planner_position_pools',
      name: 'Planner Position Pools',
      start: new Date(2026, 0, 3, 9, 0, 0),
      end: new Date(2026, 0, 3, 10, 0, 0),
      maxParticipants: 3,
      teamSignup: true,
      eventType: 'TOURNAMENT',
      teams: Object.fromEntries(teams.map((team) => [team.id, team])),
      divisions: [division],
      fields: { [field.id]: field },
      officials: [official1, official2],
      doTeamsOfficiate: false,
      doubleElimination: false,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      officialSchedulingMode: 'SCHEDULE',
      officialPositions: [
        { id: 'r1', name: 'R1', count: 1, order: 0 },
        { id: 'r2', name: 'R2', count: 1, order: 1 },
      ],
      eventOfficials: [
        {
          id: 'event_official_1',
          userId: official1.id,
          positionIds: ['r1'],
          fieldIds: [],
          isActive: true,
        },
        {
          id: 'event_official_2',
          userId: official2.id,
          positionIds: ['r2'],
          fieldIds: [],
          isActive: true,
        },
      ],
    });
    const planner = new OfficialStaffingPlanner(tournament);
    const match = buildPlannerMatch('match_1', division, field, teams[0], teams[1], 9);

    planner.assignMatch(match);

    expect(match.officialAssignments).toHaveLength(2);
    expect(match.officialAssignments).toEqual([
      expect.objectContaining({ positionId: 'r1', userId: 'official_1' }),
      expect.objectContaining({ positionId: 'r2', userId: 'official_2' }),
    ]);
  });

  it('legacy OFF maps to full coverage and still refuses one user for two positions in one match', () => {
    const division = buildDivision();
    const field = buildField('field_1', 1, division);
    const teams = Object.values(buildTeams(3, division));
    const official = new UserData({ id: 'official_1', divisions: [division] });
    const tournament = new Tournament({
      id: 'planner_off_unique_user',
      name: 'Planner OFF Uniqueness',
      start: new Date(2026, 0, 3, 9, 0, 0),
      end: new Date(2026, 0, 3, 10, 0, 0),
      maxParticipants: 3,
      teamSignup: true,
      eventType: 'TOURNAMENT',
      teams: Object.fromEntries(teams.map((team) => [team.id, team])),
      divisions: [division],
      fields: { [field.id]: field },
      officials: [official],
      doTeamsOfficiate: false,
      doubleElimination: false,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      officialSchedulingMode: 'OFF',
      officialPositions: [
        { id: 'r1', name: 'R1', count: 1, order: 0 },
        { id: 'r2', name: 'R2', count: 1, order: 1 },
      ],
      eventOfficials: [
        {
          id: 'event_official_1',
          userId: official.id,
          positionIds: ['r1', 'r2'],
          fieldIds: [],
          isActive: true,
        },
      ],
    });
    const planner = new OfficialStaffingPlanner(tournament);
    const match = buildPlannerMatch('match_1', division, field, teams[0], teams[1], 9);

    expect(() => planner.assignMatch(match)).toThrow(
      /unable to fully staff scheduled match/i,
    );
    expect(match.officialAssignments).toEqual([]);
  });

  it('does not assign a participant to officiate their own match when an unrelated official is eligible', () => {
    const division = buildDivision();
    const field = buildField('field_1', 1, division);
    const teams = Object.values(buildTeams(3, division));
    const participantOfficial = new UserData({
      id: 'official_a_participant',
      divisions: [division],
      teamIds: [teams[0].id],
    });
    const unrelatedOfficial = new UserData({
      id: 'official_z_unrelated',
      divisions: [division],
      teamIds: [],
    });
    const tournament = new Tournament({
      id: 'planner_own_match_guard',
      name: 'Planner Own Match Guard',
      start: new Date(2026, 0, 3, 9, 0, 0),
      end: new Date(2026, 0, 3, 10, 0, 0),
      maxParticipants: 3,
      teamSignup: true,
      eventType: 'TOURNAMENT',
      teams: Object.fromEntries(teams.map((team) => [team.id, team])),
      divisions: [division],
      fields: { [field.id]: field },
      officials: [participantOfficial, unrelatedOfficial],
      doTeamsOfficiate: false,
      doubleElimination: false,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      officialSchedulingMode: 'SCHEDULE',
      officialPositions: [{ id: 'referee', name: 'Referee', count: 1, order: 0 }],
      eventOfficials: [participantOfficial, unrelatedOfficial].map((official) => ({
        id: `event_${official.id}`,
        userId: official.id,
        positionIds: ['referee'],
        fieldIds: [],
        isActive: true,
      })),
    });
    const match = buildPlannerMatch('match_own_team', division, field, teams[0], teams[1], 9);

    new OfficialStaffingPlanner(tournament).assignMatch(match);

    expect(match.officialAssignments).toEqual([
      expect.objectContaining({ userId: 'official_z_unrelated' }),
    ]);
  });

  it('requires an official division membership when the user lists divisions', () => {
    const tournament = buildPriorityTournament({
      priority: 'OFFICIAL_COVERAGE_REQUIRED',
      doTeamsOfficiate: false,
      officialPositions: [{ id: 'referee', name: 'Referee', count: 1, order: 0 }],
      officialEligibility: [['referee'], ['referee']],
    });
    const division = tournament.divisions[0];
    const field = tournament.fields.field_1;
    const firstOfficial = tournament.officials[0];
    if (!division || !field || !firstOfficial) {
      throw new Error('Test fixture is incomplete.');
    }
    firstOfficial.divisions = [new Division('other', 'Other')];
    const match = buildPlannerMatch(
      'division_eligibility_match',
      division,
      field,
      Object.values(tournament.teams)[0],
      Object.values(tournament.teams)[1],
      9,
    );

    new OfficialStaffingPlanner(tournament).assignMatch(match);

    expect(match.officialAssignments).toEqual([
      expect.objectContaining({ userId: 'official_2' }),
    ]);
  });

  it('does not assign an official whose event team plays an overlapping match', () => {
    const division = buildDivision();
    const field = buildField('field_1', 1, division);
    const teams = Object.values(buildTeams(4, division));
    const overlappingParticipant = new UserData({
      id: 'official_a_overlapping_participant',
      divisions: [division],
      teamIds: [teams[2].id],
    });
    const unrelatedOfficial = new UserData({
      id: 'official_z_unrelated',
      divisions: [division],
      teamIds: [],
    });
    const tournament = new Tournament({
      id: 'planner_overlap_guard',
      name: 'Planner Overlap Guard',
      start: new Date(2026, 0, 3, 9, 0, 0),
      end: new Date(2026, 0, 3, 10, 0, 0),
      maxParticipants: 4,
      teamSignup: true,
      eventType: 'TOURNAMENT',
      teams: Object.fromEntries(teams.map((team) => [team.id, team])),
      divisions: [division],
      fields: { [field.id]: field },
      officials: [overlappingParticipant, unrelatedOfficial],
      doTeamsOfficiate: false,
      doubleElimination: false,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
      officialSchedulingMode: 'SCHEDULE',
      officialPositions: [{ id: 'referee', name: 'Referee', count: 1, order: 0 }],
      eventOfficials: [overlappingParticipant, unrelatedOfficial].map((official) => ({
        id: `event_${official.id}`,
        userId: official.id,
        positionIds: ['referee'],
        fieldIds: [],
        isActive: true,
      })),
    });
    const targetMatch = buildPlannerMatch('match_target', division, field, teams[0], teams[1], 9);
    const overlappingMatch = buildPlannerMatch('match_overlapping', division, field, teams[2], teams[3], 9);
    teams[2].matches.push(overlappingMatch);

    new OfficialStaffingPlanner(tournament).assignMatch(targetMatch);

    expect(targetMatch.officialAssignments).toEqual([
      expect.objectContaining({ userId: 'official_z_unrelated' }),
    ]);
  });

  it('uses division phase settings for official positions and Team duties', () => {
    const tournament = buildPriorityTournament({
      priority: 'OFFICIAL_COVERAGE_REQUIRED',
      doTeamsOfficiate: false,
      officialPositions: [{ id: 'event_referee', name: 'Event Referee', count: 1, order: 0 }],
      officialEligibility: [['event_referee']],
    });
    const division = tournament.divisions[0];
    const field = tournament.fields.field_1;
    const teams = Object.values(tournament.teams);
    if (!division || !field || !teams[0] || !teams[1]) {
      throw new Error('Test fixture is incomplete.');
    }
    division.phase = 'LEAGUE';
    division.phaseSettings = {
      LEAGUE: {
        officialPositions: [{
          id: 'phase_referee',
          name: 'Phase Referee',
          count: 1,
          order: 0,
        }],
        doTeamsOfficiate: true,
      },
    };
    const eventOfficial = tournament.eventOfficials[0];
    if (!eventOfficial) {
      throw new Error('Test fixture has no event official.');
    }
    eventOfficial.positionIds = ['event_referee', 'phase_referee'];
    const match = buildPlannerMatch(
      'phase_settings_match',
      division,
      field,
      teams[0],
      teams[1],
      9,
    );
    const planner = new OfficialStaffingPlanner(tournament);

    expect(planner.requiredSlotsForMatch(match).map((slot) => slot.positionId)).toEqual([
      'phase_referee',
    ]);
    expect(planner.isTeamDutyRequired(match)).toBe(true);
    planner.assignMatch(match);
    expect(assignmentSlots(match)).toEqual([
      expect.objectContaining({ positionId: 'phase_referee', userId: 'official_1' }),
    ]);
  });

  describe('canonical Staffing Priority behavior', () => {
    it.each([
      ['FULL_COVERAGE_REQUIRED', true, true, true, false],
      ['TEAM_COVERAGE_REQUIRED', true, true, false, false],
      ['OFFICIAL_COVERAGE_REQUIRED', false, false, true, false],
      ['BEST_AVAILABLE_COVERAGE', true, false, false, false],
      ['FULL_COVERAGE_WITH_CONFLICTS_ALLOWED', true, true, true, true],
    ] as const)(
      '%s exposes its Team-duty, hard-coverage, and conflict policy directly',
      (
        priority,
        requiresTeamDutySlot,
        requiresHardTeamCoverage,
        requiresHardOfficialCoverage,
        allowsOfficialAssignmentConflicts,
      ) => {
        const planner = new OfficialStaffingPlanner(buildPriorityTournament({
          priority,
          doTeamsOfficiate: false,
          officialEligibility: [['r1', 'r2']],
        }));

        expect(planner.requiresTeamDutySlot()).toBe(requiresTeamDutySlot);
        expect(planner.requiresHardTeamCoverage()).toBe(requiresHardTeamCoverage);
        expect(planner.requiresHardOfficialCoverage()).toBe(requiresHardOfficialCoverage);
        expect(planner.allowsOfficialAssignmentConflicts()).toBe(allowsOfficialAssignmentConflicts);
      },
    );

    it.each([
      ['FULL_COVERAGE_REQUIRED', true],
      ['OFFICIAL_COVERAGE_REQUIRED', false],
    ] as const)(
      '%s blocks placement when total official count is sufficient but no official is eligible for R2',
      (priority, doTeamsOfficiate) => {
        const tournament = buildPriorityTournament({
          priority,
          doTeamsOfficiate,
          officialEligibility: [['r1'], ['r1']],
          eventHours: 4,
        });

        let failure: unknown;
        try {
          scheduleEvent({ event: tournament }, context);
        } catch (error) {
          failure = error;
        }
        expect(failure).toBeInstanceOf(ScheduleError);
        expect((failure as ScheduleError).restrictingFactor).toBe('NAMED_OFFICIAL_POSITION');
      },
    );

    it('TEAM_COVERAGE_REQUIRED blocks only a Team-duty shortage in a mixed Officiating Plan', () => {
      const shortage = buildPriorityTournament({
        priority: 'TEAM_COVERAGE_REQUIRED',
        doTeamsOfficiate: true,
        officialEligibility: [['r1'], ['r1'], ['r2'], ['r2']],
        eventHours: 2,
      });
      let teamDutyFailure: unknown;
      try {
        scheduleEvent({ event: shortage }, context);
      } catch (error) {
        teamDutyFailure = error;
      }
      expect(teamDutyFailure).toBeInstanceOf(ScheduleError);
      expect((teamDutyFailure as ScheduleError).restrictingFactor).toBe('TEAM_DUTY');

      const namedPositionShortage = buildPriorityTournament({
        priority: 'TEAM_COVERAGE_REQUIRED',
        doTeamsOfficiate: true,
        officialEligibility: [['r1'], ['r1']],
        eventHours: 4,
      });
      const scheduled = scheduleEvent({ event: namedPositionShortage }, context).event as Tournament;

      expect(Object.values(scheduled.matches).every((match) => match.requiresTeamOfficial)).toBe(true);
      expect(Object.values(scheduled.matches).every((match) => match.teamOfficial)).toBe(true);
      expect(Object.values(scheduled.matches).every((match) => (
        assignmentSlots(match).some((slot) => slot.positionId === 'r2' && slot.userId === null)
      ))).toBe(true);
    });

    it('OFFICIAL_COVERAGE_REQUIRED ignores a Team-duty shortage while filling every named position', () => {
      const tournament = buildPriorityTournament({
        priority: 'OFFICIAL_COVERAGE_REQUIRED',
        doTeamsOfficiate: true,
        officialEligibility: [['r1'], ['r1'], ['r2'], ['r2']],
        eventHours: 2,
      });

      const scheduled = scheduleEvent({ event: tournament }, context).event as Tournament;
      const firstRoundMatches = Object.values(scheduled.matches).filter((match) => match.winnerNextMatch);

      expect(new Set(firstRoundMatches.map((match) => match.start.getTime())).size).toBe(1);
      expect(firstRoundMatches.some((match) => match.teamOfficial === null)).toBe(true);
      expect(Object.values(scheduled.matches).every((match) => (
        match.officialAssignments.length === 2
        && match.officialAssignments.every((assignment) => assignment.userId !== null)
      ))).toBe(true);
    });

    it('BEST_AVAILABLE_COVERAGE preserves placement and exposes both unbound Team-duty and named-position slots', () => {
      const tournament = buildPriorityTournament({
        priority: 'BEST_AVAILABLE_COVERAGE',
        doTeamsOfficiate: true,
        officialEligibility: [['r1'], ['r1']],
        eventHours: 2,
      });

      const scheduled = scheduleEvent({ event: tournament }, context).event as Tournament;
      const matches = Object.values(scheduled.matches);
      const firstRoundMatches = matches.filter((match) => match.winnerNextMatch);

      expect(matches.every((match) => match.field && match.start && match.end)).toBe(true);
      expect(new Set(firstRoundMatches.map((match) => match.start.getTime())).size).toBe(1);
      expect(matches.some((match) => match.requiresTeamOfficial && match.teamOfficial === null)).toBe(true);
      expect(matches.every((match) => (
        assignmentSlots(match).some((slot) => slot.positionId === 'r2' && slot.userId === null)
      ))).toBe(true);
    });

    it('reports unresolved Team-duty and named-position slots separately from placement failure', () => {
      const tournament = buildPriorityTournament({
        priority: 'BEST_AVAILABLE_COVERAGE',
        doTeamsOfficiate: false,
        officialEligibility: [['r1'], ['r1']],
        eventHours: 2,
      });

      const result = scheduleEvent({ event: tournament }, context) as ScheduleResult & {
        warnings?: Array<{ code: string; matchIds?: string[] }>;
      };

      expect(result.matches.every((match) => match.placementState === 'PLACED')).toBe(true);
      expect(result.warnings).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'UNRESOLVED_TEAM_DUTY',
          matchIds: expect.any(Array),
        }),
        expect.objectContaining({
          code: 'UNRESOLVED_NAMED_OFFICIAL_POSITION',
          matchIds: expect.any(Array),
        }),
      ]));
    });

    it('BEST_AVAILABLE_COVERAGE keeps every required named slot stable when only some positions are eligible', () => {
      const tournament = buildPriorityTournament({
        priority: 'BEST_AVAILABLE_COVERAGE',
        doTeamsOfficiate: false,
        officialPositions: [
          { id: 'r1', name: 'R1', count: 2, order: 0 },
          { id: 'r2', name: 'R2', count: 1, order: 1 },
        ],
        officialEligibility: [['r1'], ['r1']],
      });
      const teams = Object.values(tournament.teams);
      const match = buildPlannerMatch(
        'stable_unbound_slots',
        tournament.divisions[0],
        tournament.fields.field_1,
        teams[0],
        teams[1],
        9,
      );
      const originalPlacement = {
        fieldId: match.field?.id,
        start: match.start.getTime(),
        end: match.end.getTime(),
      };

      new OfficialStaffingPlanner(tournament).assignMatch(match);

      expect(assignmentSlots(match)).toEqual([
        { positionId: 'r1', slotIndex: 0, userId: 'official_1', hasConflict: false },
        { positionId: 'r1', slotIndex: 1, userId: 'official_2', hasConflict: false },
        { positionId: 'r2', slotIndex: 0, userId: null, hasConflict: false },
      ]);
      expect({
        fieldId: match.field?.id,
        start: match.start.getTime(),
        end: match.end.getTime(),
      }).toEqual(originalPlacement);
    });

    it('FULL_COVERAGE_WITH_CONFLICTS_ALLOWED keeps complete named coverage and marks accepted overlaps', () => {
      const tournament = buildPriorityTournament({
        priority: 'FULL_COVERAGE_WITH_CONFLICTS_ALLOWED',
        doTeamsOfficiate: false,
        officialPositions: [{ id: 'r1', name: 'R1', count: 1, order: 0 }],
        officialEligibility: [['r1']],
      });
      const teams = Object.values(tournament.teams);
      const first = buildPlannerMatch(
        'conflicts_allowed_first',
        tournament.divisions[0],
        tournament.fields.field_1,
        teams[0],
        teams[1],
        9,
      );
      const second = buildPlannerMatch(
        'conflicts_allowed_second',
        tournament.divisions[0],
        tournament.fields.field_2,
        teams[2],
        teams[3],
        9,
      );

      new OfficialStaffingPlanner(tournament).assignMatches([second, first]);

      expect(assignmentSlots(first)).toEqual([
        { positionId: 'r1', slotIndex: 0, userId: 'official_1', hasConflict: false },
      ]);
      expect(assignmentSlots(second)).toEqual([
        { positionId: 'r1', slotIndex: 0, userId: 'official_1', hasConflict: true },
      ]);
    });

    it('FULL_COVERAGE_WITH_CONFLICTS_ALLOWED still requires Team-duty coverage', () => {
      const tournament = buildPriorityTournament({
        priority: 'FULL_COVERAGE_WITH_CONFLICTS_ALLOWED',
        doTeamsOfficiate: true,
        officialEligibility: [['r1'], ['r2']],
        eventHours: 4,
      });

      expect(new OfficialStaffingPlanner(tournament).requiresHardTeamCoverage()).toBe(true);
    });
    it('FULL_COVERAGE_WITH_CONFLICTS_ALLOWED reuses an overlapping Team for Team duty', () => {
      const tournament = buildPriorityTournament({
        priority: 'FULL_COVERAGE_WITH_CONFLICTS_ALLOWED',
        doTeamsOfficiate: true,
        officialEligibility: [['r1'], ['r2']],
        eventHours: 4,
      });

      const scheduled = scheduleEvent({ event: tournament }, context).event as Tournament;
      const matches = Object.values(scheduled.matches);
      expect(matches.every((match) => match.teamOfficial)).toBe(true);
      expect(matches.some((match) => {
        const teamOfficial = match.teamOfficial;
        if (!teamOfficial) return false;
        return matches.some((other) => (
          other !== match
          && other.start < match.end
          && other.end > match.start
          && (other.team1?.id === teamOfficial.id || other.team2?.id === teamOfficial.id)
        ));
      })).toBe(true);
    });

    it('FULL_COVERAGE_REQUIRED reuses a Team for separated duties after checking activity', () => {
      const tournament = buildPriorityTournament({
        priority: 'FULL_COVERAGE_REQUIRED',
        doTeamsOfficiate: true,
        officialEligibility: [['r1'], ['r2']],
        eventHours: 8,
      });
      tournament.doubleElimination = true;

      const scheduled = scheduleEvent({ event: tournament }, context).event as Tournament;
      const matches = Object.values(scheduled.matches);
      const dutiesByTeam = new Map<string, number>();
      for (const match of matches) {
        expect(match.teamOfficial).not.toBeNull();
        expect(match.teamOfficial?.id).not.toBe(match.team1?.id);
        expect(match.teamOfficial?.id).not.toBe(match.team2?.id);
        const teamId = match.teamOfficial?.id;
        if (teamId) {
          dutiesByTeam.set(teamId, (dutiesByTeam.get(teamId) ?? 0) + 1);
        }
      }

      expect(matches.length).toBeGreaterThan(Object.keys(scheduled.teams).length);
      expect(Array.from(dutiesByTeam.values()).some((count) => count > 1)).toBe(true);
    });

    it('ranks initial Team-duty candidates by assignment count and stable Team ID', () => {
      const division = buildDivision();
      const field = buildField('ranking_field', 1, division);
      const teams = buildTeams(4, division);
      const priorMatch = buildPlannerMatch(
        'ranking_prior_match',
        division,
        field,
        teams.team_3,
        teams.team_4,
        9,
      );
      priorMatch.teamOfficial = teams.team_1;
      const target = buildPlannerMatch(
        'ranking_target_match',
        division,
        field,
        teams.team_3,
        teams.team_4,
        12,
      );

      expect(rankTeamDutyCandidates(
        [teams.team_2, teams.team_1],
        target,
        [priorMatch, target],
      ).map((team) => team.id)).toEqual(['team_2', 'team_1']);
      expect(rankTeamDutyCandidates(
        [teams.team_2, teams.team_1],
        target,
        [target],
      ).map((team) => team.id)).toEqual(['team_1', 'team_2']);
    });

    it('keeps Placeholder Teams available for Team-duty assignments', () => {
      const tournament = buildPriorityTournament({
        priority: 'TEAM_COVERAGE_REQUIRED',
        doTeamsOfficiate: true,
        officialEligibility: [['r1'], ['r2'], ['r1'], ['r2']],
        eventHours: 4,
        teamCount: 0,
      });

      const scheduled = scheduleEvent({ event: tournament }, context).event as Tournament;
      const placeholders = Object.values(scheduled.teams).filter(
        (team) => String(team.kind ?? '').toUpperCase() === 'PLACEHOLDER',
      );
      expect(placeholders.length).toBe(4);
      expect(Object.values(scheduled.matches).every((match) => (
        match.teamOfficial?.kind === 'PLACEHOLDER'
      ))).toBe(true);
    });

    it('FULL_COVERAGE_WITH_CONFLICTS_ALLOWED still requires every named position to be eligible', () => {
      const tournament = buildPriorityTournament({
        priority: 'FULL_COVERAGE_WITH_CONFLICTS_ALLOWED',
        doTeamsOfficiate: true,
        officialEligibility: [['r1'], ['r1']],
      });

      expect(() => scheduleEvent({ event: tournament }, context)).toThrow(
        /no complete position-eligible assignment exists/i,
      );
    });

    it('normalizes partial committed coverage into stable slots and reserves bound officials', () => {
      const tournament = buildPriorityTournament({
        priority: 'BEST_AVAILABLE_COVERAGE',
        doTeamsOfficiate: false,
        officialPositions: [
          { id: 'r1', name: 'R1', count: 2, order: 0 },
          { id: 'r2', name: 'R2', count: 1, order: 1 },
        ],
        officialEligibility: [['r1'], ['r1']],
      });
      const teams = Object.values(tournament.teams);
      const committed = buildPlannerMatch(
        'committed',
        tournament.divisions[0],
        tournament.fields.field_1,
        teams[0],
        teams[1],
        9,
      );
      committed.officialAssignments = [{
        positionId: 'r1',
        slotIndex: 1,
        holderType: 'OFFICIAL',
        userId: 'official_2',
        eventOfficialId: 'stale_event_official_id',
        checkedIn: true,
        hasConflict: false,
      }];
      const overlapping = buildPlannerMatch(
        'overlapping',
        tournament.divisions[0],
        tournament.fields.field_1,
        teams[2],
        teams[3],
        9,
      );
      const planner = new OfficialStaffingPlanner(tournament);

      planner.seedCommittedMatches([committed]);
      planner.assignMatch(overlapping);

      expect(committed.officialAssignments).toEqual([
        {
          positionId: 'r1',
          slotIndex: 0,
          holderType: 'OFFICIAL',
          userId: null,
          eventOfficialId: null,
          checkedIn: false,
          hasConflict: false,
        },
        {
          positionId: 'r1',
          slotIndex: 1,
          holderType: 'OFFICIAL',
          userId: 'official_2',
          eventOfficialId: 'event_official_2',
          checkedIn: true,
          hasConflict: false,
        },
        {
          positionId: 'r2',
          slotIndex: 0,
          holderType: 'OFFICIAL',
          userId: null,
          eventOfficialId: null,
          checkedIn: false,
          hasConflict: false,
        },
      ]);
      expect(assignmentSlots(overlapping)).toEqual([
        { positionId: 'r1', slotIndex: 0, userId: 'official_1', hasConflict: false },
        { positionId: 'r1', slotIndex: 1, userId: null, hasConflict: false },
        { positionId: 'r2', slotIndex: 0, userId: null, hasConflict: false },
      ]);
    });

    it('deterministically repairs conflicting committed assignments for hard coverage', () => {
      const tournament = buildPriorityTournament({
        priority: 'OFFICIAL_COVERAGE_REQUIRED',
        doTeamsOfficiate: false,
        officialPositions: [{ id: 'r1', name: 'R1', count: 1, order: 0 }],
        officialEligibility: [['r1'], ['r1']],
      });
      const teams = Object.values(tournament.teams);
      const first = buildPlannerMatch(
        'committed_a',
        tournament.divisions[0],
        tournament.fields.field_1,
        teams[0],
        teams[1],
        9,
      );
      const second = buildPlannerMatch(
        'committed_b',
        tournament.divisions[0],
        tournament.fields.field_2,
        teams[2],
        teams[3],
        9,
      );
      for (const match of [first, second]) {
        match.officialAssignments = [{
          positionId: 'r1',
          slotIndex: 0,
          holderType: 'OFFICIAL',
          userId: 'official_1',
          eventOfficialId: 'event_official_1',
          checkedIn: false,
          hasConflict: false,
        }];
      }

      new OfficialStaffingPlanner(tournament).seedCommittedMatches([second, first]);

      expect(first.officialAssignments[0]).toEqual(expect.objectContaining({
        userId: 'official_1',
        hasConflict: false,
      }));
      expect(second.officialAssignments[0]).toEqual(expect.objectContaining({
        userId: 'official_2',
        hasConflict: false,
      }));
    });

    it('marks accepted overlaps while normalizing committed conflicts-allowed coverage', () => {
      const tournament = buildPriorityTournament({
        priority: 'FULL_COVERAGE_WITH_CONFLICTS_ALLOWED',
        doTeamsOfficiate: false,
        officialPositions: [{ id: 'r1', name: 'R1', count: 1, order: 0 }],
        officialEligibility: [['r1']],
      });
      const teams = Object.values(tournament.teams);
      const first = buildPlannerMatch(
        'committed_a',
        tournament.divisions[0],
        tournament.fields.field_1,
        teams[0],
        teams[1],
        9,
      );
      const second = buildPlannerMatch(
        'committed_b',
        tournament.divisions[0],
        tournament.fields.field_2,
        teams[2],
        teams[3],
        9,
      );
      for (const match of [first, second]) {
        match.officialAssignments = [{
          positionId: 'r1',
          slotIndex: 0,
          holderType: 'OFFICIAL',
          userId: 'official_1',
          eventOfficialId: 'event_official_1',
          checkedIn: false,
          hasConflict: false,
        }];
      }

      new OfficialStaffingPlanner(tournament).seedCommittedMatches([second, first]);

      expect(first.officialAssignments[0].hasConflict).toBe(false);
      expect(second.officialAssignments[0].hasConflict).toBe(true);
    });

    it('replaces field-ineligible committed bindings with stable unbound slots', () => {
      const tournament = buildPriorityTournament({
        priority: 'BEST_AVAILABLE_COVERAGE',
        doTeamsOfficiate: false,
        officialPositions: [{ id: 'r1', name: 'R1', count: 1, order: 0 }],
        officialEligibility: [['r1']],
      });
      tournament.eventOfficials[0].fieldIds = ['field_1'];
      const teams = Object.values(tournament.teams);
      const committed = buildPlannerMatch(
        'field_ineligible',
        tournament.divisions[0],
        tournament.fields.field_2,
        teams[0],
        teams[1],
        9,
      );
      committed.officialAssignments = [{
        positionId: 'r1',
        slotIndex: 0,
        holderType: 'OFFICIAL',
        userId: 'official_1',
        eventOfficialId: 'event_official_1',
        checkedIn: false,
        hasConflict: false,
      }];

      new OfficialStaffingPlanner(tournament).seedCommittedMatches([committed]);

      expect(committed.officialAssignments).toEqual([{
        positionId: 'r1',
        slotIndex: 0,
        holderType: 'OFFICIAL',
        userId: null,
        eventOfficialId: null,
        checkedIn: false,
        hasConflict: false,
      }]);
    });
  });
});
