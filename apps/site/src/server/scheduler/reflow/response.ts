import { scheduleReflowResultSchema, type ScheduleReflowResult } from '@/contracts/scheduleReflow';
import { serializeEvent, serializeMatches } from '../serialize';
import type { Tournament } from '../types';
import type { ReflowPlan } from './types';

/** Use one canonical response conversion for the API and client contract check. */
export function serializeReflowResult(event: Tournament, plan: ReflowPlan, scheduleRevision: string): ScheduleReflowResult {
  const matches = Object.values(event.matches);
  return scheduleReflowResultSchema.parse({
    ...plan, contractVersion: 1, eventId: event.id, scheduleRevision,
    placementChanges: plan.placementChanges.map((change) => ({ matchId: change.matchId,
      before: { ...change.before, start: new Date(change.before.start).toISOString(), end: new Date(change.before.end).toISOString() },
      after: { ...change.after, start: new Date(change.after.start).toISOString(), end: new Date(change.after.end).toISOString() },
    })),
    graph: plan.status === 'CHANGED' ? {
      event: serializeEvent(event),
      matches: serializeMatches(matches).map((serialized, index) => {
        // Do not normalize protected or unaffected assignments to a changed plan.
        const assignments = matches[index]!.officialAssignments.map((assignment) => ({ ...assignment }));
        return { ...serialized, officialAssignments: assignments, officialIds: assignments.filter((entry) => entry.userId !== null) };
      }),
    } : null,
  });
}
