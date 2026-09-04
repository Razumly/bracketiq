import type { MatchOfficialAssignment, StaffingPriority } from '../../officials/config';

export type ReflowPlacement = { start: number; end: number; fieldId: string };

export type ReflowAssignments = {
  teamOfficialId: string | null;
  officialAssignments: readonly MatchOfficialAssignment[];
};

export type ReflowOfficialCandidate = {
  userId: string;
  eventOfficialId: string | null;
  holderType: 'OFFICIAL' | 'PLAYER';
  fieldIds: readonly string[];
  teamIds: readonly string[];
};

export type ReflowOfficialSlot = {
  positionId: string;
  slotIndex: number;
  candidates: readonly ReflowOfficialCandidate[];
};

export type ReflowStaffing = {
  priority: StaffingPriority;
  requiresTeamDuty: boolean;
  eligibleTeamIds: readonly string[];
  teamCheckInMs: number;
  assignments: ReflowAssignments;
  officialSlots?: readonly ReflowOfficialSlot[];
  incumbentOfficials?: readonly ReflowOfficialCandidate[];
};

export type ReflowMatch = {
  id: string;
  order: number;
  batch: number;
  protected: boolean;
  placement: ReflowPlacement | null;
  actualEnd: number | null;
  /** Lower bound for a running Match. This does not change its published end. */
  occupiedUntil?: number;
  teamIds: readonly string[];
  dependencyIds: readonly string[];
  /** Capacity reservations only. The planner never assigns bracket entrants. */
  playingTeamSlots?: readonly (readonly string[])[];
  restMs: number;
  windows: readonly ReflowPlacement[];
  staffing?: ReflowStaffing;
};

export type ReflowInput = {
  matches: readonly ReflowMatch[];
  changedMatchIds: readonly string[];
  now: number;
  fieldPolicy: 'KEEP_ASSIGNED_FIELDS' | 'ALLOW_ELIGIBLE_FIELD_CHANGES';
  maxStates?: number;
};

export type ReflowChange = {
  matchId: string;
  before: ReflowPlacement;
  after: ReflowPlacement;
};

export type ReflowPlan = {
  status: 'CHANGED' | 'NO_OP' | 'INFEASIBLE' | 'SEARCH_LIMIT';
  affectedMatchIds: string[];
  protectedMatchIds: string[];
  placementChanges: ReflowChange[];
  assignmentChanges: { matchId: string; before: ReflowAssignments; after: ReflowAssignments }[];
  warnings: { code: string; matchIds: string[]; message: string }[];
  exploredStates: number;
};
