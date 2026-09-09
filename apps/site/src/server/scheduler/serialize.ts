import { isDeepStrictEqual } from 'node:util';
import { resolveDivisionCompetitionPhase } from '@/lib/divisionPhaseSettings';
import { Division, League, Match, PlayingField, Team, TimeSlot, Tournament, UserData } from './types';
import type {
  EventOfficialPosition,
  MatchOfficialAssignment,
} from '@/server/officials/config';

const valueOr = <T>(value: T | null | undefined, fallback: T): T => value ?? fallback;
const nullable = <T>(value: T | null | undefined): T | null => value ?? null;
const copyArray = <T>(value: T[] | null | undefined): T[] => [...valueOr(value, [])];
const copyObjectOrNull = <T extends Record<string, unknown>>(
  value: T | null | undefined,
): T | null => (value ? { ...value } : null);
const serializeDateOrNull = (value: Date | null | undefined): string | null => (
  value ? value.toISOString() : null
);
const mapNullable = <T, R>(
  value: T | null | undefined,
  mapper: (value: T) => R,
): R | null => (value == null ? null : mapper(value));
type SerializedDivision = {
  id: Division['id'];
  name: Division['name'];
  kind: Division['kind'];
  role: Division['role'];
  phase: Division['phase'];
  sourceDivisionId: Division['sourceDivisionId'];
  isSystemGenerated: Division['isSystemGenerated'];
  phaseSettings: Division['phaseSettings'];
  teamIds: Division['teamIds'];
  playoffTeamCount: Division['playoffTeamCount'];
  playoffPlacementDivisionIds: Division['playoffPlacementDivisionIds'];
  standingsOverrides: Division['standingsOverrides'];
  standingsConfirmedAt: string | null;
  standingsConfirmedBy: Division['standingsConfirmedBy'];
  playoffConfig: Division['playoffConfig'];
  leagueConfig: Division['leagueConfig'];
};

const serializeDivisionPhaseSettings = (
  phaseSettings: Division['phaseSettings'] | null | undefined,
) => Object.fromEntries(
  Object.entries(valueOr(phaseSettings, {})).map(([phase, settings]) => [
    phase,
    {
      ...settings,
      officialPositions: settings.officialPositions?.map((position) => ({ ...position })),
    },
  ]),
);

const serializeDivisionPlayoffConfig = (
  config: Division['playoffConfig'],
) => config
  ? {
      ...config,
      winnerBracketPointsToVictory: copyArray(config.winnerBracketPointsToVictory),
      loserBracketPointsToVictory: copyArray(config.loserBracketPointsToVictory),
    }
  : null;

const serializeDivisionLeagueConfig = (
  config: Division['leagueConfig'],
) => config
  ? {
      ...config,
      pointsToVictory: Array.isArray(config.pointsToVictory)
        ? [...config.pointsToVictory]
        : undefined,
    }
  : null;

const serializeDivision = (division: Division): SerializedDivision => ({
  id: division.id,
  name: division.name,
  kind: division.kind,
  role: division.role,
  phase: division.phase,
  sourceDivisionId: division.sourceDivisionId,
  isSystemGenerated: division.isSystemGenerated,
  phaseSettings: serializeDivisionPhaseSettings(division.phaseSettings),
  teamIds: copyArray(division.teamIds),
  playoffTeamCount: division.playoffTeamCount,
  playoffPlacementDivisionIds: copyArray(division.playoffPlacementDivisionIds),
  standingsOverrides: copyObjectOrNull(division.standingsOverrides),
  standingsConfirmedAt: serializeDateOrNull(division.standingsConfirmedAt),
  standingsConfirmedBy: nullable(division.standingsConfirmedBy),
  playoffConfig: serializeDivisionPlayoffConfig(division.playoffConfig),
  leagueConfig: serializeDivisionLeagueConfig(division.leagueConfig),
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

const normalizedTimeSlotDays = (slot: TimeSlot): TimeSlot['daysOfWeek'] => {
  if (Array.isArray(slot.daysOfWeek) && slot.daysOfWeek.length > 0) {
    return slot.daysOfWeek;
  }
  return [slot.dayOfWeek];
};

const normalizedTimeSlotFieldIds = (slot: TimeSlot): string[] => {
  if (Array.isArray(slot.fieldIds) && slot.fieldIds.length > 0) {
    return slot.fieldIds;
  }
  if (slot.field) {
    return [slot.field];
  }
  return [];
};

const serializeTimeSlot = (slot: TimeSlot) => {
  const normalizedDays = normalizedTimeSlotDays(slot);
  const normalizedFieldIds = normalizedTimeSlotFieldIds(slot);
  return {
    id: slot.id,
    dayOfWeek: valueOr(normalizedDays[0], slot.dayOfWeek),
    daysOfWeek: normalizedDays,
    startDate: slot.startDate?.toISOString(),
    endDate: serializeDateOrNull(slot.endDate),
    repeating: slot.repeating,
    startTimeMinutes: slot.startTimeMinutes,
    endTimeMinutes: slot.endTimeMinutes,
    price: nullable(slot.price),
    scheduledFieldId: nullable(normalizedFieldIds[0]),
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



const serializeMatchDate = (
  placementState: Match['placementState'],
  value: Date | null | undefined,
): string | null => {
  if (placementState !== 'PLACED' || !value) {
    return null;
  }
  return value.toISOString();
};

const phaseDivisionIdForMatch = (match: Match): string | null => {
  if (match.division?.role === 'PHASE') {
    return match.division.id;
  }
  return null;
};

const serializeMatchDivisionReferences = (match: Match) => {
  const sourceDivisionId = nullable(match.division?.sourceDivisionId);
  return {
    phase: nullable(match.division?.phase),
    sourceDivisionId,
    phaseDivisionId: phaseDivisionIdForMatch(match),
    division: valueOr(sourceDivisionId, nullable(match.division?.id)),
  };
};

const serializeMatchParticipantIds = (match: Match) => ({
  fieldId: nullable(match.field?.id),
  team1Id: nullable(match.team1?.id),
  team2Id: nullable(match.team2?.id),
  teamOfficialId: nullable(match.teamOfficial?.id),
});

const serializeMatchGraphLinks = (match: Match) => ({
  winnerNextMatchId: nullable(match.winnerNextMatch?.id),
  loserNextMatchId: nullable(match.loserNextMatch?.id),
  previousLeftId: nullable(match.previousLeftMatch?.id),
  previousRightId: nullable(match.previousRightMatch?.id),
});

const serializeOfficialAssignments = (
  match: Match,
  officialPositions: EventOfficialPosition[] | undefined,
  eventType: string | undefined,
) => {
  if (match.placementState === 'UNPLACED') {
    return [];
  }
  const canonicalOfficialPositions = officialPositionsForMatch(
    match,
    officialPositions,
    eventType,
  );
  const assignments = canonicalOfficialPositions
    ? completeCanonicalOfficialSlots(
        valueOr(match.officialAssignments, []),
        canonicalOfficialPositions,
      )
    : valueOr(match.officialAssignments, []);
  return assignments.map((assignment) => ({
    positionId: assignment.positionId,
    slotIndex: assignment.slotIndex,
    holderType: assignment.holderType,
    userId: nullable(assignment.userId),
    eventOfficialId: nullable(assignment.eventOfficialId),
    checkedIn: assignment.checkedIn === true,
    hasConflict: assignment.hasConflict === true,
  }));
};

const serializeMatch = (
  match: Match,
  officialPositions?: EventOfficialPosition[],
  eventType?: string,
) => {
  const officialAssignments = serializeOfficialAssignments(
    match,
    officialPositions,
    eventType,
  );
  const divisionReferences = serializeMatchDivisionReferences(match);
  const participantIds = serializeMatchParticipantIds(match);
  const graphLinks = serializeMatchGraphLinks(match);
  return {
    id: match.id,
    matchId: nullable(match.matchId),
    eventId: match.eventId,
    start: serializeMatchDate(match.placementState, match.start),
    end: serializeMatchDate(match.placementState, match.end),
    locked: Boolean(match.locked),
    placementState: match.placementState,
    phase: divisionReferences.phase,
    sourceDivisionId: divisionReferences.sourceDivisionId,
    phaseDivisionId: divisionReferences.phaseDivisionId,
    division: divisionReferences.division,
    fieldId: participantIds.fieldId,
    team1Id: participantIds.team1Id,
    team2Id: participantIds.team2Id,
    team1Seed: nullable(match.team1Seed),
    team2Seed: nullable(match.team2Seed),
    status: nullable(match.status),
    resultStatus: nullable(match.resultStatus),
    resultType: nullable(match.resultType),
    actualStart: serializeDateOrNull(match.actualStart),
    actualEnd: serializeDateOrNull(match.actualEnd),
    statusReason: nullable(match.statusReason),
    winnerEventTeamId: nullable(match.winnerEventTeamId),
    matchRulesSnapshot: nullable(match.matchRulesSnapshot),
    resolvedMatchRules: nullable(match.resolvedMatchRules),
    segments: valueOr(match.segments, [])
      .map((segment) => withoutDollarPrefixedFields({ ...segment })),
    incidents: valueOr(match.incidents, [])
      .map((incident) => withoutDollarPrefixedFields({ ...incident })),
    officialIds: officialAssignments.filter((assignment) => assignment.userId !== null),
    officialAssignments,
    teamOfficialId: participantIds.teamOfficialId,
    teamOfficialSeed: null,
    team1Points: valueOr(match.team1Points, []),
    team2Points: valueOr(match.team2Points, []),
    losersBracket: valueOr(match.losersBracket, false),
    winnerNextMatchId: graphLinks.winnerNextMatchId,
    loserNextMatchId: graphLinks.loserNextMatchId,
    previousLeftId: graphLinks.previousLeftId,
    previousRightId: graphLinks.previousRightId,
    side: nullable(match.side),
    officialCheckedIn: valueOr(match.officialCheckedIn, false),
    team1: mapNullable(match.team1, serializeTeam),
    team2: mapNullable(match.team2, serializeTeam),
    teamOfficial: mapNullable(match.teamOfficial, serializeTeam),
    official: mapNullable(match.official, serializeUser),
    field: mapNullable(match.field, serializeField),
  };
};
type SerializedDivisionMap = ReadonlyMap<string, SerializedDivision>;

const throwDivisionConflict = (divisionId: string): never => {
  throw new Error(
    `Cannot serialize event: conflicting Division definitions for "${divisionId}".`,
  );
};

const canonicalSerializedDivisions = (
  divisions: Division[],
): Map<string, SerializedDivision> => {
  const canonicalById = new Map<string, SerializedDivision>();
  for (const division of divisions) {
    const serialized = serializeDivision(division);
    const existing = canonicalById.get(division.id);
    if (!existing) {
      canonicalById.set(division.id, serialized);
      continue;
    }
    if (!isDeepStrictEqual(existing, serialized)) {
      throwDivisionConflict(division.id);
    }
  }
  return canonicalById;
};

const canonicalDivisionList = (
  divisions: Division[],
  canonicalById: SerializedDivisionMap,
  deduplicate: boolean,
): SerializedDivision[] => {
  const seen = new Set<string>();
  const result: SerializedDivision[] = [];
  for (const division of divisions) {
    const canonical = canonicalById.get(division.id);
    if (!canonical) {
      throw new Error(
        `Cannot serialize event: Division "${division.id}" has no canonical definition.`,
      );
    }
    if (deduplicate && seen.has(division.id)) {
      continue;
    }
    if (deduplicate) {
      seen.add(division.id);
    }
    result.push(canonical);
  }
  return result;
};

type SerializedDivisionCollections = {
  divisions: SerializedDivision[];
  playoffDivisions: SerializedDivision[];
};

const serializeEventDivisionCollections = (
  event: Tournament | League,
): SerializedDivisionCollections => {
  const configuredPlayoffDivisions = valueOr(event.playoffDivisions, []);
  const allDivisions = [...event.divisions, ...configuredPlayoffDivisions];
  const canonicalById = canonicalSerializedDivisions(allDivisions);
  const isLeague = event instanceof League;
  const tournamentHasPlayoffDivisions = !isLeague && configuredPlayoffDivisions.length > 0;
  const divisionSources = tournamentHasPlayoffDivisions
    ? allDivisions
    : event.divisions;
  const playoffDivisionSources = isLeague || tournamentHasPlayoffDivisions
    ? configuredPlayoffDivisions
    : [];
  return {
    divisions: canonicalDivisionList(
      divisionSources,
      canonicalById,
      tournamentHasPlayoffDivisions,
    ),
    playoffDivisions: canonicalDivisionList(
      playoffDivisionSources,
      canonicalById,
      tournamentHasPlayoffDivisions,
    ),
  };
};

const serializedEventTeamIds = (event: Tournament | League): string[] => {
  if (Array.isArray(event.registeredTeamIds) && event.registeredTeamIds.length > 0) {
    return [...event.registeredTeamIds];
  }
  return Object.keys(event.teams);
};
const serializedLeagueScoringConfigId = (config: unknown): string | null => {
  if (!config || typeof config !== 'object' || !('id' in config)) {
    return null;
  }
  const id = config.id;
  return typeof id === 'string' ? id : null;
};

const serializeEventBase = (event: Tournament | League) => {
  const divisionCollections = serializeEventDivisionCollections(event);
  return {
    id: event.id,
    name: event.name,
    description: event.description,
    start: event.start.toISOString(),
    end: event.end.toISOString(),
    location: event.location,
    coordinates: nullable(event.coordinates),
    price: nullable(event.price),
    minAge: nullable(event.minAge),
    maxAge: nullable(event.maxAge),
    rating: nullable(event.rating),
    imageId: event.imageId,
    hostId: event.hostId,
    noFixedEndDateTime: valueOr(event.noFixedEndDateTime, true),
    scheduleEndConstraint: serializeDateOrNull(event.scheduleEndConstraint),
    generatedScheduleEnd: serializeDateOrNull(event.generatedScheduleEnd),
    state: event.state,
    maxParticipants: event.maxParticipants,
    teamSizeLimit: nullable(event.teamSizeLimit),
    restTimeMinutes: valueOr(event.restTimeMinutes, 0),
    teamSignup: event.teamSignup,
    singleDivision: event.singleDivision,
    waitListIds: valueOr(event.waitListIds, []),
    freeAgentIds: valueOr(event.freeAgentIds, []),
    teamIds: serializedEventTeamIds(event),
    userIds: event.players.map((player) => player.id),
    fieldIds: Object.keys(event.fields),
    timeSlotIds: event.timeSlots.map((slot) => slot.id),
    officialIds: event.officials.map((official) => official.id),
    staffingPriority: event.staffingPriority,
    officialPositions: valueOr(event.officialPositions, [])
      .map((position) => ({ ...position })),
    eventOfficials: valueOr(event.eventOfficials, []).map((official) => ({
      ...official,
      positionIds: [...official.positionIds],
      fieldIds: [...official.fieldIds],
    })),
    matchRulesOverride: nullable(event.matchRulesOverride),
    autoCreatePointMatchIncidents: valueOr(event.autoCreatePointMatchIncidents, false),
    resolvedMatchRules: nullable(event.resolvedMatchRules),
    cancellationRefundHours: nullable(event.cancellationRefundHours),
    registrationCutoffHours: nullable(event.registrationCutoffHours),
    seedColor: nullable(event.seedColor),
    eventType: event.eventType,
    sportIds: [...event.sportIds],
    leagueScoringConfigId: serializedLeagueScoringConfigId(event.leagueScoringConfig),
    organizationId: nullable(event.organizationId),
    requiredTemplateIds: valueOr(event.requiredTemplateIds, []),
    allowPaymentPlans: valueOr(event.allowPaymentPlans, false),
    installmentCount: valueOr(event.installmentCount, 0),
    installmentDueDates: event.installmentDueDates.map((date) => date.toISOString()),
    installmentDueRelativeDays: valueOr(event.installmentDueRelativeDays, []),
    installmentAmounts: valueOr(event.installmentAmounts, []),
    allowTeamSplitDefault: valueOr(event.allowTeamSplitDefault, false),
    splitLeaguePlayoffDivisions: valueOr(event.splitLeaguePlayoffDivisions, false),
    divisions: divisionCollections.divisions.map((division) => division.id),
    divisionDetails: divisionCollections.divisions,
    playoffDivisionDetails: divisionCollections.playoffDivisions,
    fields: Object.values(event.fields).map(serializeField),
    teams: Object.values(event.teams).map(serializeTeam),
    timeSlots: event.timeSlots.map(serializeTimeSlot),
    officials: event.officials.map(serializeUser),
  };
};

const serializedTournamentFieldCount = (event: Tournament): number | null => {
  const configuredFieldCount = Object.keys(valueOr(event.fields, {})).length;
  if (configuredFieldCount > 0) {
    return configuredFieldCount;
  }
  return nullable(event.fieldCount);
};

const serializedTeamOfficialsMaySwap = (event: Tournament): boolean => {
  if (event.doTeamsOfficiate !== true) {
    return false;
  }
  return valueOr(event.teamOfficialsMaySwap, false);
};

const serializedTeamCheckInMode = (event: Tournament): Tournament['teamCheckInMode'] => {
  if (!event.teamSignup) {
    return 'OFF';
  }
  return valueOr(event.teamCheckInMode, 'OFF');
};

const serializedRosterEditPolicy = (event: Tournament): boolean => {
  if (!event.teamSignup) {
    return false;
  }
  return valueOr(event.allowMatchRosterEdits, false);
};

const serializedTemporaryPlayerPolicy = (event: Tournament): boolean => {
  if (!event.teamSignup || !event.allowMatchRosterEdits) {
    return false;
  }
  return valueOr(event.allowTemporaryMatchPlayers, false);
};

const serializeTournamentExtras = (event: Tournament) => ({
  doubleElimination: valueOr(event.doubleElimination, false),
  winnerSetCount: nullable(event.winnerSetCount),
  loserSetCount: nullable(event.loserSetCount),
  winnerBracketPointsToVictory: valueOr(event.winnerBracketPointsToVictory, []),
  loserBracketPointsToVictory: valueOr(event.loserBracketPointsToVictory, []),
  prize: nullable(event.prize),
  fieldCount: serializedTournamentFieldCount(event),
  matches: Object.values(event.matches).map((match) =>
    serializeMatch(match, event.officialPositions, event.eventType),
  ),
  usesSets: valueOr(event.usesSets, false),
  matchDurationMinutes: nullable(event.matchDurationMinutes),
  setDurationMinutes: nullable(event.setDurationMinutes),
  setsPerMatch: nullable(event.setsPerMatch),
  doTeamsOfficiate: event.doTeamsOfficiate === true,
  teamOfficialsMaySwap: serializedTeamOfficialsMaySwap(event),
  teamCheckInMode: serializedTeamCheckInMode(event),
  teamCheckInOpenMinutesBefore: valueOr(event.teamCheckInOpenMinutesBefore, 60),
  allowMatchRosterEdits: serializedRosterEditPolicy(event),
  allowTemporaryMatchPlayers: serializedTemporaryPlayerPolicy(event),
  gamesPerOpponent: valueOr(event.gamesPerOpponent, 1),
  includePlayoffs: valueOr(event.includePlayoffs, false),
  playoffTeamCount: valueOr(event.playoffTeamCount, 0),
  pointsToVictory: valueOr(event.pointsToVictory, []),
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
  eventType?: string,
) => matches.map((match) => serializeMatch(match, officialPositions, eventType));
