import { Division, Match, PlayingField, Team, Tournament } from '../../src/server/scheduler/types';

export const reflowFixtureTime = (minute: number) => new Date(Date.UTC(2026, 8, 4, 9, minute));

export function createCanonicalReflowFixture(id: string, isAssignmentOnly = false) {
  const division = new Division(`${id}:division`, 'Open');
  division.phase = 'BRACKET';
  division.phaseSettings = { BRACKET: { doTeamsOfficiate: isAssignmentOnly } };
  const field = new PlayingField({ id: `${id}:field`, name: 'Court 1', divisions: [division] });
  const teams = ['Harbor', 'Summit', 'Pine', 'Falcon'].map((name) => new Team({
    id: `${id}:${name}`, name, captainId: `${id}:captain:${name}`, division,
  }));
  const first = new Match({ id: `${id}:1`, matchId: 1, eventId: id, field, division, bufferMs: 300_000,
    start: reflowFixtureTime(0), end: reflowFixtureTime(25), actualEnd: reflowFixtureTime(isAssignmentOnly ? 25 : 35),
    status: 'COMPLETED', resultStatus: 'FINAL', winnerEventTeamId: teams[0]!.id, team1: teams[0], team2: teams[1] });
  const next = new Match({ id: `${id}:2`, matchId: 2, eventId: id, field, division, bufferMs: 300_000,
    start: reflowFixtureTime(30), end: reflowFixtureTime(55), previousLeftMatch: first,
    team1: teams[0], team2: teams[2], teamOfficial: isAssignmentOnly ? teams[0] : null });
  const final = new Match({ id: `${id}:3`, matchId: 3, eventId: id, field, division, bufferMs: 300_000,
    start: reflowFixtureTime(60), end: reflowFixtureTime(85), previousLeftMatch: next, team1: teams[0], team2: teams[1] });
  first.winnerNextMatch = next;
  next.winnerNextMatch = final;
  const event = new Tournament({ id, name: 'Harbor Cup', eventType: 'TOURNAMENT', hostId: `${id}:host`,
    start: reflowFixtureTime(0), end: reflowFixtureTime(180), scheduleEndConstraint: reflowFixtureTime(180),
    noFixedEndDateTime: false, maxParticipants: 4, teamSignup: true,
    fields: { [field.id]: field }, teams: Object.fromEntries(teams.map((team) => [team.id, team])),
    divisions: [division], matches: Object.fromEntries([first, next, final].map((match) => [match.id, match])),
    restTimeMinutes: 5, doTeamsOfficiate: isAssignmentOnly,
    staffingPriority: isAssignmentOnly ? 'FULL_COVERAGE_REQUIRED' : 'BEST_AVAILABLE_COVERAGE' });
  return { event, teams, field, division, first, next, final };
}
