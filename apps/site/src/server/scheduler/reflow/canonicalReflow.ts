import { enumerateRepeatingTimeSlotOccurrences } from '@/lib/repeatingTimeSlotAvailability';
import { classifyMaintenanceMatch } from '../eventScheduleMaintenance';
import { buildMatchSchedulingBatches } from '../matchSchedulingOrder';
import { OfficialStaffingPlanner } from '../officialStaffing';
import { teamCanServeMatchDivision, teamIsCheckedInForDuty, type TeamDutyReflowContext } from '../reschedulePreservingLocks';
import { rankTeamDutyCandidates } from '../teamDutyRanking';
import { assertCanonicalSchedulerTimeSlots } from '../timeSlotAvailability';
import { League, type Match, type Tournament } from '../types';
import { planReflow } from './planReflow';
import type { ReflowInput, ReflowOfficialCandidate, ReflowPlacement, ReflowPlan, ReflowStaffing } from './types';

export type CanonicalReflowInput = {
  event: Tournament | League;
  changedMatchIds: string[];
  now: Date;
  fieldPolicy: ReflowInput['fieldPolicy'];
  checkIns: TeamDutyReflowContext;
  blockers: readonly { fieldId: string; start: Date; end: Date }[];
  protectedHistoryIds?: ReadonlySet<string>;
  eligibleFieldIds?: readonly string[];
  maxStates?: number;
};

export function reflowWindow(event: Tournament | League, now: Date) {
  const latestEnd = Math.max(+now, +event.end, +(event.generatedScheduleEnd ?? event.end),
    ...Object.values(event.matches).map((match) => +(match.actualEnd ?? match.end)));
  return {
    start: event.start,
    end: event.noFixedEndDateTime ? new Date(latestEnd + 364 * 86_400_000) : event.scheduleEndConstraint ?? event.end,
  };
}

function windowsFor(input: CanonicalReflowInput): (match: Match) => ReflowPlacement[] {
  const { event, blockers } = input;
  const window = reflowWindow(event, input.now);
  const slots = [...assertCanonicalSchedulerTimeSlots(event), ...event.timeSlots.filter((slot) => slot.repeating)
    .flatMap((slot) => enumerateRepeatingTimeSlotOccurrences({ slot, windowStart: window.start, windowEnd: window.end }))];
  return (match) => Object.values(event.fields).flatMap((field) => {
    if (input.eligibleFieldIds && !input.eligibleFieldIds.includes(field.id)) return [];
    if (!field.divisions.some((division) => division.id === match.division.id)) return [];
    const available = event.timeSlots.length ? slots.filter((slot) =>
      (!slot.resourceIds.length || slot.resourceIds.includes(field.id))
      && (!slot.divisionIds.length || slot.divisionIds.includes(match.division.id))) : [window];
    const merged: ReflowPlacement[] = [];
    for (const interval of available.map((slot) => ({
      fieldId: field.id, start: Math.max(+window.start, +slot.start), end: Math.min(+window.end, +slot.end),
    })).filter((slot) => slot.end > slot.start).sort((a, b) => a.start - b.start)) {
      const last = merged[merged.length - 1];
      if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
      else merged.push(interval);
    }
    return blockers.filter((blocker) => blocker.fieldId === field.id).reduce((remaining, blocker) =>
      remaining.flatMap((slot) => {
        if (+blocker.end <= slot.start || +blocker.start >= slot.end) return [slot];
        return [
          { ...slot, end: Math.min(slot.end, +blocker.start) },
          { ...slot, start: Math.max(slot.start, +blocker.end) },
        ].filter((part) => part.end > part.start);
      }), merged);
  });
}

function staffingFor(input: CanonicalReflowInput): (match: Match) => ReflowStaffing {
  const { event, checkIns } = input;
  const planner = new OfficialStaffingPlanner(event);
  const teams = Object.values(event.teams);
  const matches = Object.values(event.matches);
  const membership = (userId: string) => [...new Set([
    ...(planner.userById.get(userId)?.teamIds ?? []),
    ...teams.filter((team) => team.captainId === userId || team.playerIds.includes(userId)).map((team) => team.id),
  ])];
  return (match) => {
    const candidates = planner.isTeamDutyCandidatePoolEnabled(match) ? rankTeamDutyCandidates(teams.filter((team) =>
      (!(event instanceof League || event.eventType === 'LEAGUE') || team.captainId.trim().length > 0)
      && teamCanServeMatchDivision(team, match)
      && teamIsCheckedInForDuty(team.id, match, checkIns)), match, matches) : [];
    const officialSlots = planner.requiredSlotsForMatch(match).map((slot) => {
      const candidates: ReflowOfficialCandidate[] = [...planner.officialById.values()].flatMap((official) => {
        const user = planner.userById.get(official.userId);
        if (!user || !official.positionIds.includes(slot.positionId)
          || (user.divisions.length && !user.divisions.some((division) => division.id === match.division.id))) return [];
        return [{ userId: user.id, eventOfficialId: official.id, holderType: 'OFFICIAL',
          fieldIds: [...official.fieldIds], teamIds: membership(user.id) }];
      });
      const incumbent = match.officialAssignments.find((assignment) => assignment.positionId === slot.positionId
        && assignment.slotIndex === slot.slotIndex && assignment.holderType === 'PLAYER' && assignment.userId);
      if (incumbent?.userId) candidates.push({ userId: incumbent.userId, eventOfficialId: incumbent.eventOfficialId,
        holderType: 'PLAYER', fieldIds: [], teamIds: membership(incumbent.userId) });
      return { positionId: slot.positionId, slotIndex: slot.slotIndex, candidates };
    });
    return {
      priority: event.staffingPriority, isTeamDutyRequired: planner.isTeamDutyRequired(match),
      eligibleTeamIds: candidates.map((team) => team.id), teamCheckInMs: event.teamCheckInOpenMinutesBefore * 60_000,
      assignments: { teamOfficialId: match.teamOfficial?.id ?? null,
        officialAssignments: match.officialAssignments.map((assignment) => ({ ...assignment })) },
      officialSlots,
      incumbentOfficials: match.officialAssignments.flatMap((assignment) => assignment.userId ? [{
        userId: assignment.userId, eventOfficialId: assignment.eventOfficialId, holderType: assignment.holderType,
        fieldIds: [], teamIds: membership(assignment.userId),
      }] : []),
    };
  };
}

/** Adapt canonical rules without changing the hydrated Event. */
export function planCanonicalReflow(input: CanonicalReflowInput): ReflowPlan {
  const { event } = input;
  const windows = windowsFor(input);
  const staffing = staffingFor(input);
  const divisions = [...event.divisions, ...(event.playoffDivisions ?? []).filter((division) =>
    !event.divisions.some((existing) => existing.id === division.id))];
  const matches = Object.values(event.matches).sort((left, right) =>
    (left.matchId ?? Number.MAX_SAFE_INTEGER) - (right.matchId ?? Number.MAX_SAFE_INTEGER) || left.id.localeCompare(right.id));
  const batches = buildMatchSchedulingBatches(event, matches, divisions);
  const entrantSlots = (match: Match): string[][] => {
    const pool = Object.values(event.teams).filter((team) => teamCanServeMatchDivision(team, match)).map((team) => team.id);
    const possible = (dependency: Match | null, visited = new Set<string>()): string[] => {
      if (!dependency || visited.has(dependency.id)) return pool;
      visited.add(dependency.id);
      const entrants = [dependency.team1?.id, dependency.team2?.id].filter((id): id is string => Boolean(id));
      if (dependency.winnerEventTeamId && entrants.length === 2) {
        if (dependency.winnerNextMatch?.id === match.id && dependency.loserNextMatch?.id !== match.id) return [dependency.winnerEventTeamId];
        if (dependency.loserNextMatch?.id === match.id && dependency.winnerNextMatch?.id !== match.id) return entrants.filter((id) => id !== dependency.winnerEventTeamId);
      }
      return [...new Set([
        ...(dependency.team1 ? [dependency.team1.id] : possible(dependency.previousLeftMatch, visited)),
        ...(dependency.team2 ? [dependency.team2.id] : possible(dependency.previousRightMatch, visited)),
      ])];
    };
    return [
      ...(match.team1 ? [] : [possible(match.previousLeftMatch)]),
      ...(match.team2 ? [] : [possible(match.previousRightMatch)]),
    ];
  };
  const result = planReflow({
    changedMatchIds: input.changedMatchIds, now: +input.now, fieldPolicy: input.fieldPolicy, maxStates: input.maxStates,
    matches: batches.flatMap((batch, batchIndex) => batch.matches.map((match, order) => ({
      id: match.id, order, batch: batchIndex,
      isProtected: classifyMaintenanceMatch(match, input.protectedHistoryIds) === 'PROTECTED',
      placement: match.placementState === 'PLACED' && match.field
        ? { start: +match.start, end: +match.end, fieldId: match.field.id } : null,
      actualEnd: match.actualEnd ? +match.actualEnd : null,
      occupiedUntil: !match.actualEnd && (match.actualStart
        || ['STARTED', 'IN_PROGRESS', 'SUSPENDED'].includes(match.status ?? ''))
        ? Math.max(+match.end, +input.now) : undefined,
      teamIds: [match.team1?.id, match.team2?.id].filter((id): id is string => Boolean(id)),
      dependencyIds: match.getDependencies().map((dependency) => dependency.id),
      playingTeamSlots: entrantSlots(match),
      restMs: Math.max(0, match.bufferMs, event.restTimeMinutes * 60_000),
      windows: windows(match), staffing: staffing(match),
    }))),
  });
  // A finite search horizon cannot prove that an open-ended Event is infeasible.
  return event.noFixedEndDateTime && result.status === 'INFEASIBLE' ? { ...result, status: 'SEARCH_LIMIT',
    warnings: [{ code: 'REFLOW_SEARCH_LIMIT', matchIds: result.affectedMatchIds,
      message: 'No complete repair was found within the planning horizon. No changes were saved.' }],
  } : result;
}
