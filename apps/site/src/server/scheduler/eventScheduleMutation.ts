import type { Prisma } from "@/generated/prisma/client";
import {
  deletePristineScheduleByEvent,
  loadEventWithRelations,
  persistScheduledRosterTeams,
  saveEventSchedule,
  saveMatches,
  type EventSchedulePersistenceInput,
  type MatchPersistenceInput,
  type ScheduledRosterInput,
  type ScheduledRosterTeamInput,
} from "@/server/repositories/events";
import {
  findFieldConflictsForInterval,
  loadFieldBlockerCatalog,
  type FieldBlockerCatalog,
  type PrismaLike,
} from "@/server/repositories/fieldSchedulingConflicts";
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
import { acquireFieldLocks } from "@/server/repositories/locks";
import { EventBuilder, type EventBuilderPlacementFailure } from "./EventBuilder";
import {
  collectUnresolvedStaffingDiagnostics,
  OfficialStaffingPlanner,
} from "./officialStaffing";
import {
  assertPhaseOwnedMatchGraph,
  assertUnplacedMatchGraph,
  matchDemandFromGraph,
  matchDemandFromPersistedGraph,
  rekeyMatchGraph,
  type MatchDemand,
} from "./matchGraph";
import {
  diagnoseScheduleProposal,
} from "./scheduleDiagnostics";
import type { EventEditorScheduleDiagnostics } from "@/contracts/eventEditor";
import { Division, League, Match, SchedulerContext, Tournament } from "./types";
import {
  finalizeOpenEndedSchedule,
  applySplitDivisionRosterAssignments,
  prepareSchedulePlacementWindow,
  scheduleEvent,
  ScheduleError,
} from "./scheduleEvent";
import type {
  EventEditorCreateProposalGraph,
  EventEditorMatchProjection,
  EventEditorScheduleWarning,
} from "@/contracts/eventEditor";
import { serializeMatches } from "./serialize";
import {
  getStaffingPriorityPolicy,
  normalizeStaffingPriority,
  type EventOfficialPosition,
  type StaffingPriority,
} from "@/server/officials/config";
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
  allowPartialPlacement?: boolean;
  /**
   * Proposal computation uses the same scheduler but must not write accepted
   * Event, Match, roster, or graph rows.
   */
  persist?: boolean;
  /** Additional fixed Matches for maintenance Complete/Rebuild paths. */
  protectedMatchIds?: ReadonlySet<string>;
  /** Rebuild the graph even when the current graph is reusable. */
  regenerateGraph?: boolean;
};

export type EventScheduleMutationResult = {
  event: League | Tournament;
  matches: Match[];
  warnings: EventEditorScheduleWarning[];
  placementFailures: EventBuilderPlacementFailure[];
  diagnostics?: EventEditorScheduleDiagnostics;
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
export class EventScheduleProposalGraphError extends Error {
  constructor(message: string) {
    super(`The reviewed schedule proposal graph is invalid: ${message}`);
    this.name = "EventScheduleProposalGraphError";
  }
}

const proposalGraphError = (message: string): never => {
  throw new EventScheduleProposalGraphError(message);
};

export const validateAndNormalizeSerializedGraph = (
  eventId: string,
  graph: EventEditorCreateProposalGraph,
): EventEditorCreateProposalGraph => {
  const normalizedEventId = eventId.trim();
  if (!normalizedEventId || graph.event.id !== normalizedEventId) {
    return proposalGraphError("the graph event does not match the create operation.");
  }
  const eventType = graph.event.eventType.trim().toUpperCase();
  if (!["LEAGUE", "TOURNAMENT"].includes(eventType)) {
    return proposalGraphError("the graph event type is not schedulable.");
  }
  if (graph.matches.length === 0) {
    return proposalGraphError("the Match Graph is empty.");
  }

  const matchIds = new Set<string>();
  for (const match of graph.matches) {
    const matchId = match.id.trim();
    if (!matchId) {
      return proposalGraphError("a Match Graph node has no identity.");
    }
    if (matchIds.has(matchId)) {
      return proposalGraphError(`the Match Graph contains duplicate node ${matchId}.`);
    }
    if (match.eventId !== normalizedEventId) {
      return proposalGraphError(`Match ${matchId} belongs to another event.`);
    }
    matchIds.add(matchId);
  }

  const divisionDetails = [
    ...graph.event.divisionDetails,
    ...graph.event.playoffDivisionDetails,
  ];
  const divisionIds = new Set([
    ...graph.event.divisions,
    ...divisionDetails.flatMap((division) => [
      division.id,
      ...(division.sourceDivisionId ? [division.sourceDivisionId] : []),
    ]),
  ]);
  const fieldIds = new Set(graph.event.fields.map((field) => field.id));
  const teamIds = new Set(graph.event.teams.map((team) => team.id));
  const officialIds = new Set(graph.event.officials.map((official) => official.id));
  const eventOfficialIds = new Set(
    graph.event.eventOfficials.map((official) => official.id),
  );
  const eventOfficialUserIds = new Set(
    graph.event.eventOfficials.map((official) => official.userId),
  );
  const knownOfficialUserIds = new Set([
    ...officialIds,
    ...eventOfficialUserIds,
  ]);
  const knownPlayerIds = new Set(
    graph.event.teams.flatMap((team) => [
      ...team.playerIds,
      ...team.players.map((player) => player.id),
      ...team.playerRegistrations.map((registration) => registration.userId),
    ]),
  );
  const officialPositionIds = new Set([
    ...graph.event.officialPositions.map((position) => position.id),
    ...divisionDetails.flatMap((division) =>
      Object.values(division.phaseSettings).flatMap(
        (settings) => settings.officialPositions?.map((position) => position.id) ?? [],
      ),
    ),
  ]);
  const staffingPriority: StaffingPriority = (
    typeof graph.event.staffingPriority === "string"
    && graph.event.staffingPriority.trim().length > 0
  )
    ? normalizeStaffingPriority(
      graph.event.staffingPriority,
      graph.event.officialSchedulingMode,
    )
    : "FULL_COVERAGE_REQUIRED";
  const staffingPolicy = getStaffingPriorityPolicy(staffingPriority);

  const phaseSettingsForMatch = (
    match: typeof graph.matches[number],
  ) => {
    const division = divisionDetails.find(
      (candidate) =>
        candidate.id === match.division
        || candidate.id === match.phaseDivisionId
        || candidate.id === match.sourceDivisionId,
    );
    const phase = (match.phase ?? division?.phase ?? "").trim().toUpperCase();
    return Object.entries(division?.phaseSettings ?? {}).find(
      ([key]) => key.trim().toUpperCase() === phase,
    )?.[1];
  };

  const officialPositionsForMatch = (
    match: typeof graph.matches[number],
  ) => phaseSettingsForMatch(match)?.officialPositions
    ?? graph.event.officialPositions;

  const assertPlacement = (
    match: typeof graph.matches[number],
    label: string,
  ): void => {
    const placementState = String(match.placementState ?? "").trim().toUpperCase();
    if (placementState === "UNPLACED") {
      if (match.fieldId !== null) {
        proposalGraphError(`${label} has an unexpected proposed resource.`);
      }
      if (match.start !== null || match.end !== null) {
        proposalGraphError(`${label} has unexpected proposed time.`);
      }
      if (
        match.teamOfficialId !== null
        || match.official !== null
        || match.officialAssignments.length > 0
        || match.officialIds.length > 0
      ) {
        proposalGraphError(`${label} has unexpected proposed officiating.`);
      }
      return;
    }
    if (placementState !== "PLACED") {
      proposalGraphError(`${label} has an unsupported placement state.`);
    }
    if (!match.fieldId) {
      proposalGraphError(`${label} has no proposed resource.`);
    }
    if (!match.start || !match.end) {
      proposalGraphError(`${label} has no proposed time.`);
    }
    const start = Date.parse(match.start ?? "");
    const end = Date.parse(match.end ?? "");
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
      proposalGraphError(`${label} has an invalid proposed time.`);
    }
    const teamDutyConfigured =
      phaseSettingsForMatch(match)?.doTeamsOfficiate
      ?? graph.event.doTeamsOfficiate === true;
    const requiresTeamOfficial =
      teamDutyConfigured && staffingPolicy.isHardTeamCoverageRequired;
    if (requiresTeamOfficial && !match.teamOfficialId) {
      proposalGraphError(`${label} has no proposed team official.`);
    }
  };

  const assertCompleteOfficiating = (
    match: typeof graph.matches[number],
    label: string,
  ): void => {
    const positions = officialPositionsForMatch(match);
    if (positions.length === 0) {
      return;
    }
    const assignmentsBySlot = new Map(
      match.officialAssignments.map((assignment) => [
        `${assignment.positionId}:${assignment.slotIndex}`,
        assignment,
      ]),
    );
    positions.forEach((position) => {
      Array.from({ length: position.count }, (_, slotIndex) => {
        const assignment = assignmentsBySlot.get(`${position.id}:${slotIndex}`);
        if (!assignment || (!assignment.userId && !assignment.eventOfficialId)) {
          proposalGraphError(
            `${label} has an unresolved officiating slot for ${position.name} ${slotIndex + 1}.`,
          );
        }
      });
    });
  };

  const assertKnown = (
    value: string | null,
    known: Set<string>,
    label: string,
  ): void => {
    if (value !== null && !known.has(value)) {
      proposalGraphError(`${label} ${value} is not present in the proposal.`);
    }
  };
  const assertNestedIdentity = (
    value: { id: string } | null,
    id: string | null,
    label: string,
  ): void => {
    if ((value?.id ?? null) !== id) {
      proposalGraphError(`${label} does not match its serialized identifier.`);
    }
  };
  const assertAssignments = (
    assignments: typeof graph.matches[number]["officialAssignments"],
    label: string,
  ): void => {
    assignments.forEach((assignment, index) => {
      const holderType = assignment.holderType.trim().toUpperCase();
      if (holderType !== "OFFICIAL" && holderType !== "PLAYER") {
        proposalGraphError(
          `${label} has an unsupported officiating holder at slot ${index + 1}.`,
        );
      }
      assertKnown(
        assignment.positionId,
        officialPositionIds,
        `${label} officiating position at slot ${index + 1}`,
      );
      assertKnown(
        assignment.userId,
        holderType === "PLAYER" ? knownPlayerIds : knownOfficialUserIds,
        `${label} ${holderType === "PLAYER" ? "player" : "official"} at slot ${index + 1}`,
      );
      assertKnown(
        assignment.eventOfficialId,
        eventOfficialIds,
        `${label} event official at slot ${index + 1}`,
      );
      if (holderType === "PLAYER" && assignment.eventOfficialId) {
        proposalGraphError(
          `${label} player assignment has an event official at slot ${index + 1}.`,
        );
      }
      if (assignment.userId && assignment.eventOfficialId) {
        const eventOfficial = graph.event.eventOfficials.find(
          (candidate) => candidate.id === assignment.eventOfficialId,
        );
        if (eventOfficial?.userId !== assignment.userId) {
          proposalGraphError(
            `${label} event official does not match its user at slot ${index + 1}.`,
          );
        }
      }
      if (
        !assignment.userId
        && !assignment.eventOfficialId
        && staffingPolicy.isHardOfficialCoverageRequired
      ) {
        proposalGraphError(
          `${label} has an unresolved officiating slot at slot ${index + 1}.`,
        );
      }
    });
  };

  graph.matches.forEach((match) => {
    const label = `Match ${match.id}`;
    assertPlacement(match, label);
    if (!match.division) {
      proposalGraphError(`${label} has no division.`);
    }
    assertKnown(match.division, divisionIds, `${label} division`);
    assertKnown(match.sourceDivisionId, divisionIds, `${label} source division`);
    assertKnown(match.phaseDivisionId, divisionIds, `${label} phase division`);
    assertKnown(match.fieldId, fieldIds, `${label} resource`);
    assertKnown(match.team1Id, teamIds, `${label} first team`);
    assertKnown(match.team2Id, teamIds, `${label} second team`);
    assertKnown(match.teamOfficialId, teamIds, `${label} team official`);
    assertKnown(match.winnerEventTeamId, teamIds, `${label} winner team`);
    if (match.official && !knownOfficialUserIds.has(match.official.id)) {
      proposalGraphError(`${label} official is not present in the proposal.`);
    }
    assertNestedIdentity(match.team1, match.team1Id, `${label} first team`);
    assertNestedIdentity(match.team2, match.team2Id, `${label} second team`);
    if (match.teamOfficial !== null) {
      assertNestedIdentity(
        match.teamOfficial,
        match.teamOfficialId,
        `${label} team official`,
      );
    }
    if (match.placementState === "PLACED") {
      if (staffingPolicy.isHardOfficialCoverageRequired) {
        assertCompleteOfficiating(match, label);
      }
      assertAssignments(match.officialAssignments, label);
      assertAssignments(match.officialIds, `${label} filtered officiating`);
    }
    [
      ["winner", match.winnerNextMatchId],
      ["loser", match.loserNextMatchId],
      ["left predecessor", match.previousLeftId],
      ["right predecessor", match.previousRightId],
    ].forEach(([relationship, reference]) => {
      if (reference !== null && !matchIds.has(reference)) {
        proposalGraphError(
          `${label} has a dangling ${relationship} Match Graph reference.`,
        );
      }
    });
  });

  return graph;
};

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

const serializedDate = (value: unknown): Date | null => {
  if (value instanceof Date) return value;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

/**
 * Persists a previously reviewed graph without invoking EventBuilder or the
 * scheduler. The graph must come from a revision-bound create proposal.
 */
export const persistSerializedScheduleGraph = async (options: {
  tx: Prisma.TransactionClient;
  eventId: string;
  graph: EventEditorCreateProposalGraph;
}): Promise<void> => {
  const eventRecord = options.graph.event;
  type ProposalDivision =
    EventEditorCreateProposalGraph["event"]["divisionDetails"][number];
  type ProposalTeam = EventEditorCreateProposalGraph["event"]["teams"][number];
  type ProposalMatch = EventEditorCreateProposalGraph["matches"][number];

  const divisionRows: ProposalDivision[] = [
    ...eventRecord.divisionDetails,
    ...eventRecord.playoffDivisionDetails,
  ];
  const divisionById = new Map(
    divisionRows.map((division) => [division.id, division] as const),
  );
  const teamsById = new Map<string, ScheduledRosterTeamInput>(
    eventRecord.teams.map((team: ProposalTeam) => [
      team.id,
      {
        id: team.id,
        captainId: team.captainId,
        playerIds: team.playerIds,
        division: team.division ? { id: team.division } : null,
        name: team.name,
      },
    ]),
  );
  const scheduled: ScheduledRosterInput = {
    id: options.eventId,
    hostId: eventRecord.hostId,
    eventType: eventRecord.eventType,
    includePlayoffs: eventRecord.includePlayoffs,
    includePlayoffsOrPools: eventRecord.includePlayoffs,
    singleDivision: eventRecord.singleDivision,
    teamSizeLimit: eventRecord.teamSizeLimit,
    divisions: eventRecord.divisionDetails,
    playoffDivisions: eventRecord.playoffDivisionDetails,
    teams: Object.fromEntries(teamsById),
  };
  await persistScheduledRosterTeams(
    {
      eventId: options.eventId,
      scheduled,
    },
    options.tx,
  );

  const matchRows = options.graph.matches;
  const matchById = new Map(
    matchRows.map((match) => [match.id, match] as const),
  );
  const matchReference = (
    id: string | null | undefined,
  ): { id: string } | null => {
    if (id == null) return null;
    if (!matchById.has(id)) {
      throw new EventScheduleInputError(
        `The reviewed Match Graph references unknown match ${id}.`,
      );
    }
    return { id };
  };
  const teamReference = (
    id: string | null | undefined,
  ): { id: string } | null => {
    if (id == null) return null;
    if (!teamsById.has(id)) {
      throw new EventScheduleInputError(
        `The reviewed Match Graph references unknown team ${id}.`,
      );
    }
    return { id };
  };
  const fieldReference = (
    id: string | null | undefined,
  ): { id: string } | null => (id == null ? null : { id });
  const divisionForMatch = (
    row: ProposalMatch,
  ): MatchPersistenceInput["division"] => {
    const divisionId = row.phaseDivisionId ?? row.division ?? row.sourceDivisionId;
    if (!divisionId) {
      throw new EventScheduleInputError(
        `Match ${row.id} has no division in the reviewed Match Graph.`,
      );
    }
    const sourceDivision = row.sourceDivisionId
      ? divisionById.get(row.sourceDivisionId)
      : undefined;
    const division = divisionById.get(divisionId);
    if (!division && !sourceDivision) {
      throw new EventScheduleInputError(
        `Match ${row.id} references unknown division ${divisionId}.`,
      );
    }
    const source = division ?? sourceDivision;
    if (!source) {
      throw new EventScheduleInputError(
        `Match ${row.id} has no source division.`,
      );
    }
    return {
      id: division?.id ?? divisionId,
      kind: division?.kind ?? source.kind,
      role: division?.role ?? (row.phaseDivisionId ? "PHASE" : null),
      phase: division?.phase ?? row.phase ?? source.phase,
      sourceDivisionId:
        division?.sourceDivisionId ?? row.sourceDivisionId ?? null,
      phaseSettings: Object.fromEntries(
        Object.entries(source.phaseSettings).map(([phase, settings]) => [
          phase,
          { officialPositions: settings.officialPositions },
        ]),
      ),
    };
  };
  const matches: MatchPersistenceInput[] = matchRows.map(
    (row: ProposalMatch, index) => ({
      id: row.id,
      eventId: options.eventId,
      matchId: row.matchId ?? index + 1,
      locked: row.locked,
      placementState: row.placementState,
      team1Seed: row.team1Seed,
      team2Seed: row.team2Seed,
      team1Points: row.team1Points,
      team2Points: row.team2Points,
      start: serializedDate(row.start),
      end: serializedDate(row.end),
      division: divisionForMatch(row),
      field: fieldReference(row.fieldId),
      team1: teamReference(row.team1Id),
      team2: teamReference(row.team2Id),
      official: row.official ? { id: row.official.id } : null,
      teamOfficial: teamReference(row.teamOfficialId),
      officialCheckedIn: row.officialCheckedIn,
      officialAssignments: row.officialAssignments,
      winnerEventTeamId: row.winnerEventTeamId,
      matchRulesSnapshot: row.matchRulesSnapshot,
      resolvedMatchRules: row.resolvedMatchRules,
      status: row.status,
      resultStatus: row.resultStatus,
      resultType: row.resultType,
      actualStart: serializedDate(row.actualStart),
      actualEnd: serializedDate(row.actualEnd),
      statusReason: row.statusReason,
      segments: row.segments,
      incidents: row.incidents,
      side: row.side,
      losersBracket: row.losersBracket,
      winnerNextMatch: matchReference(row.winnerNextMatchId),
      loserNextMatch: matchReference(row.loserNextMatchId),
      previousLeftMatch: matchReference(row.previousLeftId),
      previousRightMatch: matchReference(row.previousRightId),
    }),
  );
  await saveMatches(options.eventId, matches, options.tx);

  const eventSchedule: EventSchedulePersistenceInput = {
    id: options.eventId,
    end: serializedDate(eventRecord.end) ?? new Date(eventRecord.end),
    generatedScheduleEnd: serializedDate(eventRecord.generatedScheduleEnd),
    noFixedEndDateTime: eventRecord.noFixedEndDateTime,
    scheduleEndConstraint: serializedDate(eventRecord.scheduleEndConstraint),
  };
  await saveEventSchedule(eventSchedule, options.tx);
};


const isLeagueEvent = (event: { eventType?: unknown }): event is League =>
  typeof event.eventType === "string" &&
  event.eventType.toUpperCase() === "LEAGUE";

const shouldApplyConfirmedAdvancementReassignments = (
  event: League | Tournament,
): event is StandingsAdvancementEvent =>
  (isLeagueEvent(event) && event.singleDivision) ||
  isTournamentPoolPlayStandingsEvent(event);

type ConfirmedAdvancementReassignment = {
  affectedPlayoffDivisionIds: string[];
  teamIdsByPlayoffDivision: Record<string, string[]>;
  phaseTeamIdsByDivision: Record<string, string[]>;
};

const applyConfirmedAdvancementReassignments = (
  league: StandingsAdvancementEvent,
  context: SchedulerContext,
): ConfirmedAdvancementReassignment => {
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
  reassignment?: ConfirmedAdvancementReassignment,
  protectedDivisionIds: ReadonlySet<string> = new Set<string>(),
): Promise<void> => {
  if (!shouldApplyConfirmedAdvancementReassignments(event)) return;
  const applied = reassignment ?? applyConfirmedAdvancementReassignments(event, context);
  const affectedPlayoffDivisionIds = applied.affectedPlayoffDivisionIds
    .filter((divisionId) => !protectedDivisionIds.has(divisionId));
  const phaseTeamIdsByDivision = Object.fromEntries(
    Object.entries(applied.phaseTeamIdsByDivision)
      .filter(([divisionId]) => !protectedDivisionIds.has(divisionId)),
  );
  const teamIdsByPlayoffDivision = Object.fromEntries(
    Object.entries(applied.teamIdsByPlayoffDivision)
      .filter(([divisionId]) => !protectedDivisionIds.has(divisionId)),
  );
  const divisionIds = Array.from(
    new Set([
      ...affectedPlayoffDivisionIds,
      ...Object.keys(phaseTeamIdsByDivision),
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
            phaseTeamIdsByDivision[divisionId] ??
            teamIdsByPlayoffDivision[divisionId] ??
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
    teamIdsByPhaseDivision: phaseTeamIdsByDivision,
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
  officialPositions?: EventOfficialPosition[],
  eventType?: string,
): EventEditorMatchProjection[] => {
  const serialized = serializeMatches(matches, officialPositions, eventType);
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

const scheduledFieldIdsFor = (
  event: League | Tournament,
  configuredFieldIds?: unknown,
): string[] => {
  const configured = Array.isArray(configuredFieldIds)
    ? configuredFieldIds
      .filter((fieldId): fieldId is string =>
        typeof fieldId === "string" && fieldId.trim().length > 0,
      )
      .map((fieldId) => fieldId.trim())
    : null;
  return [...new Set(configured ?? Object.keys(event.fields ?? {}))].sort();
};

const scheduleConflictLowerBound = (event: League | Tournament): Date => {
  const candidates = [
    ...(event.start instanceof Date && !Number.isNaN(event.start.getTime()) ? [event.start] : []),
    ...(Array.isArray(event.timeSlots)
      ? event.timeSlots
        .map((slot) => slot.startDate)
        .filter((value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()))
      : []),
  ];
  return new Date(Math.min(...candidates.map((value) => value.getTime())));
};

const assertScheduledFieldConflicts = (
  catalog: FieldBlockerCatalog,
  matches: Match[],
): void => {
  for (const match of matches) {
    if (
      match.placementState !== "PLACED"
      || !match.field
      || !(match.start instanceof Date)
      || !(match.end instanceof Date)
      || Number.isNaN(match.start.getTime())
      || Number.isNaN(match.end.getTime())
      || match.end.getTime() <= match.start.getTime()
    ) {
      continue;
    }
    const conflict = findFieldConflictsForInterval(
      catalog,
      [match.field.id],
      match.start,
      match.end,
    )[0];
    if (!conflict) continue;
    throw new ScheduleError(
      `Field ${match.field.id} is occupied from ${conflict.start.toISOString()} to ${conflict.end.toISOString()} by ${conflict.source.kind}.`,
      "RESOURCE",
    );
  }
};

type FieldCandidateGuard = (candidate: {
  event: Match;
  resource: { id: string };
  start: Date;
  end: Date;
}) => boolean;

const buildFieldCandidateGuard = (
  catalog: FieldBlockerCatalog | null,
): FieldCandidateGuard | undefined => {
  if (!catalog) return undefined;
  return ({ resource, start, end }) =>
    findFieldConflictsForInterval(catalog, [resource.id], start, end).length === 0;
};

type MatchPlacementWindow = {
  start: Date;
  end: Date;
  bufferMs: number;
  fieldId: string;
};

const placementWindowFor = (match: Match): MatchPlacementWindow | null => {
  if (
    match.placementState !== "PLACED"
    || !match.field
    || !(match.start instanceof Date)
    || !(match.end instanceof Date)
    || Number.isNaN(match.start.getTime())
    || Number.isNaN(match.end.getTime())
    || match.end.getTime() <= match.start.getTime()
  ) {
    return null;
  }
  return {
    start: match.start,
    end: match.end,
    bufferMs: Number.isFinite(match.bufferMs) ? Math.max(0, match.bufferMs) : 0,
    fieldId: match.field.id,
  };
};

const candidateWindowFor = (
  event: Match,
  start: Date,
  end: Date,
): MatchPlacementWindow => ({
  start,
  end,
  bufferMs: Number.isFinite(event.bufferMs) ? Math.max(0, event.bufferMs) : 0,
  fieldId: "",
});

const windowsOverlap = (
  left: MatchPlacementWindow,
  right: MatchPlacementWindow,
  includeBuffers = true,
): boolean => (
  left.start.getTime() < right.end.getTime()
    + (includeBuffers ? right.bufferMs : 0)
  && left.end.getTime() + (includeBuffers ? left.bufferMs : 0)
    > right.start.getTime()
);

const teamIdsForMatch = (match: Match): Set<string> => new Set(
  [match.team1, match.team2, match.teamOfficial]
    .map((team) => team?.id?.trim() ?? "")
    .filter((id): id is string => id.length > 0),
);

const officialIdsForMatch = (match: Match): Set<string> => {
  const ids = new Set<string>();
  const primaryId = match.official?.id?.trim();
  if (primaryId) ids.add(primaryId);
  for (const assignment of match.officialAssignments ?? []) {
    const userId = assignment?.userId?.trim();
    if (userId) ids.add(userId);
  }
  return ids;
};

const hasSharedId = (left: Set<string>, right: Set<string>): boolean =>
  Array.from(left).some((id) => right.has(id));

const placedMatchesFor = (
  matches: Match[],
): Array<{ match: Match; window: MatchPlacementWindow }> =>
  matches
    .map((match) => {
      const window = placementWindowFor(match);
      return window ? { match, window } : null;
    })
    .filter(
      (entry): entry is { match: Match; window: MatchPlacementWindow } =>
        entry !== null,
    );

const buildProtectedCandidateGuard = (
  baseGuard: FieldCandidateGuard | undefined,
  protectedMatches: Match[],
): FieldCandidateGuard | undefined => {
  const protectedPlacements = placedMatchesFor(protectedMatches);
  if (!baseGuard && protectedPlacements.length === 0) return undefined;
  return ({ event, resource, start, end }) => {
    if (
      baseGuard
      && !baseGuard({ event, resource, start, end })
    ) {
      return false;
    }
    const candidateWindow = candidateWindowFor(event, start, end);
    candidateWindow.fieldId = resource.id;
    const candidateTeams = teamIdsForMatch(event);
    const candidateOfficials = officialIdsForMatch(event);
    return protectedPlacements.every(({ match, window }) => {
      if (
        window.fieldId === resource.id
        && windowsOverlap(candidateWindow, window, false)
      ) {
        return false;
      }
      if (
        windowsOverlap(candidateWindow, window)
        && (
          hasSharedId(candidateTeams, teamIdsForMatch(match))
          || hasSharedId(candidateOfficials, officialIdsForMatch(match))
        )
      ) {
        return false;
      }
      return true;
    });
  };
};

const cloneMatchForReservation = (match: Match): Match => {
  const clone = Object.assign(
    Object.create(Object.getPrototypeOf(match)),
    match,
  ) as Match;
  clone.team1Points = [...match.team1Points];
  clone.team2Points = [...match.team2Points];
  clone.officialAssignments = (match.officialAssignments ?? []).map(
    (assignment) => ({ ...assignment }),
  );
  clone.segments = [...match.segments];
  clone.incidents = [...match.incidents];
  return clone;
};

/**
 * Reassign generated officials after placement with protected commitments
 * loaded into a planner that does not allow overlaps.
 */
const assignGeneratedOfficialsAroundProtectedMatches = (
  event: League | Tournament,
  matches: Match[],
  protectedMatches: Match[],
): void => {
  const protectedPlacements = placedMatchesFor(protectedMatches);
  if (
    protectedPlacements.length === 0
    || !protectedPlacements.some(({ match }) => officialIdsForMatch(match).size > 0)
  ) {
    return;
  }

  const plannerEvent = event.staffingPriority === "FULL_COVERAGE_WITH_CONFLICTS_ALLOWED"
    ? Object.assign(
      Object.create(Object.getPrototypeOf(event)),
      event,
      // Protected occupancy is never negotiable in the legacy mode that
      // allows generated official assignment conflicts.
      { staffingPriority: "OFFICIAL_COVERAGE_REQUIRED" },
    ) as League | Tournament
    : event;
  const planner = new OfficialStaffingPlanner(plannerEvent);
  const protectedClones = protectedPlacements.map(({ match }) =>
    cloneMatchForReservation(match),
  );
  const protectedTeamMatches = new Map<
    NonNullable<Match["team1"]>,
    Match[]
  >();
  for (const { match } of protectedPlacements) {
    for (const team of [match.team1, match.team2, match.teamOfficial]) {
      if (!team) continue;
      const existing = protectedTeamMatches.get(team) ?? [...team.matches];
      if (!existing.some((entry) => entry.id === match.id)) {
        existing.push(match);
      }
      protectedTeamMatches.set(team, existing);
    }
  }
  const originalTeamMatches = new Map(
    Array.from(protectedTeamMatches.keys()).map((team) => [
      team,
      [...team.matches],
    ]),
  );
  const originalOfficialMatches = new Map(
    event.officials.map((official) => [
      official,
      [...official.matches],
    ] as const),
  );
  const protectedCloneIds = new Set(protectedClones.map((match) => match.id));
  try {
    for (const [team, teamMatches] of protectedTeamMatches) {
      team.matches = teamMatches;
    }
    planner.seedCommittedMatches(protectedClones);
    const ordered = matches
      .filter((match) => (
        placementWindowFor(match)
        && (
          (match.officialAssignments ?? []).length > 0
          || planner.hasStaffingRequirement(match)
        )
      ))
      .sort((left, right) => (
        left.start.getTime() - right.start.getTime()
        || left.end.getTime() - right.end.getTime()
        || left.id.localeCompare(right.id)
      ));
    for (const match of ordered) {
      planner.assignMatch(match);
    }
  } finally {
    for (const [team, teamMatches] of originalTeamMatches) {
      team.matches = teamMatches;
    }
    for (const [official, originalMatches] of originalOfficialMatches) {
      const currentMatches = official.matches.filter(
        (match) => !protectedCloneIds.has(match.id),
      );
      const currentIds = new Set(currentMatches.map((match) => match.id));
      for (const originalMatch of originalMatches) {
        if (!currentIds.has(originalMatch.id)) {
          currentMatches.push(originalMatch);
        }
      }
      official.matches = currentMatches;
    }
  }
};

const assertIntraEventConflicts = (
  event: League | Tournament,
  matches: Match[],
  protectedMatchIds: ReadonlySet<string> | undefined,
): void => {
  const placed = placedMatchesFor(matches);
  if (placed.length < 2) return;
  const protectedIds = protectedMatchIds ?? new Set<string>();
  const allowOfficialConflicts =
    new OfficialStaffingPlanner(event).isOfficialAssignmentConflictAllowed();
  for (let leftIndex = 0; leftIndex < placed.length; leftIndex += 1) {
    const left = placed[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < placed.length; rightIndex += 1) {
      const right = placed[rightIndex]!;
      const pairHasProtectedMatch =
        protectedIds.has(left.match.id) || protectedIds.has(right.match.id);
      if (
        left.window.fieldId === right.window.fieldId
        && windowsOverlap(left.window, right.window, false)
      ) {
        throw new ScheduleError(
          `Matches ${left.match.id} and ${right.match.id} overlap on field ${left.window.fieldId}.`,
          "RESOURCE",
        );
      }
      if (
        windowsOverlap(left.window, right.window)
        && hasSharedId(
          teamIdsForMatch(left.match),
          teamIdsForMatch(right.match),
        )
      ) {
        throw new ScheduleError(
          `Matches ${left.match.id} and ${right.match.id} overlap for a team.`,
          "PLAYING_TEAM",
        );
      }
      if (
        windowsOverlap(left.window, right.window)
        && hasSharedId(
          officialIdsForMatch(left.match),
          officialIdsForMatch(right.match),
        )
        && (pairHasProtectedMatch || !allowOfficialConflicts)
      ) {
        throw new ScheduleError(
          `Matches ${left.match.id} and ${right.match.id} overlap for an official.`,
          "NAMED_OFFICIAL_POSITION",
        );
      }
    }
  }
};

const setGeneratedScheduleEnd = (
  event: League | Tournament,
  matches: Match[],
  restoreWhenUnplaced?: {
    end: Date;
    generatedScheduleEnd: Date | null;
  },
): void => {
  if (!event.noFixedEndDateTime) return;
  const placedMatchEnds = matches
    .filter((match) => (
      match.placementState === "PLACED"
      && match.end instanceof Date
      && !Number.isNaN(match.end.getTime())
    ))
    .map((match) => match.end.getTime());
  if (!placedMatchEnds.length) {
    if (restoreWhenUnplaced) {
      event.end = restoreWhenUnplaced.end;
      event.generatedScheduleEnd = restoreWhenUnplaced.generatedScheduleEnd;
    }
    return;
  }
  const generatedScheduleEnd = new Date(Math.max(...placedMatchEnds));
  event.generatedScheduleEnd = generatedScheduleEnd;
  event.end = generatedScheduleEnd;
};
const scheduleWarningKey = (warning: EventEditorScheduleWarning): string =>
  JSON.stringify([
    warning.code,
    warning.message,
    warning.matchIds ?? [],
    warning.restrictingFactor ?? null,
  ]);

const mergeScheduleWarnings = (
  existing: EventEditorScheduleWarning[],
  additions: readonly EventEditorScheduleWarning[],
): EventEditorScheduleWarning[] => {
  const seen = new Set(existing.map(scheduleWarningKey));
  const merged = [...existing];
  for (const warning of additions) {
    const key = scheduleWarningKey(warning);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(warning);
  }
  return merged;
};

const buildPartialSchedule = (
  event: League | Tournament,
  context: SchedulerContext,
  includePlaceholderTeams: boolean,
  participantCount: number | undefined,
  canUseCandidate: FieldCandidateGuard | undefined,
): {
  event: League | Tournament;
  matches: Match[];
  placementFailures: EventBuilderPlacementFailure[];
  diagnostics: EventEditorScheduleDiagnostics;
} => {
  if (
    includePlaceholderTeams
    && typeof participantCount === "number"
    && participantCount > 0
  ) {
    event.maxParticipants = participantCount;
  }
  prepareSchedulePlacementWindow(event, includePlaceholderTeams);
  if (event instanceof League) {
    const rosterTeamIds = Array.from(
      new Set(
        (Array.isArray(event.registeredTeamIds) && event.registeredTeamIds.length
          ? event.registeredTeamIds
          : Object.keys(event.teams))
          .map((teamId) => String(teamId).trim())
          .filter((teamId) => teamId.length > 0 && Boolean(event.teams[teamId])),
      ),
    );
    applySplitDivisionRosterAssignments(event, rosterTeamIds);
  }
  const builder = new EventBuilder(event, context, {
    includePlaceholderTeams,
    canUseCandidate,
    allowPartialPlacement: true,
  });
  const scheduled = builder.buildSchedule();

  const matches = Object.values(scheduled.matches);
  finalizeOpenEndedSchedule(scheduled, matches);
  return {
    event: scheduled,
    matches,
    placementFailures: builder.placementFailures,
    diagnostics: builder.getScheduleDiagnostics(),
  };
};

type MatchStructuralShape = {
  phase: string | null;
  division: string | null;
  sourceDivision: string | null;
  role: string | null;
  bracket: "WINNERS" | "LOSERS";
  side: string | null;
  dependencyRole: {
    left: boolean;
    right: boolean;
  };
  dependencies: {
    left: string | null;
    right: string | null;
  };
  seeds: [number | null, number | null];
};

const structuralText = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
};

const structuralSeed = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const structuralShapeFor = (
  match: Match,
  cache: WeakMap<object, string>,
  active: Set<object>,
): string => {
  const cached = cache.get(match);
  if (cached) return cached;
  if (active.has(match)) return "cycle";
  active.add(match);
  const shape: MatchStructuralShape = {
    phase: structuralText(match.division?.phase),
    division: structuralText(match.division?.id),
    sourceDivision: structuralText(match.division?.sourceDivisionId),
    role: structuralText(match.division?.role),
    bracket: match.losersBracket === true ? "LOSERS" : "WINNERS",
    side: structuralText(match.side),
    dependencyRole: {
      left: Boolean(match.previousLeftMatch),
      right: Boolean(match.previousRightMatch),
    },
    dependencies: {
      left: match.previousLeftMatch
        ? structuralShapeFor(match.previousLeftMatch, cache, active)
        : null,
      right: match.previousRightMatch
        ? structuralShapeFor(match.previousRightMatch, cache, active)
        : null,
    },
    seeds: [
      structuralSeed(match.team1Seed),
      structuralSeed(match.team2Seed),
    ],
  };
  active.delete(match);
  const key = JSON.stringify(shape);
  cache.set(match, key);
  return key;
};

const structuralKeyFor = (
  match: Match,
  cache = new WeakMap<object, string>(),
): string => structuralShapeFor(match, cache, new Set<object>());

const participantKeyFor = (match: Match): string => JSON.stringify([
  structuralText(match.team1?.id),
  structuralText(match.team2?.id),
]);

const unorderedParticipantKeyFor = (match: Match): string => JSON.stringify(
  [structuralText(match.team1?.id), structuralText(match.team2?.id)]
    .filter((id): id is string => id !== null)
    .sort(),
);

const seedKeyFor = (match: Match): string => JSON.stringify([
  structuralSeed(match.team1Seed),
  structuralSeed(match.team2Seed),
]);

const chooseStructuralMatch = (
  previous: Match,
  candidates: Match[],
  consumed: Set<string>,
): Match | undefined => {
  const available = candidates.filter((candidate) => !consumed.has(candidate.id));
  if (!available.length) return undefined;
  const participantKey = participantKeyFor(previous);
  const unorderedParticipantKey = unorderedParticipantKeyFor(previous);
  const seedKey = seedKeyFor(previous);
  return available
    .slice()
    .sort((left, right) => {
      const score = (candidate: Match): number => {
        let value = 0;
        if (participantKeyFor(candidate) === participantKey) value += 8;
        if (unorderedParticipantKeyFor(candidate) === unorderedParticipantKey) value += 4;
        if (seedKeyFor(candidate) === seedKey) value += 2;
        return value;
      };
      return score(right) - score(left)
        || left.id.localeCompare(right.id);
    })[0];
};
const renumberMutableMatches = (
  matches: Match[],
  protectedMatchIds: ReadonlySet<string>,
): void => {
  const protectedMatchNumbers = new Set<number>();
  const mutableMatchNumberCounts = new Map<number, number>();
  for (const match of matches) {
    if (protectedMatchIds.has(match.id)) {
      if (
        Number.isInteger(match.matchId)
        && (match.matchId as number) > 0
      ) {
        protectedMatchNumbers.add(match.matchId as number);
      }
      continue;
    }
    if (Number.isInteger(match.matchId) && (match.matchId as number) > 0) {
      mutableMatchNumberCounts.set(
        match.matchId as number,
        (mutableMatchNumberCounts.get(match.matchId as number) ?? 0) + 1,
      );
    }
  }

  const orderedMutableMatches = matches
    .filter((match) => !protectedMatchIds.has(match.id))
    .sort((left, right) => (
      (left.matchId ?? Number.POSITIVE_INFINITY) - (right.matchId ?? Number.POSITIVE_INFINITY)
      || left.id.localeCompare(right.id)
    ));
  const usedNumbers = new Set(protectedMatchNumbers);
  const preservedMutableNumbers = new Set<number>();
  for (const match of orderedMutableMatches) {
    const matchId = match.matchId;
    if (
      Number.isInteger(matchId)
      && (matchId as number) > 0
      && !protectedMatchNumbers.has(matchId as number)
      && mutableMatchNumberCounts.get(matchId as number) === 1
    ) {
      preservedMutableNumbers.add(matchId as number);
      usedNumbers.add(matchId as number);
    }
  }

  let nextNumber = 1;
  for (const match of orderedMutableMatches) {
    const matchId = match.matchId;
    if (
      Number.isInteger(matchId)
      && (matchId as number) > 0
      && preservedMutableNumbers.has(matchId as number)
    ) {
      continue;
    }
    while (usedNumbers.has(nextNumber)) {
      nextNumber += 1;
    }
    match.matchId = nextNumber;
    usedNumbers.add(nextNumber);
    nextNumber += 1;
  }
};


export const mergeProtectedMatches = (
  event: League | Tournament,
  generatedMatches: Match[],
  previousMatches: Match[],
  protectedMatchIds: ReadonlySet<string> | undefined,
): Match[] => {
  if (!protectedMatchIds?.size) return generatedMatches;
  const directlyProtectedMatches = previousMatches.filter((match) =>
    protectedMatchIds.has(match.id),
  );
  const protectedPhaseDivisionIds = new Set(
    directlyProtectedMatches
      .map((match) => match.division?.id ?? "")
      .filter((divisionId) => divisionId.length > 0),
  );
  const protectedMatches = previousMatches.filter((match) =>
    protectedMatchIds.has(match.id)
    || protectedPhaseDivisionIds.has(match.division?.id ?? ""),
  );
  const effectiveProtectedMatchIds = new Set(
    protectedMatches.map((match) => match.id),
  );

  const structuralCache = new WeakMap<object, string>();
  const generatedByStructuralKey = new Map<string, Match[]>();
  for (const generated of generatedMatches) {
    const key = structuralKeyFor(generated, structuralCache);
    const candidates = generatedByStructuralKey.get(key) ?? [];
    candidates.push(generated);
    generatedByStructuralKey.set(key, candidates);
  }
  for (const candidates of generatedByStructuralKey.values()) {
    candidates.sort((left, right) => left.id.localeCompare(right.id));
  }

  const consumedGeneratedIds = new Set<string>();
  const previousToGenerated = new Map<string, Match>();
  const pairPreviousMatches = (matches: Match[]): void => {
    for (const previous of matches) {
      const candidates = generatedByStructuralKey.get(
        structuralKeyFor(previous, structuralCache),
      ) ?? [];
      const generated = chooseStructuralMatch(
        previous,
        candidates,
        consumedGeneratedIds,
      );
      if (!generated) continue;
      consumedGeneratedIds.add(generated.id);
      previousToGenerated.set(previous.id, generated);
    }
  };
  // Protected nodes claim their structural slots first. Replacements then
  // consume the remaining one-to-one slots.
  pairPreviousMatches(protectedMatches);
  pairPreviousMatches(previousMatches.filter((match) =>
    !effectiveProtectedMatchIds.has(match.id),
  ));

  const generatedById = new Map(
    generatedMatches.map((match) => [match.id, match] as const),
  );
  const replacementByGeneratedId = new Map<string, Match>();
  const mergedById = new Map(
    generatedMatches
      .filter((match) => !protectedPhaseDivisionIds.has(match.division?.id ?? ""))
      .map((match) => [match.id, match]),
  );
  for (const protectedMatch of protectedMatches) {
    const generated = previousToGenerated.get(protectedMatch.id);
    if (generated) {
      replacementByGeneratedId.set(generated.id, protectedMatch);
      mergedById.delete(generated.id);
    }
    mergedById.set(protectedMatch.id, protectedMatch);
  }

  const previousToRetained = new Map<string, Match>();
  for (const previous of previousMatches) {
    const generated = previousToGenerated.get(previous.id);
    const retained = generated
      ? replacementByGeneratedId.get(generated.id) ?? generated
      : effectiveProtectedMatchIds.has(previous.id)
        ? previous
        : undefined;
    if (retained) previousToRetained.set(previous.id, retained);
  }
  const resolve = (match: Match | null): Match | null => {
    if (!match) return null;
    const previousRetained = previousToRetained.get(match.id);
    if (previousRetained) return previousRetained;
    const generated = generatedById.get(match.id);
    if (generated) {
      return replacementByGeneratedId.get(generated.id)
        ?? (mergedById.has(generated.id) ? generated : null);
    }
    return mergedById.get(match.id) ?? null;
  };

  const merged = Array.from(mergedById.values());
  renumberMutableMatches(merged, effectiveProtectedMatchIds);
  for (const match of merged) {
    match.winnerNextMatch = resolve(match.winnerNextMatch);
    match.loserNextMatch = resolve(match.loserNextMatch);
    match.previousLeftMatch = resolve(match.previousLeftMatch);
    match.previousRightMatch = resolve(match.previousRightMatch);
  }
  event.matches = Object.fromEntries(merged.map((match) => [match.id, match]));
  return merged;
};
type ProtectedMatchSnapshot = {
  match: Match;
  values: Match;
  divisionStates: Array<{
    division: Division;
    teamIds: string[];
  }>;
  teamMatches: Array<{
    team: NonNullable<Match["team1"]>;
    matches: Match[];
  }>;
};

const snapshotProtectedMatches = (
  protectedMatches: Match[],
): ProtectedMatchSnapshot[] => {
  const teams = new Set<NonNullable<Match["team1"]>>();
  const divisions = new Set<Division>();
  for (const match of protectedMatches) {
    if (match.division) divisions.add(match.division);
    for (const team of [match.team1, match.team2, match.teamOfficial]) {
      if (team) teams.add(team);
    }
  }
  return protectedMatches.map((match) => ({
    match,
    values: cloneMatchForReservation(match),
    divisionStates: Array.from(divisions).map((division) => ({
      division,
      teamIds: [...division.teamIds],
    })),
    teamMatches: Array.from(teams).map((team) => ({
      team,
      matches: [...team.matches],
    })),
  }));
};
const restoreProtectedMatches = (
  snapshots: ProtectedMatchSnapshot[],
): void => {
  const restoredTeams = new Set<NonNullable<Match["team1"]>>();
  const restoredDivisions = new Set<Division>();
  for (const snapshot of snapshots) {
    Object.assign(snapshot.match, snapshot.values);
    for (const divisionState of snapshot.divisionStates) {
      if (restoredDivisions.has(divisionState.division)) continue;
      divisionState.division.teamIds = [...divisionState.teamIds];
      restoredDivisions.add(divisionState.division);
    }
    for (const teamState of snapshot.teamMatches) {
      if (restoredTeams.has(teamState.team)) continue;
      teamState.team.matches = [...teamState.matches];
      restoredTeams.add(teamState.team);
    }
  }
};
const protectedMatchIdsForWholePhases = (
  matches: Match[],
  directlyProtectedMatchIds: ReadonlySet<string>,
): Set<string> => {
  const protectedPhaseDivisionIds = new Set(
    matches
      .filter((match) => directlyProtectedMatchIds.has(match.id))
      .map((match) => match.division?.id ?? "")
      .filter((divisionId) => divisionId.length > 0),
  );
  return new Set(
    matches
      .filter((match) => (
        directlyProtectedMatchIds.has(match.id)
        || protectedPhaseDivisionIds.has(match.division?.id ?? "")
      ))
      .map((match) => match.id),
  );
};
const retainedMatchIdsForProtectedPhases = async (
  tx: Prisma.TransactionClient,
  eventId: string,
  directlyProtectedMatchIds: ReadonlySet<string> | undefined,
): Promise<string[]> => {
  const directIds = Array.from(directlyProtectedMatchIds ?? []).sort();
  if (!directIds.length) return [];
  const matches = (tx as unknown as Record<string, unknown>).matches as {
    findMany?: (args: unknown) => Promise<unknown>;
  } | undefined;
  if (typeof matches?.findMany !== "function") return directIds;
  const rows = await matches.findMany({
    where: { eventId },
    select: { id: true, division: true },
  });
  if (!Array.isArray(rows)) return directIds;
  const directIdSet = new Set(directIds);
  const protectedDivisions = new Set(
    rows
      .filter((row) => (
        row
        && typeof row === "object"
        && directIdSet.has(String((row as { id?: unknown }).id ?? ""))
      ))
      .map((row) => (
        row && typeof row === "object"
          ? String((row as { division?: unknown }).division ?? "")
          : ""
      ))
      .filter((divisionId) => divisionId.length > 0),
  );
  const retainedIds = rows
    .filter((row) => {
      if (!row || typeof row !== "object") return false;
      const typedRow = row as { id?: unknown; division?: unknown };
      const id = String(typedRow.id ?? "");
      return directIdSet.has(id)
        || protectedDivisions.has(String(typedRow.division ?? ""));
    })
    .map((row) => String((row as { id?: unknown }).id ?? ""))
    .filter((id) => id.length > 0);
  return Array.from(new Set([...directIds, ...retainedIds])).sort();
};


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
    allowPartialPlacement = false,
    persist = true,
    protectedMatchIds: directlyProtectedMatchIds,
    regenerateGraph = false,
  } = options;
  const eventRow = await tx.events.findUnique({ where: { id: eventId } });
  if (!eventRow) throw new EventScheduleUnsupportedError("Event not found.");
  const scheduleState = await loadEventScheduleState(
    eventRow as unknown as Record<string, unknown>,
    eventId,
    tx,
  );
  if (
    expectedScheduleRevision
    && expectedScheduleRevision !== scheduleState.revision
  ) {
    throw new EventScheduleRevisionConflictError(scheduleState.revision);
  }

  const eventRowRecord = eventRow as unknown as Record<string, unknown>;
  const shouldRetainProtectedMatches =
    mode === "RESCHEDULE_PRESERVING_LOCKS"
    || (mode === "REBUILD" && regenerateGraph);
  const retainedMatchIds = shouldRetainProtectedMatches
    ? await retainedMatchIdsForProtectedPhases(
      tx,
      eventId,
      directlyProtectedMatchIds,
    )
    : [];
  const event = retainedMatchIds.length
    ? await loadEventWithRelations(eventId, tx, { retainedMatchIds })
    : await loadEventWithRelations(eventId, tx);
  const fieldIds = scheduledFieldIdsFor(event, eventRowRecord.fieldIds);
  await acquireFieldLocks(tx, fieldIds);
  const blockerCatalog = mode === "DELETE"
    ? null
    : await loadFieldBlockerCatalog({
      client: tx as unknown as PrismaLike,
      fieldIds,
      lowerBound: scheduleConflictLowerBound(event),
      excludeEventId: eventId,
    });
  const baseFieldCandidateGuard = buildFieldCandidateGuard(blockerCatalog);
  const currentFieldIds = new Set(fieldIds);
  const fieldCandidateGuard: FieldCandidateGuard = (candidate) => (
    currentFieldIds.has(candidate.resource.id)
    && (baseFieldCandidateGuard?.(candidate) ?? true)
  );
  const previousMatches = Object.values(event.matches);
  const effectiveProtectedMatchIds =
    mode === "REBUILD" && regenerateGraph
      ? protectedMatchIdsForWholePhases(
        previousMatches,
        directlyProtectedMatchIds ?? new Set<string>(),
      )
      : new Set(directlyProtectedMatchIds ?? []);
  const protectedMatches = previousMatches.filter((match) =>
    effectiveProtectedMatchIds.has(match.id),
  );
  const protectedPhaseDivisionIds = new Set(
    protectedMatches
      .map((match) => match.division?.id ?? "")
      .filter((divisionId) => divisionId.length > 0),
  );
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
      placementFailures: [],
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
  const canUseCandidate =
    mode === "REBUILD" && regenerateGraph
      ? buildProtectedCandidateGuard(
          fieldCandidateGuard,
          protectedMatches,
        )
      : fieldCandidateGuard;
  const originalScheduleEnd = {
    end: event.end,
    generatedScheduleEnd: event.generatedScheduleEnd,
  };
  const protectedSnapshots = snapshotProtectedMatches(protectedMatches);
  const advancement = shouldApplyConfirmedAdvancementReassignments(event)
    ? applyConfirmedAdvancementReassignments(event, context)
    : undefined;
  if (protectedSnapshots.length) {
    restoreProtectedMatches(protectedSnapshots);
  }
  if (mode === "REBUILD" && regenerateGraph) {
    event.matches = {};
  }
  let scheduled: {
    event: League | Tournament;
    matches: Match[];
    warnings?: EventEditorScheduleWarning[];
    placementFailures?: EventBuilderPlacementFailure[];
    diagnostics?: EventEditorScheduleDiagnostics;
  };
  let scheduleWarnings: EventEditorScheduleWarning[] = [];
  if (
    (mode === "BUILD" || mode === "REBUILD")
    && !regenerateGraph
    && isReusableUnplacedMatchGraph(previousMatches)
  ) {
    prepareSchedulePlacementWindow(event, false);
    const builder = new EventBuilder(event, context, {
      includePlaceholderTeams: false,
      canUseCandidate,
      allowPartialPlacement,
    });
    const placedEvent = builder.placeMatchGraph({ preserveMatchIds: true });
    const placedMatches = Object.values(placedEvent.matches);
    finalizeOpenEndedSchedule(placedEvent, placedMatches);
    scheduled = {
      event: placedEvent,
      matches: placedMatches,
      placementFailures: builder.placementFailures,
      diagnostics: builder.getScheduleDiagnostics(),
    };
  } else if (
    (mode === "BUILD" || mode === "REBUILD")
    && allowPartialPlacement
  ) {
    scheduled = buildPartialSchedule(
      event,
      context,
      includePlaceholderTeams,
      participantCount,
      canUseCandidate,
    );
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
      scheduled = rescheduleEventMatchesPreservingLocks(
        event,
        {
          eventCheckedInTeamIds,
          checkedInTeamIdsByMatch,
        },
        fieldCandidateGuard,
        effectiveProtectedMatchIds,
        allowPartialPlacement,
      );
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
    scheduled = scheduleEvent(
      {
        event,
        participantCount,
        includePlaceholderTeams,
        canUseCandidate,
      },
      context,
    );
  }
  if (mode === "REBUILD" && regenerateGraph) {
    assignGeneratedOfficialsAroundProtectedMatches(
      scheduled.event,
      scheduled.matches,
      protectedMatches,
    );
  }
  if (mode === "REBUILD" && regenerateGraph) {
    scheduled.matches = mergeProtectedMatches(
      scheduled.event,
      scheduled.matches,
      previousMatches,
      effectiveProtectedMatchIds,
    );
  }
  scheduleWarnings = mergeScheduleWarnings(
    scheduleWarnings,
    collectUnresolvedStaffingDiagnostics(scheduled.matches),
  );
  if (!scheduled.matches.length) {
    throw new EventScheduleInputError(
      "The scheduler did not produce any matches.",
    );
  }
  const diagnostics = scheduled.diagnostics ?? diagnoseScheduleProposal({
    event: scheduled.event,
    matches: scheduled.matches,
    placementFailures: scheduled.placementFailures ?? [],
  });
  if (blockerCatalog) {
    assertScheduledFieldConflicts(blockerCatalog, scheduled.matches);
  }
  assertIntraEventConflicts(
    scheduled.event,
    scheduled.matches,
    effectiveProtectedMatchIds,
  );
  setGeneratedScheduleEnd(
    scheduled.event,
    scheduled.matches,
    allowPartialPlacement ? originalScheduleEnd : undefined,
  );
  if (!persist) {
    return {
      event: scheduled.event,
      matches: scheduled.matches,
      warnings: scheduleWarnings,
      placementFailures: scheduled.placementFailures ?? [],
      diagnostics,
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
  }
  await updateConfirmedPlayoffDivisions(
    tx,
    scheduled.event,
    context,
    advancement,
    protectedPhaseDivisionIds,
  );
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
    placementFailures: scheduled.placementFailures ?? [],
    diagnostics,
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
