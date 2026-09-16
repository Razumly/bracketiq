import { Schedule } from './Schedule';
import {
  Division,
  League,
  Match,
  PlayingField,
  SchedulerContext,
  Team,
  Tournament,
  UserData,
  TIMES,
} from './types';
import { rescheduleEventMatchesPreservingLocks } from './reschedulePreservingLocks';
import {
  finalizeOpenEndedSchedule,
  prepareSchedulePlacementWindow,
} from './scheduleEvent';
import { OfficialStaffingPlanner } from './officialStaffing';
import {
  buildLegacyOfficialAssignment,
  deriveLegacyOfficialCheckedInFromAssignments,
  deriveLegacyOfficialIdFromAssignments,
  type MatchOfficialAssignment,
} from '@/server/officials/config';

export type MatchUpdate = {
  locked?: boolean;
  team1Points?: number[];
  team2Points?: number[];
  team1Id?: string | null;
  team2Id?: string | null;
  officialId?: string | null;
  teamOfficialId?: string | null;
  fieldId?: string | null;
  start?: Date;
  end?: Date;
  side?: string | null;
  winnerNextMatchId?: string | null;
  loserNextMatchId?: string | null;
  previousLeftId?: string | null;
  previousRightId?: string | null;
  officialCheckedIn?: boolean;
  officialAssignments?: MatchOfficialAssignment[] | null;
  matchId?: number | null;
};

export type FinalizeResult = {
  updatedMatch: Match;
  seededTeamIds: string[];
};

const noopContext: SchedulerContext = {
  log: () => {},
  error: () => {},
};


export const isScheduleWindowExceededError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('No available time slots remaining for scheduling');
};

export const isTeamOfficialSchedulingCapacityError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('Not enough teams are available to cover match and team-official slots.');
};

export const isFieldSchedulingCapacityError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('Unable to schedule event because no fields are available')
    || message.includes('No compatible time slots are available for the selected fields and divisions');
};

const ensureMatchesArray = (participant?: { matches?: Match[] } | null) => {
  if (!participant) return [] as Match[];
  if (!participant.matches) participant.matches = [];
  return participant.matches;
};

const detachMatch = (participant: { matches?: Match[] } | null | undefined, match: Match) => {
  if (!participant?.matches) return;
  participant.matches = participant.matches.filter((existing) => existing.id !== match.id);
};

const getMatchStartMs = (match: Match): number | null => {
  const start = (match as unknown as { start?: Date | null }).start;
  if (!(start instanceof Date)) {
    return null;
  }
  const startMs = start.getTime();
  return Number.isNaN(startMs) ? null : startMs;
};

export const shouldAutoLockMatch = (match: Match, now: Date = new Date()): boolean => {
  if (match.officialCheckedIn === true) {
    return true;
  }
  const startMs = getMatchStartMs(match);
  if (startMs === null) {
    return false;
  }
  return startMs <= now.getTime();
};

export const applyPersistentAutoLock = (
  match: Match,
  options?: { now?: Date; explicitLockedValue?: boolean | undefined },
): boolean => {
  if (options?.explicitLockedValue === false) {
    return false;
  }
  if (shouldAutoLockMatch(match, options?.now ?? new Date()) && !match.locked) {
    match.locked = true;
    return true;
  }
  return false;
};

export const applyMatchUpdates = (event: Tournament | League, match: Match, update: MatchUpdate) => {
  if (update.matchId !== undefined) {
    match.matchId = update.matchId ?? null;
  }
  if (update.locked !== undefined) {
    match.locked = Boolean(update.locked);
  }
  if (update.team1Points) {
    match.team1Points = [...update.team1Points];
  }
  if (update.team2Points) {
    match.team2Points = [...update.team2Points];
  }
  if (update.start) {
    match.start = update.start;
  }
  if (update.end) {
    match.end = update.end;
  }
  if (update.officialCheckedIn !== undefined) {
    match.officialCheckedIn = update.officialCheckedIn;
    if (Array.isArray(match.officialAssignments) && match.officialAssignments.length) {
      match.officialAssignments = match.officialAssignments.map((assignment, index) => (
        index === 0 && assignment.holderType === 'OFFICIAL'
          ? { ...assignment, checkedIn: update.officialCheckedIn === true }
          : assignment
      ));
    }
  }
  if (update.side !== undefined) {
    match.side = update.side as any;
  }
  if (update.team1Id !== undefined) {
    detachMatch(match.team1, match);
    match.team1 = update.team1Id ? event.teams[update.team1Id] ?? null : null;
    if (match.team1) ensureMatchesArray(match.team1).push(match);
  }
  if (update.team2Id !== undefined) {
    detachMatch(match.team2, match);
    match.team2 = update.team2Id ? event.teams[update.team2Id] ?? null : null;
    if (match.team2) ensureMatchesArray(match.team2).push(match);
  }
  if (update.teamOfficialId !== undefined) {
    detachMatch(match.teamOfficial, match);
    match.teamOfficial = update.teamOfficialId ? event.teams[update.teamOfficialId] ?? null : null;
    if (match.teamOfficial) ensureMatchesArray(match.teamOfficial).push(match);
  }
  if (update.officialId !== undefined) {
    detachMatch(match.official, match);
    match.official = update.officialId
      ? event.officials.find((official) => official.id === update.officialId) ?? null
      : null;
    match.officialAssignments = buildLegacyOfficialAssignment({
      eventId: match.eventId,
      officialId: update.officialId ?? null,
      officialCheckedIn: update.officialCheckedIn ?? match.officialCheckedIn === true,
      officialPositions: event.officialPositions,
    });
    match.officialCheckedIn = deriveLegacyOfficialCheckedInFromAssignments(match.officialAssignments);
    if (match.official) ensureMatchesArray(match.official).push(match);
  }
  if (update.officialAssignments !== undefined) {
    detachMatch(match.official, match);
    match.officialAssignments = Array.isArray(update.officialAssignments)
      ? update.officialAssignments.map((assignment) => ({ ...assignment }))
      : [];
    const primaryOfficialId = deriveLegacyOfficialIdFromAssignments(match.officialAssignments);
    match.official = primaryOfficialId
      ? event.officials.find((official) => official.id === primaryOfficialId) ?? null
      : null;
    match.officialCheckedIn = match.officialAssignments.length > 0
      ? deriveLegacyOfficialCheckedInFromAssignments(match.officialAssignments)
      : update.officialCheckedIn ?? match.officialCheckedIn;
    if (match.official) ensureMatchesArray(match.official).push(match);
  }
  if (update.fieldId !== undefined) {
    if (match.field) {
      match.field.deleteEvent(match);
    }
    match.field = update.fieldId ? event.fields[update.fieldId] ?? null : null;
    if (match.field) {
      match.field.addEvent(match);
    }
  }
  if (update.previousLeftId !== undefined) {
    match.previousLeftMatch = update.previousLeftId ? event.matches[update.previousLeftId] ?? null : null;
  }
  if (update.previousRightId !== undefined) {
    match.previousRightMatch = update.previousRightId ? event.matches[update.previousRightId] ?? null : null;
  }
  if (update.winnerNextMatchId !== undefined) {
    match.winnerNextMatch = update.winnerNextMatchId ? event.matches[update.winnerNextMatchId] ?? null : null;
  }
  if (update.loserNextMatchId !== undefined) {
    match.loserNextMatch = update.loserNextMatchId ? event.matches[update.loserNextMatchId] ?? null : null;
  }
};

const attachMatchToParticipants = (match: Match) => {
  for (const participant of match.getParticipants()) {
    const matches = ensureMatchesArray(participant);
    if (!matches.includes(match)) matches.push(match);
  }
};

const syncMatchParticipants = (matches: Iterable<Match>) => {
  for (const match of matches) {
    attachMatchToParticipants(match);
  }
};
const applyCanonicalTeamDutyRequirements = (event: Tournament | League): void => {
  const planner = new OfficialStaffingPlanner(event);
  for (const match of Object.values(event.matches)) {
    match.requiresTeamOfficial = planner.isTeamDutyRequired(match);
    match.reservesTeamOfficial =
      match.requiresTeamOfficial && planner.isTeamDutySlotReserved(match);
  }
};


type FinalizationSnapshot = {
  event: Tournament | League;
  eventEnd: Date;
  matches: Array<{
    match: Match;
    team1: Team | null;
    team2: Team | null;
    team1Seed: number | null;
    team2Seed: number | null;
    teamOfficial: Team | null;
    official: UserData | null;
    field: PlayingField | null;
    start: Date;
    placementState: Match['placementState'];
    end: Date;
    locked: boolean;
    status: string | null;
    resultStatus: string | null;
    actualEnd: Date | null;
    actualStart: Date | null;
    winnerEventTeamId: string | null;
    requiresTeamOfficial: boolean;
    reservesTeamOfficial: boolean;
    officialAssignments: MatchOfficialAssignment[];
    officialCheckedIn: boolean;
  }>;
  fieldMatches: Array<{ field: PlayingField; matches: Match[] }>;
  participantMatches: Array<{ participant: Team | UserData; matches: Match[] }>;
  timeSlotDivisions: Array<{
    slot: (Tournament | League)['timeSlots'][number];
    divisions: Division[];
  }>;
  officialDivisions: Array<{ official: UserData; divisions: Division[] }>;
};

const captureFinalizationSnapshot = (event: Tournament | League): FinalizationSnapshot => {
  const matches = Object.values(event.matches);
  const participants = [
    ...Object.values(event.teams),
    ...event.officials,
  ];
  return {
    event,
    eventEnd: event.end,
    matches: matches.map((match) => ({
      match,
      team1: match.team1,
      team2: match.team2,
      team1Seed: match.team1Seed,
      team2Seed: match.team2Seed,
      teamOfficial: match.teamOfficial,
      official: match.official,
      field: match.field,
      placementState: match.placementState,
      start: match.start,
      end: match.end,
      locked: match.locked,
      status: match.status,
      resultStatus: match.resultStatus,
      actualEnd: match.actualEnd,
      actualStart: match.actualStart,
      winnerEventTeamId: match.winnerEventTeamId,
      requiresTeamOfficial: match.requiresTeamOfficial,
      reservesTeamOfficial: match.reservesTeamOfficial,
      officialAssignments: match.officialAssignments,
      officialCheckedIn: match.officialCheckedIn === true,
    })),
    fieldMatches: Object.values(event.fields).map((field) => ({ field, matches: [...field.matches] })),
    participantMatches: participants.map((participant) => ({ participant, matches: [...participant.matches] })),
    timeSlotDivisions: event.timeSlots.map((slot) => ({ slot, divisions: slot.divisions })),
    officialDivisions: event.officials.map((official) => ({ official, divisions: official.divisions })),
  };
};

const restoreFinalizationSnapshot = (snapshot: FinalizationSnapshot): void => {
  snapshot.event.end = snapshot.eventEnd;
  for (const state of snapshot.matches) {
    Object.assign(state.match, {
      team1: state.team1,
      team2: state.team2,
      team1Seed: state.team1Seed,
      team2Seed: state.team2Seed,
      teamOfficial: state.teamOfficial,
      official: state.official,
      field: state.field,
      placementState: state.placementState,
      start: state.start,
      end: state.end,
      locked: state.locked,
      status: state.status,
      resultStatus: state.resultStatus,
      actualEnd: state.actualEnd,
      actualStart: state.actualStart,
      winnerEventTeamId: state.winnerEventTeamId,
      requiresTeamOfficial: state.requiresTeamOfficial,
      reservesTeamOfficial: state.reservesTeamOfficial,
      officialAssignments: state.officialAssignments,
      officialCheckedIn: state.officialCheckedIn,
    });
  }
  for (const state of snapshot.fieldMatches) {
    state.field.matches = [...state.matches];
  }
  for (const state of snapshot.participantMatches) {
    state.participant.matches = [...state.matches];
  }
  for (const state of snapshot.timeSlotDivisions) {
    state.slot.divisions = state.divisions;
  }
  for (const state of snapshot.officialDivisions) {
    state.official.divisions = state.divisions;
  }
};

const buildScheduleParticipants = (event: Tournament | League): Record<string, Team | UserData> => {
  const participants: Record<string, Team | UserData> = { ...event.teams };
  for (const official of event.officials) {
    if (!official.divisions.length) official.divisions = [...event.divisions];
    participants[official.id] = official;
  }
  return participants;
};


const completedSegmentWinnerIds = (match: Match): string[] => (
  (Array.isArray(match.segments) ? match.segments : [])
    .filter((segment) => segment.status === 'COMPLETE' || Boolean(segment.winnerEventTeamId))
    .map((segment) => segment.winnerEventTeamId)
    .filter((winnerId): winnerId is string => typeof winnerId === 'string' && winnerId.length > 0)
);

const segmentScoreTotal = (match: Match, teamId: string): number => (
  (Array.isArray(match.segments) ? match.segments : []).reduce((total, segment) => {
    const score = Number(segment.scores?.[teamId] ?? 0);
    return Number.isFinite(score) ? total + score : total;
  }, 0)
);


export const resolveMatchWinner = (match: Match): Team | null => {
  const teamOne = match.team1;
  const teamTwo = match.team2;
  if (!teamOne || !teamTwo) return null;

  if (match.winnerEventTeamId === teamOne.id) return teamOne;
  if (match.winnerEventTeamId === teamTwo.id) return teamTwo;

  const rules = (match.matchRulesSnapshot ?? match.resolvedMatchRules ?? {}) as { scoringModel?: string; segmentCount?: number };
  const scoringModel = typeof rules.scoringModel === 'string' ? rules.scoringModel : null;
  const segments = Array.isArray(match.segments) ? match.segments : [];

  if (segments.length) {
    if (scoringModel === 'SETS') {
      const winners = completedSegmentWinnerIds(match);
      const team1Wins = winners.filter((winnerId) => winnerId === teamOne.id).length;
      const team2Wins = winners.filter((winnerId) => winnerId === teamTwo.id).length;
      const configuredSegmentCount = Number(rules.segmentCount);
      const segmentCount = Number.isFinite(configuredSegmentCount) && configuredSegmentCount > 0
        ? Math.trunc(configuredSegmentCount)
        : Math.max(segments.length, 1);
      const setsToWin = Math.max(1, Math.ceil(segmentCount / 2));
      if (team1Wins >= setsToWin || team2Wins >= setsToWin) {
        return team1Wins >= team2Wins ? teamOne : teamTwo;
      }
      return null;
    }

    const allScoredSegmentsComplete = segments.every((segment) => segment.status === 'COMPLETE');
    if (allScoredSegmentsComplete) {
      const team1Score = segmentScoreTotal(match, teamOne.id);
      const team2Score = segmentScoreTotal(match, teamTwo.id);
      if (team1Score !== team2Score) {
        return team1Score > team2Score ? teamOne : teamTwo;
      }
    }
  }

  return null;
};


const isValidDate = (value: Date | null | undefined): value is Date => (
  value instanceof Date && !Number.isNaN(value.getTime())
);

const syncUnlockedCompletedMatchScheduleWindow = (match: Match, actualEnd: Date): boolean => {
  if (match.locked) {
    return false;
  }
  const actualStart = isValidDate(match.actualStart) ? match.actualStart : match.start;
  if (!isValidDate(actualStart) || !isValidDate(actualEnd) || actualEnd.getTime() <= actualStart.getTime()) {
    return false;
  }

  if (!isValidDate(match.actualStart)) {
    match.actualStart = actualStart;
  }
  match.start = actualStart;
  match.end = actualEnd;
  return true;
};


const reassignUserOfficial = (match: Match, schedule: Schedule<Match, any, any, Division>): void => {
  if (!match.division) return;
  if (match.official && match.official.matches) {
    match.official.matches = match.official.matches.filter((existing) => existing.id !== match.id);
  }
  const freeParticipants = schedule.freeParticipants(match.division, match.start, match.end);
  const freeRefs = freeParticipants.filter((participant) => participant instanceof UserData) as UserData[];
  if (freeRefs.length) {
    match.official = freeRefs[0];
    ensureMatchesArray(freeRefs[0]).push(match);
  }
};

const unscheduleMatchesOnField = (match: Match): void => {
  if (!match.field) return;
  const matchesOnField = match.field.matches as Match[];
  for (const matchOnField of matchesOnField) {
    if (matchOnField.locked) continue;
    if (matchOnField.start > match.start) {
      matchOnField.unschedule();
    }
  }
};

const processMatches = (
  matches: Match[],
  bracketSchedule: Schedule<Match, any, any, Division>,
  updatedMatch: Match,
  tournament: Tournament | League,
): void => {
  unscheduleMatchesOnField(updatedMatch);
  for (const field of Object.values(tournament.fields)) {
    for (const match of field.matches) {
      if (match.locked) continue;
      if (field === updatedMatch.field && match.start > updatedMatch.start) {
        match.unschedule();
      }
      if (match.start >= updatedMatch.end) {
        match.unschedule();
      }
    }
  }

  for (const match of [...matches].reverse()) {
    if (!match.locked && !match.field) {
      const segmentDurationCount = Math.max(match.segments?.length ?? 0, match.team1Points.length, 1);
      bracketSchedule.scheduleEvent(match, segmentDurationCount * TIMES.SET);
      attachMatchToParticipants(match);
    }
  }
};

export const finalizeMatch = (
  event: Tournament | League,
  updatedMatch: Match,
  _context: SchedulerContext = noopContext,
  currentTime: Date,
): FinalizeResult => {
  syncMatchParticipants(Object.values(event.matches));
  applyCanonicalTeamDutyRequirements(event);

  const seededTeamIds: string[] = [];

  const teamOne = updatedMatch.team1;
  const teamTwo = updatedMatch.team2;
  if (!teamOne || !teamTwo) {
    return { updatedMatch, seededTeamIds };
  }

  const winner = resolveMatchWinner(updatedMatch);
  if (!winner) {
    return { updatedMatch, seededTeamIds };
  }
  const loser = winner === teamOne ? teamTwo : teamOne;

  if (updatedMatch.status === 'COMPLETE' && updatedMatch.winnerEventTeamId === winner.id) {
    return { updatedMatch, seededTeamIds };
  }

  updatedMatch.winnerEventTeamId = winner.id;
  updatedMatch.status = 'COMPLETE';
  updatedMatch.resultStatus = updatedMatch.resultStatus ?? 'OFFICIAL';
  updatedMatch.actualEnd = updatedMatch.actualEnd ?? currentTime;
  const preserveCompletedWindow = syncUnlockedCompletedMatchScheduleWindow(updatedMatch, updatedMatch.actualEnd);

  updatedMatch.advanceTeams(winner, loser);

  if (preserveCompletedWindow) {
    updatedMatch.locked = true;
  }

  if (event instanceof League) {
    // Match completion may move times, but only explicit Schedule Reflow selects Team-duty replacements.
    rescheduleEventMatchesPreservingLocks(event);
    if (preserveCompletedWindow) {
      updatedMatch.locked = false;
    }
    return { updatedMatch, seededTeamIds };
  }

  prepareSchedulePlacementWindow(event, false, undefined, currentTime);
  const participants = buildScheduleParticipants(event);
  const matchesSchedule = new Schedule<Match, PlayingField, Team | UserData, Division>(
    event.start,
    event.fields,
    participants,
    event.divisions,
    currentTime,
    { endTime: event.end, timeSlots: event.timeSlots },
  );

  const orderedMatches = Object.values(event.matches);
  if (!orderedMatches.length) {
    if (preserveCompletedWindow) {
      updatedMatch.locked = false;
    }
    return { updatedMatch, seededTeamIds };
  }

  const rootMatch = [...orderedMatches].sort((a, b) => (b.matchId ?? 0) - (a.matchId ?? 0))[0];
  const queue: Match[] = [rootMatch];
  const matches: Match[] = [];

  while (queue.length) {
    const match = queue.shift() as Match;
    matches.push(match);

    const prevMatches = match.getMatches();
    for (const prevMatch of prevMatches) {
      if (matches.includes(prevMatch) || queue.includes(prevMatch)) continue;
      if (match.losersBracket && match.losersBracket !== prevMatch.losersBracket) continue;

      queue.push(prevMatch);

      if (prevMatch.losersBracket) {
        const leftLoser = Boolean(prevMatch.previousLeftMatch && prevMatch.previousLeftMatch.losersBracket);
        const rightLoser = Boolean(prevMatch.previousRightMatch && prevMatch.previousRightMatch.losersBracket);
        if (leftLoser !== rightLoser) {
          if (leftLoser && prevMatch.previousLeftMatch) {
            queue.push(prevMatch.previousLeftMatch);
          } else if (prevMatch.previousRightMatch) {
            queue.push(prevMatch.previousRightMatch);
          }
        }
      }
    }
  }

  processMatches(matches, matchesSchedule, updatedMatch, event);

  const conflicts = matchesSchedule.getParticipantConflicts();
  for (const [participant, conflictMatches] of conflicts.entries()) {
    if (!(participant instanceof UserData)) {
      continue;
    }
    for (const match of conflictMatches) {
      if (match.official === participant) {
        reassignUserOfficial(match, matchesSchedule);
      }
    }
  }
  finalizeOpenEndedSchedule(event, Object.values(event.matches));


  if (preserveCompletedWindow) {
    updatedMatch.locked = false;
  }
  return { updatedMatch, seededTeamIds };
};

/**
 * Records a valid result and advances its bracket dependencies while retaining
 * the existing schedule. Used when an automatic rebuild cannot staff a future
 * match or cannot find a field eligible for its division.
 */
export const finalizeMatchWithoutRescheduling = (
  event: Tournament | League,
  updatedMatch: Match,
  currentTime: Date,
): FinalizeResult => {
  syncMatchParticipants(Object.values(event.matches));
  applyCanonicalTeamDutyRequirements(event);

  const seededTeamIds: string[] = [];
  const teamOne = updatedMatch.team1;
  const teamTwo = updatedMatch.team2;
  if (!teamOne || !teamTwo) {
    return { updatedMatch, seededTeamIds };
  }

  const winner = resolveMatchWinner(updatedMatch);
  if (!winner) {
    return { updatedMatch, seededTeamIds };
  }
  const loser = winner === teamOne ? teamTwo : teamOne;

  if (updatedMatch.status === 'COMPLETE' && updatedMatch.winnerEventTeamId === winner.id) {
    return { updatedMatch, seededTeamIds };
  }

  updatedMatch.winnerEventTeamId = winner.id;
  updatedMatch.status = 'COMPLETE';
  updatedMatch.resultStatus = updatedMatch.resultStatus ?? 'OFFICIAL';
  updatedMatch.actualEnd = updatedMatch.actualEnd ?? currentTime;
  const preserveCompletedWindow = syncUnlockedCompletedMatchScheduleWindow(updatedMatch, updatedMatch.actualEnd);
  updatedMatch.advanceTeams(winner, loser);

  if (preserveCompletedWindow) {
    updatedMatch.locked = false;
  }
  return { updatedMatch, seededTeamIds };
};

export const finalizeMatchWithTeamOfficialCapacityFallback = (
  event: Tournament | League,
  updatedMatch: Match,
  context: SchedulerContext = noopContext,
  currentTime: Date,
): FinalizeResult => {
  const snapshot = captureFinalizationSnapshot(event);
  try {
    return finalizeMatch(event, updatedMatch, context, currentTime);
  } catch (error) {
    if (
      !isTeamOfficialSchedulingCapacityError(error)
      && !isFieldSchedulingCapacityError(error)
    ) {
      throw error;
    }
    restoreFinalizationSnapshot(snapshot);
    context.error(
      'Automatic rescheduling could not place every future match; preserving the existing schedule while advancing the confirmed result.',
    );
    return finalizeMatchWithoutRescheduling(event, updatedMatch, currentTime);
  }
};



