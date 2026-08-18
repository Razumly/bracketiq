import { getStaffingPriorityPolicy } from '@/server/officials/config';
import { resolveDivisionCompetitionPhase } from '@/lib/divisionPhaseSettings';
import { ScheduleError } from './scheduleErrors';

import {
  League,
  Match,
  Tournament,
  UserData,
  type EventOfficial,
  type EventOfficialPosition,
  type MatchOfficialAssignment,
  type PlayingField,
  type StaffingPriority,
  type Team,
} from './types';

type RequiredOfficialSlot = {
  positionId: string;
  slotIndex: number;
  order: number;
};

type PreviewOptions = {
  field: PlayingField | null;
  start: Date;
  end: Date;
  requireFull: boolean;
  allowAssignmentConflicts: boolean;
};

type PlannerDecision = {
  assignments: MatchOfficialAssignment[];
  complete: boolean;
};

type OfficialCommitment = {
  matchId: string;
  start: Date;
  end: Date;
  bufferMs: number;
};

type AssignmentCandidate = {
  official: EventOfficial;
  user: UserData;
  assignment: MatchOfficialAssignment;
  score: [number, number, number, string, string];
};

export type StaffingDiagnosticCode =
  | 'UNRESOLVED_TEAM_DUTY'
  | 'UNRESOLVED_NAMED_OFFICIAL_POSITION';

export type StaffingDiagnostic = {
  code: StaffingDiagnosticCode;
  message: string;
  matchIds: string[];
};

const LEGACY_PRIMARY_POSITION_ID = 'legacy_primary_official';
const DEFAULT_MATCH_DURATION_MINUTES = 60;

const validDate = (value: unknown): value is Date => (
  value instanceof Date && Number.isFinite(value.getTime())
);

const committedMatchWindow = (
  match: Match,
  event: Tournament | League,
): { start: Date; end: Date; bufferMs: number } => {
  const start = validDate((match as { start?: unknown }).start)
    ? match.start
    : validDate((event as { start?: unknown }).start)
      ? event.start
      : new Date(0);
  const configuredDurationMinutes = Number(event.matchDurationMinutes);
  const durationMinutes = Number.isFinite(configuredDurationMinutes) && configuredDurationMinutes > 0
    ? configuredDurationMinutes
    : DEFAULT_MATCH_DURATION_MINUTES;
  const candidateEnd = (match as { end?: unknown }).end;
  const end = validDate(candidateEnd) && candidateEnd.getTime() > start.getTime()
    ? candidateEnd
    : new Date(start.getTime() + durationMinutes * 60_000);
  const bufferMs = Number.isFinite(match.bufferMs) ? Math.max(0, match.bufferMs) : 0;
  return { start, end, bufferMs };
};

const windowsConflict = (
  startA: Date,
  endA: Date,
  bufferA: number,
  startB: Date,
  endB: Date,
  bufferB: number,
): boolean => {
  if (![startA, endA, startB, endB].every(validDate)) {
    return false;
  }
  return startA.getTime() < endB.getTime() + bufferB
    && endA.getTime() + bufferA > startB.getTime();
};

const defaultPositionsForEvent = (event: Tournament | League): EventOfficialPosition[] => {
  if (Array.isArray(event.officialPositions) && event.officialPositions.length) {
    return event.officialPositions;
  }
  if (!event.officials.length) {
    return [];
  }
  return [{
    id: LEGACY_PRIMARY_POSITION_ID,
    name: 'Official',
    count: 1,
    order: 0,
  }];
};
const phaseForMatch = (event: Tournament | League, match: Match) => (
  match.division.phase
    ?? resolveDivisionCompetitionPhase({
      eventType: event.eventType,
      divisionKind: match.division.kind,
      hasBracketLinks: match.getDependencies().length > 0 || match.getDependants().length > 0,
    })
);

const phaseSettingsForMatch = (event: Tournament | League, match: Match) => (
  match.division.phaseSettings?.[phaseForMatch(event, match)] ?? {}
);
export const isTeamDutyCandidatePoolEnabled = (
  event: Tournament | League,
  match: Match,
): boolean => (
  phaseSettingsForMatch(event, match).doTeamsOfficiate
  ?? event.doTeamsOfficiate === true
);

const phasePositionsForEvent = (event: Tournament | League): EventOfficialPosition[] => (
  [...event.divisions, ...(event instanceof League ? event.playoffDivisions : [])]
    .flatMap((division) => Object.values(division.phaseSettings ?? {}).flatMap(
      (settings) => settings.officialPositions ?? [],
    ))
);


const defaultEventOfficialsForEvent = (

  event: Tournament | League,
  positions: EventOfficialPosition[],
): EventOfficial[] => {
  if (Array.isArray(event.eventOfficials) && event.eventOfficials.length) {
    return event.eventOfficials.filter((official) => official.isActive !== false);
  }
  const positionIds = Array.from(new Set([
    ...positions.map((position) => position.id),
    ...phasePositionsForEvent(event).map((position) => position.id),
  ]));
  return event.officials.map((official) => ({
    id: `event_official_${event.id}_${official.id}`,
    userId: official.id,
    positionIds: [...positionIds],
    fieldIds: [],
    isActive: true,
  }));
};

const buildRequiredSlots = (positions: EventOfficialPosition[]): RequiredOfficialSlot[] => {
  const slots: RequiredOfficialSlot[] = [];
  positions
    .slice()
    .sort((left, right) => (
      left.order - right.order
      || left.name.localeCompare(right.name)
      || left.id.localeCompare(right.id)
    ))
    .forEach((position, positionOrder) => {
      for (let slotIndex = 0; slotIndex < position.count; slotIndex += 1) {
        slots.push({ positionId: position.id, slotIndex, order: positionOrder });
      }
    });
  return slots;
};

const slotKey = (slot: RequiredOfficialSlot): `${string}:${number}` => `${slot.positionId}:${slot.slotIndex}`;

export const collectUnresolvedStaffingDiagnostics = (matches: Match[]): StaffingDiagnostic[] => {
  const placedMatches = matches.filter((match) => (
    match.field !== null && match.placementState !== 'UNPLACED'
  ));
  const teamDutyMatchIds = placedMatches
    .filter((match) => match.requiresTeamOfficial && match.teamOfficial === null)
    .map((match) => match.id)
    .sort((left, right) => left.localeCompare(right));
  const namedOfficialMatchIds = placedMatches
    .filter((match) => match.officialAssignments.some((assignment) => assignment.userId === null))
    .map((match) => match.id)
    .sort((left, right) => left.localeCompare(right));
  const diagnostics: StaffingDiagnostic[] = [];
  if (teamDutyMatchIds.length) {
    diagnostics.push({
      code: 'UNRESOLVED_TEAM_DUTY',
      message: 'Some placed matches do not have a Team-duty assignment.',
      matchIds: teamDutyMatchIds,
    });
  }
  if (namedOfficialMatchIds.length) {
    diagnostics.push({
      code: 'UNRESOLVED_NAMED_OFFICIAL_POSITION',
      message: 'Some placed matches have an unbound named Official Position.',
      matchIds: namedOfficialMatchIds,
    });
  }
  return diagnostics;
};

export class OfficialStaffingPlanner {
  readonly event: Tournament | League;
  readonly priority: StaffingPriority;
  readonly positions: EventOfficialPosition[];
  readonly requiredSlots: RequiredOfficialSlot[];
  readonly userById: Map<string, UserData>;
  readonly officialById: Map<string, EventOfficial>;
  readonly teamById: Map<string, Team>;

  private readonly commitmentsByUserId = new Map<string, OfficialCommitment[]>();
  private readonly assignmentCountByUserId = new Map<string, number>();
  private readonly assignmentCountByUserPosition = new Map<string, number>();
  private readonly lastAssignmentEndByUserId = new Map<string, number>();
  private readonly previewCache = new Map<string, MatchOfficialAssignment[]>();
  private readonly requiredSlotsByPhaseAndDivision = new Map<string, RequiredOfficialSlot[]>();

  constructor(event: Tournament | League) {
    this.event = event;
    this.priority = event.staffingPriority;
    this.positions = defaultPositionsForEvent(event);
    this.requiredSlots = buildRequiredSlots(this.positions);
    this.userById = new Map(event.officials.map((official) => [official.id, official]));
    this.officialById = new Map(
      defaultEventOfficialsForEvent(event, this.positions)
        .filter((official) => this.userById.has(official.userId))
        .map((official) => [official.id, official]),
    );
    this.teamById = new Map(Object.values(event.teams).map((team) => [team.id, team]));
  }

  positionsForMatch(match: Match): EventOfficialPosition[] {
    return phaseSettingsForMatch(this.event, match).officialPositions ?? this.positions;
  }

  requiredSlotsForMatch(match: Match): RequiredOfficialSlot[] {
    const phase = phaseForMatch(this.event, match);
    const key = `${phase}:${match.division.id}`;
    const cached = this.requiredSlotsByPhaseAndDivision.get(key);
    if (cached) {
      return cached;
    }
    const slots = buildRequiredSlots(this.positionsForMatch(match));
    this.requiredSlotsByPhaseAndDivision.set(key, slots);
    return slots;
  }

  isHardOfficialCoverageRequired(): boolean {
    return getStaffingPriorityPolicy(this.priority).isHardOfficialCoverageRequired;
  }

  isTeamDutyRequired(match: Match): boolean {
    const configured = phaseSettingsForMatch(this.event, match).doTeamsOfficiate;
    return configured ?? this.requiresTeamDutySlot();
  }

  isTeamDutyCandidatePoolEnabled(match: Match): boolean {
    return isTeamDutyCandidatePoolEnabled(this.event, match);
  }
  isHardTeamCoverageRequired(match?: Match): boolean {
    const policy = getStaffingPriorityPolicy(this.priority);
    return policy.isHardTeamCoverageRequired
      && (match ? this.isTeamDutyRequired(match) : true);
  }

  isOfficialAssignmentConflictAllowed(): boolean {
    return getStaffingPriorityPolicy(this.priority).isOfficialAssignmentConflictAllowed;
  }

  isTeamDutySlotReserved(match?: Match): boolean {
    const policy = getStaffingPriorityPolicy(this.priority);
    return policy.isTeamDutySlotReserved
      && (match ? this.isTeamDutyRequired(match) : true);
  }

  isTeamDutyConflictAllowed(): boolean {
    return getStaffingPriorityPolicy(this.priority).isTeamDutyConflictAllowed;
  }

  requiresTeamDutySlot(): boolean {
    return getStaffingPriorityPolicy(this.priority).requiresTeamDutySlot;
  }

  requiresHardTeamCoverage(): boolean {
    return this.isHardTeamCoverageRequired();
  }

  requiresHardOfficialCoverage(): boolean {
    return this.isHardOfficialCoverageRequired();
  }

  allowsOfficialAssignmentConflicts(): boolean {
    return this.isOfficialAssignmentConflictAllowed();
  }

  reservesTeamDutySlot(): boolean {
    return this.isTeamDutySlotReserved();
  }

  hasRequiredSlots(match?: Match): boolean {
    return match
      ? this.requiredSlotsForMatch(match).length > 0
      : this.requiredSlots.length > 0;
  }

  hasStaffingRequirement(match?: Match): boolean {
    return this.isHardOfficialCoverageRequired() && this.hasRequiredSlots(match);
  }

  hasCommittedAssignments(match: Match): boolean {
    return this.hasCompleteNamedCoverage(match);
  }

  hasCompleteNamedCoverage(match: Match): boolean {
    const requiredSlots = this.requiredSlotsForMatch(match);
    if (!requiredSlots.length) {
      return true;
    }
    const boundSlotKeys = new Set(
      this.normalizeCommittedAssignments(match)
        .map((assignment) => `${assignment.positionId}:${assignment.slotIndex}`),
    );
    return boundSlotKeys.size === requiredSlots.length
      && requiredSlots.every((slot) => boundSlotKeys.has(slotKey(slot)));
  }

  hasPotentialCompleteNamedCoverage(match: Match): boolean {
    const requiredSlots = this.requiredSlotsForMatch(match);
    if (!requiredSlots.length) {
      return true;
    }
    const eligibleFields = Object.values(this.event.fields).filter((field) => {
      const divisions = field.getGroups();
      return divisions.length === 0
        || divisions.some((division) => division.id === match.division.id);
    });
    if (!eligibleFields.length) {
      return true;
    }
    return eligibleFields.some((field) => {
      const candidatesBySlot = new Map<string, Array<{ user: UserData }>>();
      for (const slot of requiredSlots) {
        const usersById = new Map<string, UserData>();
        for (const official of this.officialById.values()) {
          const user = this.userById.get(official.userId);
          if (
            user
            && this.isEligibleForMatchDivision(user, match)
            && official.positionIds.includes(slot.positionId)
            && (!official.fieldIds.length || official.fieldIds.includes(field.id))
            && !this.isSameMatchParticipant(match, user)
          ) {
            usersById.set(user.id, user);
          }
        }
        candidatesBySlot.set(
          slotKey(slot),
          Array.from(usersById.values())
            .sort((left, right) => left.id.localeCompare(right.id))
            .map((user) => ({ user })),
        );
      }
      return this.maximumMatchingSize(requiredSlots, candidatesBySlot)
        === requiredSlots.length;
    });
  }

  seedCommittedMatches(matches: Match[]): void {
    const ordered = [...matches].sort((left, right) => {
      const leftWindow = committedMatchWindow(left, this.event);
      const rightWindow = committedMatchWindow(right, this.event);
      const startDiff = leftWindow.start.getTime() - rightWindow.start.getTime();
      if (startDiff !== 0) return startDiff;
      const endDiff = leftWindow.end.getTime() - rightWindow.end.getTime();
      if (endDiff !== 0) return endDiff;
      return left.id.localeCompare(right.id);
    });
    for (const match of ordered) {
      const requiredSlots = this.requiredSlotsForMatch(match);
      if (!requiredSlots.length) {
        continue;
      }
      const window = committedMatchWindow(match, this.event);
      const normalizedBySlot = new Map(
        this.normalizeCommittedAssignments(match)
          .map((assignment) => [
            `${assignment.positionId}:${assignment.slotIndex}`,
            assignment,
          ] as const),
      );
      const assignments = requiredSlots.map((slot) => {
        const assignment = normalizedBySlot.get(slotKey(slot));
        if (!assignment || assignment.userId === null) {
          return this.unboundAssignment(slot);
        }
        const user = this.userById.get(assignment.userId);
        if (!user || this.userHasTeamMatchConflict(
          user,
          match,
          window.start,
          window.end,
        )) {
          return this.unboundAssignment(slot);
        }
        const hasConflict = this.userHasAssignmentConflict(
          user,
          match.id,
          window.start,
          window.end,
          window.bufferMs,
        );
        if (hasConflict && !this.isOfficialAssignmentConflictAllowed()) {
          return this.unboundAssignment(slot);
        }
        return {
          ...assignment,
          hasConflict,
        };
      });
      if (
        this.isHardOfficialCoverageRequired()
        && assignments.some((assignment) => assignment.userId === null)
      ) {
        const decision = this.planAssignments(match, {
          field: match.field,
          start: window.start,
          end: window.end,
          requireFull: true,
          allowAssignmentConflicts: this.isOfficialAssignmentConflictAllowed(),
        });
        if (!decision.complete) {
          throw new ScheduleError('Unable to fully staff scheduled match with eligible officials.', 'NAMED_OFFICIAL_POSITION');
        }
        this.applyAssignments(match, decision.assignments);
        continue;
      }
      this.applyAssignments(match, assignments);
    }
  }

  previewSchedulingCandidate(match: Match, field: PlayingField, start: Date, end: Date): boolean {
    if (!this.hasPotentialCompleteNamedCoverage(match)) {
      throw new ScheduleError('Unable to fully staff scheduled match because no complete position-eligible assignment exists.', 'NAMED_OFFICIAL_POSITION');
    }
    const preview = this.planAssignments(match, {
      field,
      start,
      end,
      requireFull: true,
      allowAssignmentConflicts: this.isOfficialAssignmentConflictAllowed(),
    });
    const key = this.previewKey(match.id, field.id, start, end);
    if (!preview.complete) {
      this.previewCache.delete(key);
      return false;
    }
    this.previewCache.set(key, preview.assignments);
    return true;
  }

  commitScheduledMatch(match: Match): void {
    const fieldId = match.field?.id ?? '';
    const key = this.previewKey(match.id, fieldId, match.start, match.end);
    const preview = this.previewCache.get(key);
    this.previewCache.delete(key);
    const decision = preview
      ? { assignments: preview, complete: true }
      : this.planAssignments(match, {
          field: match.field,
          start: match.start,
          end: match.end,
          requireFull: true,
          allowAssignmentConflicts: this.isOfficialAssignmentConflictAllowed(),
        });
    if (!decision.complete) {
      throw new ScheduleError('Unable to fully staff scheduled match with eligible officials.', 'NAMED_OFFICIAL_POSITION');
    }
    this.applyAssignments(match, decision.assignments);
  }

  assignMatch(match: Match): void {
    const requireFull = this.isHardOfficialCoverageRequired()
      && this.hasRequiredSlots(match);
    const decision = this.planAssignments(match, {
      field: match.field,
      start: match.start,
      end: match.end,
      requireFull,
      allowAssignmentConflicts: this.isOfficialAssignmentConflictAllowed(),
    });
    if (requireFull && !decision.complete) {
      throw new ScheduleError('Unable to fully staff scheduled match with eligible officials.', 'NAMED_OFFICIAL_POSITION');
    }
    this.applyAssignments(match, decision.assignments);
  }

  assignMatches(matches: Match[]): void {
    const ordered = [...matches].sort((left, right) => {
      const startDiff = left.start.getTime() - right.start.getTime();
      if (startDiff !== 0) return startDiff;
      const endDiff = left.end.getTime() - right.end.getTime();
      if (endDiff !== 0) return endDiff;
      const fieldDiff = (left.field?.id ?? '').localeCompare(right.field?.id ?? '');
      if (fieldDiff !== 0) return fieldDiff;
      return left.id.localeCompare(right.id);
    });
    for (const match of ordered) {
      this.assignMatch(match);
    }
  }

  private previewKey(matchId: string, fieldId: string, start: Date, end: Date): string {
    return `${matchId}:${fieldId}:${start.getTime()}:${end.getTime()}`;
  }

  private planAssignments(match: Match, options: PreviewOptions): PlannerDecision {
    const requiredSlots = this.requiredSlotsForMatch(match);
    if (!requiredSlots.length) {
      return { assignments: [], complete: true };
    }

    const candidatesBySlot = new Map<string, AssignmentCandidate[]>();
    for (const slot of requiredSlots) {
      candidatesBySlot.set(
        slotKey(slot),
        options.field
          ? this.eligibleCandidatesForSlot(match, slot, options.field, options)
          : [],
      );
    }

    const matchingOrder = [...requiredSlots].sort((left, right) => {
      const candidateCountDiff = (candidatesBySlot.get(slotKey(left))?.length ?? 0)
        - (candidatesBySlot.get(slotKey(right))?.length ?? 0);
      if (candidateCountDiff !== 0) return candidateCountDiff;
      if (left.order !== right.order) return left.order - right.order;
      return left.slotIndex - right.slotIndex;
    });
    const targetAssignmentCount = this.maximumMatchingSize(matchingOrder, candidatesBySlot);
    if (options.requireFull && targetAssignmentCount !== requiredSlots.length) {
      return {
        assignments: requiredSlots.map((slot) => this.unboundAssignment(slot)),
        complete: false,
      };
    }

    const selectedUserIds = new Set<string>();
    const selectedBySlot = new Map<string, MatchOfficialAssignment>();
    const target = options.requireFull ? requiredSlots.length : targetAssignmentCount;
    this.selectPreferredMatching(
      matchingOrder,
      candidatesBySlot,
      target,
      0,
      selectedUserIds,
      selectedBySlot,
    );

    const assignments = requiredSlots.map((slot) => (
      selectedBySlot.get(slotKey(slot)) ?? this.unboundAssignment(slot)
    ));
    return {
      assignments,
      complete: assignments.every((assignment) => assignment.userId !== null),
    };
  }

  private maximumMatchingSize<T extends { user: UserData }>(
    slots: RequiredOfficialSlot[],
    candidatesBySlot: Map<string, T[]>,
  ): number {
    const slotKeyByUserId = new Map<string, string>();
    const assignSlot = (key: string, visitedUserIds: Set<string>): boolean => {
      for (const candidate of candidatesBySlot.get(key) ?? []) {
        if (visitedUserIds.has(candidate.user.id)) {
          continue;
        }
        visitedUserIds.add(candidate.user.id);
        const existingSlotKey = slotKeyByUserId.get(candidate.user.id);
        if (!existingSlotKey || assignSlot(existingSlotKey, visitedUserIds)) {
          slotKeyByUserId.set(candidate.user.id, key);
          return true;
        }
      }
      return false;
    };
    let matched = 0;
    for (const slot of slots) {
      if (assignSlot(slotKey(slot), new Set<string>())) {
        matched += 1;
      }
    }
    return matched;
  }

  private selectPreferredMatching(
    slots: RequiredOfficialSlot[],
    candidatesBySlot: Map<string, AssignmentCandidate[]>,
    target: number,
    index: number,
    selectedUserIds: Set<string>,
    selectedBySlot: Map<string, MatchOfficialAssignment>,
  ): boolean {
    if (selectedBySlot.size === target) {
      return true;
    }
    if (index >= slots.length || selectedBySlot.size + (slots.length - index) < target) {
      return false;
    }
    const slot = slots[index];
    const key = slotKey(slot);
    for (const candidate of candidatesBySlot.get(key) ?? []) {
      if (selectedUserIds.has(candidate.user.id)) {
        continue;
      }
      selectedUserIds.add(candidate.user.id);
      selectedBySlot.set(key, candidate.assignment);
      if (this.selectPreferredMatching(
        slots,
        candidatesBySlot,
        target,
        index + 1,
        selectedUserIds,
        selectedBySlot,
      )) {
        return true;
      }
      selectedBySlot.delete(key);
      selectedUserIds.delete(candidate.user.id);
    }
    return this.selectPreferredMatching(
      slots,
      candidatesBySlot,
      target,
      index + 1,
      selectedUserIds,
      selectedBySlot,
    );
  }

  private isEligibleForMatchDivision(user: UserData, match: Match): boolean {
    const divisions = user.divisions ?? [];
    return divisions.length === 0 || divisions.some((division) => division.id === match.division.id);
  }

  private eligibleCandidatesForSlot(
    match: Match,
    slot: RequiredOfficialSlot,
    field: PlayingField,
    options: PreviewOptions,
  ): AssignmentCandidate[] {
    const results: AssignmentCandidate[] = [];
    for (const official of this.officialById.values()) {
      if (!official.positionIds.includes(slot.positionId)) {
        continue;
      }
      const user = this.userById.get(official.userId);
      if (
        !user
        || !this.isEligibleForMatchDivision(user, match)
        || (official.fieldIds.length && !official.fieldIds.includes(field.id))
      ) {
        continue;
      }
      if (this.isSameMatchParticipant(match, user)) {
        continue;
      }
      if (this.userHasTeamMatchConflict(user, match, options.start, options.end)) {
        continue;
      }

      const hasAssignmentConflict = this.userHasAssignmentConflict(
        user,
        match.id,
        options.start,
        options.end,
        match.bufferMs,
      );
      if (!options.allowAssignmentConflicts && hasAssignmentConflict) {
        continue;
      }

      const exactCount = this.assignmentCountByUserPosition.get(`${user.id}:${slot.positionId}`) ?? 0;
      const totalCount = this.assignmentCountByUserId.get(user.id) ?? 0;
      const lastAssigned = this.lastAssignmentEndByUserId.get(user.id) ?? 0;
      results.push({
        official,
        user,
        assignment: {
          positionId: slot.positionId,
          slotIndex: slot.slotIndex,
          holderType: 'OFFICIAL',
          userId: user.id,
          eventOfficialId: official.id,
          checkedIn: false,
          hasConflict: options.allowAssignmentConflicts && hasAssignmentConflict,
        },
        score: [exactCount, totalCount, lastAssigned, user.id, official.id],
      });
    }

    results.sort((left, right) => {
      const exactDiff = left.score[0] - right.score[0];
      if (exactDiff !== 0) return exactDiff;
      const totalDiff = left.score[1] - right.score[1];
      if (totalDiff !== 0) return totalDiff;
      const recencyDiff = left.score[2] - right.score[2];
      if (recencyDiff !== 0) return recencyDiff;
      const userDiff = left.score[3].localeCompare(right.score[3]);
      if (userDiff !== 0) return userDiff;
      return left.score[4].localeCompare(right.score[4]);
    });
    return results;
  }

  private userHasAssignmentConflict(
    user: UserData,
    currentMatchId: string,
    start: Date,
    end: Date,
    bufferMs: number,
  ): boolean {
    for (const commitment of this.commitmentsByUserId.get(user.id) ?? []) {
      if (
        commitment.matchId !== currentMatchId
        && windowsConflict(
          start,
          end,
          bufferMs,
          commitment.start,
          commitment.end,
          commitment.bufferMs,
        )
      ) {
        return true;
      }
    }
    return false;
  }

  private userHasTeamMatchConflict(
    user: UserData,
    currentMatch: Match,
    start: Date,
    end: Date,
  ): boolean {
    for (const teamId of user.teamIds ?? []) {
      const team = this.teamById.get(teamId);
      if (!team) {
        continue;
      }
      for (const teamMatch of team.matches ?? []) {
        if (teamMatch.id === currentMatch.id) {
          continue;
        }
        const teamMatchWindow = committedMatchWindow(teamMatch, this.event);
        if (windowsConflict(
          start,
          end,
          currentMatch.bufferMs,
          teamMatchWindow.start,
          teamMatchWindow.end,
          teamMatchWindow.bufferMs,
        )) {
          return true;
        }
      }
    }
    return false;
  }

  private isSameMatchParticipant(match: Match, user: UserData): boolean {
    const team1Id = match.team1?.id ?? null;
    const team2Id = match.team2?.id ?? null;
    if (!team1Id && !team2Id) {
      return false;
    }
    return user.teamIds.some((teamId) => teamId === team1Id || teamId === team2Id);
  }

  private eligibleEventOfficial(
    userId: string,
    positionId: string,
    field: PlayingField | null,
  ): EventOfficial | null {
    let selected: EventOfficial | null = null;
    for (const official of this.officialById.values()) {
      if (
        official.userId !== userId
        || !official.positionIds.includes(positionId)
        || (
          field
          && official.fieldIds.length > 0
          && !official.fieldIds.includes(field.id)
        )
      ) {
        continue;
      }
      if (!selected || official.id.localeCompare(selected.id) < 0) {
        selected = official;
      }
    }
    return selected;
  }

  private unboundAssignment(slot: RequiredOfficialSlot): MatchOfficialAssignment {
    return {
      positionId: slot.positionId,
      slotIndex: slot.slotIndex,
      holderType: 'OFFICIAL',
      userId: null,
      eventOfficialId: null,
      checkedIn: false,
      hasConflict: false,
    };
  }

  private applyAssignments(match: Match, assignments: MatchOfficialAssignment[]): void {
    match.officialAssignments = assignments.map((assignment) => ({ ...assignment }));
    const primaryAssignment = assignments.find((assignment) => (
      assignment.holderType === 'OFFICIAL' && assignment.userId !== null
    ));
    match.official = primaryAssignment
      ? (this.userById.get(primaryAssignment.userId as string) ?? null)
      : null;
    match.officialCheckedIn = assignments.some((assignment) => (
      assignment.userId !== null && assignment.checkedIn === true
    ));
    this.recordAssignments(match, assignments);
  }

  private normalizeCommittedAssignments(match: Match): MatchOfficialAssignment[] {
    const requiredSlots = this.requiredSlotsForMatch(match);
    const requiredSlotKeys = new Set(
      requiredSlots.map((slot) => slotKey(slot)),
    );
    const normalized: MatchOfficialAssignment[] = [];
    const seenSlotKeys = new Set<string>();
    const seenUsers = new Set<string>();
    for (const assignment of match.officialAssignments ?? []) {
      const positionId = typeof assignment?.positionId === 'string' ? assignment.positionId.trim() : '';
      const userId = typeof assignment?.userId === 'string' ? assignment.userId.trim() : '';
      const assignmentSlotIndex = Number(assignment?.slotIndex);
      const user = this.userById.get(userId);
      if (
        assignment?.holderType !== 'OFFICIAL'
        || !positionId
        || !user
        || !Number.isInteger(assignmentSlotIndex)
        || !this.isEligibleForMatchDivision(user, match)
        || this.isSameMatchParticipant(match, user)
      ) {
        continue;
      }
      const key: `${string}:${number}` = `${positionId}:${assignmentSlotIndex}`;
      if (!requiredSlotKeys.has(key) || seenSlotKeys.has(key) || seenUsers.has(userId)) {
        continue;
      }
      const eventOfficial = this.eligibleEventOfficial(userId, positionId, match.field);
      if (!eventOfficial) {
        continue;
      }
      normalized.push({
        ...assignment,
        positionId,
        slotIndex: assignmentSlotIndex,
        holderType: 'OFFICIAL',
        userId,
        eventOfficialId: eventOfficial.id,
        checkedIn: assignment.checkedIn === true,
        hasConflict: assignment.hasConflict === true,
      });
      seenSlotKeys.add(key);
      seenUsers.add(userId);
    }
    if (normalized.length > 0) {
      return normalized;
    }
    const fallbackUserId = match.official?.id?.trim() ?? '';
    const fallbackSlot = requiredSlots[0] ?? null;
    const fallbackUser = this.userById.get(fallbackUserId);
    if (
      !fallbackSlot
      || !fallbackUser
      || !this.isEligibleForMatchDivision(fallbackUser, match)
      || this.isSameMatchParticipant(match, fallbackUser)
    ) {
      return [];
    }
    const eventOfficial = this.eligibleEventOfficial(
      fallbackUserId,
      fallbackSlot.positionId,
      match.field,
    );
    if (!eventOfficial) {
      return [];
    }
    return [{
      positionId: fallbackSlot.positionId,
      slotIndex: fallbackSlot.slotIndex,
      holderType: 'OFFICIAL',
      userId: fallbackUserId,
      eventOfficialId: eventOfficial.id,
      checkedIn: match.officialCheckedIn === true,
      hasConflict: false,
    }];
  }

  private recordAssignments(match: Match, assignments: MatchOfficialAssignment[]): void {
    const window = committedMatchWindow(match, this.event);
    for (const assignment of assignments) {
      if (assignment.userId === null) {
        continue;
      }
      const user = this.userById.get(assignment.userId);
      if (!user) {
        continue;
      }
      if (!user.matches.includes(match)) {
        user.matches.push(match);
      }
      const commitments = this.commitmentsByUserId.get(user.id) ?? [];
      commitments.push({
        matchId: match.id,
        start: window.start,
        end: window.end,
        bufferMs: window.bufferMs,
      });
      this.commitmentsByUserId.set(user.id, commitments);
      this.assignmentCountByUserId.set(user.id, (this.assignmentCountByUserId.get(user.id) ?? 0) + 1);
      const positionKey = `${user.id}:${assignment.positionId}`;
      this.assignmentCountByUserPosition.set(
        positionKey,
        (this.assignmentCountByUserPosition.get(positionKey) ?? 0) + 1,
      );
      this.lastAssignmentEndByUserId.set(user.id, window.end.getTime());
    }
  }
}
