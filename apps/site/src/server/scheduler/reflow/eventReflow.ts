import type { Prisma } from '@/generated/prisma/client';
import { scheduleReflowResultSchema, type ScheduleReflowRequest, type ScheduleReflowResult } from '@/contracts/scheduleReflow';
import { loadEventScheduleState } from '@/server/events/eventEditorSnapshot';
import { loadEventProtectedHistory } from '@/server/events/eventProtectedHistory';
import { loadFieldBlockerCatalog, materializeFieldBlockerCatalog, type PrismaLike as FieldBlockerClient } from '@/server/repositories/fieldSchedulingConflicts';
import { loadLockedScheduleEvent } from '../eventScheduleMaintenance';
import type { Tournament } from '../types';
import { planCanonicalReflow, reflowWindow } from './canonicalReflow';
import type { ReflowPlan } from './types';
import { serializeReflowResult } from './response';

export async function saveReflowDelta(tx: Prisma.TransactionClient, event: Tournament, plan: ReflowPlan, now: Date) {
  const latestScheduledEnd = () => Math.max(+event.start, ...Object.values(event.matches)
    .filter((match) => match.placementState === 'PLACED').map((match) => +match.end));
  const previousLatestEnd = latestScheduledEnd();
  const placements = new Map(plan.placementChanges.map((change) => [change.matchId, change.after]));
  const assignments = new Map(plan.assignmentChanges.map((change) => [change.matchId, change.after]));
  for (const id of [...new Set([...placements.keys(), ...assignments.keys()])].sort()) {
    const match = event.matches[id]!;
    const placement = placements.get(id);
    const staffing = assignments.get(id);
    const data: Prisma.MatchesUpdateInput = { updatedAt: now };
    if (placement) Object.assign(data, { start: new Date(placement.start), end: new Date(placement.end), fieldId: placement.fieldId });
    if (staffing) {
      const primary = staffing.officialAssignments.find((assignment) => assignment.userId !== null);
      Object.assign(data, { teamOfficialId: staffing.teamOfficialId,
        officialIds: staffing.officialAssignments.map((assignment) => ({ ...assignment })),
        officialId: primary?.userId ?? null, officialCheckedIn: primary?.checkedIn ?? false });
    }
    await tx.matches.update({ where: { id }, data });
    if (placement) {
      match.start = new Date(placement.start);
      match.end = new Date(placement.end);
      match.field = event.fields[placement.fieldId]!;
    }
    if (staffing) {
      match.teamOfficial = staffing.teamOfficialId ? event.teams[staffing.teamOfficialId]! : null;
      match.officialAssignments = staffing.officialAssignments.map((assignment) => ({ ...assignment }));
      match.official = event.officials.find((official) => official.id === data.officialId) ?? null;
      match.officialCheckedIn = data.officialCheckedIn === true;
    }
  }
  if (event.noFixedEndDateTime && plan.placementChanges.length) {
    const latest = latestScheduledEnd();
    if (latest !== previousLatestEnd) {
      event.end = new Date(latest);
      event.generatedScheduleEnd = new Date(latest);
      event.updatedAt = now;
      await tx.events.update({ where: { id: event.id }, data: { end: event.end, generatedScheduleEnd: event.generatedScheduleEnd, updatedAt: now } });
    }
  }
}

/** The caller must commit this transaction only after this function succeeds. */
export async function reflowEventSchedule(params: {
  tx: Prisma.TransactionClient;
  actor: { userId: string; isAdmin: boolean };
  request: ScheduleReflowRequest;
  now?: Date;
}): Promise<ScheduleReflowResult> {
  const { tx, actor, request } = params;
  const now = params.now ?? new Date();
  const { event, persistedEvent } = await loadLockedScheduleEvent({ tx, actor, eventId: request.eventId });
  const state = await loadEventScheduleState(persistedEvent, event.id, tx);
  if (state.revision !== request.expectedScheduleRevision) return scheduleReflowResultSchema.parse({
    contractVersion: 1, eventId: event.id, status: 'STALE', scheduleRevision: state.revision,
    affectedMatchIds: [], protectedMatchIds: [], placementChanges: [], assignmentChanges: [],
    warnings: [{ code: 'STALE', matchIds: [], message: 'The Schedule changed. Load its current revision and try again.' }],
    exploredStates: 0, graph: null,
  });
  const plan = await planStoredEventReflow(tx, event, request.changedMatchIds, now, request.fieldPolicy,
    Array.isArray(persistedEvent.fieldIds) ? persistedEvent.fieldIds : undefined);
  if (plan.status === 'CHANGED') await saveReflowDelta(tx, event, plan, now);
  const revision = plan.status === 'CHANGED'
    ? (await loadEventScheduleState({ ...persistedEvent, end: event.end, generatedScheduleEnd: event.generatedScheduleEnd,
      updatedAt: event.updatedAt ?? persistedEvent.updatedAt }, event.id, tx)).revision
    : state.revision;
  return serializeReflowResult(event, plan, revision);
}

/** The caller holds the Event and Resource locks and owns the complete transaction. */
export async function planStoredEventReflow(
  tx: Prisma.TransactionClient, event: Tournament, changedMatchIds: string[], now: Date,
  fieldPolicy: ScheduleReflowRequest['fieldPolicy'], eligibleFieldIds?: string[],
): Promise<ReflowPlan> {
  const window = reflowWindow(event, now);
  const [history, catalog] = await Promise.all([
    loadEventProtectedHistory(event.id, tx),
    loadFieldBlockerCatalog({ client: tx as unknown as FieldBlockerClient, fieldIds: Object.keys(event.fields), lowerBound: window.start, excludeEventId: event.id }),
  ]);
  const eventCheckedInTeamIds = new Set<string>();
  const checkedInTeamIdsByMatch = new Map<string, Set<string>>();
  for (const checkIn of history.checkIns) {
    if (checkIn.status !== 'CHECKED_IN') continue;
    if (!checkIn.matchId) eventCheckedInTeamIds.add(checkIn.eventTeamId);
    else {
      const ids = checkedInTeamIdsByMatch.get(checkIn.matchId) ?? new Set<string>();
      ids.add(checkIn.eventTeamId);
      checkedInTeamIdsByMatch.set(checkIn.matchId, ids);
    }
  }
  return planCanonicalReflow({ event, changedMatchIds, now, fieldPolicy, eligibleFieldIds,
    protectedHistoryIds: history.protectedMatchIds, checkIns: { eventCheckedInTeamIds, checkedInTeamIdsByMatch },
    blockers: materializeFieldBlockerCatalog(catalog, window.start, window.end) });
}
