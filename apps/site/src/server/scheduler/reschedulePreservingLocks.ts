import { dateWithMinutesInTimeZone, Schedule } from './Schedule';
import {
  finalizeOpenEndedSchedule,
  prepareSchedulePlacementWindow,
} from './scheduleEvent';
import { getDateTimePartsInTimeZone, normalizeTimeZone } from '@/lib/dateUtils';
import {
  Division,
  League,
  Match,
  MINUTE_MS,
  PlayingField,
  Team,
  Tournament,
  UserData,
} from './types';
import {
  collectUnresolvedStaffingDiagnostics,
  isTeamDutyCandidatePoolEnabled,
  OfficialStaffingPlanner,
  type StaffingDiagnostic,
} from './officialStaffing';

type SchedulerEvent = League | Tournament;

const MIN_SCHEDULE_DURATION_MS = 5 * MINUTE_MS;

const isLeagueEvent = (event: SchedulerEvent): event is League => (
  event instanceof League || event.eventType === 'LEAGUE'
);

const isSplitPlayoffLeague = (event: SchedulerEvent): event is League => (
  isLeagueEvent(event)
  && Boolean(event.splitLeaguePlayoffDivisions)
  && Array.isArray(event.playoffDivisions)
  && event.playoffDivisions.length > 0
);

const isTournamentPoolPlayEvent = (event: SchedulerEvent): boolean => (
  !isLeagueEvent(event)
  && String(event.eventType ?? '').toUpperCase() === 'TOURNAMENT'
  && event.includePlayoffs === true
  && Array.isArray(event.playoffDivisions)
  && event.playoffDivisions.length > 0
);

const usesMappedPlayoffDivisions = (event: SchedulerEvent): boolean => (
  isSplitPlayoffLeague(event) || isTournamentPoolPlayEvent(event)
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
  if (!usesMappedPlayoffDivisions(event)) {
    return divisions;
  }
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

const ensureTournamentPoolTimeSlotCoverage = (event: SchedulerEvent): void => {
  if (!isTournamentPoolPlayEvent(event) || !event.timeSlots.length) {
    return;
  }

  const playoffDivisionById = new Map<string, Division>();
  for (const playoffDivision of event.playoffDivisions ?? []) {
    const normalizedId = normalizeDivisionId(playoffDivision.id);
    if (!normalizedId) {
      continue;
    }
    playoffDivisionById.set(normalizedId, playoffDivision);
  }
  if (!playoffDivisionById.size) {
    return;
  }

  const poolDivisionsByPlayoffId = new Map<string, Division[]>();
  const seenPoolIdsByPlayoffId = new Map<string, Set<string>>();
  for (const poolDivision of event.divisions) {
    const poolDivisionId = normalizeDivisionId(poolDivision.id);
    if (!poolDivisionId) {
      continue;
    }
    for (const mappedPlayoffDivisionIdRaw of poolDivision.playoffPlacementDivisionIds ?? []) {
      const mappedPlayoffDivisionId = normalizeDivisionId(mappedPlayoffDivisionIdRaw);
      if (!mappedPlayoffDivisionId || !playoffDivisionById.has(mappedPlayoffDivisionId)) {
        continue;
      }
      const seenPoolIds = seenPoolIdsByPlayoffId.get(mappedPlayoffDivisionId) ?? new Set<string>();
      if (seenPoolIds.has(poolDivisionId)) {
        continue;
      }
      seenPoolIds.add(poolDivisionId);
      seenPoolIdsByPlayoffId.set(mappedPlayoffDivisionId, seenPoolIds);

      const bucket = poolDivisionsByPlayoffId.get(mappedPlayoffDivisionId) ?? [];
      bucket.push(poolDivision);
      poolDivisionsByPlayoffId.set(mappedPlayoffDivisionId, bucket);
    }
  }

  if (!poolDivisionsByPlayoffId.size) {
    return;
  }

  for (const slot of event.timeSlots) {
    const existingDivisions = Array.isArray(slot.divisions) ? slot.divisions : [];
    if (!existingDivisions.length) {
      continue;
    }
    const normalizedSlotDivisionIds = new Set<string>();
    for (const division of existingDivisions) {
      const normalizedId = normalizeDivisionId(division?.id);
      if (normalizedId) {
        normalizedSlotDivisionIds.add(normalizedId);
      }
    }
    if (!normalizedSlotDivisionIds.size) {
      continue;
    }

    const nextDivisions: Division[] = [...existingDivisions];
    let changed = false;
    for (const divisionId of Array.from(normalizedSlotDivisionIds)) {
      const poolDivisions = poolDivisionsByPlayoffId.get(divisionId);
      if (!poolDivisions) {
        continue;
      }
      for (const poolDivision of poolDivisions) {
        const poolDivisionId = normalizeDivisionId(poolDivision.id);
        if (!poolDivisionId || normalizedSlotDivisionIds.has(poolDivisionId)) {
          continue;
        }
        nextDivisions.push(poolDivision);
        normalizedSlotDivisionIds.add(poolDivisionId);
        changed = true;
      }
    }

    if (changed) {
      slot.divisions = nextDivisions;
    }
  }
};

const ensureSplitPlayoffTimeSlotCoverage = (event: SchedulerEvent): void => {
  if (isTournamentPoolPlayEvent(event)) {
    ensureTournamentPoolTimeSlotCoverage(event);
    return;
  }
  if (!isSplitPlayoffLeague(event) || !event.timeSlots.length) {
    return;
  }

  const playoffDivisionById = new Map<string, Division>();
  for (const playoffDivision of event.playoffDivisions ?? []) {
    const normalizedId = normalizeDivisionId(playoffDivision.id);
    if (!normalizedId) {
      continue;
    }
    playoffDivisionById.set(normalizedId, playoffDivision);
  }
  if (!playoffDivisionById.size) {
    return;
  }

  const mappedPlayoffIdsByDivisionId = new Map<string, Set<string>>();
  for (const division of event.divisions) {
    const sourceDivisionId = normalizeDivisionId(division.id);
    if (!sourceDivisionId) {
      continue;
    }
    for (const mappedPlayoffDivisionIdRaw of division.playoffPlacementDivisionIds ?? []) {
      const mappedPlayoffDivisionId = normalizeDivisionId(mappedPlayoffDivisionIdRaw);
      if (!mappedPlayoffDivisionId || !playoffDivisionById.has(mappedPlayoffDivisionId)) {
        continue;
      }
      const bucket = mappedPlayoffIdsByDivisionId.get(sourceDivisionId) ?? new Set<string>();
      bucket.add(mappedPlayoffDivisionId);
      mappedPlayoffIdsByDivisionId.set(sourceDivisionId, bucket);
    }
  }

  if (!mappedPlayoffIdsByDivisionId.size) {
    return;
  }

  for (const slot of event.timeSlots) {
    const existingDivisions = Array.isArray(slot.divisions) ? slot.divisions : [];
    if (!existingDivisions.length) {
      continue;
    }
    const normalizedSlotDivisionIds = new Set<string>();
    for (const division of existingDivisions) {
      const normalizedId = normalizeDivisionId(division?.id);
      if (normalizedId) {
        normalizedSlotDivisionIds.add(normalizedId);
      }
    }
    if (!normalizedSlotDivisionIds.size) {
      continue;
    }

    const nextDivisions: Division[] = [...existingDivisions];
    let changed = false;
    for (const divisionId of normalizedSlotDivisionIds) {
      const mappedPlayoffIds = mappedPlayoffIdsByDivisionId.get(divisionId);
      if (!mappedPlayoffIds) {
        continue;
      }
      for (const playoffDivisionId of mappedPlayoffIds) {
        if (normalizedSlotDivisionIds.has(playoffDivisionId)) {
          continue;
        }
        const playoffDivision = playoffDivisionById.get(playoffDivisionId);
        if (!playoffDivision) {
          continue;
        }
        nextDivisions.push(playoffDivision);
        normalizedSlotDivisionIds.add(playoffDivisionId);
        changed = true;
      }
    }

    if (changed) {
      slot.divisions = nextDivisions;
    }
  }
};

export type LockedScheduleWarning = {
  code: 'LOCKED_MATCH_OUTSIDE_WINDOW';
  message: string;
  matchIds: string[];
};

export type LockedPreservingRescheduleResult = {
  event: SchedulerEvent;
  matches: Match[];
  warnings: Array<LockedScheduleWarning | StaffingDiagnostic>;
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
  const startDiff = left.start.getTime() - right.start.getTime();
  if (startDiff !== 0) return startDiff;
  const endDiff = left.end.getTime() - right.end.getTime();
  if (endDiff !== 0) return endDiff;
  return left.id.localeCompare(right.id);
};

const compareScheduledOrder = (left: Match, right: Match): number => {
  const startDiff = left.start.getTime() - right.start.getTime();
  if (startDiff !== 0) return startDiff;
  const endDiff = left.end.getTime() - right.end.getTime();
  if (endDiff !== 0) return endDiff;
  const fieldDiff = (left.field?.id ?? '').localeCompare(right.field?.id ?? '');
  if (fieldDiff !== 0) return fieldDiff;
  return left.id.localeCompare(right.id);
};

const durationForReschedule = (match: Match): number => {
  const durationMs = match.end.getTime() - match.start.getTime();
  if (durationMs >= MIN_SCHEDULE_DURATION_MS) {
    return durationMs;
  }
  return MIN_SCHEDULE_DURATION_MS;
};


const toValidDayIndex = (value: unknown): number | null => {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 0 || numeric > 6) {
    return null;
  }
  return numeric;
};

const normalizeSlotDayIndexes = (slot: { daysOfWeek?: unknown; dayOfWeek?: unknown }): number[] => {
  const rawDays = Array.isArray(slot.daysOfWeek) && slot.daysOfWeek.length
    ? slot.daysOfWeek
    : [slot.dayOfWeek];
  return Array.from(
    new Set(
      rawDays
        .map((value) => toValidDayIndex(value))
        .filter((value): value is number => value !== null),
    ),
  );
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
  return Array.from(
    new Set(
      rawFieldIds
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value.length > 0),
    ),
  );
};
const slotPredicateTimeZone = (slot: {
  startDate?: Date;
  startTimeMinutes?: number;
  timeZone?: string | null;
}): string => {
  const configuredTimeZone = normalizeTimeZone(slot.timeZone, 'UTC');
  if (configuredTimeZone !== 'UTC' || typeof slot.startTimeMinutes !== 'number') {
    return configuredTimeZone;
  }
  let localTimeZone: string;
  try {
    localTimeZone = normalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone, 'UTC');
  } catch {
    return configuredTimeZone;
  }
  if (localTimeZone === 'UTC' || !slot.startDate) {
    return configuredTimeZone;
  }
  const localParts = getDateTimePartsInTimeZone(slot.startDate, localTimeZone);
  const utcParts = getDateTimePartsInTimeZone(slot.startDate, configuredTimeZone);
  if (!localParts || !utcParts) {
    return configuredTimeZone;
  }
  const localStartMinutes = localParts.hour * 60 + localParts.minute;
  const utcStartMinutes = utcParts.hour * 60 + utcParts.minute;
  return localStartMinutes === slot.startTimeMinutes && utcStartMinutes !== slot.startTimeMinutes
    ? localTimeZone
    : configuredTimeZone;
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
  if (!allowedFieldIds.length) {
    return true;
  }
  return allowedFieldIds.includes(fieldId);
};

const slotAllowsDivision = (slot: { divisions?: Division[] }, divisionId: string): boolean => {
  if (!Array.isArray(slot.divisions) || !slot.divisions.length) {
    return true;
  }
  return slot.divisions.some((division) => division.id === divisionId);
};

const slotAllowsDate = (
  slot: {
    startDate: Date;
    endDate: Date | null;
    startTimeMinutes: number;
    timeZone?: string | null;
  },
  matchStart: Date,
): boolean => {
  const timeZone = slotPredicateTimeZone(slot);
  const matchParts = getDateTimePartsInTimeZone(matchStart, timeZone);
  const slotStartParts = getDateTimePartsInTimeZone(slot.startDate, timeZone);
  if (!matchParts || !slotStartParts) {
    return false;
  }
  const matchDayMs = Date.UTC(matchParts.year, matchParts.month - 1, matchParts.day);
  const slotStartMs = Date.UTC(slotStartParts.year, slotStartParts.month - 1, slotStartParts.day);
  if (matchDayMs < slotStartMs) return false;
  if (!slot.endDate) return true;
  const slotEndParts = getDateTimePartsInTimeZone(slot.endDate, timeZone);
  if (!slotEndParts) {
    return false;
  }
  const slotEndMs = Date.UTC(slotEndParts.year, slotEndParts.month - 1, slotEndParts.day);
  return matchDayMs <= slotEndMs;
};

const slotAllowsTime = (
  slot: {
    dayOfWeek?: number;
    daysOfWeek?: number[];
    startTimeMinutes: number;
    endTimeMinutes: number;
    timeZone?: string | null;
  },
  matchStart: Date,
  matchEnd: Date,
): boolean => {
  const timeZone = slotPredicateTimeZone(slot);
  const startParts = getDateTimePartsInTimeZone(matchStart, timeZone);
  const endParts = getDateTimePartsInTimeZone(matchEnd, timeZone);
  if (!startParts || !endParts) {
    return false;
  }
  const allowedDays = normalizeSlotDayIndexes(slot);
  const dayOfWeek = (new Date(Date.UTC(
    startParts.year,
    startParts.month - 1,
    startParts.day,
  )).getUTCDay() + 6) % 7;
  if (allowedDays.length && !allowedDays.includes(dayOfWeek)) {
    return false;
  }
  if (
    startParts.year !== endParts.year
    || startParts.month !== endParts.month
    || startParts.day !== endParts.day
  ) {
    return false;
  }
  const startMinutes = startParts.hour * 60 + startParts.minute;
  const endMinutes = endParts.hour * 60 + endParts.minute;
  return startMinutes >= slot.startTimeMinutes && endMinutes <= slot.endTimeMinutes;
};

const slotAllowsDateTime = (
  slot: {
    repeating?: boolean;
    startDate: Date;
    endDate: Date | null;
    dayOfWeek: number;
    startTimeMinutes: number;
    endTimeMinutes: number;
    timeZone?: string | null;
  },
  matchStart: Date,
  matchEnd: Date,
): boolean => {
  if (slot.repeating === false) {
    if (!(slot.startDate instanceof Date) || Number.isNaN(slot.startDate.getTime())) {
      return false;
    }
    if (!(slot.endDate instanceof Date) || Number.isNaN(slot.endDate.getTime())) {
      return false;
    }
    const slotTimeZone = normalizeTimeZone(slot.timeZone, 'UTC');
    const slotStart = dateWithMinutesInTimeZone(slot.startDate, slot.startTimeMinutes, slotTimeZone);
    const slotEndBase = slot.endTimeMinutes > slot.startTimeMinutes ? slot.startDate : slot.endDate;
    const slotEnd = dateWithMinutesInTimeZone(slotEndBase, slot.endTimeMinutes, slotTimeZone);
    if (!slotStart || !slotEnd || slotEnd.getTime() <= slotStart.getTime()) {
      return false;
    }
    return matchStart.getTime() >= slotStart.getTime()
      && matchEnd.getTime() <= slotEnd.getTime();
  }
  return slotAllowsDate(slot, matchStart) && slotAllowsTime(slot, matchStart, matchEnd);
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


const isMatchCompleted = (match: Match): boolean => {
  const status = String(match.status ?? '').trim().toUpperCase();
  const resultStatus = String(match.resultStatus ?? '').trim().toUpperCase();
  if (
    Boolean(match.winnerEventTeamId)
    && (
      ['COMPLETE', 'COMPLETED', 'FINISHED', 'FINAL'].includes(status)
      || ['COMPLETE', 'COMPLETED', 'FINAL'].includes(resultStatus)
      || Boolean(match.actualEnd)
    )
  ) {
    return true;
  }
  const segments = Array.isArray(match.segments) ? match.segments : [];
  if (!segments.length) {
    return false;
  }
  const team1Wins = segments.filter((segment) => (
    segment.status === 'COMPLETE' && segment.winnerEventTeamId === match.team1?.id
  )).length;
  const team2Wins = segments.filter((segment) => (
    segment.status === 'COMPLETE' && segment.winnerEventTeamId === match.team2?.id
  )).length;
  const setsToWin = Math.ceil(segments.length / 2);
  return team1Wins >= setsToWin || team2Wins >= setsToWin;
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

const EMPTY_TEAM_DUTY_REFLOW_CONTEXT: TeamDutyReflowContext = {
  eventCheckedInTeamIds: new Set<string>(),
  checkedInTeamIdsByMatch: new Map<string, ReadonlySet<string>>(),
};

const matchHasPlayingTeam = (match: Match, teamId: string): boolean => (
  match.team1?.id === teamId || match.team2?.id === teamId
);

const matchHasTeamDuty = (match: Match, teamId: string): boolean => (
  match.teamOfficial?.id === teamId
);

const matchHasTeamActivity = (match: Match, teamId: string): boolean => (
  matchHasPlayingTeam(match, teamId) || matchHasTeamDuty(match, teamId)
);

const rangesOverlap = (
  leftStart: Date,
  leftEnd: Date,
  rightStart: Date,
  rightEnd: Date,
): boolean => leftStart.getTime() < rightEnd.getTime() && leftEnd.getTime() > rightStart.getTime();

const historyEndTime = (match: Match): number => (
  match.actualEnd?.getTime() ?? match.end.getTime()
);

const teamCanServeMatchDivision = (team: Team, match: Match): boolean => {
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

const teamIsCheckedInForDuty = (
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

type RankedTeamDutyCandidate = {
  team: Team;
  rankTier: number;
  latestLossAt: number;
  assignmentCount: number;
  restMs: number;
};

const rankTeamDutyCandidate = (
  team: Team,
  target: Match,
  matches: Match[],
): RankedTeamDutyCandidate => {
  const completedPlayingMatches = matches
    .filter((match) => (
      match.id !== target.id
      && matchHasPlayingTeam(match, team.id)
      && isMatchCompleted(match)
      && historyEndTime(match) <= target.start.getTime()
      && Boolean(match.winnerEventTeamId)
    ))
    .sort((left, right) => (
      historyEndTime(right) - historyEndTime(left)
      || left.id.localeCompare(right.id)
    ));
  const latestResult = completedPlayingMatches[0] ?? null;
  const latestResultIsLoss = Boolean(
    latestResult
    && latestResult.winnerEventTeamId
    && latestResult.winnerEventTeamId !== team.id,
  );
  const hasRemainingMatch = matches.some((match) => (
    match.id !== target.id
    && matchHasPlayingTeam(match, team.id)
    && !isMatchCompleted(match)
    && match.start.getTime() >= target.end.getTime()
  ));
  const latestActivityEnd = matches.reduce<number | null>((latest, match) => {
    if (
      match.id === target.id
      || !matchHasTeamActivity(match, team.id)
      || match.end.getTime() > target.start.getTime()
    ) {
      return latest;
    }
    const end = historyEndTime(match);
    return latest == null || end > latest ? end : latest;
  }, null);

  return {
    team,
    rankTier: latestResultIsLoss ? (hasRemainingMatch ? 1 : 0) : 2,
    latestLossAt: latestResultIsLoss && latestResult
      ? historyEndTime(latestResult)
      : Number.NEGATIVE_INFINITY,
    assignmentCount: matches.filter((match) => (
      match.id !== target.id && matchHasTeamDuty(match, team.id)
    )).length,
    restMs: latestActivityEnd == null
      ? Number.POSITIVE_INFINITY
      : target.start.getTime() - latestActivityEnd,
  };
};

const compareRankedTeamDutyCandidates = (
  left: RankedTeamDutyCandidate,
  right: RankedTeamDutyCandidate,
): number => {
  const tierComparison = left.rankTier - right.rankTier;
  if (tierComparison !== 0) {
    return tierComparison;
  }
  const recentLossComparison = left.rankTier <= 1
    ? right.latestLossAt - left.latestLossAt
    : 0;
  return recentLossComparison
    || left.assignmentCount - right.assignmentCount
    || right.restMs - left.restMs
    || left.team.id.localeCompare(right.team.id);
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
      && rangesOverlap(otherMatch.start, otherMatch.end, match.start, match.end)
    )))
    .filter((team) => {
      const latestPriorEnd = matches.reduce<number | null>((latest, otherMatch) => {
        if (
          otherMatch.id === match.id
          || !matchHasTeamActivity(otherMatch, team.id)
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
): void => {
  for (const match of [...matches].sort(compareScheduledOrder)) {
    attachMatchToParticipants(match);
    if (match.teamOfficial || !match.requiresTeamOfficial || !(match.team1 && match.team2)) {
      continue;
    }
    const candidate = eligibleTeamDutyCandidates(event, match, matches, context)[0] ?? null;
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
): LockedPreservingRescheduleResult => {
  const allMatches = Object.values(event.matches);
  if (!allMatches.length) {
    return { event, matches: [], warnings: [] };
  }
  const shouldReflowTeamDuties = teamDutyReflowContext !== EMPTY_TEAM_DUTY_REFLOW_CONTEXT;
  const teamDutyReflowSnapshot = shouldReflowTeamDuties
    ? {
        eventEnd: event.end,
        eventGeneratedScheduleEnd: event.generatedScheduleEnd,
        timeSlotDivisions: event.timeSlots.map((slot) => [slot, slot.divisions] as const),
        fieldMatches: Object.values(event.fields).map((field) => [field, field.matches] as const),
        teamMatches: Object.values(event.teams).map((team) => [team, team.matches] as const),
        officialStates: event.officials.map((official) => [
          official,
          { matches: official.matches, divisions: official.divisions },
        ] as const),
        matchStates: allMatches.map((match) => [
          match,
          {
            start: match.start,
            end: match.end,
            field: match.field,
            placementState: match.placementState,
            team1: match.team1,
            team2: match.team2,
            team1Seed: match.team1Seed,
            team2Seed: match.team2Seed,
            teamOfficial: match.teamOfficial,
            requiresTeamOfficial: match.requiresTeamOfficial,
            reservesTeamOfficial: match.reservesTeamOfficial,
            official: match.official,
            officialAssignments: match.officialAssignments,
            officialCheckedIn: match.officialCheckedIn,
            matchRulesSnapshot: match.matchRulesSnapshot,
            resolvedMatchRules: match.resolvedMatchRules,
          },
        ] as const),
      }
    : null;
  const restoreTeamDutyReflowSnapshot = (): void => {
    if (!teamDutyReflowSnapshot) {
      return;
    }
    event.end = teamDutyReflowSnapshot.eventEnd;
    event.generatedScheduleEnd = teamDutyReflowSnapshot.eventGeneratedScheduleEnd;
    for (const [slot, divisions] of teamDutyReflowSnapshot.timeSlotDivisions) {
      slot.divisions = divisions;
    }
    for (const [match, state] of teamDutyReflowSnapshot.matchStates) {
      Object.assign(match, state);
    }
    for (const [field, matches] of teamDutyReflowSnapshot.fieldMatches) {
      field.matches = matches;
    }
    for (const [team, matches] of teamDutyReflowSnapshot.teamMatches) {
      team.matches = matches;
    }
    for (const [official, state] of teamDutyReflowSnapshot.officialStates) {
      official.matches = state.matches;
      official.divisions = state.divisions;
    }
  };

  try {
    ensureSplitPlayoffTimeSlotCoverage(event);
    const isOpenEndedSchedule = prepareSchedulePlacementWindow(event, false);
    const schedulingDivisions = schedulingDivisionsForEvent(event);
    const rescheduleEndTime = event.end;
  const lockedMatches = allMatches.filter((match) => match.locked);
  const warnings = collectWarnings(event, lockedMatches, rescheduleEndTime);
  resetScheduleCollections(event);
  const staffingPlanner = new OfficialStaffingPlanner(event);
  const plannerHasRequiredSlots = allMatches.some((match) => (
    staffingPlanner.hasRequiredSlots(match)
  ));
  for (const match of allMatches) {
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

  const unlockedMatches = allMatches
    .filter((match) => !match.locked)
    .sort(compareMatches);
  if (plannerHasRequiredSlots) {
    for (const match of unlockedMatches) {
      clearUserOfficialAssignments(match);
    }
  }
  const unlockedById = new Map(unlockedMatches.map((match) => [match.id, match]));
  const pendingIds = new Set(unlockedMatches.map((match) => match.id));
  const detachedPendingAssignments: PendingDependencyAssignment[] = [];

  for (const match of unlockedMatches) {
    const hasUnresolvedDependency = match.getDependencies().some((dependency) => !isMatchCompleted(dependency));
    if (hasUnresolvedDependency) {
      detachedPendingAssignments.push(detachPendingDependencyAssignments(match));
    }
    match.unschedule();
  }

  try {
    while (pendingIds.size > 0) {
      const readyMatches = unlockedMatches
        .filter((match) => pendingIds.has(match.id) && dependenciesAreScheduled(match, pendingIds))
        .sort(compareMatches);

      const nextBatch = readyMatches.length
        ? readyMatches
        : [unlockedById.get(Array.from(pendingIds.values())[0]) as Match];

      for (const match of nextBatch) {
        const matchDuration = durationForReschedule(match);
        if (staffingPlanner.hasStaffingRequirement(match)) {
          schedule.scheduleEventWithOptions(match, matchDuration, {
            canUseCandidate: ({ resource, start, end }) => (
              staffingPlanner.previewSchedulingCandidate(match, resource, start, end)
            ),
          });
          staffingPlanner.commitScheduledMatch(match);
        } else {
          schedule.scheduleEvent(match, matchDuration);
        }
        attachMatchToParticipants(match);
        pendingIds.delete(match.id);
      }
    }
  } finally {
    detachedPendingAssignments.forEach(restorePendingDependencyAssignments);
  }

  const matchesForPostScheduleStaffing = unlockedMatches.filter((match) => (
    plannerHasRequiredSlots
    && staffingPlanner.hasRequiredSlots(match)
    && !staffingPlanner.hasStaffingRequirement(match)
  ));
  if (matchesForPostScheduleStaffing.length > 0) {
    staffingPlanner.assignMatches(matchesForPostScheduleStaffing);
  }
  if (shouldReflowTeamDuties) {
    assignMissingCheckedInTeamOfficials(event, allMatches, teamDutyReflowContext);
  }
  if (
    shouldReflowTeamDuties
    && allMatches.some((match) => staffingPlanner.isHardTeamCoverageRequired(match))
  ) {
    const unstaffedMatch = allMatches.find((match) => (
      staffingPlanner.isHardTeamCoverageRequired(match)
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
  finalizeOpenEndedSchedule(event, allMatches);

  return {
    event,
    matches: allMatches.sort(compareMatches),
    warnings: [...warnings, ...collectUnresolvedStaffingDiagnostics(allMatches)],
  };
  } catch (error) {
    restoreTeamDutyReflowSnapshot();
    throw error;
  }
};
