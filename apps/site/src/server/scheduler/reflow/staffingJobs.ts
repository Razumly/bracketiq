import { getStaffingPriorityPolicy, type MatchOfficialAssignment } from '../../officials/config';
import type { ReflowMatch, ReflowOfficialCandidate, ReflowOfficialSlot, ReflowPlacement } from './types';

export type StaffHolder = {
  key: string;
  teamId: string | null;
  official: ReflowOfficialCandidate | null;
};
export type StaffJob = {
  id: string;
  kind: 'PLAYING' | 'TEAM_DUTY' | 'OFFICIAL';
  match: ReflowMatch;
  placement: ReflowPlacement;
  slot: ReflowOfficialSlot | null;
  candidates: StaffHolder[];
  incumbent: StaffHolder | null;
  required: boolean;
  allowConflict: boolean;
};

const teamHolder = (id: string): StaffHolder => ({ key: `team:${id}`, teamId: id, official: null });
const officialHolder = (candidate: ReflowOfficialCandidate): StaffHolder => ({
  key: `user:${candidate.userId}`, teamId: null, official: candidate,
});

const incumbentOfficial = (assignment: MatchOfficialAssignment, slot: ReflowOfficialSlot, match: ReflowMatch): StaffHolder | null => {
  if (!assignment.userId) return null;
  return officialHolder(slot.candidates.find((entry) => entry.userId === assignment.userId)
    ?? match.staffing?.incumbentOfficials?.find((entry) => entry.userId === assignment.userId) ?? {
    userId: assignment.userId, eventOfficialId: assignment.eventOfficialId,
    holderType: assignment.holderType, fieldIds: [], teamIds: [],
  });
};

export function staffingJobs(match: ReflowMatch, placement: ReflowPlacement): StaffJob[] {
  const jobs: StaffJob[] = (match.playingTeamSlots ?? []).map((candidates, index) => ({
    id: `${match.id}:playing:${index}`, kind: 'PLAYING', match, placement, slot: null,
    candidates: [...new Set(candidates)].map(teamHolder), incumbent: null, required: true, allowConflict: false,
  }));
  const staffing = match.staffing;
  if (!staffing) return jobs;
  const policy = getStaffingPriorityPolicy(staffing.priority);
  if (staffing.requiresTeamDuty || staffing.assignments.teamOfficialId !== null) {
    jobs.push({
      id: `${match.id}:team-duty`, kind: 'TEAM_DUTY', match, placement, slot: null,
      candidates: staffing.requiresTeamDuty ? staffing.eligibleTeamIds.map(teamHolder) : [],
      incumbent: staffing.assignments.teamOfficialId ? teamHolder(staffing.assignments.teamOfficialId) : null,
      required: staffing.requiresTeamDuty && policy.isHardTeamCoverageRequired,
      allowConflict: policy.isTeamDutyConflictAllowed,
    });
  }
  const slots = [...(staffing.officialSlots ?? [])];
  // Preserve reservations from slots that are no longer in the active plan.
  for (const assignment of staffing.assignments.officialAssignments) {
    if (!slots.some((slot) => slot.positionId === assignment.positionId && slot.slotIndex === assignment.slotIndex)) {
      slots.push({ positionId: assignment.positionId, slotIndex: assignment.slotIndex, candidates: [] });
    }
  }
  for (const slot of slots) {
    const assignment = staffing.assignments.officialAssignments.find((entry) =>
      entry.positionId === slot.positionId && entry.slotIndex === slot.slotIndex);
    const configured = staffing.officialSlots?.some((entry) =>
      entry.positionId === slot.positionId && entry.slotIndex === slot.slotIndex) === true;
    jobs.push({
      id: `${match.id}:official:${slot.positionId}:${slot.slotIndex}`, kind: 'OFFICIAL', match, placement, slot,
      candidates: slot.candidates.filter((entry) => !entry.fieldIds.length || entry.fieldIds.includes(placement.fieldId))
        .map(officialHolder),
      incumbent: assignment ? incumbentOfficial(assignment, slot, match) : null,
      required: configured && policy.isHardOfficialCoverageRequired,
      allowConflict: policy.isOfficialAssignmentConflictAllowed,
    });
  }
  return jobs;
}

export const staffHoldersConflict = (a: StaffHolder, b: StaffHolder): boolean => {
  if (a.key === b.key) return true;
  if (a.teamId) return b.official?.teamIds.includes(a.teamId) === true;
  if (b.teamId) return a.official?.teamIds.includes(b.teamId) === true;
  return false;
};

export const staffWindowsOverlap = (a: StaffJob, b: StaffJob): boolean => {
  const rest = Math.max(a.match.restMs, b.match.restMs);
  return a.placement.start < b.placement.end + rest && a.placement.end + rest > b.placement.start;
};

export const staffAssignmentsConflict = (a: StaffJob, ah: StaffHolder, b: StaffJob, bh: StaffHolder): boolean => {
  if (!staffHoldersConflict(ah, bh) || !staffWindowsOverlap(a, b)) return false;
  if (a.match.id === b.match.id) return a.kind === 'PLAYING' || b.kind === 'PLAYING'
    || (ah.official !== null && bh.official !== null && ah.key === bh.key);
  return true;
};

export function holderCanAttend(
  job: StaffJob,
  holder: StaffHolder,
  placed: readonly { match: ReflowMatch; placement: ReflowPlacement }[],
): boolean {
  const teams = holder.teamId ? [holder.teamId] : holder.official?.teamIds ?? [];
  if (job.match.teamIds.some((id) => teams.includes(id))) return false;
  return !placed.some((other) => {
    if (other.match.id === job.match.id || !other.match.teamIds.some((id) => teams.includes(id))) return false;
    const rest = Math.max(job.match.restMs, other.match.restMs);
    const nextPlayGap = holder.teamId ? Math.max(rest, job.match.staffing?.teamCheckInMs ?? 0) : rest;
    return job.placement.start < other.placement.end + rest
      && job.placement.end + nextPlayGap > other.placement.start;
  });
}
