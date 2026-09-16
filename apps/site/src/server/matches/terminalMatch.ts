import type { Prisma } from '@/generated/prisma/client';
import { terminalMatchResultSchema, type TerminalMatchResult } from '@/contracts/terminalMatch';
import { saveMatches } from '@/server/repositories/events';
import { serializeMatches } from '@/server/scheduler/serialize';
import { planStoredEventReflow, saveReflowDelta } from '@/server/scheduler/reflow/eventReflow';
import type { Match, Tournament } from '@/server/scheduler/types';
import type { ReflowPlan } from '@/server/scheduler/reflow/types';
import { resolveMatchWinner } from '@/server/scheduler/updateMatch';
import type { TerminalMatchAction } from '@/contracts/matchUpdate';

type TerminalMatchSnapshot = ReturnType<typeof serializeMatches>[number];

export const snapshotTerminalMatches = (event: Tournament): Map<string, TerminalMatchSnapshot> => new Map(
  serializeMatches(Object.values(event.matches)).map((match) => [match.id, match]),
);

export const replayTerminalMatch = (event: Tournament, matchId: string, operationId: string): TerminalMatchResult =>
  terminalMatchResultSchema.parse({
    contractVersion: 1, operationId, eventId: event.id, matchId, status: 'REPLAYED',
    event: { id: event.id, end: event.end.toISOString(), generatedScheduleEnd: event.generatedScheduleEnd?.toISOString() ?? null },
    matches: [], affectedMatchIds: [], protectedMatchIds: [], placementChanges: [], assignmentChanges: [], warnings: [], exploredStates: 0,
  });

/** Save terminal state and Reflow in the caller's transaction. */
export async function commitTerminalMatch(params: {
  tx: Prisma.TransactionClient; event: Tournament; match: Match; before: ReadonlyMap<string, TerminalMatchSnapshot>;
  operationId: string; now: Date; action: TerminalMatchAction;
}): Promise<TerminalMatchResult> {
  const { tx, event, match, before, operationId, now } = params;
  if (match.actualStart && (match.actualEnd ?? now) < match.actualStart) {
    throw new Response('A terminal time cannot be before the Match start.', { status: 400 });
  }
  if (params.action === 'COMPLETE' || params.action === 'FORFEIT') {
    const winner = resolveMatchWinner(match);
    if (!winner) throw new Response('Complete the final segment with a valid Match winner.', { status: 409 });
    match.winnerEventTeamId = winner.id;
    match.status = 'COMPLETE';
    match.resultStatus = 'FINAL';
    match.resultType = params.action === 'FORFEIT' ? 'FORFEIT' : 'NORMAL';
    match.actualEnd = match.actualEnd ?? now;
    match.locked = true;
  } else {
    match.status = 'CANCELLED';
    match.resultStatus = 'NO_CONTEST';
    match.resultType = 'NO_CONTEST';
    match.winnerEventTeamId = null;
    match.actualEnd = match.actualEnd ?? now;
    match.locked = true;
  }
  const winner = [match.team1, match.team2].find((team) => team?.id === match.winnerEventTeamId);
  const loser = [match.team1, match.team2].find((team) => team && team.id !== winner?.id);
  if (winner && loser) match.advanceTeams(winner, loser);
  for (const next of [match.winnerNextMatch, match.loserNextMatch]) {
    if (!next) continue;
    const prior = before.get(next.id)!;
    // Advancement does not assign Team Duty. Reflow owns that assignment.
    next.teamOfficial = prior.teamOfficialId ? event.teams[prior.teamOfficialId] ?? null : null;
    const hasChangedTeams = (next.team1?.id ?? null) !== prior.team1Id || (next.team2?.id ?? null) !== prior.team2Id;
    const hasStarted = next.actualStart || next.actualEnd || next.incidents.length
      || ['IN_PROGRESS', 'COMPLETE', 'CANCELLED', 'SUSPENDED'].includes(next.status ?? '')
      || next.segments.some((segment) => segment.startedAt || segment.status === 'COMPLETE');
    if (hasChangedTeams && hasStarted) throw Response.json({ code: 'TERMINAL_DEPENDENCY_STARTED',
      error: 'Advancement would change the Teams of a Match that has started.' }, { status: 409 });
  }
  const changed = Object.values(event.matches).filter((entry) =>
    JSON.stringify(serializeMatches([entry])[0]) !== JSON.stringify(before.get(entry.id)));
  if (changed.includes(match)) await saveMatches(event.id, [match], tx);
  for (const next of changed.filter((entry) => entry.id !== match.id)) {
    await tx.matches.update({ where: { id: next.id }, data: {
      team1Id: next.team1?.id ?? null, team2Id: next.team2?.id ?? null,
      team1Seed: next.team1Seed, team2Seed: next.team2Seed, updatedAt: now,
    } });
  }
  const persistedEvent = await tx.events.findUniqueOrThrow({ where: { id: event.id } });
  let plan: ReflowPlan = { status: 'NO_OP', affectedMatchIds: [], protectedMatchIds: [],
    placementChanges: [], assignmentChanges: [], warnings: [], exploredStates: 0 };
  if (persistedEvent.automatedScheduling === true && event.eventType === 'TOURNAMENT') {
    plan = await planStoredEventReflow(tx, event, [match.id], now, 'KEEP_ASSIGNED_FIELDS', persistedEvent.fieldIds);
    if (plan.status === 'INFEASIBLE' || plan.status === 'SEARCH_LIMIT') throw Response.json({
      code: `TERMINAL_REFLOW_${plan.status}`, error: plan.warnings[0]?.message ?? 'The complete terminal operation could not be scheduled.',
      warnings: plan.warnings,
    }, { status: 409 });
    if (plan.status === 'CHANGED') await saveReflowDelta(tx, event, plan, now);
  }
  const changedIds = new Set([...changed.map((entry) => entry.id), ...plan.placementChanges.map((entry) => entry.matchId),
    ...plan.assignmentChanges.map((entry) => entry.matchId)]);
  return terminalMatchResultSchema.parse({
    contractVersion: 1, operationId, eventId: event.id, matchId: match.id, status: changedIds.size ? 'CHANGED' : 'NO_OP',
    event: { id: event.id, end: event.end.toISOString(), generatedScheduleEnd: event.generatedScheduleEnd?.toISOString() ?? null },
    matches: serializeMatches(Object.values(event.matches).filter((entry) => changedIds.has(entry.id))),
    affectedMatchIds: [...new Set([...changedIds, ...plan.affectedMatchIds])], protectedMatchIds: plan.protectedMatchIds,
    placementChanges: plan.placementChanges.map((entry) => ({ matchId: entry.matchId,
      before: { ...entry.before, start: new Date(entry.before.start).toISOString(), end: new Date(entry.before.end).toISOString() },
      after: { ...entry.after, start: new Date(entry.after.start).toISOString(), end: new Date(entry.after.end).toISOString() },
    })),
    assignmentChanges: plan.assignmentChanges, warnings: plan.warnings, exploredStates: plan.exploredStates,
  });
}
