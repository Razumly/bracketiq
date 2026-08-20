import type { Prisma } from "@/generated/prisma/client";
import {
  deletePristineScheduleByEvent,
  loadEventWithRelations,
  persistScheduledRosterTeams,
  saveEventSchedule,
  saveMatches,
} from "@/server/repositories/events";
import {
  collectPhaseDivisions,
  collectPhaseTeamIdsByDivision,
  persistPhaseParticipantAssignments,
  type PhasePersistenceClient,
} from "@/server/repositories/eventDivisionPhases";
import {
  collectMatchScheduleChanges,
  type MatchScheduleNotificationPlan,
  snapshotMatchScheduleState,
} from "@/server/matchScheduleNotifications";
import { loadEventScheduleState } from "@/server/events/eventEditorSnapshot";
import { loadTeamCheckIns } from "@/server/matches/teamCheckIns";
import {
  applyLeagueDivisionPlayoffReassignment,
  isTournamentPoolPlayStandingsEvent,
  type StandingsAdvancementEvent,
} from "./standings";
import { rescheduleEventMatchesPreservingLocks } from "./reschedulePreservingLocks";
import { EventBuilder } from "./EventBuilder";
import {
  assertPhaseOwnedMatchGraph,
  assertUnplacedMatchGraph,
  matchDemandFromGraph,
  matchDemandFromPersistedGraph,
  rekeyMatchGraph,
  type MatchDemand,
} from "./matchGraph";
import { League, Match, SchedulerContext, Tournament } from "./types";
import {
  finalizeOpenEndedSchedule,
  prepareSchedulePlacementWindow,
  scheduleEvent,
  ScheduleError,
} from "./scheduleEvent";
import type {
  EventEditorMatchProjection,
  EventEditorScheduleWarning,
} from "@/contracts/eventEditor";
import { serializeMatches } from "./serialize";
export type EventScheduleMutationMode =
  | "BUILD"
  | "REBUILD"
  | "DELETE"
  | "RESCHEDULE_PRESERVING_LOCKS";

export type EventScheduleMutationOptions = {
  tx: Prisma.TransactionClient;
  eventId: string;
  mode: EventScheduleMutationMode;
  expectedScheduleRevision?: string;
  historyPolicy?: "REJECT_PROTECTED" | "ALLOW_PROTECTED";
  participantCount?: number;
  includePlaceholderTeams?: boolean;
};

export type EventScheduleMutationResult = {
  event: League | Tournament;
  matches: Match[];
  warnings: EventEditorScheduleWarning[];
  previousMatchCount: number;
  notification: MatchScheduleNotificationPlan | null;
};

export class EventScheduleMutationError extends Error {
  readonly code:
    | "EDITOR_SCHEDULE_REVISION_CONFLICT"
    | "EDITOR_PROTECTED_MATCH_HISTORY"
    | "EDITOR_SCHEDULE_UNSUPPORTED"
    | "EDITOR_SCHEDULE_INPUT_INVALID"
    | "EDITOR_SCHEDULE_FAILED";

  constructor(code: EventScheduleMutationError["code"], message: string) {
    super(message);
    this.name = "EventScheduleMutationError";
    this.code = code;
  }
}

export class EventScheduleRevisionConflictError extends EventScheduleMutationError {
  readonly currentRevision: string;

  constructor(currentRevision: string) {
    super(
      "EDITOR_SCHEDULE_REVISION_CONFLICT",
      "The schedule changed. Reload before saving again.",
    );
    this.name = "EventScheduleRevisionConflictError";
    this.currentRevision = currentRevision;
  }
}

export class EventScheduleProtectedHistoryError extends EventScheduleMutationError {
  constructor() {
    super(
      "EDITOR_PROTECTED_MATCH_HISTORY",
      "The schedule has match history and cannot be replaced.",
    );
    this.name = "EventScheduleProtectedHistoryError";
  }
}

export class EventScheduleUnsupportedError extends EventScheduleMutationError {
  constructor(message: string) {
    super("EDITOR_SCHEDULE_UNSUPPORTED", message);
    this.name = "EventScheduleUnsupportedError";
  }
}

export class EventScheduleInputError extends EventScheduleMutationError {
  constructor(message: string) {
    super("EDITOR_SCHEDULE_INPUT_INVALID", message);
    this.name = "EventScheduleInputError";
  }
}

const buildContext = (): SchedulerContext => {
  const debug = process.env.SCHEDULER_DEBUG === "true";
  return {
    log: (message) => {
      if (debug) console.log(message);
    },
    error: (message) => {
      console.error(message);
    },
  };
};
export type CreateOnlyMatchGraphPersistenceOptions = {
  tx: Prisma.TransactionClient;
  eventId: string;
  includePlaceholderTeams?: boolean;
};

export type CreateOnlyMatchGraphPersistenceResult = {
  event: League | Tournament;
  matches: Match[];
  demand: MatchDemand;
};

const isSyntheticGraphTeam = (team: Match["team1"]): boolean =>
  String(team?.kind ?? "").trim().toUpperCase() === "PLACEHOLDER";
const persistGraphPlaceholderTeams = async (
  tx: Prisma.TransactionClient,
  eventId: string,
  event: League | Tournament,
): Promise<void> => {
  const placeholderTeams = Object.values(event.teams).filter(
    isSyntheticGraphTeam,
  );
  if (!placeholderTeams.length) return;
  const teams = (tx as any).teams;
  if (typeof teams?.upsert !== "function") {
    throw new EventScheduleInputError(
      "The Match Graph placeholder teams could not be persisted.",
    );
  }
  const now = new Date();
  for (const team of placeholderTeams) {
    await teams.upsert({
      where: { id: team.id },
      create: {
        id: team.id,
        createdAt: now,
        updatedAt: now,
        eventId,
        kind: "PLACEHOLDER",
        playerIds: [],
        playerRegistrationIds: [],
        division: team.division.id,
        divisionTypeId: null,
        name: team.name,
        captainId: "",
        managerId: "",
        headCoachId: null,
        coachIds: [],
        staffAssignmentIds: [],
        parentTeamId: null,
        pending: [],
        teamSize: 0,
        profileImageId: null,
        sport: null,
      },
      update: {
        updatedAt: now,
        eventId,
        kind: "PLACEHOLDER",
        division: team.division.id,
        name: team.name,
        captainId: "",
        managerId: "",
      },
    });
  }
};

const persistGraphPhaseParticipants = async (
  tx: Prisma.TransactionClient,
  eventId: string,
  event: League | Tournament,
): Promise<void> => {
  const phaseDivisions = collectPhaseDivisions(event);
  if (!phaseDivisions.length) return;

  const teamIdsByPhaseDivision = collectPhaseTeamIdsByDivision(
    event,
    event.teams,
  );
  // Prisma transaction delegates share the phase persistence contract.
  const phasePersistenceClient =
    tx as unknown as PhasePersistenceClient;
  await persistPhaseParticipantAssignments({
    client: phasePersistenceClient,
    eventId,
    teamIdsByPhaseDivision,
  });
};
const loadPersistedGraphDemand = async (
  tx: Prisma.TransactionClient,
  eventId: string,
): Promise<MatchDemand> => {
  const persistenceClient = tx as unknown as {
    matches?: {
      findMany?: (args: unknown) => Promise<unknown[]>;
    };
    divisions?: {
      findMany?: (args: unknown) => Promise<unknown[]>;
    };
  };
  if (
    typeof persistenceClient.matches?.findMany !== "function" ||
    typeof persistenceClient.divisions?.findMany !== "function"
  ) {
    throw new EventScheduleInputError(
      "The persisted Match Graph demand could not be loaded.",
    );
  }

  const [matchRows, divisionRows] = await Promise.all([
    persistenceClient.matches.findMany({
      where: { eventId },
      select: {
        division: true,
        placementState: true,
        fieldId: true,
      },
    }),
    persistenceClient.divisions.findMany({
      where: { eventId, scope: "EVENT", status: "ACTIVE" },
      select: { id: true, phase: true },
    }),
  ]);
  const asRecord = (row: unknown): Record<string, unknown> =>
    row && typeof row === "object"
      ? (row as Record<string, unknown>)
      : {};
  return matchDemandFromPersistedGraph(
    matchRows.map((rawRow) => {
      const row = asRecord(rawRow);
      return {
        divisionId: typeof row.division === "string" ? row.division : null,
        placementState:
          typeof row.placementState === "string"
            ? row.placementState
            : null,
        fieldId: typeof row.fieldId === "string" ? row.fieldId : null,
      };
    }),
    divisionRows.map((rawRow) => {
      const row = asRecord(rawRow);
      return {
        id: typeof row.id === "string" ? row.id : "",
        phase: typeof row.phase === "string" ? row.phase : null,
      };
    }),
  );
};


export const persistCreateOnlyMatchGraph = async (
  options: CreateOnlyMatchGraphPersistenceOptions,
): Promise<CreateOnlyMatchGraphPersistenceResult> => {
  const event = await loadEventWithRelations(options.eventId, options.tx);
  if (!(event instanceof League) && !(event instanceof Tournament)) {
    throw new EventScheduleUnsupportedError(
      "Only League and Tournament events support Match Graph creation.",
    );
  }

  const graphEvent = new EventBuilder(event, buildContext(), {
    includePlaceholderTeams: options.includePlaceholderTeams !== false,
  }).buildMatchGraph();
  const generatedMatches = Object.values(graphEvent.matches);
  if (!generatedMatches.length) {
    throw new EventScheduleInputError(
      "The scheduler did not produce any Match Graph nodes.",
    );
  }
  assertPhaseOwnedMatchGraph(generatedMatches);
  assertUnplacedMatchGraph(generatedMatches);
  const matches = rekeyMatchGraph(options.eventId, generatedMatches);

  matches.forEach((match) => {
    match.placementState = "UNPLACED";
    match.field = null;
    match.official = null;
    match.officialAssignments = [];
    match.teamOfficial = null;
  });
  graphEvent.matches = Object.fromEntries(
    matches.map((match) => [match.id, match]),
  );
  await persistGraphPlaceholderTeams(options.tx, options.eventId, graphEvent);
  await persistGraphPhaseParticipants(
    options.tx,
    options.eventId,
    graphEvent,
  );
  await saveMatches(options.eventId, matches, options.tx);

  return {
    event: graphEvent,
    matches,
    demand: await loadPersistedGraphDemand(options.tx, options.eventId),
  };
};

const isLeagueEvent = (event: { eventType?: unknown }): event is League =>
  typeof event.eventType === "string" &&
  event.eventType.toUpperCase() === "LEAGUE";

const shouldApplyConfirmedAdvancementReassignments = (
  event: League | Tournament,
): event is StandingsAdvancementEvent =>
  (isLeagueEvent(event) && event.singleDivision) ||
  isTournamentPoolPlayStandingsEvent(event);

const applyConfirmedAdvancementReassignments = (
  league: StandingsAdvancementEvent,
  context: SchedulerContext,
): {
  affectedPlayoffDivisionIds: string[];
  teamIdsByPlayoffDivision: Record<string, string[]>;
  phaseTeamIdsByDivision: Record<string, string[]>;
} => {
  const affectedPlayoffDivisionIds = new Set<string>();
  const teamIdsByPlayoffDivision: Record<string, string[]> = {};
  const phaseTeamIdsByDivision: Record<string, string[]> = {};

  for (const division of league.divisions) {
    if (!division.standingsConfirmedAt) continue;
    const reassignment = applyLeagueDivisionPlayoffReassignment(
      league,
      division.id,
      context,
    );
    reassignment.affectedPlayoffDivisionIds.forEach((playoffDivisionId) => {
      affectedPlayoffDivisionIds.add(playoffDivisionId);
    });
    Object.entries(reassignment.teamIdsByPlayoffDivision).forEach(
      ([playoffDivisionId, teamIds]) => {
        teamIdsByPlayoffDivision[playoffDivisionId] = teamIds;
      },
    );
    Object.entries(reassignment.phaseTeamIdsByDivision).forEach(
      ([phaseDivisionId, teamIds]) => {
        phaseTeamIdsByDivision[phaseDivisionId] = teamIds;
      },
    );
  }

  return {
    affectedPlayoffDivisionIds: Array.from(affectedPlayoffDivisionIds),
    teamIdsByPlayoffDivision,
    phaseTeamIdsByDivision,
  };
};
const updateConfirmedPlayoffDivisions = async (
  tx: Prisma.TransactionClient,
  event: League | Tournament,
  context: SchedulerContext,
): Promise<void> => {
  if (!shouldApplyConfirmedAdvancementReassignments(event)) return;
  const reassignment = applyConfirmedAdvancementReassignments(event, context);
  const divisionIds = Array.from(
    new Set([
      ...reassignment.affectedPlayoffDivisionIds,
      ...Object.keys(reassignment.phaseTeamIdsByDivision),
    ]),
  );
  if (!divisionIds.length) return;
  const now = new Date();
  await Promise.all(
    divisionIds.map((divisionId) =>
      tx.divisions.update({
        where: { id: divisionId },
        data: {
          teamIds:
            reassignment.phaseTeamIdsByDivision[divisionId] ??
            reassignment.teamIdsByPlayoffDivision[divisionId] ??
            [],
          updatedAt: now,
        },
      }),
    ),
  );
  // Prisma transaction delegates share the phase persistence contract.
  const phasePersistenceClient =
    tx as unknown as PhasePersistenceClient;
  await persistPhaseParticipantAssignments({
    client: phasePersistenceClient,
    eventId: event.id,
    teamIdsByPhaseDivision: reassignment.phaseTeamIdsByDivision,
  });
};

const deleteSyntheticScheduleTeams = async (
  tx: Prisma.TransactionClient,
  eventId: string,
): Promise<void> => {
  const placeholderTeams = await tx.teams.findMany({
    where: {
      eventId,
      kind: "PLACEHOLDER",
    },
    select: { id: true },
  });
  const placeholderTeamIds = placeholderTeams
    .map((team) => team.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  if (!placeholderTeamIds.length) return;

  await tx.eventRegistrations.deleteMany({
    where: {
      eventId,
      registrantType: "TEAM",
      OR: [
        { registrantId: { in: placeholderTeamIds } },
        { eventTeamId: { in: placeholderTeamIds } },
      ],
    },
  });
  const divisions = await tx.divisions.findMany({
    where: { eventId },
    select: { id: true, teamIds: true },
  });
  const placeholderIds = new Set(placeholderTeamIds);
  await Promise.all(
    divisions
      .filter((division) =>
        division.teamIds.some((teamId) => placeholderIds.has(teamId)),
      )
      .map((division) =>
        tx.divisions.update({
          where: { id: division.id },
          data: {
            teamIds: division.teamIds.filter(
              (teamId) => !placeholderIds.has(teamId),
            ),
            updatedAt: new Date(),
          },
        }),
      ),
  );
  await tx.teams.deleteMany({ where: { id: { in: placeholderTeamIds } } });
};

const recordOrNull = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const recordsFrom = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> =>
          Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
      )
    : [];

const editorMatchProjectionsFor = (
  matches: Match[],
): EventEditorMatchProjection[] => {
  const serialized = serializeMatches(matches);
  return serialized.map((serializedMatch) => {
    const match = serializedMatch as Record<string, unknown>;
    const id = typeof match.id === "string" ? match.id : "";
    const eventId = typeof match.eventId === "string" ? match.eventId : "";
    if (!id || !eventId) {
      throw new EventScheduleInputError(
        "The scheduler returned a match without an event identity.",
      );
    }
    const stringOrNull = (value: unknown): string | null =>
      typeof value === "string" ? value : null;
    const numberOrNull = (value: unknown): number | null =>
      typeof value === "number" && Number.isInteger(value) ? value : null;
    const numberList = (value: unknown): number[] =>
      Array.isArray(value)
        ? value.filter(
            (entry): entry is number =>
              typeof entry === "number" && Number.isFinite(entry),
          )
        : [];
    return {
      id,
      matchId: numberOrNull(match.matchId),
      eventId,
      start: stringOrNull(match.start),
      end: stringOrNull(match.end),
      locked: match.locked === true,
      placementState:
        match.placementState === "PLACED" ? "PLACED" : "UNPLACED",
      phase: stringOrNull(match.phase),
      sourceDivisionId: stringOrNull(match.sourceDivisionId),
      phaseDivisionId: stringOrNull(match.phaseDivisionId),
      division: stringOrNull(match.division),
      fieldId: stringOrNull(match.fieldId),
      team1Id: stringOrNull(match.team1Id),
      team2Id: stringOrNull(match.team2Id),
      team1Seed: numberOrNull(match.team1Seed),
      team2Seed: numberOrNull(match.team2Seed),
      status: stringOrNull(match.status),
      resultStatus: stringOrNull(match.resultStatus),
      resultType: stringOrNull(match.resultType),
      actualStart: stringOrNull(match.actualStart),
      actualEnd: stringOrNull(match.actualEnd),
      statusReason: stringOrNull(match.statusReason),
      winnerEventTeamId: stringOrNull(match.winnerEventTeamId),
      matchRulesSnapshot: recordOrNull(match.matchRulesSnapshot),
      resolvedMatchRules: recordOrNull(match.resolvedMatchRules),
      segments: recordsFrom(match.segments),
      incidents: recordsFrom(match.incidents),
      officialId: stringOrNull(match.officialId),
      officialIds: recordsFrom(match.officialIds),
      teamOfficialId: stringOrNull(match.teamOfficialId),
      team1Points: numberList(match.team1Points),
      team2Points: numberList(match.team2Points),
      losersBracket: match.losersBracket === true,
      winnerNextMatchId: stringOrNull(match.winnerNextMatchId),
      loserNextMatchId: stringOrNull(match.loserNextMatchId),
      previousLeftId: stringOrNull(match.previousLeftId),
      previousRightId: stringOrNull(match.previousRightId),
      side: stringOrNull(match.side),
      officialCheckedIn: match.officialCheckedIn === true,
    };
  });
};
const isReusableUnplacedMatchGraph = (matches: Match[]): boolean =>
  matches.length > 0 &&
  matches.every(
    (match) =>
      match.placementState === "UNPLACED" &&
      match.field === null &&
      match.division.role === "PHASE" &&
      Boolean(match.division.phase),
  );

export const reconcileEventSchedule = async (
  options: EventScheduleMutationOptions,
): Promise<EventScheduleMutationResult> => {
  const {
    tx,
    eventId,
    mode,
    expectedScheduleRevision,
    historyPolicy = "REJECT_PROTECTED",
    includePlaceholderTeams = true,
    participantCount,
  } = options;
  const eventRow = await tx.events.findUnique({ where: { id: eventId } });
  if (!eventRow) throw new EventScheduleUnsupportedError("Event not found.");
  const scheduleState = await loadEventScheduleState(
    eventRow as unknown as Record<string, unknown>,
    eventId,
    tx,
  );
  if (
    expectedScheduleRevision &&
    expectedScheduleRevision !== scheduleState.revision
  ) {
    throw new EventScheduleRevisionConflictError(scheduleState.revision);
  }

  const event = await loadEventWithRelations(eventId, tx);
  const previousMatches = Object.values(event.matches);
  if (
    mode !== "RESCHEDULE_PRESERVING_LOCKS" &&
    historyPolicy === "REJECT_PROTECTED" &&
    scheduleState.hasProtectedHistory
  ) {
    throw new EventScheduleProtectedHistoryError();
  }
  if (
    mode === "BUILD" &&
    previousMatches.length > 0 &&
    !isReusableUnplacedMatchGraph(previousMatches)
  ) {
    throw new EventScheduleUnsupportedError(
      "A schedule already exists; use rebuild.",
    );
  }
  if (mode === "DELETE") {
    await deletePristineScheduleByEvent(eventId, tx);
    await deleteSyntheticScheduleTeams(tx, eventId);
    await tx.events.update({
      where: { id: eventId },
      data: { generatedScheduleEnd: null, updatedAt: new Date() },
    });
    const updatedEvent = await loadEventWithRelations(eventId, tx);
    return {
      event: updatedEvent,
      matches: [],
      warnings: [],
      previousMatchCount: previousMatches.length,
      notification: previousMatches.length
        ? {
            eventId,
            eventName: String(event.name ?? "Event"),
            forceBatch: true,
            changes: collectMatchScheduleChanges({
              before: snapshotMatchScheduleState(previousMatches),
              after: snapshotMatchScheduleState([]),
            }),
          }
        : null,
    };
  }
  const context = buildContext();
  let scheduled: {
    event: League | Tournament;
    matches: Match[];
    warnings?: EventEditorScheduleWarning[];
  };
  let scheduleWarnings: EventEditorScheduleWarning[] = [];
  if (
    (mode === "BUILD" || mode === "REBUILD") &&
    isReusableUnplacedMatchGraph(previousMatches)
  ) {
    prepareSchedulePlacementWindow(event, false);
    const placedEvent = new EventBuilder(event, context, {
      includePlaceholderTeams: false,
    }).placeMatchGraph({ preserveMatchIds: true });
    const placedMatches = Object.values(placedEvent.matches);
    finalizeOpenEndedSchedule(placedEvent, placedMatches);
    scheduled = {
      event: placedEvent,
      matches: placedMatches,
    };
  } else if (mode === "RESCHEDULE_PRESERVING_LOCKS" && previousMatches.length > 0) {
    try {
      const checkIns = await loadTeamCheckIns(tx, eventId);
      const eventCheckedInTeamIds = new Set<string>();
      const checkedInTeamIdsByMatch = new Map<string, Set<string>>();
      for (const checkIn of checkIns) {
        if (String(checkIn.status ?? "").trim().toUpperCase() !== "CHECKED_IN") {
          continue;
        }
        const teamId = String(checkIn.eventTeamId ?? "").trim();
        if (!teamId) {
          continue;
        }
        const matchId = String(checkIn.matchId ?? "").trim();
        if (!matchId) {
          eventCheckedInTeamIds.add(teamId);
          continue;
        }
        const checkedInTeamIds = checkedInTeamIdsByMatch.get(matchId) ?? new Set<string>();
        checkedInTeamIds.add(teamId);
        checkedInTeamIdsByMatch.set(matchId, checkedInTeamIds);
      }
      scheduled = rescheduleEventMatchesPreservingLocks(event, {
        eventCheckedInTeamIds,
        checkedInTeamIdsByMatch,
      });
      scheduleWarnings = scheduled.warnings ?? [];
    } catch (error) {
      if (error instanceof ScheduleError) {
        throw error;
      }
      throw new ScheduleError(
        error instanceof Error
          ? error.message
          : "Unable to reschedule while preserving existing matches.",
      );
    }
  } else {
    if (
      !["LEAGUE", "TOURNAMENT"].includes(String(event.eventType).toUpperCase())
    ) {
      throw new EventScheduleUnsupportedError(
        "Only League and Tournament events support schedule building.",
      );
    }
    scheduled = scheduleEvent(
      { event, participantCount, includePlaceholderTeams },
      context,
    );
  }
  if (!scheduled.matches.length) {
    throw new EventScheduleInputError(
      "The scheduler did not produce any matches.",
    );
  }
  await updateConfirmedPlayoffDivisions(tx, scheduled.event, context);
  await persistScheduledRosterTeams(
    {
      eventId,
      scheduled: scheduled.event,
      removeOmittedPlaceholderTeams: true,
    },
    tx,
  );
  if (mode !== "RESCHEDULE_PRESERVING_LOCKS" || previousMatches.length === 0) {
    await deletePristineScheduleByEvent(eventId, tx);
  }
  await saveMatches(eventId, scheduled.matches, tx);
  await saveEventSchedule(scheduled.event, tx);
  return {
    event: scheduled.event,
    matches: scheduled.matches,
    warnings: scheduleWarnings,
    previousMatchCount: previousMatches.length,
    notification: previousMatches.length
      ? {
          eventId,
          eventName: String(scheduled.event.name ?? event.name ?? "Event"),
          forceBatch: true,
          changes: collectMatchScheduleChanges({
            before: snapshotMatchScheduleState(previousMatches),
            after: snapshotMatchScheduleState(scheduled.matches),
          }),
        }
      : null,
  };
};

export { editorMatchProjectionsFor };
