// Read a client-serialized request. Return a result from the canonical site planner and schemas.
import { scheduleReflowRequestSchema, scheduleReflowResultSchema } from '../src/contracts/scheduleReflow';
import { planCanonicalReflow } from '../src/server/scheduler/reflow/canonicalReflow';
import { serializeEvent, serializeMatches } from '../src/server/scheduler/serialize';
import { createCanonicalReflowFixture, reflowFixtureTime } from '../test/fixtures/scheduleReflow';
import { UserData } from '../src/server/scheduler/types';

async function main() {
  let body = '';
  for await (const chunk of process.stdin) body += chunk;
  const request = scheduleReflowRequestSchema.parse(JSON.parse(body));
  if (!['reflow-time', 'reflow-assignment', 'reflow-named'].includes(request.eventId)) throw new Error('Use a Reflow contract fixture.');
  const assignmentOnly = request.eventId !== 'reflow-time';
  const { event, teams } = createCanonicalReflowFixture(request.eventId, assignmentOnly);
  if (request.eventId === 'reflow-named') {
    const userId = `${event.id}:Dana`;
    event.officials = [new UserData({ id: userId, firstName: 'Dana', lastName: 'Kim', userName: 'DanaKim' })];
    event.officialPositions = [{ id: 'referee', name: 'Referee', count: 1, order: 0 }];
    event.eventOfficials = [{ id: `${event.id}:referee`, userId, positionIds: ['referee'], fieldIds: [], isActive: true }];
  }
  const plan = planCanonicalReflow({ event, changedMatchIds: request.changedMatchIds,
    now: reflowFixtureTime(assignmentOnly ? 25 : 35), fieldPolicy: request.fieldPolicy, blockers: [],
    checkIns: { eventCheckedInTeamIds: new Set([teams[3]!.id]), checkedInTeamIdsByMatch: new Map() } });
  for (const change of plan.placementChanges) Object.assign(event.matches[change.matchId]!, {
    start: new Date(change.after.start), end: new Date(change.after.end), field: event.fields[change.after.fieldId],
  });
  for (const change of plan.assignmentChanges) {
    const primary = change.after.officialAssignments.find((assignment) => assignment.userId);
    Object.assign(event.matches[change.matchId]!, {
      teamOfficial: change.after.teamOfficialId ? event.teams[change.after.teamOfficialId] : null,
      officialAssignments: change.after.officialAssignments,
      official: event.officials.find((official) => official.id === primary?.userId) ?? null,
      officialCheckedIn: primary?.checkedIn ?? false,
    });
  }
  const result = scheduleReflowResultSchema.parse({ ...plan, contractVersion: 1, eventId: event.id, scheduleRevision: 'fixture-revision-2',
    placementChanges: plan.placementChanges.map((change) => ({ matchId: change.matchId,
      before: { ...change.before, start: new Date(change.before.start).toISOString(), end: new Date(change.before.end).toISOString() },
      after: { ...change.after, start: new Date(change.after.start).toISOString(), end: new Date(change.after.end).toISOString() },
    })),
    graph: plan.status === 'CHANGED' ? { event: serializeEvent(event), matches: serializeMatches(Object.values(event.matches)) } : null,
  });
  process.stdout.write(JSON.stringify(result));
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
