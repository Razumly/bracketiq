import { dateWithMinutesInTimeZone, Schedule } from './Schedule';
import {
  finalizeOpenEndedSchedule,
  prepareSchedulePlacementWindow,
} from './scheduleEvent';
import { assertCanonicalSchedulerTimeSlots } from './timeSlotAvailability';
import {
  enumerateRepeatingTimeSlotOccurrences,
} from '@/lib/repeatingTimeSlotAvailability';
import { resolveOneTimeTimeSlot } from '@/lib/timeSlotAvailability';
import { getDateTimePartsInTimeZone, normalizeTimeZone } from '@/lib/dateUtils';
import {
  Division,
  League,
  Match,
  MINUTE_MS,
  PlayingField,
  Team,
  TimeSlot,
  Tournament,
  UserData,
} from './types';
import {
  PROTECTED_DIVISION_ORDER_MESSAGE,
  buildMatchSchedulingBatches,
  validateMatchBatchBoundaries,
} from './matchSchedulingOrder';
import {
  collectUnresolvedStaffingDiagnostics,
  isTeamDutyCandidatePoolEnabled,
  OfficialStaffingPlanner,
  type StaffingDiagnostic,
} from './officialStaffing';
import {
  compareRankedTeamDutyCandidates,
  historyEndTime,
  isMatchCompletedForTeamDuty,
  matchHasPlayingTeam,
  matchHasTeamActivity,
  matchHasTeamDuty,
  rankTeamDutyCandidate,
} from './teamDutyRanking';
import { ensureSplitPlayoffTimeSlotCoverage } from './timeSlotCoverage';
import { ScheduleError, type ScheduleFailureFactor } from './scheduleErrors';
import { captureSchedulerState, restoreSchedulerState } from './schedulerState';

type SchedulerEvent = League | Tournament;

const MIN_SCHEDULE_DURATION_MS = 5 * MINUTE_MS;

const isLeagueEvent = (event: SchedulerEvent): event is League => (
  event instanceof League || event.eventType === 'LEAGUE'
);

const timestampForSort = (value: Date | null | undefined): number => (
  value instanceof Date && Number.isFinite(value.getTime())
    ? value.getTime()
    : Number.POSITIVE_INFINITY
);


const normalizeDivisionId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

const schedulingDivisionsForEvent = (event: SchedulerEvent): Division[] => {
  const divisions: Division[] = [...event.divisions];
  const seenIds = new Set(divisions.map((division) => division.id));
  for (const playoffDivision of event.playoffDivisions ?? []) {
    if (seenIds.has(playoffDivision.id)) {
      continue;
    }
    seenIds.add(playoffDivision.id);
    divisions.push(playoffDivision);
  }
  return divisions;
};


export type LockedScheduleWarning = {
  code: 'LOCKED_MATCH_OUTSIDE_WINDOW';
  message: string;
  matchIds: string[];
};

export type LockedPreservingPlacementFailure = {
  matchId: string;
  message: string;
  restrictingFactor: ScheduleFailureFactor;
};

export type LockedPreservingRescheduleResult = {
  event: SchedulerEvent;
  matches: Match[];
  warnings: Array<LockedScheduleWarning | StaffingDiagnostic>;
  placementFailures: LockedPreservingPlacementFailure[];
};

const buildScheduleParticipants = (
  event: SchedulerEvent,
  schedulingDivisions: Division[],
): Record<string, Team | UserData> => {
  const participants: Record<string, Team | UserData> = { ...event.teams };
  for (const official of event.officials) {
    if (!official.divisions.length) {
      official.divisions = [...schedulingDivisions];
    }
    participants[official.id] = official;
  }
  return participants;
};

const resetScheduleCollections = (event: SchedulerEvent): void => {
  for (const field of Object.values(event.fields)) {
    field.matches = [];
  }
  for (const team of Object.values(event.teams)) {
    team.matches = [];
  }
  for (const official of event.officials) {
    official.matches = [];
  }
};

const appendMatchToParticipant = (participant: { matches?: Match[] } | null | undefined, match: Match): void => {
  if (!participant) {
    return;
  }
  if (!participant.matches) {
    participant.matches = [];
  }
  if (!participant.matches.includes(match)) {
    participant.matches.push(match);
  }
};

const attachMatchToParticipants = (match: Match): void => {
  for (const participant of match.getParticipants()) {
    appendMatchToParticipant(participant, match);
  }
};

const attachLockedMatchToField = (event: SchedulerEvent, match: Match): void => {
  if (!match.field) return;
  const field = event.fields[match.field.id] ?? null;
  match.field = field;
  if (!field) return;
  if (!field.matches.includes(match)) {
    field.matches.push(match);
  }
};

const compareMatches = (left: Match, right: Match): number => {
  const leftMatchId = left.matchId ?? Number.MAX_SAFE_INTEGER;
  const rightMatchId = right.matchId ?? Number.MAX_SAFE_INTEGER;
  if (leftMatchId !== rightMatchId) {
    return leftMatchId - rightMatchId;
  }
  const startDiff = timestampForSort(left.start) - timestampForSort(right.start);
  if (startDiff !== 0) return startDiff;
  const endDiff = timestampForSort(left.end) - timestampForSort(right.end);
  if (endDiff !== 0) return endDiff;
  return left.id.localeCompare(right.id);
};

const compareScheduledOrder = (left: Match, right: Match): number => {
  const startDiff = timestampForSort(left.start) - timestampForSort(right.start);
  if (startDiff !== 0) return startDiff;
  const endDiff = timestampForSort(left.end) - timestampForSort(right.end);
  if (endDiff !== 0) return endDiff;
  const fieldDiff = (left.field?.id ?? '').localeCompare(right.field?.id ?? '');
  if (fieldDiff !== 0) return fieldDiff;
  return left.id.localeCompare(right.id);
};

const durationForReschedule = (event: SchedulerEvent, match: Match): number => {
  const durationMs = (
    match.start instanceof Date && match.end instanceof Date
      ? match.end.getTime() - match.start.getTime()
      : Number.NaN
  );
  if (durationMs >= MIN_SCHEDULE_DURATION_MS) {
    return durationMs;
  }
  const configuredDurationMinutes = match.division.kind === 'PLAYOFF'
    ? match.division.playoffConfig?.matchDurationMinutes ?? event.matchDurationMinutes
    : match.division.leagueConfig?.matchDurationMinutes ?? event.matchDurationMinutes;
  if (
    typeof configuredDurationMinutes === 'number'
    && Number.isFinite(configuredDurationMinutes)
    && configuredDurationMinutes > 0
  ) {
    return configuredDurationMinutes * MINUTE_MS;
  }
  return MIN_SCHEDULE_DURATION_MS;
};

const normalizeSlotFieldIds = (slot: {
  scheduledFieldIds?: unknown;
  fieldIds?: unknown;
  field?: unknown;
  scheduledFieldId?: unknown;
}): string[] => {
  const rawFieldIds = Array.isArray(slot.scheduledFieldIds) && slot.scheduledFieldIds.length
    ? slot.scheduledFieldIds
    : Array.isArray(slot.fieldIds) && slot.fieldIds.length
      ? slot.fieldIds
      : [slot.field ?? slot.scheduledFieldId];
  return Array.from(new Set(
    rawFieldIds
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter((value) => value.length > 0),
  ));
};

const slotAllowsField = (
  slot: {
    scheduledFieldIds?: unknown;
    fieldIds?: unknown;
    field?: unknown;
    scheduledFieldId?: unknown;
  },
  fieldId: string,
): boolean => {
  const allowedFieldIds = normalizeSlotFieldIds(slot);
  return !allowedFieldIds.length || allowedFieldIds.includes(fieldId);
};

const slotAllowsDivision = (slot: { divisions?: Division[] }, divisionId: string): boolean => (
  !Array.isArray(slot.divisions)
  || !slot.divisions.length
  || slot.divisions.some((division) => division.id === divisionId)
);

const slotAllowsDateTime = (
  slot: TimeSlot,
  matchStart: Date,
  matchEnd: Date,
): boolean => {
  if (matchEnd.getTime() <= matchStart.getTime()) {
    return false;
  }
  try {
    if (slot.repeating === false) {
      const resolved = resolveOneTimeTimeSlot(slot, slot.timeZone);
      return matchStart.getTime() >= resolved.start.getTime()
        && matchEnd.getTime() <= resolved.end.getTime();
    }
    const occurrences = enumerateRepeatingTimeSlotOccurrences({
      slot,
      windowStart: matchStart,
      windowEnd: matchEnd,
    });
    return occurrences.some((occurrence) => (
      matchStart.getTime() >= occurrence.start.getTime()
      && matchEnd.getTime() <= occurrence.end.getTime()
    ));
  } catch {
    return false;
  }
};


const lockedMatchFitsUpdatedWindow = (event: SchedulerEvent, rescheduleEndTime: Date, match: Match): boolean => {
  if (match.start.getTime() < event.start.getTime() || match.end.getTime() > rescheduleEndTime.getTime()) {
    return false;
  }
  if (!event.timeSlots.length) {
    return true;
  }
  if (!match.field) {
    return false;
  }
  return event.timeSlots.some((slot) =>
    slotAllowsField(slot, match.field?.id ?? '')
    && slotAllowsDivision(slot, match.division?.id ?? '')
    && slotAllowsDateTime(slot, match.start, match.end),
  );
};

const collectWarnings = (
  event: SchedulerEvent,
  lockedMatches: Match[],
  rescheduleEndTime: Date,
): LockedScheduleWarning[] => {
  if (!lockedMatches.length) return [];
  const outOfWindowIds = lockedMatches
    .filter((match) => !lockedMatchFitsUpdatedWindow(event, rescheduleEndTime, match))
    .map((match) => match.id);
  if (!outOfWindowIds.length) {
    return [];
  }
  const subject = outOfWindowIds.length === 1 ? 'Locked match is' : 'Locked matches are';
  const preservedVerb = outOfWindowIds.length === 1 ? 'was' : 'were';
  return [
    {
      code: 'LOCKED_MATCH_OUTSIDE_WINDOW',
      message: `${subject} outside the updated start/time-slot window and ${preservedVerb} preserved.`,
      matchIds: outOfWindowIds,
    },
  ];
};


const detachMatchFromParticipant = (participant: { matches?: Match[] } | null | undefined, match: Match): void => {
  if (!participant?.matches) {
    return;
  }
  participant.matches = participant.matches.filter((existing) => existing.id !== match.id);
};

type PendingDependencyAssignment = {
  match: Match;
  team1: Team | null;
  team2: Team | null;
  teamOfficial: Team | null;
  team1Seed: number | null;
  team2Seed: number | null;
};

const normalizePendingDependencySeedSlots = (
  match: Match,
  snapshot: PendingDependencyAssignment,
): { team1Seed: number | null; team2Seed: number | null } => {
  const team1Seed = snapshot.team1Seed;
  const team2Seed = snapshot.team2Seed;
  const dependencyCount = Number(Boolean(match.previousLeftMatch)) + Number(Boolean(match.previousRightMatch));
  if (dependencyCount !== 1) {
    return { team1Seed, team2Seed };
  }
  if (snapshot.team1 || snapshot.team2) {
    return { team1Seed, team2Seed };
  }

  const seedCount = Number(typeof team1Seed === 'number') + Number(typeof team2Seed === 'number');
  if (seedCount !== 1) {
    return { team1Seed, team2Seed };
  }

  const carriedSeed = team1Seed ?? team2Seed;
  if (match.previousLeftMatch) {
    return {
      team1Seed: null,
      team2Seed: carriedSeed,
    };
  }
  return {
    team1Seed: carriedSeed,
    team2Seed: null,
  };
};

const detachPendingDependencyAssignments = (match: Match): PendingDependencyAssignment => {
  const snapshot: PendingDependencyAssignment = {
    match,
    team1: match.team1,
    team2: match.team2,
    teamOfficial: match.teamOfficial,
    team1Seed: match.team1Seed ?? null,
    team2Seed: match.team2Seed ?? null,
  };
  detachMatchFromParticipant(match.team1, match);
  detachMatchFromParticipant(match.team2, match);
  detachMatchFromParticipant(match.teamOfficial, match);
  match.team1 = null;
  match.team2 = null;
  match.teamOfficial = null;
  return snapshot;
};

const restorePendingDependencyAssignments = (snapshot: PendingDependencyAssignment): void => {
  const { match } = snapshot;
  const normalizedSeeds = normalizePendingDependencySeedSlots(match, snapshot);
  match.team1 = snapshot.team1;
  match.team2 = snapshot.team2;
  match.teamOfficial = snapshot.teamOfficial;
  match.team1Seed = normalizedSeeds.team1Seed;
  match.team2Seed = normalizedSeeds.team2Seed;
  attachMatchToParticipants(match);
};

const dependenciesAreScheduled = (match: Match, pendingIds: Set<string>): boolean => {
  for (const dependency of match.getDependencies()) {
    if (pendingIds.has(dependency.id)) {
      return false;
    }
  }
  return true;
};


const clearUserOfficialAssignments = (match: Match): void => {
  match.official = null;
  match.officialAssignments = [];
  match.officialCheckedIn = false;
};

export type TeamDutyReflowContext = {
  eventCheckedInTeamIds: ReadonlySet<string>;
  checkedInTeamIdsByMatch: ReadonlyMap<string, ReadonlySet<string>>;
};
export type FieldCandidateValidator = (candidate: {
  event: Match;
  resource: PlayingField;
  start: Date;
  end: Date;
}) => boolean;

const EMPTY_TEAM_DUTY_REFLOW_CONTEXT: TeamDutyReflowContext = {
  eventCheckedInTeamIds: new Set<string>(),
  checkedInTeamIdsByMatch: new Map<string, ReadonlySet<string>>(),
};

const rangesOverlap = (
  leftStart: Date,
  leftEnd: Date,
  rightStart: Date,
  rightEnd: Date,
): boolean => leftStart.getTime() < rightEnd.getTime() && leftEnd.getTime() > rightStart.getTime();

export const teamCanServeMatchDivision = (team: Team, match: Match): boolean => {
  const targetDivisionId = normalizeDivisionId(match.division.id);
  if (!targetDivisionId) {
    return false;
  }
  if (normalizeDivisionId(team.division.id) === targetDivisionId) {
    return true;
  }
  if ((match.division.teamIds ?? []).includes(team.id)) {
    return true;
  }
  return (team.division.playoffPlacementDivisionIds ?? []).some(
    (divisionId) => normalizeDivisionId(divisionId) === targetDivisionId,
  );
};

export const teamIsCheckedInForDuty = (
  teamId: string,
  match: Match,
  context: TeamDutyReflowContext,
): boolean => {
  if (context.eventCheckedInTeamIds.has(teamId)) {
    return true;
  }
  const visitedMatchIds = new Set<string>();
  const pendingMatches = [match];
  while (pendingMatches.length > 0) {
    const candidate = pendingMatches.pop() as Match;
    if (visitedMatchIds.has(candidate.id)) {
      continue;
    }
    visitedMatchIds.add(candidate.id);
    if (context.checkedInTeamIdsByMatch.get(candidate.id)?.has(teamId)) {
      return true;
    }
    pendingMatches.push(...candidate.getDependencies());
  }
  return false;
};

const eligibleTeamDutyCandidates = (
  event: SchedulerEvent,
  match: Match,
  matches: Match[],
  context: TeamDutyReflowContext,
): Team[] => {
  if (!isTeamDutyCandidatePoolEnabled(event, match)) {
    return [];
  }
  const restMs = Math.max(0, event.restTimeMinutes) * MINUTE_MS;
  const imminentMatchWindowEnd = match.end.getTime()
    + Math.max(0, event.teamCheckInOpenMinutesBefore) * MINUTE_MS;
  const requireCaptains = isLeagueEvent(event);

  return Object.values(event.teams)
    .filter((team) => {
      const result = (
        (!requireCaptains || team.captainId.trim().length > 0)
        && team.id !== match.team1?.id
        && team.id !== match.team2?.id
        && teamCanServeMatchDivision(team, match)
        && teamIsCheckedInForDuty(team.id, match, context)
      );
      return result;
    })
    .filter((team) => !matches.some((otherMatch) => (
      otherMatch.id !== match.id
      && matchHasTeamActivity(otherMatch, team.id)
      && otherMatch.start instanceof Date
      && otherMatch.end instanceof Date
      && rangesOverlap(otherMatch.start, otherMatch.end, match.start, match.end)
    )))
    .filter((team) => {
      const latestPriorEnd = matches.reduce<number | null>((latest, otherMatch) => {
        if (
          otherMatch.id === match.id
          || !matchHasTeamActivity(otherMatch, team.id)
          || !(otherMatch.end instanceof Date)
          || otherMatch.end.getTime() > match.start.getTime()
        ) {
          return latest;
        }
        const end = historyEndTime(otherMatch);
        return latest == null || end > latest ? end : latest;
      }, null);
      return latestPriorEnd == null || match.start.getTime() - latestPriorEnd >= restMs;
    })
    .filter((team) => !matches.some((otherMatch) => (
      otherMatch.id !== match.id
      && matchHasPlayingTeam(otherMatch, team.id)
      && otherMatch.start instanceof Date
      && otherMatch.start.getTime() > match.end.getTime()
      && otherMatch.start.getTime() < imminentMatchWindowEnd
    )))
    .map((team) => rankTeamDutyCandidate(team, match, matches))
    .sort(compareRankedTeamDutyCandidates)
    .map(({ team }) => team);
};

const assignMissingCheckedInTeamOfficials = (
  event: SchedulerEvent,
  matches: Match[],
  context: TeamDutyReflowContext,
  conflictMatches: Match[] = matches,
): void => {
  for (const match of [...matches].sort(compareScheduledOrder)) {
    if (match.placementState !== 'PLACED') {
      continue;
    }
    attachMatchToParticipants(match);
    if (match.teamOfficial || !match.requiresTeamOfficial || !(match.team1 && match.team2)) {
      continue;
    }
    const candidate = eligibleTeamDutyCandidates(event, match, conflictMatches, context)[0] ?? null;
    if (!candidate) {
      continue;
    }
    match.teamOfficial = candidate;
    appendMatchToParticipant(candidate, match);
    attachMatchToParticipants(match);
  }
};

export const rescheduleEventMatchesPreservingLocks = (
  event: SchedulerEvent,
  teamDutyReflowContext: TeamDutyReflowContext = EMPTY_TEAM_DUTY_REFLOW_CONTEXT,
  canUseFieldCandidate?: FieldCandidateValidator,
  protectedMatchIds?: ReadonlySet<string>,
  allowPartialPlacement = false,
): LockedPreservingRescheduleResult => {
  const allMatches = Object.values(event.matches);
  if (!allMatches.length) {
    return { event, matches: [], warnings: [], placementFailures: [] };
  }
  const isProtected = (match: Match): boolean =>
    match.locked || protectedMatchIds?.has(match.id) === true;
  const shouldReflowTeamDuties = teamDutyReflowContext !== EMPTY_TEAM_DUTY_REFLOW_CONTEXT;
  const unlockedMatches = allMatches
    .filter((match) => !isProtected(match))
    .sort(compareMatches);
  const unlockedMatchIds = new Set(unlockedMatches.map((match) => match.id));
  const schedulerStateSnapshot = captureSchedulerState(event);

  try {
    ensureSplitPlayoffTimeSlotCoverage(event);
    const isOpenEndedSchedule = prepareSchedulePlacementWindow(event, false);
    const schedulingDivisions = schedulingDivisionsForEvent(event);
    const rescheduleEndTime = event.end;
    const lockedMatches = allMatches.filter(isProtected);
    const lockedMatchIds = new Set(lockedMatches.map((match) => match.id));
    const batches = buildMatchSchedulingBatches(
      event,
      allMatches,
      schedulingDivisions,
      {
        lockedMatchIds,
        affectedMatchIds: unlockedMatchIds,
      },
    );
    const warnings = collectWarnings(event, lockedMatches, rescheduleEndTime);
    const placementFailures: LockedPreservingPlacementFailure[] = [];
    resetScheduleCollections(event);
    const staffingPlanner = new OfficialStaffingPlanner(event);
    const plannerHasRequiredSlots = allMatches.some((match) => (
      staffingPlanner.hasRequiredSlots(match)
    ));
    const teamDutyReflowMatches = allMatches.filter((match) =>
      !protectedMatchIds?.has(match.id),
    );
    for (const match of teamDutyReflowMatches) {
      match.requiresTeamOfficial = staffingPlanner.isTeamDutyRequired(match);
      match.reservesTeamOfficial =
        match.requiresTeamOfficial && staffingPlanner.isTeamDutySlotReserved(match);
    }
    for (const match of lockedMatches) {
      attachLockedMatchToField(event, match);
    }
    if (plannerHasRequiredSlots) {
      staffingPlanner.seedCommittedMatches([...lockedMatches].sort(compareScheduledOrder));
    }
    for (const match of lockedMatches) {
      attachMatchToParticipants(match);
    }

  const participants = buildScheduleParticipants(event, schedulingDivisions);
  const schedule = new Schedule<Match, PlayingField, Team | UserData, Division>(
    event.start,
    event.fields,
    participants,
    schedulingDivisions,
    event.start,
    { endTime: rescheduleEndTime, timeSlots: event.timeSlots },
  );
  const probeCanPlaceWithoutProtectedHistory = (
    match: Match,
    durationMs: number,
    cursorFloor: Date,
  ): boolean => {
    const probeSnapshot = captureSchedulerState(event);
    try {
      for (const field of Object.values(event.fields)) {
        field.matches = field.matches.filter((scheduledMatch) => (
          !lockedMatchIds.has(scheduledMatch.id)
        ));
      }
      const probeSchedule = new Schedule<Match, PlayingField, Team | UserData, Division>(
        event.start,
        event.fields,
        participants,
        schedulingDivisions,
        cursorFloor,
        { endTime: rescheduleEndTime, timeSlots: event.timeSlots },
      );
      if (staffingPlanner.hasStaffingRequirement(match)) {
        probeSchedule.scheduleEventWithOptions(match, durationMs, {
          canUseCandidate: ({ resource, start, end }) => (
            staffingPlanner.previewSchedulingCandidate(match, resource, start, end)
          ),
        });
      } else {
        probeSchedule.scheduleEvent(match, durationMs);
      }
      return true;
    } catch {
      return false;
    } finally {
      restoreSchedulerState(probeSnapshot);
    }
  };

  if (plannerHasRequiredSlots) {
    for (const match of unlockedMatches) {
      clearUserOfficialAssignments(match);
    }
  }
  const pendingIds = new Set(unlockedMatches.map((match) => match.id));
  const detachedPendingAssignments: PendingDependencyAssignment[] = [];

  for (const match of unlockedMatches) {
    const hasUnresolvedDependency = match.getDependencies().some((dependency) => !isMatchCompletedForTeamDuty(dependency));
    if (hasUnresolvedDependency) {
      detachedPendingAssignments.push(detachPendingDependencyAssignments(match));
    }
    match.unschedule();
  }

  try {
    let cursorWasProtectedDerived = false;
    let protectedCursorFloor: Date | null = null;
    for (const batch of batches) {
      const pendingBatchIds = new Set(
        batch.matches
          .filter((match) => !isProtected(match))
          .map((match) => match.id),
      );
      while (pendingBatchIds.size > 0) {
        const readyMatches = batch.matches.filter((match) => (
          pendingBatchIds.has(match.id)
          && dependenciesAreScheduled(match, pendingIds)
        ));
        const fallbackMatch = batch.matches.find((match) => (
          pendingBatchIds.has(match.id)
        ));
        const nextBatch = readyMatches.length
          ? readyMatches
          : fallbackMatch
            ? [fallbackMatch]
            : [];

        for (const match of nextBatch) {
          const matchDuration = durationForReschedule(event, match);
          const requiresStaffing = staffingPlanner.hasStaffingRequirement(match);
          try {
            if (requiresStaffing || canUseFieldCandidate) {
              schedule.scheduleEventWithOptions(match, matchDuration, {
                canUseCandidate: ({ resource, start, end }) => (
                  (canUseFieldCandidate?.({ event: match, resource, start, end }) ?? true) &&
                  (!requiresStaffing || staffingPlanner.previewSchedulingCandidate(match, resource, start, end))
                ),
              });
              if (requiresStaffing) {
                staffingPlanner.commitScheduledMatch(match);
              }
            } else {
              schedule.scheduleEvent(match, matchDuration);
            }
          } catch (error) {
            if (
              error instanceof ScheduleError
              && error.restrictingFactor === 'RESOURCE'
              && cursorWasProtectedDerived
              && protectedCursorFloor !== null
              && probeCanPlaceWithoutProtectedHistory(match, matchDuration, event.start)
            ) {
              throw new ScheduleError(PROTECTED_DIVISION_ORDER_MESSAGE, 'DIVISION_ORDER');
            }
            if (
              allowPartialPlacement
              && error instanceof ScheduleError
              && error.restrictingFactor !== 'DIVISION_ORDER'
            ) {
              detachMatchFromParticipant(match.official, match);
              detachMatchFromParticipant(match.teamOfficial, match);
              match.unschedule();
              match.teamOfficial = null;
              clearUserOfficialAssignments(match);
              placementFailures.push({
                matchId: match.id,
                message: error.message,
                restrictingFactor: error.restrictingFactor,
              });
              pendingIds.delete(match.id);
              pendingBatchIds.delete(match.id);
              continue;
            }
            throw error;
          }
          attachMatchToParticipants(match);
          pendingIds.delete(match.id);
          pendingBatchIds.delete(match.id);
        }
      }

      const cursorBeforeBatchMs = schedule.currentTime.getTime();
      let maxEndMs = Number.NEGATIVE_INFINITY;
      let maxNonLockedEndMs = Number.NEGATIVE_INFINITY;
      for (const match of batch.matches) {
        const endMs = match.end.getTime();
        maxEndMs = Math.max(maxEndMs, endMs);
        if (!isProtected(match)) {
          maxNonLockedEndMs = Math.max(maxNonLockedEndMs, endMs);
        }
      }
      cursorWasProtectedDerived = (
        Number.isFinite(maxEndMs)
        && maxEndMs > cursorBeforeBatchMs
        && maxEndMs > maxNonLockedEndMs
      );
      protectedCursorFloor = cursorWasProtectedDerived
        ? new Date(
            Math.max(
              cursorBeforeBatchMs,
              Number.isFinite(maxNonLockedEndMs)
                ? maxNonLockedEndMs
                : cursorBeforeBatchMs,
            ),
          )
        : null;
      schedule.advanceTo(
        Number.isFinite(maxEndMs) ? new Date(maxEndMs) : event.start,
      );
    }

  } finally {
    detachedPendingAssignments.forEach(restorePendingDependencyAssignments);
  }

  const matchesForPostScheduleStaffing = unlockedMatches.filter((match) => (
    match.placementState === 'PLACED'
    && plannerHasRequiredSlots
    && staffingPlanner.hasRequiredSlots(match)
    && !staffingPlanner.hasStaffingRequirement(match)
  ));
  if (matchesForPostScheduleStaffing.length > 0) {
    staffingPlanner.assignMatches(matchesForPostScheduleStaffing);
  }
  if (shouldReflowTeamDuties) {
    assignMissingCheckedInTeamOfficials(
      event,
      teamDutyReflowMatches,
      teamDutyReflowContext,
      allMatches,
    );
  }
  if (
    shouldReflowTeamDuties
    && teamDutyReflowMatches.some((match) => (
      match.placementState === 'PLACED'
      && staffingPlanner.isHardTeamCoverageRequired(match)
    ))
  ) {
    const unstaffedMatch = teamDutyReflowMatches.find((match) => (
      match.placementState === 'PLACED'
      && staffingPlanner.isHardTeamCoverageRequired(match)
      && match.requiresTeamOfficial
      && Boolean(match.team1)
      && Boolean(match.team2)
      && !match.teamOfficial
    ));
    if (unstaffedMatch) {
      throw new Error(
        `Unable to preserve the schedule because Match ${unstaffedMatch.id} requires a Team duty assignment.`,
      );
    }
  }

  if (
    !isOpenEndedSchedule
    && allMatches.some((match) => (
      match.end instanceof Date
      && !Number.isNaN(match.end.getTime())
      && match.end.getTime() > event.end.getTime()
    ))
  ) {
    throw new Error('Scheduled matches exceed the fixed event end date/time. Increase the end date/time or enable "No fixed end datetime scheduling".');
  }
  finalizeOpenEndedSchedule(
    event,
    allMatches.filter((match) => match.placementState === 'PLACED'),
  );
  validateMatchBatchBoundaries(batches, {
    lockedMatchIds,
    affectedMatchIds: unlockedMatchIds,
  });

  return {
    event,
    matches: allMatches.sort(compareMatches),
    warnings: [...warnings, ...collectUnresolvedStaffingDiagnostics(allMatches)],
    placementFailures,
  };
  } catch (error) {
    restoreSchedulerState(schedulerStateSnapshot);
    throw error;
  }
};
