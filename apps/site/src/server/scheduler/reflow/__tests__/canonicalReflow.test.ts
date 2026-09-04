import { Division, Match, PlayingField, Team, TimeSlot, Tournament, UserData } from '../../types';
import { planCanonicalReflow } from '../canonicalReflow';

const at = (minute: number) => new Date(Date.UTC(2026, 8, 4, 9, minute));
const checkIns = { eventCheckedInTeamIds: new Set<string>(), checkedInTeamIdsByMatch: new Map<string, Set<string>>() };

function fixture() {
  const division = new Division('open', 'Open');
  const field = new PlayingField({ id: 'f1', name: 'Court 1', divisions: [division] });
  const teams = Object.fromEntries(['Harbor', 'Summit', 'Pine', 'Falcon'].map((id) => [
    id, new Team({ id, name: id, captainId: `captain-${id}`, division }),
  ]));
  const first = new Match({ id: 'm1', matchId: 1, eventId: 'event', division, field,
    start: at(0), end: at(25), actualEnd: at(35), bufferMs: 300_000,
    team1: teams.Harbor, team2: teams.Summit });
  const second = new Match({ id: 'm2', matchId: 2, eventId: 'event', division, field,
    start: at(30), end: at(55), bufferMs: 300_000, previousLeftMatch: first,
    team1: teams.Harbor, team2: teams.Pine });
  first.winnerNextMatch = second;
  const event = new Tournament({ id: 'event', name: 'Harbor Cup', start: at(0), end: at(180),
    maxParticipants: 4, teamSignup: true, hostId: 'host', fields: { f1: field }, teams,
    divisions: [division], matches: { m1: first, m2: second }, restTimeMinutes: 5,
    eventType: 'TOURNAMENT', noFixedEndDateTime: false, scheduleEndConstraint: at(180),
    staffingPriority: 'BEST_AVAILABLE_COVERAGE' });
  return { event, first, second, field, division, teams };
}

describe('canonical Reflow', () => {
  it('keeps a running Match fixed and does not treat its past published end as a release', () => {
    const { event, first } = fixture();
    first.actualEnd = null;
    first.actualStart = at(0);
    first.status = 'IN_PROGRESS';
    const result = planCanonicalReflow({ event, changedMatchIds: ['m1'], now: at(35), checkIns,
      fieldPolicy: 'KEEP_ASSIGNED_FIELDS', blockers: [] });
    expect(result.protectedMatchIds).toContain('m1');
    expect(result.placementChanges.map((change) => [change.matchId, change.after.start])).toEqual([['m2', +at(40)]]);
    expect(first.end).toEqual(at(25));
    expect(first.actualEnd).toBeNull();
  });

  it('uses canonical windows and external blockers without changing the hydrated graph', () => {
    const { event, first, second, field, division } = fixture();
    event.timeSlots = [new TimeSlot({ id: 'slot', startDate: at(0), endDate: at(120),
      dayOfWeek: 4, repeating: false, startTimeMinutes: 540, endTimeMinutes: 660,
      timeZone: 'UTC', fieldIds: [field.id], divisions: [division] })];
    const result = planCanonicalReflow({ event, changedMatchIds: ['m1'], now: at(35), checkIns,
      fieldPolicy: 'KEEP_ASSIGNED_FIELDS', blockers: [{ fieldId: 'f1', start: at(40), end: at(65) }] });
    expect(result.status).toBe('CHANGED');
    expect(result.placementChanges).toEqual([{ matchId: 'm2',
      before: { fieldId: 'f1', start: +at(30), end: +at(55) },
      after: { fieldId: 'f1', start: +at(65), end: +at(90) } }]);
    expect(first.start).toEqual(at(0));
    expect(second.start).toEqual(at(30));
    expect(second.previousLeftMatch).toBe(first);
  });

  it('applies phase staffing, checked-in Team eligibility, and named position eligibility', () => {
    const { event, first, second, teams, division } = fixture();
    first.actualEnd = at(25);
    division.phase = 'BRACKET';
    division.phaseSettings = { BRACKET: { doTeamsOfficiate: true,
      officialPositions: [{ id: 'referee', name: 'Referee', count: 1, order: 0 }] } };
    event.staffingPriority = 'FULL_COVERAGE_REQUIRED';
    event.officials = [new UserData({ id: 'Dana' }), new UserData({ id: 'Lee' })];
    event.eventOfficials = [
      { id: 'dana-ref', userId: 'Dana', positionIds: ['referee'], fieldIds: ['f1'], isActive: true },
      { id: 'lee-score', userId: 'Lee', positionIds: ['scorer'], fieldIds: [], isActive: true },
    ];
    const result = planCanonicalReflow({ event, changedMatchIds: ['m2'], now: at(25),
      checkIns: { ...checkIns, eventCheckedInTeamIds: new Set([teams.Falcon.id]) },
      fieldPolicy: 'KEEP_ASSIGNED_FIELDS', blockers: [] });
    expect(result.status).toBe('CHANGED');
    expect(result.placementChanges).toEqual([]);
    expect(result.assignmentChanges).toEqual([expect.objectContaining({ matchId: second.id,
      after: { teamOfficialId: 'Falcon', officialAssignments: [expect.objectContaining({
        userId: 'Dana', positionId: 'referee', eventOfficialId: 'dana-ref',
      })] } })]);
    expect(second.teamOfficial).toBeNull();
  });
});
