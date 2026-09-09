import type { MatchOfficialAssignment } from '../../officials/config';
import type { ReflowAssignments, ReflowInput, ReflowPlacement, ReflowPlan } from './types';
import { occupiedPlacement } from './occupancy';
import {
  holderCanAttend, staffAssignmentsConflict, staffHoldersConflict, staffingJobs, staffWindowsOverlap,
  type StaffHolder, type StaffJob,
} from './staffingJobs';

type StaffingRepair = {
  status: 'FEASIBLE' | 'INFEASIBLE' | 'SEARCH_LIMIT';
  changes: ReflowPlan['assignmentChanges'];
  warnings: ReflowPlan['warnings'];
  affectedMatchIds: string[];
  placementRepairMatchIds: string[];
};

const isStaffingConflictForbidden = (a: StaffJob, b: StaffJob): boolean =>
  !a.isConflictAllowed || !b.isConflictAllowed || a.match.id === b.match.id;

const sameAssignments = (a: ReflowAssignments, b: ReflowAssignments): boolean =>
  a.teamOfficialId === b.teamOfficialId && a.officialAssignments.length === b.officialAssignments.length
  && a.officialAssignments.every((left) => b.officialAssignments.some((right) =>
    left.positionId === right.positionId && left.slotIndex === right.slotIndex
    && left.userId === right.userId && left.eventOfficialId === right.eventOfficialId
    && left.holderType === right.holderType && left.checkedIn === right.checkedIn && left.hasConflict === right.hasConflict));

export function repairStaffing(
  input: ReflowInput,
  placements: ReadonlyMap<string, ReflowPlacement>,
  affected: ReadonlySet<string>,
  visit: () => boolean,
): StaffingRepair {
  const placed = input.matches.flatMap((match) => {
    const placement = placements.get(match.id) ?? match.placement;
    return placement ? [{ match, placement: occupiedPlacement(match, placement) }] : [];
  });
  const jobs = placed.flatMap(({ match, placement }) => staffingJobs(match, placement));
  const warnings: ReflowPlan['warnings'] = [];
  const protectedJobs = jobs.filter((entry) => entry.match.isProtected && entry.incumbent);
  for (let index = 0; index < protectedJobs.length; index += 1) {
    const job = protectedJobs[index]!;
    for (const other of protectedJobs.slice(index + 1)) {
      if ((!affected.has(job.match.id) && !affected.has(other.match.id))
        || !staffAssignmentsConflict(job, job.incumbent!, other, other.incumbent!)) continue;
      const matchIds = [...new Set([job.match.id, other.match.id])];
      if (isStaffingConflictForbidden(job, other)) return {
        status: 'INFEASIBLE', changes: [], warnings: [],
        affectedMatchIds: [...new Set([...affected, ...matchIds])], placementRepairMatchIds: [],
      };
      warnings.push({ code: 'ALLOWED_STAFFING_CONFLICT', matchIds,
        message: 'Staffing Priority permits an overlapping assignment.' });
    }
  }
  const blockedPlayingMatches = new Set<string>();
  for (const job of protectedJobs) {
    const holder = job.incumbent!;
    if (!holderCanAttend(job, holder, [])) {
      if (affected.has(job.match.id)) blockedPlayingMatches.add(job.match.id);
      continue;
    }
    for (const entry of placed) {
      if ((affected.has(job.match.id) || affected.has(entry.match.id))
        && !holderCanAttend(job, holder, [entry])) blockedPlayingMatches.add(entry.match.id);
    }
  }
  if (blockedPlayingMatches.size > 0) return {
    status: 'INFEASIBLE', changes: [], warnings: [],
    affectedMatchIds: [...new Set([...affected, ...blockedPlayingMatches])],
    placementRepairMatchIds: [...blockedPlayingMatches],
  };
  const component = new Set(affected);
  let hasExpanded = true;
  while (hasExpanded) {
    hasExpanded = false;
    for (const job of jobs) {
      if (component.has(job.match.id) || (job.match.isProtected && job.kind !== 'PLAYING')) continue;
      const holders = [...job.candidates, ...(job.incumbent ? [job.incumbent] : [])];
      const isCompeting = jobs.some((other) => component.has(other.match.id) && staffWindowsOverlap(job, other)
        && holders.some((a) => [...other.candidates, ...(other.incumbent ? [other.incumbent] : [])]
          .some((b) => staffHoldersConflict(a, b))));
      const changedPlay = placed.filter((entry) => affected.has(entry.match.id));
      const hasPlayConflict = (job.incumbent && !holderCanAttend(job, job.incumbent, changedPlay))
        || (job.kind === 'PLAYING' && holders.some((holder) => !holderCanAttend(job, holder, changedPlay)));
      if (isCompeting || hasPlayConflict) {
        component.add(job.match.id);
        hasExpanded = true;
      }
    }
  }
  const editable = jobs.filter((job) => component.has(job.match.id) && (!job.match.isProtected || job.kind === 'PLAYING'))
    .sort((a, b) => Number(b.isRequired) - Number(a.isRequired)
      || a.candidates.length - b.candidates.length || a.match.order - b.match.order || a.id.localeCompare(b.id));
  const editableIds = new Set(editable.map((job) => job.id));
  const assigned = new Map<string, StaffHolder | null>(jobs.filter((job) => !editableIds.has(job.id))
    .map((job) => [job.id, job.incumbent]));
  let hasReachedSearchLimit = false;
  const conflictsWithAssignment = (job: StaffJob, holder: StaffHolder, other: StaffJob): boolean => {
    const otherHolder = assigned.get(other.id);
    return other.id !== job.id && !!otherHolder && staffAssignmentsConflict(job, holder, other, otherHolder);
  };
  const available = (job: StaffJob, holder: StaffHolder): boolean => holderCanAttend(job, holder, placed)
    && !jobs.some((other) => conflictsWithAssignment(job, holder, other)
      && isStaffingConflictForbidden(job, other));
  const solve = (index: number, missing: number): boolean => {
    const job = editable[index];
    if (!job) return true;
    const candidates: (StaffHolder | null)[] = [...job.candidates].sort((a, b) =>
      Number(b.key === job.incumbent?.key) - Number(a.key === job.incumbent?.key));
    if (!job.isRequired && missing > 0) candidates.push(null);
    for (const candidate of candidates) {
      if (!visit()) { hasReachedSearchLimit = true; return false; }
      if (candidate && !available(job, candidate)) continue;
      assigned.set(job.id, candidate);
      if (solve(index + 1, missing - Number(candidate === null))) return true;
      assigned.delete(job.id);
      if (hasReachedSearchLimit) return false;
    }
    return false;
  };
  let isFeasible = false;
  const optionalCount = editable.filter((job) => !job.isRequired).length;
  for (let missing = 0; missing <= optionalCount && !hasReachedSearchLimit; missing += 1) {
    if (solve(0, missing)) { isFeasible = true; break; }
  }
  const affectedMatchIds = [...new Set(editable.map((job) => job.match.id))];
  if (!isFeasible) return {
    status: hasReachedSearchLimit ? 'SEARCH_LIMIT' : 'INFEASIBLE', changes: [], warnings: [], affectedMatchIds,
    placementRepairMatchIds: [...new Set(editable.filter((job) => job.isRequired).map((job) => job.match.id))],
  };
  const changes: ReflowPlan['assignmentChanges'] = [];
  for (const entry of placed.filter(({ match }) => affectedMatchIds.includes(match.id) && match.staffing && !match.isProtected)) {
    const before = entry.match.staffing!.assignments;
    const matchJobs = editable.filter((job) => job.match.id === entry.match.id && job.kind !== 'PLAYING');
    const duty = matchJobs.find((job) => job.kind === 'TEAM_DUTY');
    const teamOfficialId = duty ? assigned.get(duty.id)?.teamId ?? null : before.teamOfficialId;
    const officialAssignments: MatchOfficialAssignment[] = matchJobs.filter((job) => job.slot !== null)
      .filter((job) => entry.match.staffing?.officialSlots?.some((slot) => slot.positionId === job.slot!.positionId
        && slot.slotIndex === job.slot!.slotIndex))
      .map((job) => {
        const holder = assigned.get(job.id);
        const prior = before.officialAssignments.find((assignment) => assignment.positionId === job.slot!.positionId
          && assignment.slotIndex === job.slot!.slotIndex);
        const official = holder?.official;
        return {
          positionId: job.slot!.positionId, slotIndex: job.slot!.slotIndex,
          holderType: official?.holderType ?? 'OFFICIAL', userId: official?.userId ?? null,
          eventOfficialId: official?.eventOfficialId ?? null,
          checkedIn: !!official && prior?.userId === official.userId && prior?.checkedIn === true,
          hasConflict: !!holder && jobs.some((other) => conflictsWithAssignment(job, holder, other)),
        };
      });
    for (const job of matchJobs) {
      const holder = assigned.get(job.id);
      if (holder && jobs.some((other) => conflictsWithAssignment(job, holder, other))) warnings.push({
        code: 'ALLOWED_STAFFING_CONFLICT', matchIds: [entry.match.id],
        message: 'Staffing Priority permits an overlapping assignment.',
      });
      if (!assigned.get(job.id) && (job.slot !== null || entry.match.staffing?.isTeamDutyRequired)) warnings.push({
        code: job.slot ? 'UNRESOLVED_NAMED_OFFICIAL_POSITION' : 'UNRESOLVED_TEAM_DUTY',
        matchIds: [entry.match.id], message: job.slot ? 'A named Official Position is unassigned.' : 'A Team Duty is unassigned.',
      });
    }
    const after = { teamOfficialId, officialAssignments };
    if (!sameAssignments(after, before)) changes.push({
      matchId: entry.match.id,
      before: { ...before, officialAssignments: before.officialAssignments.map((assignment) => ({ ...assignment })) }, after,
    });
  }
  return { status: 'FEASIBLE', changes, warnings, affectedMatchIds, placementRepairMatchIds: [] };
}
