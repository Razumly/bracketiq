import type { Prisma } from "@/generated/prisma/client";
import {
  deletePristineScheduleByEvent,
  loadEventWithRelations,
  persistScheduledRosterTeams,
  saveEventSchedule,
  saveMatches,
} from "@/server/repositories/events";
import {
  collectMatchScheduleChanges,
  type MatchScheduleNotificationPlan,
  snapshotMatchScheduleState,
} from "@/server/matchScheduleNotifications";
import { loadEventScheduleState } from "@/server/events/eventEditorSnapshot";
import {
  applyLeagueDivisionPlayoffReassignment,
  isTournamentPoolPlayStandingsEvent,
  type StandingsAdvancementEvent,
} from "./standings";
import { rescheduleEventMatchesPreservingLocks } from "./reschedulePreservingLocks";
import { scheduleEvent, ScheduleError } from "./scheduleEvent";
import type {
  EventEditorMatchProjection,
  EventEditorScheduleWarning,
} from "@/contracts/eventEditor";
import { League, Match, SchedulerContext, Tournament } from "./types";
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
} => {
  const affectedPlayoffDivisionIds = new Set<string>();
  const teamIdsByPlayoffDivision: Record<string, string[]> = {};

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
  }

  return {
    affectedPlayoffDivisionIds: Array.from(affectedPlayoffDivisionIds),
    teamIdsByPlayoffDivision,
  };
};

const updateConfirmedPlayoffDivisions = async (
  tx: Prisma.TransactionClient,
  event: League | Tournament,
  context: SchedulerContext,
): Promise<void> => {
  if (!shouldApplyConfirmedAdvancementReassignments(event)) return;
  const reassignment = applyConfirmedAdvancementReassignments(event, context);
  if (!reassignment.affectedPlayoffDivisionIds.length) return;
  const now = new Date();
  await Promise.all(
    reassignment.affectedPlayoffDivisionIds.map((playoffDivisionId) =>
      tx.divisions.update({
        where: { id: playoffDivisionId },
        data: {
          teamIds:
            reassignment.teamIdsByPlayoffDivision[playoffDivisionId] ?? [],
          updatedAt: now,
        },
      }),
    ),
  );
};

const deleteSyntheticScheduleTeams = async (
  tx: Prisma.TransactionClient,
  eventId: string,
): Promise<void> => {
  const placeholderTeams = await tx.teams.findMany({
    where: {
      eventId,
      OR: [
        { kind: "PLACEHOLDER" },
        {
          AND: [
            { captainId: "" },
            { name: { startsWith: "Place Holder", mode: "insensitive" } },
          ],
        },
      ],
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
  if (mode === "BUILD" && previousMatches.length > 0) {
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
  if (mode === "RESCHEDULE_PRESERVING_LOCKS" && previousMatches.length > 0) {
    try {
      scheduled = rescheduleEventMatchesPreservingLocks(event);
      scheduleWarnings = scheduled.warnings ?? [];
    } catch (error) {
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
