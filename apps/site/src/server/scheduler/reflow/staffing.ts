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
};

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
  const component = new Set(affected);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const job of jobs) {
      if (component.has(job.match.id) || (job.match.protected && job.kind !== 'PLAYING')) continue;
      const holders = [...job.candidates, ...(job.incumbent ? [job.incumbent] : [])];
      const competes = jobs.some((other) => component.has(other.match.id) && staffWindowsOverlap(job, other)
        && holders.some((a) => [...other.candidates, ...(other.incumbent ? [other.incumbent] : [])]
          .some((b) => staffHoldersConflict(a, b))));
      const changedPlay = placed.filter((entry) => affected.has(entry.match.id));
      const playConflict = (job.incumbent && !holderCanAttend(job, job.incumbent, changedPlay))
        || (job.kind === 'PLAYING' && holders.some((holder) => !holderCanAttend(job, holder, changedPlay)));
      if (competes || playConflict) {
        component.add(job.match.id);
        expanded = true;
      }
    }
  }
  const editable = jobs.filter((job) => component.has(job.match.id) && (!job.match.protected || job.kind === 'PLAYING'))
    .sort((a, b) => Number(b.required) - Number(a.required)
      || a.candidates.length - b.candidates.length || a.match.order - b.match.order || a.id.localeCompare(b.id));
  const editableIds = new Set(editable.map((job) => job.id));
  const assigned = new Map<string, StaffHolder | null>(jobs.filter((job) => !editableIds.has(job.id))
    .map((job) => [job.id, job.incumbent]));
  let limited = false;
  const conflictsWithAssignment = (job: StaffJob, holder: StaffHolder, other: StaffJob): boolean => {
    const otherHolder = assigned.get(other.id);
    return other.id !== job.id && !!otherHolder && staffAssignmentsConflict(job, holder, other, otherHolder);
  };
  const available = (job: StaffJob, holder: StaffHolder): boolean => holderCanAttend(job, holder, placed)
    && !jobs.some((other) => conflictsWithAssignment(job, holder, other)
      && (!job.allowConflict || !other.allowConflict || job.match.id === other.match.id));
  const solve = (index: number, missing: number): boolean => {
    const job = editable[index];
    if (!job) return true;
    const candidates: (StaffHolder | null)[] = [...job.candidates].sort((a, b) =>
      Number(b.key === job.incumbent?.key) - Number(a.key === job.incumbent?.key));
    if (!job.required && missing > 0) candidates.push(null);
    for (const candidate of candidates) {
      if (!visit()) { limited = true; return false; }
      if (candidate && !available(job, candidate)) continue;
      assigned.set(job.id, candidate);
      if (solve(index + 1, missing - Number(candidate === null))) return true;
      assigned.delete(job.id);
      if (limited) return false;
    }
    return false;
  };
  let feasible = false;
  const optionalCount = editable.filter((job) => !job.required).length;
  for (let missing = 0; missing <= optionalCount && !limited; missing += 1) {
    if (solve(0, missing)) { feasible = true; break; }
  }
  const affectedMatchIds = [...new Set(editable.map((job) => job.match.id))];
  if (!feasible) return {
    status: limited ? 'SEARCH_LIMIT' : 'INFEASIBLE', changes: [], warnings: [], affectedMatchIds,
  };
  const changes: ReflowPlan['assignmentChanges'] = [];
  const warnings: ReflowPlan['warnings'] = [];
  for (const entry of placed.filter(({ match }) => affectedMatchIds.includes(match.id) && match.staffing && !match.protected)) {
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
      if (!assigned.get(job.id) && (job.slot !== null || entry.match.staffing?.requiresTeamDuty)) warnings.push({
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
  return { status: 'FEASIBLE', changes, warnings, affectedMatchIds };
}
