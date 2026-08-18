/** @jest-environment node */

jest.mock("@/lib/prisma", () => ({
  prisma: {},
}));

jest.mock("@/server/repositories/events", () => ({
  deletePristineScheduleByEvent: jest.fn(),
  loadEventWithRelations: jest.fn(),
  persistScheduledRosterTeams: jest.fn(),
  saveEventSchedule: jest.fn(),
  saveMatches: jest.fn(),
}));

jest.mock("@/server/events/eventEditorSnapshot", () => ({
  loadEventScheduleState: jest.fn(),
}));

jest.mock("@/server/matchScheduleNotifications", () => ({
  collectMatchScheduleChanges: jest.fn(() => []),
  snapshotMatchScheduleState: jest.fn(() => []),
}));

import {
  persistCreateOnlyMatchGraph,
  reconcileEventSchedule,
} from "@/server/scheduler/eventScheduleMutation";
import {
  Division,
  League,
  Match,
  PlayingField,
  Team,
  TimeSlot,
} from "@/server/scheduler/types";
import { loadEventScheduleState } from "@/server/events/eventEditorSnapshot";
import {
  deletePristineScheduleByEvent,
  loadEventWithRelations,
  persistScheduledRosterTeams,
  saveEventSchedule,
  saveMatches,
} from "@/server/repositories/events";

const context = {
  log: () => {},
  error: () => {},
};

const buildDivision = (
  id: string,
  phase: "LEAGUE" | "PLAYOFF",
  kind: "LEAGUE" | "PLAYOFF" = phase === "PLAYOFF" ? "PLAYOFF" : "LEAGUE",
) =>
  new Division(
    id,
    id,
    [],
    null,
    4,
    phase === "PLAYOFF" ? 4 : null,
    kind,
    [],
    null,
    null,
    null,
    null,
    [],
    null,
    {},
    "PHASE",
    phase,
  );

const buildLeague = (
  id = "event_graph",
  includePlayoffs = true,
  restTimeMinutes = 0,
  teamCount = 4,
  fieldCount = 1,
) => {
  const division = buildDivision("phase_open", "LEAGUE");
  const playoffDivision = buildDivision(
    "phase_open__phase__playoff",
    "PLAYOFF",
  );
  const teams = Object.fromEntries(
    Array.from({ length: teamCount }, (_, index) => {
      const teamId = `team_${index + 1}`;
      return [
        teamId,
        new Team({
          id: teamId,
          captainId: `captain_${index + 1}`,
          division,
          name: `Team ${index + 1}`,
        }),
      ];
    }),
  );
  const fields = Object.fromEntries(
    Array.from({ length: fieldCount }, (_, index) => {
      const field = new PlayingField({
        id: `field_${index + 1}`,
        divisions: includePlayoffs ? [division, playoffDivision] : [division],
      });
      return [field.id, field];
    }),
  );
  const timeSlots = Object.values(fields).map(
    (field) =>
      new TimeSlot({
        id: `slot_${field.id}`,
        dayOfWeek: 0,
        startDate: new Date("2026-01-05T08:00:00.000Z"),
        repeating: true,
        startTimeMinutes: 8 * 60,
        endTimeMinutes: 22 * 60,
        field: field.id,
      }),
  );
  return new League({
    id,
    name: "Graph League",
    start: new Date("2026-01-05T08:00:00.000Z"),
    end: new Date("2026-01-31T22:00:00.000Z"),
    maxParticipants: teamCount,
    teamSignup: true,
    eventType: "LEAGUE",
    teams,
    divisions: [division],
    playoffDivisions: includePlayoffs ? [playoffDivision] : [],
    fields,
    timeSlots,
    gamesPerOpponent: 1,
    includePlayoffs,
    playoffTeamCount: includePlayoffs ? 4 : null,
    usesSets: false,
    matchDurationMinutes: 60,
    restTimeMinutes,
  });
};

const buildReadinessGraphLeague = () => {
  const event = buildLeague("event_readiness", false, 0, 12, 4);
  const division = event.divisions[0];
  const teams = Object.values(event.teams);
  const openingMatches = Array.from({ length: 6 }, (_, index) =>
    new Match({
      id: `${event.id}:match:${index + 1}`,
      matchId: index + 1,
      placementState: "UNPLACED",
      start: event.start,
      end: event.start,
      division,
      field: null,
      bufferMs: 0,
      team1: teams[index * 2],
      team2: teams[index * 2 + 1],
      eventId: event.id,
    }),
  );
  const downstream = new Match({
    id: `${event.id}:match:7`,
    matchId: 7,
    placementState: "UNPLACED",
    start: event.start,
    end: event.start,
    division,
    field: null,
    bufferMs: 0,
    eventId: event.id,
    previousLeftMatch: openingMatches[0],
    previousRightMatch: openingMatches[1],
  });
  openingMatches[0].winnerNextMatch = downstream;
  openingMatches[1].winnerNextMatch = downstream;
  event.matches = Object.fromEntries(
    [...openingMatches, downstream].map((match) => [match.id, match]),
  );
  return { event, openingMatches, downstream };
};

describe("event schedule Match Graph persistence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (saveMatches as jest.Mock).mockResolvedValue(undefined);
    (saveEventSchedule as jest.Mock).mockResolvedValue(undefined);
    (persistScheduledRosterTeams as jest.Mock).mockResolvedValue([]);
    (deletePristineScheduleByEvent as jest.Mock).mockResolvedValue([]);
    (loadEventScheduleState as jest.Mock).mockResolvedValue({
      revision: "schedule_revision_1",
      hasProtectedHistory: false,
    });
  });

  it("persists stable unplaced graph IDs, dependencies, and synthetic roster teams", async () => {
    const event = buildLeague();
    const tx = {
      teams: { upsert: jest.fn().mockResolvedValue(undefined) },
      matches: {
        findMany: jest.fn().mockImplementation(async () =>
          Object.values(event.matches).map((match) => ({
            division: match.division.id,
            placementState: match.placementState,
            fieldId: null,
          })),
        ),
      },
      divisions: {
        findMany: jest.fn().mockResolvedValue(
          [...event.divisions, ...event.playoffDivisions].map((division) => ({
            id: division.id,
            phase: division.phase,
          })),
        ),
      },
    } as any;
    (loadEventWithRelations as jest.Mock).mockResolvedValue(event);

    const result = await persistCreateOnlyMatchGraph({
      tx,
      eventId: event.id,
      includePlaceholderTeams: true,
    });

    const ids = new Set(result.matches.map((match) => match.id));
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches.every((match) =>
      match.id.startsWith(`${event.id}:match:`),
    )).toBe(true);
    expect(result.matches.every((match) =>
      match.placementState === "UNPLACED" && match.field === null,
    )).toBe(true);
    for (const match of result.matches) {
      for (const dependency of match.getDependencies()) {
        expect(ids.has(dependency.id)).toBe(true);
      }
    }
    expect(tx.teams.upsert).toHaveBeenCalled();
    expect(saveMatches).toHaveBeenCalledWith(event.id, result.matches, tx);
  });

  it("places a persisted graph by readiness without waiting for every opening Match", async () => {
    const firstFixture = buildReadinessGraphLeague();
    const secondFixture = buildReadinessGraphLeague();
    const openingIds = firstFixture.openingMatches.map((match) => match.id);
    const downstreamId = firstFixture.downstream.id;
    const expectedIds = [...openingIds, downstreamId].sort();
    const tx = {
      events: {
        findUnique: jest.fn().mockResolvedValue({
          id: firstFixture.event.id,
          eventType: "LEAGUE",
        }),
      },
    } as unknown as Parameters<typeof reconcileEventSchedule>[0]["tx"];
    (loadEventWithRelations as jest.Mock)
      .mockResolvedValueOnce(firstFixture.event)
      .mockResolvedValueOnce(secondFixture.event);

    const firstResult = await reconcileEventSchedule({
      tx,
      eventId: firstFixture.event.id,
      mode: "BUILD",
    });
    const secondResult = await reconcileEventSchedule({
      tx,
      eventId: secondFixture.event.id,
      mode: "BUILD",
    });

    const firstById = new Map(
      firstResult.matches.map((match) => [match.id, match] as const),
    );
    const placedOpenings = openingIds.map((id) => firstById.get(id)!);
    const downstream = firstById.get(downstreamId)!;
    const waveOneStart = new Date("2026-01-05T08:00:00.000Z").getTime();
    const waveTwoStart = new Date("2026-01-05T09:00:00.000Z").getTime();

    expect(firstResult.matches.map((match) => match.id).sort()).toEqual(
      expectedIds,
    );
    expect(
      firstResult.matches.every(
        (match) => match.placementState === "PLACED" && match.field,
      ),
    ).toBe(true);
    expect(
      placedOpenings.every(
        (match) =>
          match.previousLeftMatch === null &&
          match.previousRightMatch === null,
      ),
    ).toBe(true);
    expect(
      placedOpenings
        .filter((match) => match.start.getTime() === waveOneStart)
        .map((match) => match.id),
    ).toEqual(openingIds.slice(0, 4));
    expect(
      new Set(placedOpenings.slice(0, 4).map((match) => match.field!.id)).size,
    ).toBe(4);
    expect(
      placedOpenings
        .filter((match) => match.start.getTime() === waveTwoStart)
        .map((match) => match.id),
    ).toEqual(openingIds.slice(4));
    expect(downstream.start.getTime()).toBe(waveTwoStart);
    expect(downstream.start.getTime()).toBeGreaterThanOrEqual(
      downstream.previousLeftMatch!.end.getTime(),
    );
    expect(downstream.start.getTime()).toBeGreaterThanOrEqual(
      downstream.previousRightMatch!.end.getTime(),
    );
    expect(
      placedOpenings.slice(4).map((match) => match.field!.id),
    ).not.toContain(downstream.field!.id);
    expect([
      downstream.previousLeftMatch!.id,
      downstream.previousRightMatch!.id,
    ]).toEqual(openingIds.slice(0, 2));
    expect(firstById.get(openingIds[0])!.winnerNextMatch!.id).toBe(
      downstreamId,
    );
    expect(firstById.get(openingIds[1])!.winnerNextMatch!.id).toBe(
      downstreamId,
    );

    const firstPlacementSignature = [...firstResult.matches]
      .sort((left, right) => (left.matchId ?? 0) - (right.matchId ?? 0))
      .map((match) => ({
        id: match.id,
        matchId: match.matchId,
        start: match.start.toISOString(),
        end: match.end.toISOString(),
        fieldId: match.field?.id ?? null,
        previousLeftId: match.previousLeftMatch?.id ?? null,
        previousRightId: match.previousRightMatch?.id ?? null,
        winnerNextId: match.winnerNextMatch?.id ?? null,
      }));
    const secondPlacementSignature = [...secondResult.matches]
      .sort((left, right) => (left.matchId ?? 0) - (right.matchId ?? 0))
      .map((match) => ({
        id: match.id,
        matchId: match.matchId,
        start: match.start.toISOString(),
        end: match.end.toISOString(),
        fieldId: match.field?.id ?? null,
        previousLeftId: match.previousLeftMatch?.id ?? null,
        previousRightId: match.previousRightMatch?.id ?? null,
        winnerNextId: match.winnerNextMatch?.id ?? null,
      }));
    expect(secondPlacementSignature).toEqual(firstPlacementSignature);
    expect(deletePristineScheduleByEvent).toHaveBeenCalledWith(
      firstFixture.event.id,
      expect.anything(),
    );
    expect(saveMatches).toHaveBeenCalledWith(
      firstFixture.event.id,
      firstResult.matches,
      expect.anything(),
    );
    expect(persistScheduledRosterTeams).toHaveBeenCalled();
    expect(saveEventSchedule).toHaveBeenCalled();
  });
});
