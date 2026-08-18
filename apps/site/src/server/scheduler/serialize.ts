import { resolveDivisionCompetitionPhase } from '@/lib/divisionPhaseSettings';
import { Division, League, Match, PlayingField, Team, TimeSlot, Tournament, UserData } from './types';
import {
  LEGACY_OFFICIAL_SCHEDULING_MODE_BY_PRIORITY,
  type EventOfficialPosition,
  type MatchOfficialAssignment,
} from '@/server/officials/config';
const serializeDivision = (division: Division) => ({
  id: division.id,
  name: division.name,
  kind: division.kind,
  role: division.role,
  phase: division.phase,
  phaseSettings: Object.fromEntries(
    Object.entries(division.phaseSettings ?? {}).map(([phase, settings]) => [
      phase,
      {
        ...settings,
        officialPositions: settings.officialPositions?.map((position) => ({ ...position })),
      },
    ]),
  ),
  teamIds: [...(division.teamIds ?? [])],
  playoffTeamCount: division.playoffTeamCount,
  playoffPlacementDivisionIds: [...(division.playoffPlacementDivisionIds ?? [])],
  standingsOverrides: division.standingsOverrides ? { ...division.standingsOverrides } : null,
  standingsConfirmedAt: division.standingsConfirmedAt ? division.standingsConfirmedAt.toISOString() : null,
  standingsConfirmedBy: division.standingsConfirmedBy ?? null,
  playoffConfig: division.playoffConfig
    ? {
        ...division.playoffConfig,
        winnerBracketPointsToVictory: [...(division.playoffConfig.winnerBracketPointsToVictory ?? [])],
        loserBracketPointsToVictory: [...(division.playoffConfig.loserBracketPointsToVictory ?? [])],
      }
    : null,
  leagueConfig: division.leagueConfig
    ? {
        ...division.leagueConfig,
        pointsToVictory: Array.isArray(division.leagueConfig.pointsToVictory)
          ? [...division.leagueConfig.pointsToVictory]
          : undefined,
      }
    : null,
});

const serializeTeam = (team: Team) => ({
  id: team.id,
  captainId: team.captainId,
  division: team.division?.id ?? team.division,
  kind: team.kind ?? null,
  name: team.name,
  playerIds: team.playerIds ?? [],
  players: (team.players ?? []).map((player) => ({
    id: player.id,
    firstName: player.firstName,
    lastName: player.lastName,
    userName: player.userName,
  })),
  playerRegistrations: (team.playerRegistrations ?? []).map((registration) => ({
    id: registration.id,
    teamId: registration.teamId ?? null,
    userId: registration.userId,
    status: registration.status,
    jerseyNumber: registration.jerseyNumber ?? null,
    position: registration.position ?? null,
    isCaptain: registration.isCaptain ?? false,
  })),
});

const serializeField = (field: PlayingField) => ({
  id: field.id,
  organizationId: field.organizationId ?? null,
  divisions: field.divisions.map((division) => division.id),
  name: field.name,
});

const serializeTimeSlot = (slot: TimeSlot) => {
  const normalizedDays = Array.isArray(slot.daysOfWeek) && slot.daysOfWeek.length
    ? slot.daysOfWeek
    : [slot.dayOfWeek];
  const normalizedFieldIds = Array.isArray(slot.fieldIds) && slot.fieldIds.length
    ? slot.fieldIds
    : slot.field
      ? [slot.field]
      : [];
  return {
    id: slot.id,
    dayOfWeek: normalizedDays[0] ?? slot.dayOfWeek,
    daysOfWeek: normalizedDays,
    startDate: slot.startDate?.toISOString(),
    endDate: slot.endDate ? slot.endDate.toISOString() : null,
    repeating: slot.repeating,
    startTimeMinutes: slot.startTimeMinutes,
    endTimeMinutes: slot.endTimeMinutes,
    price: slot.price ?? null,
    scheduledFieldId: normalizedFieldIds[0] ?? null,
    scheduledFieldIds: normalizedFieldIds,
    divisions: slot.divisions.map((division) => division.id),
  };
};

const serializeUser = (user: UserData) => ({
  id: user.id,
  firstName: user.firstName,
  lastName: user.lastName,
  userName: user.userName,
});

const withoutDollarPrefixedFields = <T extends Record<string, unknown>>(row: T): Omit<T, `$${string}`> => (
  Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith('$'))) as Omit<T, `$${string}`>
);
const completeCanonicalOfficialSlots = (
  assignments: MatchOfficialAssignment[],
  officialPositions: EventOfficialPosition[],
): MatchOfficialAssignment[] => {
  const assignmentBySlot = new Map(
    assignments.map((assignment) => [
      `${assignment.positionId}:${assignment.slotIndex}`,
      assignment,
    ]),
  );
  return [...officialPositions]
    .sort((left, right) => (
      left.order - right.order
      || left.name.localeCompare(right.name)
      || left.id.localeCompare(right.id)
    ))
    .flatMap((position) => (
      Array.from({ length: position.count }, (_, slotIndex) => {
        const assignment = assignmentBySlot.get(`${position.id}:${slotIndex}`);
        if (!assignment?.userId) {
          return {
            positionId: position.id,
            slotIndex,
            holderType: 'OFFICIAL' as const,
            userId: null,
            eventOfficialId: null,
            checkedIn: false,
            hasConflict: false,
          };
        }
        return {
          positionId: position.id,
          slotIndex,
          holderType: assignment.holderType,
          userId: assignment.userId,
          eventOfficialId: assignment.eventOfficialId ?? null,
          checkedIn: assignment.checkedIn === true,
          hasConflict: assignment.hasConflict === true,
        };
      })
    ));
};
const officialPositionsForMatch = (
  match: Match,
  fallback: EventOfficialPosition[] | undefined,
  eventType?: string,
): EventOfficialPosition[] | undefined => {
  const phase = match.division.phase ?? resolveDivisionCompetitionPhase({
    eventType,
    divisionKind: match.division.kind,
    hasBracketLinks: match.getDependencies().length > 0 || match.getDependants().length > 0,
  });
  return match.division.phaseSettings?.[phase]?.officialPositions ?? fallback;
};



const serializeMatch = (
  match: Match,
  officialPositions?: EventOfficialPosition[],
  eventType?: string,
) => {
  const canonicalOfficialPositions = officialPositionsForMatch(
    match,
    officialPositions,
    eventType,
  );
  const officialAssignments = (
    canonicalOfficialPositions
      ? completeCanonicalOfficialSlots(
          match.officialAssignments ?? [],
          canonicalOfficialPositions,
        )
      : (match.officialAssignments ?? [])
  ).map((assignment) => ({
    positionId: assignment.positionId,
    slotIndex: assignment.slotIndex,
    holderType: assignment.holderType,
    userId: assignment.userId ?? null,
    eventOfficialId: assignment.eventOfficialId ?? null,
    checkedIn: assignment.checkedIn === true,
    hasConflict: assignment.hasConflict === true,
  }));
  const sourceDivisionId = match.division?.sourceDivisionId ?? null;
  const phaseDivisionId =
    match.division?.role === "PHASE" ? match.division.id : null;
  return {
  id: match.id,
  matchId: match.matchId ?? null,
  eventId: match.eventId,
  start: match.start ? match.start.toISOString() : null,
  end: match.end ? match.end.toISOString() : null,
  locked: Boolean(match.locked),
  placementState: match.placementState,
  phase: match.division?.phase ?? null,
  sourceDivisionId,
  phaseDivisionId,
  division: sourceDivisionId ?? match.division?.id ?? null,
  fieldId: match.field?.id ?? null,
  team1Id: match.team1?.id ?? null,
  team2Id: match.team2?.id ?? null,
  team1Seed: match.team1Seed ?? null,
  team2Seed: match.team2Seed ?? null,
  status: match.status ?? null,
  resultStatus: match.resultStatus ?? null,
  resultType: match.resultType ?? null,
  actualStart: match.actualStart ? match.actualStart.toISOString() : null,
  actualEnd: match.actualEnd ? match.actualEnd.toISOString() : null,
  statusReason: match.statusReason ?? null,
  winnerEventTeamId: match.winnerEventTeamId ?? null,
  matchRulesSnapshot: match.matchRulesSnapshot ?? null,
  resolvedMatchRules: match.resolvedMatchRules ?? null,
  segments: (match.segments ?? []).map((segment) => withoutDollarPrefixedFields({ ...segment })),
  incidents: (match.incidents ?? []).map((incident) => withoutDollarPrefixedFields({ ...incident })),
  officialIds: officialAssignments.filter((assignment) => assignment.userId !== null),
  officialAssignments,
  teamOfficialId: match.teamOfficial?.id ?? null,
  teamOfficialSeed: null,
  team1Points: match.team1Points ?? [],
  team2Points: match.team2Points ?? [],
  losersBracket: match.losersBracket ?? false,
  winnerNextMatchId: match.winnerNextMatch?.id ?? null,
  loserNextMatchId: match.loserNextMatch?.id ?? null,
  previousLeftId: match.previousLeftMatch?.id ?? null,
  previousRightId: match.previousRightMatch?.id ?? null,
  side: match.side ?? null,
  officialCheckedIn: match.officialCheckedIn ?? false,
  team1: match.team1 ? serializeTeam(match.team1) : null,
  team2: match.team2 ? serializeTeam(match.team2) : null,
  teamOfficial: match.teamOfficial ? serializeTeam(match.teamOfficial) : null,
  official: match.official ? serializeUser(match.official) : null,
  field: match.field ? serializeField(match.field) : null,
};
};

const serializeEventBase = (event: Tournament | League) => ({
  id: event.id,
  name: event.name,
  description: event.description,
  start: event.start.toISOString(),
  end: event.end.toISOString(),
  location: event.location,
  coordinates: event.coordinates ?? null,
  price: event.price ?? null,
  minAge: event.minAge ?? null,
  maxAge: event.maxAge ?? null,
  rating: event.rating ?? null,
  imageId: event.imageId,
  hostId: event.hostId,
  noFixedEndDateTime: event.noFixedEndDateTime ?? true,
  scheduleEndConstraint: event.scheduleEndConstraint?.toISOString() ?? null,
  generatedScheduleEnd: event.generatedScheduleEnd?.toISOString() ?? null,
  state: event.state,
  maxParticipants: event.maxParticipants,
  teamSizeLimit: event.teamSizeLimit ?? null,
  restTimeMinutes: event.restTimeMinutes ?? 0,
  teamSignup: event.teamSignup,
  singleDivision: event.singleDivision,
  waitListIds: event.waitListIds ?? [],
  freeAgentIds: event.freeAgentIds ?? [],
  teamIds: Array.isArray(event.registeredTeamIds) && event.registeredTeamIds.length
    ? [...event.registeredTeamIds]
    : Object.keys(event.teams),
  userIds: event.players.map((player) => player.id),
  fieldIds: Object.keys(event.fields),
  timeSlotIds: event.timeSlots.map((slot) => slot.id),
  officialIds: event.officials.map((official) => official.id),
  officialSchedulingMode: LEGACY_OFFICIAL_SCHEDULING_MODE_BY_PRIORITY[event.staffingPriority],
  staffingPriority: event.staffingPriority,
  officialPositions: (event.officialPositions ?? []).map((position) => ({ ...position })),
  eventOfficials: (event.eventOfficials ?? []).map((official) => ({
    ...official,
    positionIds: [...official.positionIds],
    fieldIds: [...official.fieldIds],
  })),
  matchRulesOverride: event.matchRulesOverride ?? null,
  autoCreatePointMatchIncidents: event.autoCreatePointMatchIncidents ?? false,
  resolvedMatchRules: event.resolvedMatchRules ?? null,
  cancellationRefundHours: event.cancellationRefundHours ?? null,
  registrationCutoffHours: event.registrationCutoffHours ?? null,
  seedColor: event.seedColor ?? null,
  eventType: event.eventType,
  sportIds: [...event.sportIds],
  leagueScoringConfigId: (event.leagueScoringConfig as any)?.id ?? null,
  organizationId: event.organizationId ?? null,
  requiredTemplateIds: event.requiredTemplateIds ?? [],
  allowPaymentPlans: event.allowPaymentPlans ?? false,
  installmentCount: event.installmentCount ?? 0,
  installmentDueDates: event.installmentDueDates.map((date) => date.toISOString()),
  installmentDueRelativeDays: event.installmentDueRelativeDays ?? [],
  installmentAmounts: event.installmentAmounts ?? [],
  allowTeamSplitDefault: event.allowTeamSplitDefault ?? false,
  splitLeaguePlayoffDivisions: event.splitLeaguePlayoffDivisions ?? false,
  divisions: event.divisions.map((division) => division.id),
  divisionDetails: event.divisions.map(serializeDivision),
  playoffDivisionDetails: event instanceof League
    ? event.playoffDivisions.map(serializeDivision)
    : [],
  fields: Object.values(event.fields).map(serializeField),
  teams: Object.values(event.teams).map(serializeTeam),
  timeSlots: event.timeSlots.map(serializeTimeSlot),
  officials: event.officials.map(serializeUser),
});

const serializeTournamentExtras = (event: Tournament) => ({
  doubleElimination: event.doubleElimination ?? false,
  winnerSetCount: event.winnerSetCount ?? null,
  loserSetCount: event.loserSetCount ?? null,
  winnerBracketPointsToVictory: event.winnerBracketPointsToVictory ?? [],
  loserBracketPointsToVictory: event.loserBracketPointsToVictory ?? [],
  prize: event.prize ?? null,
  fieldCount: (() => {
    const configuredFieldCount = Object.keys(event.fields ?? {}).length;
    if (configuredFieldCount > 0) {
      return configuredFieldCount;
    }
    return event.fieldCount ?? null;
  })(),
  matches: Object.values(event.matches).map((match) =>
    serializeMatch(match, event.officialPositions, event.eventType),
  ),
  usesSets: event.usesSets ?? false,
  matchDurationMinutes: event.matchDurationMinutes ?? null,
  setDurationMinutes: event.setDurationMinutes ?? null,
  setsPerMatch: event.setsPerMatch ?? null,
  doTeamsOfficiate: event.doTeamsOfficiate === true,
  teamOfficialsMaySwap: event.doTeamsOfficiate === true ? event.teamOfficialsMaySwap ?? false : false,
  teamCheckInMode: event.teamSignup ? event.teamCheckInMode ?? 'OFF' : 'OFF',
  teamCheckInOpenMinutesBefore: event.teamCheckInOpenMinutesBefore ?? 60,
  allowMatchRosterEdits: event.teamSignup ? event.allowMatchRosterEdits ?? false : false,
  allowTemporaryMatchPlayers: event.teamSignup && event.allowMatchRosterEdits
    ? event.allowTemporaryMatchPlayers ?? false
    : false,
});

const serializeLeagueExtras = (event: League) => ({
  gamesPerOpponent: event.gamesPerOpponent ?? 1,
  includePlayoffs: event.includePlayoffs ?? false,
  playoffTeamCount: event.playoffTeamCount ?? 0,
  pointsToVictory: event.pointsToVictory ?? [],
});

export const serializeEvent = (event: Tournament | League) => {
  const base = serializeEventBase(event);
  const tournamentExtras = serializeTournamentExtras(event);
  const leagueExtras = event instanceof League ? serializeLeagueExtras(event) : {};
  return { ...base, ...tournamentExtras, ...leagueExtras };
};

export const serializeMatches = (
  matches: Match[],
  officialPositions?: EventOfficialPosition[],
) => matches.map((match) => serializeMatch(match, officialPositions));
