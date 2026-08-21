import { MIN_BRACKET_TEAM_COUNT } from '@/lib/divisionTypes';
import { EventBuilder } from './EventBuilder';
import {
  collectUnresolvedStaffingDiagnostics,
  type StaffingDiagnostic,
} from './officialStaffing';
import { ScheduleError } from './scheduleErrors';
import { validatePlayoffDivisionReferenceCapacities } from './standings';
import { TimeSlotValidationError, type ResolvedOneTimeTimeSlot } from '@/lib/timeSlotAvailability';
import {
  Division,
  League,
  Match,
  Tournament,
  TIMES,
  MINUTE_MS,
  PlayingField,
  SchedulerContext,
  Team,
  type TimeSlot,
} from './types';
import {
  assertCanonicalSchedulerTimeSlots,
  calculateOneTimeAvailabilityMinutes,
} from './timeSlotAvailability';
import { captureSchedulerState, restoreSchedulerState } from './schedulerState';
import { ensureSplitPlayoffTimeSlotCoverage } from './timeSlotCoverage';
import {
  enumerateRepeatingTimeSlotOccurrences,
  RepeatingTimeSlotValidationError,
} from '@/lib/repeatingTimeSlotAvailability';

export { ScheduleError } from './scheduleErrors';
export type { ScheduleFailureFactor } from './scheduleErrors';

export type ScheduleRequest = {
  event: League | Tournament;
  participantCount?: number;
  includePlaceholderTeams?: boolean;
  canUseCandidate?: (candidate: {
    event: Match;
    resource: PlayingField;
    start: Date;
    end: Date;
  }) => boolean;
};

export type ScheduleResult = {
  preview?: boolean;
  event: League | Tournament;
  matches: Match[];
  warnings: StaffingDiagnostic[];
};



const isLeague = (event: League | Tournament): event is League => {
  return event instanceof League || event.eventType === 'LEAGUE';
};


const normalizeTeamId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const isPlaceholderSchedulerTeam = (team: Team | undefined): boolean =>
  String(team?.kind ?? '').trim().toUpperCase() === 'PLACEHOLDER';


const removeTeamsFromEvent = (event: League | Tournament, shouldRemove: (team: Team | undefined) => boolean): void => {
  const retainedTeams: Record<string, Team> = {};
  for (const [teamId, team] of Object.entries(event.teams)) {
    if (!shouldRemove(team)) {
      retainedTeams[teamId] = team;
    }
  }
  event.teams = retainedTeams;
  event.registeredTeamIds = event.registeredTeamIds.filter((teamId) => Boolean(retainedTeams[teamId]));
  for (const division of event.divisions) {
    division.teamIds = division.teamIds.filter((teamId) => Boolean(retainedTeams[teamId]));
  }
  for (const division of event.playoffDivisions ?? []) {
    division.teamIds = division.teamIds.filter((teamId) => Boolean(retainedTeams[teamId]));
  }
};

const stripPlaceholderTeamsFromEvent = (event: League | Tournament): void => {
  removeTeamsFromEvent(event, isPlaceholderSchedulerTeam);
};

const normalizeLeagueRosterTeamIds = (
  league: League,
  includePlaceholderTeams: boolean,
): string[] => {
  const source = Array.isArray(league.registeredTeamIds) && league.registeredTeamIds.length
    ? league.registeredTeamIds
    : Object.keys(league.teams);
  const playoffDivisionIds = new Set(
    (league.playoffDivisions ?? [])
      .map((division) => String(division.id ?? '').trim().toLowerCase())
      .filter(Boolean),
  );
  const playoffParticipantTeamIds = new Set(
    (league.playoffDivisions ?? [])
      .flatMap((division) => division.teamIds)
      .map((teamId) => normalizeTeamId(teamId))
      .filter((teamId): teamId is string => Boolean(teamId)),
  );
  return Array.from(
    new Set(
      source
        .map((teamId) => normalizeTeamId(teamId))
        .filter((teamId): teamId is string => Boolean(teamId))
        .filter((teamId) => Boolean(league.teams[teamId])),
    ),
  ).filter((teamId) => {
    const team = league.teams[teamId];
    if (!isPlaceholderSchedulerTeam(team)) {
      return true;
    }
    if (!includePlaceholderTeams) {
      return false;
    }
    if (playoffParticipantTeamIds.has(teamId)) {
      return false;
    }
    const teamDivisionId = String(team?.division?.id ?? '').trim().toLowerCase();
    return !playoffDivisionIds.has(teamDivisionId);
  });
};

const applyRosterToLeagueTeams = (
  league: League,
  rosterTeamIds: string[],
  divisionByTeamId: Map<string, Division> = new Map<string, Division>(),
): void => {
  if (!rosterTeamIds.length) {
    return;
  }
  const nextTeams: Record<string, (typeof league.teams)[string]> = {};
  for (const teamId of rosterTeamIds) {
    const team = league.teams[teamId];
    if (!team) {
      continue;
    }
    const mappedDivision = divisionByTeamId.get(teamId);
    if (mappedDivision) {
      team.division = mappedDivision;
    }
    nextTeams[teamId] = team;
  }
  league.teams = nextTeams;
};

const formatTeamLabel = (league: League, teamId: string): string => {
  const team = league.teams[teamId];
  const name = team?.name?.trim() ?? '';
  return name.length > 0 ? name : 'Unnamed Team';
};

const buildSplitDivisionAssignmentState = (
  league: League,
  rosterTeamIds: string[],
): {
  divisionByTeamId: Map<string, Division>;
  unassignedTeamIds: string[];
  duplicateAssignments: Array<{ teamId: string; divisionIds: string[] }>;
} => {
  const rosterSet = new Set(rosterTeamIds);
  const divisionByTeamId = new Map<string, Division>();
  const duplicateAssignments = new Map<string, Set<string>>();

  for (const division of league.divisions) {
    for (const rawTeamId of division.teamIds ?? []) {
      const teamId = normalizeTeamId(rawTeamId);
      if (!teamId || !rosterSet.has(teamId)) {
        continue;
      }
      const existingDivision = divisionByTeamId.get(teamId);
      if (existingDivision && existingDivision.id !== division.id) {
        const conflictDivisionIds = duplicateAssignments.get(teamId) ?? new Set<string>([existingDivision.id]);
        conflictDivisionIds.add(division.id);
        duplicateAssignments.set(teamId, conflictDivisionIds);
        continue;
      }
      divisionByTeamId.set(teamId, division);
    }
  }

  const duplicateEntries = Array.from(duplicateAssignments.entries())
    .map(([teamId, divisionIds]) => ({ teamId, divisionIds: Array.from(divisionIds) }));

  const unassignedTeamIds = rosterTeamIds.filter((teamId) => !divisionByTeamId.has(teamId));

  return {
    divisionByTeamId,
    unassignedTeamIds,
    duplicateAssignments: duplicateEntries,
  };
};

const hasConfiguredSplitDivisionMembership = (
  league: League,
  rosterTeamIds: string[],
): boolean => {
  if (!rosterTeamIds.length) {
    return false;
  }
  const rosterSet = new Set(rosterTeamIds);
  return league.divisions.some((division) => (
    (division.teamIds ?? []).some((rawTeamId) => {
      const teamId = normalizeTeamId(rawTeamId);
      return Boolean(teamId && rosterSet.has(teamId));
    })
  ));
};


const OPEN_ENDED_WEEKS = 52;
const NO_FIELDS_MESSAGE_REGEX = /^Unable to schedule event because no fields are available(?: for divisions:\s*(.+))?\.$/i;
const SCHEDULE_OVERRUN_MESSAGE = 'Not enough time is allotted in the configured time slots to schedule this event.';
const SCHEDULE_OVERRUN_DETAIL = 'No available time slots remaining for scheduling';

const isOpenEndedEventSchedule = (event: League | Tournament): boolean => event.noFixedEndDateTime;

const applyStoredScheduleEnd = (event: League | Tournament): void => {
  if (event.noFixedEndDateTime) {
    return;
  }
  event.end = event.scheduleEndConstraint ?? event.end;
};

const extendOpenEndedWindow = (
  event: League | Tournament,
  minimumPlacementEnd?: Date,
): void => {
  const generatedEnd = event.generatedScheduleEnd;
  const generatedEndMs = hasValidDate(generatedEnd)
    ? generatedEnd.getTime()
    : event.end.getTime();
  const minimumEndMs = hasValidDate(minimumPlacementEnd)
    ? minimumPlacementEnd.getTime()
    : event.start.getTime();
  const baseEndMs = Math.max(
    event.start.getTime(),
    event.end.getTime(),
    generatedEndMs,
    minimumEndMs,
  );
  event.end = new Date(baseEndMs + OPEN_ENDED_WEEKS * 7 * 24 * 60 * MINUTE_MS);
};

const hasValidDate = (value: unknown): value is Date => {
  return value instanceof Date && !Number.isNaN(value.getTime());
};

const isExtendableRecurringSlot = (slot: { repeating?: boolean; endDate?: Date | null }): boolean => {
  if (slot.repeating === false) {
    return false;
  }
  return !hasValidDate(slot.endDate ?? null);
};

const hasExtendableRecurringSlots = (event: League | Tournament): boolean => {
  return event.timeSlots.some((slot) => isExtendableRecurringSlot(slot));
};


const isScheduleOverrunError = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return normalized.includes(SCHEDULE_OVERRUN_DETAIL.toLowerCase())
    || normalized.includes('not enough time is allotted');
};
const setGeneratedScheduleEndFromMatches = (
  result: ScheduleResult,
): void => {
  if (!result.event.noFixedEndDateTime) return;
  const placedMatchEnds = result.matches
    .filter((match) => (
      match.placementState === "PLACED"
      && match.end instanceof Date
      && !Number.isNaN(match.end.getTime())
    ))
    .map((match) => match.end.getTime());
  if (!placedMatchEnds.length) return;
  const generatedScheduleEnd = new Date(Math.max(...placedMatchEnds));
  result.event.generatedScheduleEnd = generatedScheduleEnd;
  result.event.end = generatedScheduleEnd;
};


const resolveSchedulerTimeSlots = (
  event: League | Tournament,
): ResolvedOneTimeTimeSlot[] => {
  try {
    return assertCanonicalSchedulerTimeSlots(event);
  } catch (error) {
    if (error instanceof TimeSlotValidationError || error instanceof RepeatingTimeSlotValidationError) {
      throw new ScheduleError(error.message, 'RESOURCE');
    }
    throw error;
  }
};

export const prepareSchedulePlacementWindow = (
  event: League | Tournament,
  includePlaceholderTeams: boolean,
  resolvedOneTimeSlots: ResolvedOneTimeTimeSlot[] = resolveSchedulerTimeSlots(event),
  minimumPlacementEnd?: Date,
): boolean => {
  const isOpenEndedSchedule = isOpenEndedEventSchedule(event);
  applyStoredScheduleEnd(event);
  if (!isOpenEndedSchedule && event.end.getTime() <= event.start.getTime()) {
    throw new ScheduleError('End date/time must be after start date/time when \"No fixed end datetime scheduling\" is disabled.', 'RESOURCE');
  }
  if (isOpenEndedSchedule) {
    extendOpenEndedWindow(event, minimumPlacementEnd);
    for (const slot of resolvedOneTimeSlots) {
      if (slot.end.getTime() > event.end.getTime()) {
        event.end = slot.end;
      }
    }
  }

  prepareScheduleWindow(event, isOpenEndedSchedule, includePlaceholderTeams);
  return isOpenEndedSchedule;
};

const scheduleEventMutating = (request: ScheduleRequest, context: SchedulerContext): ScheduleResult => {
  const { event } = request;
  const resolvedOneTimeSlots = resolveSchedulerTimeSlots(event);
  const includePlaceholderTeams = request.includePlaceholderTeams !== false;
  if (!includePlaceholderTeams) {
    stripPlaceholderTeamsFromEvent(event);
  }
  if (includePlaceholderTeams && typeof request.participantCount === 'number' && request.participantCount > 0) {
    event.maxParticipants = request.participantCount;
  }

  const isOpenEndedSchedule = prepareSchedulePlacementWindow(
    event,
    includePlaceholderTeams,
    resolvedOneTimeSlots,
  );

  const result = isLeague(event)
    ? buildLeagueSchedule(event, context, isOpenEndedSchedule, includePlaceholderTeams, request.canUseCandidate)
    : (() => {
      ensureSplitPlayoffTimeSlotCoverage(event);
      return buildTournamentSchedule(event, context, isOpenEndedSchedule, includePlaceholderTeams, request.canUseCandidate);
    })();
  finalizeOpenEndedSchedule(result.event, result.matches);
  return result;
};
export const scheduleEvent = (request: ScheduleRequest, context: SchedulerContext): ScheduleResult => {
  const snapshot = captureSchedulerState(request.event);
  try {
    return scheduleEventMutating(request, context);
  } catch (error) {
    restoreSchedulerState(snapshot);
    throw error;
  }
};


const buildLeagueSchedule = (
  league: League,
  context: SchedulerContext,
  isOpenEndedSchedule: boolean,
  includePlaceholderTeams: boolean,
  canUseCandidate?: ScheduleRequest["canUseCandidate"],
): ScheduleResult => {
  const playoffMappingErrors = validatePlayoffDivisionReferenceCapacities(league);
  if (playoffMappingErrors.length > 0) {
    throw new ScheduleError(playoffMappingErrors.join(' '), 'PLAYING_TEAM');
  }
  const rosterTeamIds = normalizeLeagueRosterTeamIds(league, includePlaceholderTeams);
  const splitDivisionMode = !league.singleDivision && league.divisions.length > 0;

  if (splitDivisionMode) {
    const splitMembershipConfigured = hasConfiguredSplitDivisionMembership(league, rosterTeamIds);
    if (splitMembershipConfigured) {
      const assignmentState = buildSplitDivisionAssignmentState(league, rosterTeamIds);

      if (assignmentState.duplicateAssignments.length > 0) {
        const divisionNameById = new Map<string, string>();
        for (const division of league.divisions) {
          divisionNameById.set(division.id, division.name || division.id);
        }
        const conflictSummary = assignmentState.duplicateAssignments
          .map(({ teamId, divisionIds }) => {
            const divisionNames = divisionIds
              .map((divisionId) => divisionNameById.get(divisionId) ?? divisionId)
              .join(', ');
            return `${formatTeamLabel(league, teamId)} -> ${divisionNames}`;
          })
          .join('; ');
        throw new ScheduleError(
          `Cannot schedule split-division league because a team is assigned to multiple divisions: ${conflictSummary}.`,
          'PLAYING_TEAM',
        );
      }

      if (assignmentState.unassignedTeamIds.length > 0) {
        const unassigned = assignmentState.unassignedTeamIds
          .map((teamId) => formatTeamLabel(league, teamId))
          .join(', ');
        throw new ScheduleError(
          `Cannot schedule split-division league until all teams are assigned to a division. Unassigned teams: ${unassigned}.`,
          'PLAYING_TEAM',
        );
      }

      applyRosterToLeagueTeams(league, rosterTeamIds, assignmentState.divisionByTeamId);
    } else {
      // Legacy/synthetic callers may still only provide team.division without
      // explicit division.teamIds membership payloads.
      applyRosterToLeagueTeams(league, rosterTeamIds);
    }
  } else {
    applyRosterToLeagueTeams(league, rosterTeamIds);
  }

  ensureSplitPlayoffTimeSlotCoverage(league);

  if (!league.timeSlots.length) {
    throw new ScheduleError(
      describeScheduleFailure(league, includePlaceholderTeams ? league.maxParticipants : undefined),
      'RESOURCE',
    );
  }
  let updated: League | null = null;
  let extensionAttempt = 0;
  const maxExtensions = 3;
  const baseTeams = { ...league.teams };
  const canExtendWindow = isOpenEndedSchedule && hasExtendableRecurringSlots(league);

  while (!updated) {
    // Retry attempts must start from the original roster. Placeholder teams
    // are synthetic and should not leak into later attempts.
    league.teams = { ...baseTeams };
    for (const team of Object.values(league.teams)) {
      team.matches = [];
    }

    const builder = new EventBuilder(league, context, { includePlaceholderTeams, canUseCandidate });
    try {
      const scheduled = builder.buildSchedule();
      if (!(scheduled instanceof League)) {
        throw new ScheduleError('Builder returned unexpected event type');
      }
      updated = scheduled;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      context.error(`schedule_event: scheduling failed (${errMsg}), attempt ${extensionAttempt + 1}`);
      if (errMsg.toLowerCase().includes('no fields')) {
        // Misconfiguration: surface this as a 4xx instead of a 500.
        throw new ScheduleError(formatNoFieldsErrorForUser(errMsg, league), 'RESOURCE');
      }
      if (errMsg.toLowerCase().includes('split playoff divisions are enabled')) {
        throw new ScheduleError(errMsg);
      }
      if (canExtendWindow && extensionAttempt < maxExtensions) {
        extensionAttempt += 1;
        const extraWeeks = Math.max(2, extensionAttempt * 2);
        league.end = new Date(league.end.getTime() + extraWeeks * 7 * 24 * 60 * MINUTE_MS);
        context.log(`schedule_event: extending season end to ${league.end.toISOString()} for retry`);
        continue;
      }
      // Build the failure summary from the original roster, not synthetic
      // playoff placeholders created during the failed attempt.
      league.teams = { ...baseTeams };
      for (const team of Object.values(league.teams)) {
        team.matches = [];
      }
      const baselineTeamCount = Object.keys(baseTeams).length;
      const message = describeScheduleFailure(
        league,
        Math.max(league.maxParticipants ?? 0, baselineTeamCount),
      );
      const typedError = err instanceof ScheduleError ? err : null;
      if (isScheduleOverrunError(errMsg)) {
        const preservesFailureDetail = typedError
          && typedError.restrictingFactor !== 'RESOURCE'
          && typedError.restrictingFactor !== 'UNKNOWN';
        throw new ScheduleError(
          preservesFailureDetail
            ? errMsg
            : `${SCHEDULE_OVERRUN_MESSAGE} ${message}`,
          typedError?.restrictingFactor ?? 'UNKNOWN',
        );
      }
      if (typedError) {
        throw typedError;
      }
      throw new ScheduleError(errMsg, 'UNKNOWN');
    }
  }

  const matches = Object.values(updated.matches);
  const latestEnd = latestMatchEnd(matches);
  if (latestEnd && !isOpenEndedSchedule && latestEnd.getTime() > updated.end.getTime()) {
    throw new ScheduleError(
      'Scheduled matches exceed the fixed event end date/time. Increase the end date/time or enable "No fixed end datetime scheduling".',
      hasTeamDutyPlacementRestriction(matches) ? 'TEAM_DUTY' : 'RESOURCE',
    );
  }

  return {
    preview: false,
    event: updated,
    matches,
    warnings: collectUnresolvedStaffingDiagnostics(matches),
  };
};

const collectDivisionNameById = (league: League): Map<string, string> => {
  const names = new Map<string, string>();
  const remember = (division: Division) => {
    const divisionId = String(division.id || '').trim();
    const divisionName = String(division.name || '').trim();
    if (!divisionId || !divisionName) {
      return;
    }
    names.set(divisionId, divisionName);
  };
  league.divisions.forEach(remember);
  league.playoffDivisions.forEach(remember);
  return names;
};

const titleCase = (value: string): string =>
  value
    .split(' ')
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');

const fallbackDivisionNameFromId = (divisionId: string): string => {
  const normalized = String(divisionId || '').trim();
  if (!normalized) {
    return 'Unknown Division';
  }
  const token = normalized.includes('__division__')
    ? normalized.split('__division__').pop() || normalized
    : normalized;
  const clean = token
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean);
  if (!clean || looksLikeUuid) {
    return 'Unknown Division';
  }
  return titleCase(clean);
};

const formatNoFieldsErrorForUser = (message: string, league: League): string => {
  const match = message.match(NO_FIELDS_MESSAGE_REGEX);
  if (!match) {
    return message;
  }
  const rawDivisionIds = String(match[1] || '')
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  if (!rawDivisionIds.length) {
    return 'Unable to schedule event because no fields are available.';
  }
  const nameById = collectDivisionNameById(league);
  const labels = rawDivisionIds.map((divisionId) => nameById.get(divisionId) || fallbackDivisionNameFromId(divisionId));
  const uniqueLabels = Array.from(new Set(labels.filter((label) => label.length > 0)));
  if (!uniqueLabels.length) {
    return 'Unable to schedule event because no fields are available.';
  }
  return `Unable to schedule event because no fields are available for divisions: ${uniqueLabels.join(', ')}.`;
};

const buildTournamentSchedule = (
  tournament: Tournament,
  context: SchedulerContext,
  isOpenEndedSchedule: boolean,
  includePlaceholderTeams: boolean,
  canUseCandidate?: ScheduleRequest["canUseCandidate"],
): ScheduleResult => {
  const builder = new EventBuilder(tournament, context, { includePlaceholderTeams, canUseCandidate });
  let scheduled: Tournament;
  try {
    const result = builder.buildSchedule();
    if (!(result instanceof Tournament)) {
      throw new ScheduleError('Builder returned unexpected event type');
    }
    scheduled = result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof ScheduleError) {
      throw error;
    }
    throw new ScheduleError(
      isScheduleOverrunError(message) ? SCHEDULE_OVERRUN_MESSAGE : message,
      'UNKNOWN',
    );
  }
  const matches = Object.values(scheduled.matches);
  const latestEnd = latestMatchEnd(matches);
  if (latestEnd && !isOpenEndedSchedule && latestEnd.getTime() > scheduled.end.getTime()) {
    throw new ScheduleError(
      'Scheduled matches exceed the fixed event end date/time. Increase the end date/time or enable "No fixed end datetime scheduling".',
      hasTeamDutyPlacementRestriction(matches) ? 'TEAM_DUTY' : 'RESOURCE',
    );
  }
  return {
    preview: false,
    event: scheduled,
    matches,
    warnings: collectUnresolvedStaffingDiagnostics(matches),
  };
};

const latestMatchEnd = (matches: Match[]): Date | null => {
  let latest: Date | null = null;
  for (const match of matches) {
    if (
      hasValidDate(match.end)
      && (!latest || match.end.getTime() > latest.getTime())
    ) {
      latest = match.end;
    }
  }
  return latest;
};

export const finalizeOpenEndedSchedule = (
  event: League | Tournament,
  matches: Match[],
): void => {
  if (!event.noFixedEndDateTime) {
    return;
  }
  if (!matches.length) {
    event.generatedScheduleEnd = event.end;
    return;
  }
  const latestEnd = latestMatchEnd(matches);
  if (!latestEnd) {
    return;
  }
  event.end = latestEnd;
  event.generatedScheduleEnd = latestEnd;
};
const hasTeamDutyPlacementRestriction = (matches: Match[]): boolean => matches.some(
  (match) => (match as Match & { placementRestriction?: string }).placementRestriction === 'TEAM_DUTY',
);

const projectedDivisionTeamCounts = (event: League, fallbackTotal: number = 0): Map<string, number> => {
  const participantsByDivision = new Map<string, number>();
  for (const team of Object.values(event.teams)) {
    const divisionId = team.division?.id ?? event.divisions[0]?.id ?? 'default';
    participantsByDivision.set(divisionId, (participantsByDivision.get(divisionId) ?? 0) + 1);
  }

  const configuredDivisions = event.divisions.length ? event.divisions : [new Division('default', 'Default')];
  const divisionFallbackCapacity = event.maxParticipants && event.maxParticipants > 0
    ? Math.ceil(event.maxParticipants / Math.max(configuredDivisions.length, 1))
    : 0;

  const byDivision = new Map<string, number>();
  for (const division of configuredDivisions) {
    const currentCount = participantsByDivision.get(division.id) ?? 0;
    const configuredCapacity = typeof division.maxParticipants === 'number' && Number.isFinite(division.maxParticipants)
      ? Math.max(0, Math.trunc(division.maxParticipants))
      : divisionFallbackCapacity;
    byDivision.set(division.id, Math.max(currentCount, configuredCapacity));
    participantsByDivision.delete(division.id);
  }

  for (const [divisionId, count] of participantsByDivision.entries()) {
    byDivision.set(divisionId, Math.max(0, Math.trunc(count)));
  }

  if (!byDivision.size && fallbackTotal > 0) {
    byDivision.set(configuredDivisions[0].id, Math.max(0, Math.trunc(fallbackTotal)));
  }

  return byDivision;
};

const resolveDivisionPlayoffTeamCount = (
  event: League,
  division: Division | undefined,
  teamCount: number,
): number => {
  if (teamCount < MIN_BRACKET_TEAM_COUNT) {
    return 0;
  }
  const configuredDivisionCount = typeof division?.playoffTeamCount === 'number' && Number.isFinite(division.playoffTeamCount)
    ? Math.max(MIN_BRACKET_TEAM_COUNT, Math.trunc(division.playoffTeamCount))
    : null;
  const configuredEventCount = typeof event.playoffTeamCount === 'number' && Number.isFinite(event.playoffTeamCount)
    ? Math.max(MIN_BRACKET_TEAM_COUNT, Math.trunc(event.playoffTeamCount))
    : MIN_BRACKET_TEAM_COUNT;
  const configured = configuredDivisionCount ?? configuredEventCount;
  return Math.min(configured, teamCount);
};

const resolveSplitPlayoffDivisionCapacity = (
  event: League,
  playoffDivision: Division,
): number => {
  const explicitCapacity = (() => {
    if (typeof playoffDivision.maxParticipants === 'number' && Number.isFinite(playoffDivision.maxParticipants)) {
      return Math.max(MIN_BRACKET_TEAM_COUNT, Math.trunc(playoffDivision.maxParticipants));
    }
    if (typeof playoffDivision.playoffTeamCount === 'number' && Number.isFinite(playoffDivision.playoffTeamCount)) {
      return Math.max(MIN_BRACKET_TEAM_COUNT, Math.trunc(playoffDivision.playoffTeamCount));
    }
    return null;
  })();
  if (explicitCapacity !== null) {
    return explicitCapacity;
  }
  const fallbackLeagueCount = typeof event.playoffTeamCount === 'number' && Number.isFinite(event.playoffTeamCount)
    ? Math.max(MIN_BRACKET_TEAM_COUNT, Math.trunc(event.playoffTeamCount))
    : MIN_BRACKET_TEAM_COUNT;
  return fallbackLeagueCount;
};

const resolveSplitPlayoffDivisionDoubleElimination = (
  event: League,
  playoffDivision: Division,
): boolean => {
  if (typeof playoffDivision.playoffConfig?.doubleElimination === 'boolean') {
    return playoffDivision.playoffConfig.doubleElimination;
  }
  return Boolean(event.doubleElimination);
};

const describeScheduleFailure = (event: League, placeholderCount?: number): string => {
  let teamCount = Object.keys(event.teams).length;
  if (teamCount < 2 && placeholderCount) {
    teamCount = placeholderCount;
  }
  const totalMatches = estimateLeagueMatches(event, teamCount);

  let matchMinutes = 60;
  let bufferMinutes = 5;
  if (event.usesSets && event.setDurationMinutes && event.setsPerMatch) {
    matchMinutes = event.setDurationMinutes * event.setsPerMatch;
    bufferMinutes = 5 * Math.max(event.setsPerMatch, 1);
  } else if (event.matchDurationMinutes) {
    matchMinutes = event.matchDurationMinutes;
  }
  const minutesPerMatch = matchMinutes + bufferMinutes;

  const weeklySlotMinutesTotal = weeklySlotMinutes(event);
  const weeklyHoursAvailable = weeklySlotMinutesTotal / 60;
  const weeklyMatchesCapacity = minutesPerMatch ? Math.floor(weeklySlotMinutesTotal / minutesPerMatch) : 0;
  const hasRecurringSlots = event.timeSlots.some((slot) => slot.repeating !== false);

  const totalSlotMinutes = calculateSlotMinutes(event);
  const totalHoursAvailable = totalSlotMinutes / 60;
  const totalMatchesCapacity = minutesPerMatch ? Math.floor(totalSlotMinutes / minutesPerMatch) : 0;

  if (!totalSlotMinutes) {
    return 'Unable to schedule league because no valid time-slot windows are configured. Add or extend time slots to continue.';
  }

  const weeklyCapacityLine = hasRecurringSlots
    ? `Approximate capacity from weekly repeating timeslots: ${weeklyMatchesCapacity} matches/week (~${weeklyHoursAvailable.toFixed(1)} hours/week).`
    : 'Approximate capacity from weekly repeating timeslots: 0 matches/week because no weekly repeating timeslots are configured; only explicit one-time windows are available.';

  return [
    'Unable to schedule league with the provided time slots.',
    `Approximate matches needed: ${totalMatches}.`,
    weeklyCapacityLine,
    `Approximate total capacity across the event schedule window: ${totalMatchesCapacity} matches (~${totalHoursAvailable.toFixed(1)} hours).`,
    'Add more slot availability, extend slot windows, or reduce games per opponent/playoff teams to create a schedule.',
  ].join(' ');
};

const calculateSlotMinutes = (event: League): number => {
  if (!event.timeSlots.length) return 0;
  const start = event.start;
  const end = event.end;
  if (start.getTime() >= end.getTime()) return 0;

  let totalMinutes = calculateOneTimeAvailabilityMinutes(event);
  const recurringSlots = event.timeSlots.filter((slot) => slot.repeating !== false);
  for (const slot of recurringSlots) {
    const occurrences = enumerateRepeatingTimeSlotOccurrences({
      slot,
      windowStart: start,
      windowEnd: end,
    });
    for (const occurrence of occurrences) {
      const windowStart = new Date(Math.max(occurrence.start.getTime(), start.getTime()));
      const windowEnd = new Date(Math.min(occurrence.end.getTime(), end.getTime()));
      if (windowEnd.getTime() > windowStart.getTime()) {
        totalMinutes += Math.floor((windowEnd.getTime() - windowStart.getTime()) / MINUTE_MS);
      }
    }
  }
  return totalMinutes;
};

const prepareScheduleWindow = (
  event: Tournament | League,
  allowExtension: boolean,
  includePlaceholderTeams: boolean,
): void => {
  if (!allowExtension) return;
  if (!event.timeSlots.length) return;
  if (!hasExtendableRecurringSlots(event)) return;
  const expectedTeams = projectedTeamCount(event, includePlaceholderTeams);
  const weeklyMinutes = weeklySlotMinutes(event, event.timeSlots.filter((slot) => isExtendableRecurringSlot(slot)));
  if (weeklyMinutes <= 0) return;
  const matchMinutes = estimatedMatchMinutes(event, expectedTeams);
  if (matchMinutes <= 0) return;
  const weeks = Math.max(Math.ceil(matchMinutes / weeklyMinutes), 1);
  const scheduleSpan = (weeks + 1) * 7 * 24 * 60 * MINUTE_MS;
  if (event.end.getTime() <= event.start.getTime() || event.end.getTime() - event.start.getTime() < scheduleSpan) {
    event.end = new Date(event.start.getTime() + scheduleSpan);
  }
};

const projectedTeamCount = (event: Tournament | League, includePlaceholderTeams: boolean): number => {
  if (!includePlaceholderTeams) {
    return Object.keys(event.teams).length;
  }
  if (isLeague(event) && !event.singleDivision && event.divisions.length > 0) {
    const projectedByDivision = projectedDivisionTeamCounts(event, event.maxParticipants || 0);
    const total = Array.from(projectedByDivision.values()).reduce((sum, count) => sum + Math.max(0, count), 0);
    return Math.max(total, 2);
  }
  let teamCount = Object.keys(event.teams).length;
  const maxParticipants = event.maxParticipants || 0;
  if (maxParticipants > teamCount) teamCount = maxParticipants;
  return Math.max(teamCount, 2);
};

const weeklySlotMinutes = (
  event: League | Tournament,
  slots: TimeSlot[] = event.timeSlots,
): number => {
  const windowEnd = new Date(event.start.getTime() + 7 * 24 * 60 * MINUTE_MS);
  let total = 0;
  for (const slot of slots) {
    if (slot.repeating === false) continue;
    const occurrences = enumerateRepeatingTimeSlotOccurrences({
      slot,
      windowStart: event.start,
      windowEnd,
    });
    for (const occurrence of occurrences) {
      if (
        occurrence.start.getTime() >= event.start.getTime()
        && occurrence.start.getTime() < windowEnd.getTime()
      ) {
        total += occurrence.durationMinutes;
      }
    }
  }
  return total;
};

const estimatedMatchMinutes = (event: Tournament | League, teamCount: number): number => {
  const totalMatches = estimateTotalMatches(event, teamCount);
  if (totalMatches <= 0) return 0;
  const minutesPerMatch = matchMinutesWithBuffer(event);
  return totalMatches * minutesPerMatch;
};

const estimateTotalMatches = (event: Tournament | League, teamCount: number): number => {
  if (isLeague(event)) {
    return estimateLeagueMatches(event, teamCount);
  }
  return estimateTournamentMatches(event, teamCount);
};

const estimateLeagueMatches = (event: League, teamCount: number): number => {
  const gamesPerOpponent = event.gamesPerOpponent || 1;
  const splitPlayoffsEnabled = Boolean(event.splitLeaguePlayoffDivisions && event.playoffDivisions.length > 0);
  if (event.singleDivision || event.divisions.length === 0) {
    let regularMatches = 0;
    if (teamCount > 1) {
      regularMatches = Math.floor((teamCount * (teamCount - 1) / 2) * gamesPerOpponent);
    }
    const playoffMatches = (() => {
      if (!event.includePlayoffs) {
        return 0;
      }
      if (splitPlayoffsEnabled) {
        return event.playoffDivisions.reduce((total, playoffDivision) => {
          const playoffCount = resolveSplitPlayoffDivisionCapacity(event, playoffDivision);
          if (playoffCount < MIN_BRACKET_TEAM_COUNT) {
            return total;
          }
          return total + tournamentMatchCount(
            playoffCount,
            resolveSplitPlayoffDivisionDoubleElimination(event, playoffDivision),
          );
        }, 0);
      }
      const playoffCount = resolveDivisionPlayoffTeamCount(event, undefined, teamCount);
      return playoffCount >= MIN_BRACKET_TEAM_COUNT
        ? tournamentMatchCount(playoffCount, Boolean(event.doubleElimination))
        : 0;
    })();
    return regularMatches + playoffMatches;
  }

  const projectedByDivision = projectedDivisionTeamCounts(event, teamCount);
  const divisionLookup = new Map(event.divisions.map((division) => [division.id, division]));
  let regularMatches = 0;
  let playoffMatches = 0;
  for (const [divisionId, divisionTeamCount] of projectedByDivision.entries()) {
    if (divisionTeamCount < 2) {
      continue;
    }
    regularMatches += Math.floor((divisionTeamCount * (divisionTeamCount - 1) / 2) * gamesPerOpponent);
    if (!event.includePlayoffs || splitPlayoffsEnabled) {
      continue;
    }
    const playoffCount = resolveDivisionPlayoffTeamCount(
      event,
      divisionLookup.get(divisionId),
      divisionTeamCount,
    );
    if (playoffCount >= MIN_BRACKET_TEAM_COUNT) {
      playoffMatches += tournamentMatchCount(playoffCount, Boolean(event.doubleElimination));
    }
  }
  if (event.includePlayoffs && splitPlayoffsEnabled) {
    for (const playoffDivision of event.playoffDivisions) {
      const playoffCount = resolveSplitPlayoffDivisionCapacity(event, playoffDivision);
      if (playoffCount < MIN_BRACKET_TEAM_COUNT) {
        continue;
      }
      playoffMatches += tournamentMatchCount(
        playoffCount,
        resolveSplitPlayoffDivisionDoubleElimination(event, playoffDivision),
      );
    }
  }
  return regularMatches + playoffMatches;
};

const estimateTournamentMatches = (event: Tournament, teamCount: number): number => {
  const doubleElimination = event.doubleElimination;
  const divisionCounts: Record<string, number> = {};
  let processed = 0;
  for (const team of Object.values(event.teams)) {
    const divisionId = team.division?.id ?? 'default';
    divisionCounts[divisionId] = (divisionCounts[divisionId] ?? 0) + 1;
    processed += 1;
  }
  let totalMatches = 0;
  for (const count of Object.values(divisionCounts)) {
    totalMatches += tournamentMatchCount(count, doubleElimination);
  }
  const remaining = Math.max(teamCount - processed, 0);
  if (remaining) totalMatches += tournamentMatchCount(remaining, doubleElimination);
  return totalMatches;
};

const tournamentMatchCount = (teamCount: number, doubleElimination: boolean): number => {
  if (teamCount < MIN_BRACKET_TEAM_COUNT) return 0;
  if (doubleElimination) return Math.max(2 * teamCount - 1, 0);
  return Math.max(teamCount - 1, 0);
};

const matchMinutesWithBuffer = (event: Tournament | League): number => {
  const usesSets = event.usesSets;
  const setMinutes = event.setDurationMinutes;
  let setsPerMatch = event.setsPerMatch ?? (event as Tournament).winnerSetCount ?? null;
  if (usesSets && setMinutes && setsPerMatch) {
    const matchMinutes = setMinutes * setsPerMatch;
    const bufferMinutes = 5 * Math.max(setsPerMatch, 1);
    return matchMinutes + bufferMinutes;
  }
  const matchDuration = event.matchDurationMinutes;
  const matchMinutes = matchDuration && matchDuration > 0 ? matchDuration : 60;
  return matchMinutes + 5;
};
