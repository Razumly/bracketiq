import type { ReflowInput, ReflowMatch, ReflowPlan, ReflowPlacement } from './types';
import { repairStaffing } from './staffing';
import { staffingJobs } from './staffingJobs';
import { orderReflowMatches } from './matchOrder';
import { validateReflowInput } from './validateInput';
import { occupiedPlacement } from './occupancy';

type PlacementState = {
  placements: Map<string, ReflowPlacement>;
  changed: Set<string>;
};
type SearchResult = { state: PlacementState; staffing: ReturnType<typeof repairStaffing> } | 'EXPAND' | null;

const sharesTeam = (a: ReflowMatch, b: ReflowMatch) => a.teamIds.some((id) => b.teamIds.includes(id));
const samePlacement = (a: ReflowPlacement, b: ReflowPlacement) =>
  a.start === b.start && a.end === b.end && a.fieldId === b.fieldId;
const effectivePlacement = (match: ReflowMatch, state: PlacementState): ReflowPlacement | null => {
  const placement = state.placements.get(match.id) ?? match.placement;
  return placement ? occupiedPlacement(match, placement) : null;
};
const conflicts = (a: ReflowMatch, ap: ReflowPlacement, b: ReflowMatch, bp: ReflowPlacement) => {
  const resourceConflict = ap.fieldId === bp.fieldId && ap.start < bp.end && ap.end > bp.start;
  const rest = Math.max(a.restMs, b.restMs);
  return resourceConflict || (sharesTeam(a, b) && ap.start < bp.end + rest && ap.end + rest > bp.start);
};

export function planReflow(input: ReflowInput): ReflowPlan {
  validateReflowInput(input);
  const plan: ReflowPlan = {
    status: 'NO_OP', affectedMatchIds: [],
    protectedMatchIds: input.matches.filter((match) => match.protected).map((match) => match.id),
    placementChanges: [], assignmentChanges: [], warnings: [], exploredStates: 0,
  };
  const byId = new Map(input.matches.map((match) => [match.id, match]));
  const ordered = orderReflowMatches(input.matches);
  const orderById = new Map(ordered.map((match, index) => [match.id, index]));
  const initial: PlacementState = {
    placements: new Map(input.matches.flatMap((match) => match.placement ? [[match.id, match.placement] as const] : [])),
    changed: new Set(input.changedMatchIds),
  };
  let limited = false;
  const visit = (): boolean => {
    if (plan.exploredStates >= (input.maxStates ?? 20_000)) { limited = true; return false; }
    plan.exploredStates += 1;
    return true;
  };
  const considered = new Set<string>();
  const forced = new Set<string>();
  const addStaffingFailures = (ids: string[]): boolean => {
    let added = false;
    for (const id of ids) {
      const match = byId.get(id);
      if (!match?.placement || match.protected || forced.has(id)) continue;
      if (!staffingJobs(match, match.placement).some((job) => job.required)) continue;
      forced.add(id);
      added = true;
    }
    return added;
  };
  const baselineStaffing = repairStaffing(input, initial.placements, initial.changed, visit);
  input.changedMatchIds.forEach((id) => considered.add(id));
  baselineStaffing.affectedMatchIds.forEach((id) => considered.add(id));
  if (baselineStaffing.status === 'INFEASIBLE') addStaffingFailures(baselineStaffing.affectedMatchIds);
  const dependencyFloor = (match: ReflowMatch, state: PlacementState): number => Math.max(
    Number.NEGATIVE_INFINITY,
    ...match.dependencyIds.map((id) => {
      const dependency = byId.get(id);
      return dependency ? (effectivePlacement(dependency, state)?.end ?? Number.POSITIVE_INFINITY) + Math.max(match.restMs, dependency.restMs)
        : Number.POSITIVE_INFINITY;
    }),
    ...ordered.filter((other) => other.batch < match.batch).map((other) => effectivePlacement(other, state)?.end
      ?? Number.NEGATIVE_INFINITY),
  );
  const publishedFloor = (match: ReflowMatch): number => {
    const end = (other: ReflowMatch) => input.changedMatchIds.includes(other.id)
      ? other.placement?.end : other.actualEnd ?? other.placement?.end;
    return Math.max(Number.NEGATIVE_INFINITY,
      ...match.dependencyIds.map((id) => (end(byId.get(id)!) ?? Number.POSITIVE_INFINITY) + Math.max(match.restMs, byId.get(id)!.restMs)),
      ...ordered.filter((other) => other.batch < match.batch).map((other) => end(other) ?? Number.NEGATIVE_INFINITY));
  };
  const touched = (match: ReflowMatch, state: PlacementState): boolean => {
    if (state.changed.has(match.id) || forced.has(match.id) || match.dependencyIds.some((id) => state.changed.has(id))) return true;
    if (ordered.some((other) => other.batch < match.batch && state.changed.has(other.id))) return true;
    return input.matches.some((other) => {
      const placement = effectivePlacement(other, state);
      return other.id !== match.id && state.changed.has(other.id) && placement && match.placement
        && conflicts(match, match.placement, other, placement);
    });
  };
  const candidateFits = (match: ReflowMatch, candidate: ReflowPlacement, state: PlacementState): boolean => {
    if (candidate.start < dependencyFloor(match, state)) return false;
    if (!match.windows.some((window) => window.fieldId === candidate.fieldId
      && window.start <= candidate.start && window.end >= candidate.end)) return false;
    return !ordered.some((other) => {
      if (other.id === match.id || (!other.protected && orderById.get(other.id)! > orderById.get(match.id)!)) return false;
      const placement = effectivePlacement(other, state);
      return placement !== null && conflicts(match, candidate, other, placement);
    });
  };
  const candidatesFor = (match: ReflowMatch, state: PlacementState): ReflowPlacement[] => {
    const before = match.placement!;
    const duration = before.end - before.start;
    const earlier = dependencyFloor(match, state) < publishedFloor(match);
    const mustMove = forced.has(match.id) || !candidateFits(match, before, state);
    const floor = Math.max(input.now, dependencyFloor(match, state), earlier || mustMove ? input.now : before.start);
    const boundaries = ordered.flatMap((other) => {
      const placement = effectivePlacement(other, state);
      if (!placement || other.id === match.id) return [];
      return [placement.end, placement.end + Math.max(match.restMs, other.restMs)];
    });
    const newConflicts = (candidate: ReflowPlacement) => ordered.filter((other) => {
      if (other.id === match.id || state.changed.has(other.id)) return false;
      const placement = effectivePlacement(other, state);
      return placement !== null && conflicts(match, candidate, other, placement);
    }).length;
    const candidates = match.windows.flatMap((window) => {
      if (input.fieldPolicy === 'KEEP_ASSIGNED_FIELDS' && window.fieldId !== before.fieldId) return [];
      return [Math.max(floor, window.start), ...boundaries]
        .filter((start) => start >= floor && start >= window.start && start + duration <= window.end)
        .map((start) => ({ start, end: start + duration, fieldId: window.fieldId }));
    }).map((placement) => ({ placement, conflicts: newConflicts(placement) }))
      .sort((a, b) => a.placement.start - b.placement.start || a.conflicts - b.conflicts
        || Number(b.placement.fieldId === before.fieldId) - Number(a.placement.fieldId === before.fieldId)
        || a.placement.fieldId.localeCompare(b.placement.fieldId))
      .map((candidate) => candidate.placement);
    if (!earlier) candidates.unshift(before);
    const seen = new Set<string>();
    return candidates.filter((candidate) => {
      const key = `${candidate.fieldId}:${candidate.start}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const search = (startIndex: number, state: PlacementState): SearchResult => {
    for (let index = startIndex; index < ordered.length; index += 1) {
      const match = ordered[index]!;
      if (!match.placement || !touched(match, state)) continue;
      considered.add(match.id);
      if (match.protected) {
        if (dependencyFloor(match, state) > match.placement.start) return null;
        continue;
      }
      for (const candidate of candidatesFor(match, state)) {
        if (!visit()) return null;
        if (!candidateFits(match, candidate, state)) continue;
        const next: PlacementState = {
          placements: new Map(state.placements), changed: new Set(state.changed),
        };
        next.placements.set(match.id, candidate);
        if (!samePlacement(match.placement, candidate)) next.changed.add(match.id);
        const result = search(index + 1, next);
        if (result || limited) return result;
      }
      return null;
    }
    const retainedPlacements = ordered.every((match) => !match.placement
      || samePlacement(match.placement, state.placements.get(match.id)!));
    const staffing = baselineStaffing.status === 'FEASIBLE' && forced.size === 0 && retainedPlacements
      ? baselineStaffing
      : repairStaffing(input, state.placements, new Set([...state.changed, ...forced]), visit);
    if (staffing.status === 'SEARCH_LIMIT') { limited = true; return null; }
    if (staffing.status === 'INFEASIBLE') return addStaffingFailures(staffing.affectedMatchIds) ? 'EXPAND' : null;
    return { state, staffing };
  };
  let result: SearchResult = null;
  if (!limited) {
    do { result = search(0, initial); } while (result === 'EXPAND' && !limited);
  }
  plan.affectedMatchIds = [...considered];
  if (!result || result === 'EXPAND') return { ...plan, status: limited ? 'SEARCH_LIMIT' : 'INFEASIBLE',
    warnings: [{ code: limited ? 'REFLOW_SEARCH_LIMIT' : 'REFLOW_INFEASIBLE', matchIds: plan.affectedMatchIds,
      message: limited ? 'The search budget was reached. No changes were saved.'
        : 'No complete repair fits the current constraints. No changes were saved.' }],
  };
  plan.placementChanges = ordered.flatMap((match) => {
    const after = result.state.placements.get(match.id);
    return match.placement && after && !samePlacement(match.placement, after)
      ? [{ matchId: match.id, before: { ...match.placement }, after: { ...after } }] : [];
  });
  plan.assignmentChanges = result.staffing.changes;
  plan.warnings = result.staffing.warnings;
  plan.affectedMatchIds = [...new Set([...plan.affectedMatchIds, ...result.staffing.affectedMatchIds])];
  plan.status = plan.placementChanges.length || plan.assignmentChanges.length ? 'CHANGED' : 'NO_OP';
  return plan;
}
