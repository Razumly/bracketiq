/** @jest-environment node */

jest.mock("@/lib/prisma", () => ({
  prisma: {},
}));

jest.mock("@/server/repositories/locks", () => ({
  acquireFieldLocks: jest.fn().mockResolvedValue(undefined),
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

import type { EventEditorCreateProposalGraph } from "@/contracts/eventEditor";
import {
  EventScheduleProposalGraphError,
  mergeProtectedMatches,
  persistCreateOnlyMatchGraph,
  persistSerializedScheduleGraph,
  reconcileEventSchedule,
  validateAndNormalizeSerializedGraph,
} from "@/server/scheduler/eventScheduleMutation";
import { EventBuilder } from "@/server/scheduler/EventBuilder";
import {
  Division,
  League,
  Match,
  PlayingField,
  Team,
  TimeSlot,
  UserData,
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
    null,
    true,
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
const buildProposalValidationGraph = (): EventEditorCreateProposalGraph => ({
  event: {
    id: "event_1",
    eventType: "LEAGUE",
    divisions: ["division_1"],
    divisionDetails: [],
    playoffDivisionDetails: [],
    fields: [{ id: "field_1" }],
    teams: [],
    officials: [],
    eventOfficials: [],
    officialPositions: [],
  },
  matches: [
    {
      id: "match_1",
      eventId: "event_1",
      start: "2026-08-24T08:00:00.000Z",
      end: "2026-08-24T09:00:00.000Z",
      placementState: "PLACED",
      division: "division_1",
      sourceDivisionId: null,
      phaseDivisionId: null,
      fieldId: "field_1",
      team1Id: null,
      team2Id: null,
      teamOfficialId: null,
      winnerEventTeamId: null,
      officialAssignments: [],
      officialIds: [],
      team1: null,
      team2: null,
      teamOfficial: null,
      official: null,
      field: { id: "field_1" },
      winnerNextMatchId: null,
      loserNextMatchId: null,
      previousLeftId: null,
      previousRightId: null,
    },
  ],
}) as unknown as EventEditorCreateProposalGraph;


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
  it("rejects dangling Match Graph references before persistence", () => {
    const graph = buildProposalValidationGraph();
    graph.matches[0]!.winnerNextMatchId = "missing-match";

    expect(() =>
      validateAndNormalizeSerializedGraph("event_1", graph),
    ).toThrow(EventScheduleProposalGraphError);
  });
  it("accepts a placed phase match with its source division identity", () => {
    const graph = buildProposalValidationGraph();
    graph.event.divisions = ["phase_pool"];
    graph.event.divisionDetails = [{
      id: "phase_pool",
      name: "Pool",
      kind: "LEAGUE",
      role: "PHASE",
      phase: "POOL",
      sourceDivisionId: "entry",
      isSystemGenerated: true,
      phaseSettings: {},
      teamIds: [],
      playoffTeamCount: null,
      playoffPlacementDivisionIds: [],
      standingsOverrides: null,
      standingsConfirmedAt: null,
      standingsConfirmedBy: null,
      playoffConfig: null,
      leagueConfig: null,
    }];
    graph.matches[0]!.division = "entry";
    graph.matches[0]!.sourceDivisionId = "entry";
    graph.matches[0]!.phaseDivisionId = "phase_pool";
    graph.matches[0]!.phase = "POOL";

    expect(() =>
      validateAndNormalizeSerializedGraph("event_1", graph),
    ).not.toThrow();
  });
  it("rejects an incomplete proposal match with no proposed resource", () => {
    const graph = buildProposalValidationGraph();
    graph.matches[0]!.fieldId = null;

    expect(() =>
      validateAndNormalizeSerializedGraph("event_1", graph),
    ).toThrow(EventScheduleProposalGraphError);
    expect(() =>
      validateAndNormalizeSerializedGraph("event_1", graph),
    ).toThrow(/has no proposed resource/);
  });
  it("rejects an incomplete proposal match with no proposed time", () => {
    const graph = buildProposalValidationGraph();
    graph.matches[0]!.start = null;

    expect(() =>
      validateAndNormalizeSerializedGraph("event_1", graph),
    ).toThrow(EventScheduleProposalGraphError);
    expect(() =>
      validateAndNormalizeSerializedGraph("event_1", graph),
    ).toThrow(/has no proposed time/);
  });
  it("rejects a proposal match whose placement is not placed", () => {
    const graph = buildProposalValidationGraph();
    graph.matches[0]!.placementState = "UNPLACED";

    expect(() =>
      validateAndNormalizeSerializedGraph("event_1", graph),
    ).toThrow(EventScheduleProposalGraphError);
    expect(() =>
      validateAndNormalizeSerializedGraph("event_1", graph),
    ).toThrow(/has an unexpected proposed resource/);
  });
  it("rejects an unresolved officiating slot for a configured official position", () => {
    const graph = buildProposalValidationGraph();
    graph.event.officialPositions = [
      { id: "referee", name: "Referee", count: 1, order: 0 },
    ];

    expect(() =>
      validateAndNormalizeSerializedGraph("event_1", graph),
    ).toThrow(EventScheduleProposalGraphError);
    expect(() =>
      validateAndNormalizeSerializedGraph("event_1", graph),
    ).toThrow(/has an unresolved officiating slot for Referee 1/);
  });
  it("accepts unresolved optional named-official slots under Best Available coverage", () => {
    const graph = buildProposalValidationGraph();
    graph.event.staffingPriority = "BEST_AVAILABLE_COVERAGE";
    graph.event.officialPositions = [
      { id: "referee", name: "Referee", count: 1, order: 0 },
    ];
    graph.matches[0]!.officialAssignments = [{
      positionId: "referee",
      slotIndex: 0,
      holderType: "OFFICIAL",
      userId: null,
      eventOfficialId: null,
      checkedIn: false,
      hasConflict: false,
    }];
    graph.matches[0]!.officialIds = [];

    expect(() =>
      validateAndNormalizeSerializedGraph("event_1", graph),
    ).not.toThrow();
  });

  it("accepts a player as a team-officiating assignment holder", () => {
    const graph = buildProposalValidationGraph();
    const assignment = {
      positionId: "team_official",
      slotIndex: 0,
      holderType: "PLAYER",
      userId: "player_1",
      eventOfficialId: null,
      checkedIn: false,
      hasConflict: false,
    };
    graph.event.officialPositions = [
      { id: "team_official", name: "Team official", count: 1, order: 0 },
    ];
    graph.event.teams = [{
      id: "team_1",
      captainId: null,
      division: "division_1",
      kind: "TEAM",
      name: "Team 1",
      playerIds: ["player_1"],
      players: [],
      playerRegistrations: [],
    }];
    graph.matches[0]!.teamOfficialId = "team_1";
    graph.matches[0]!.officialAssignments = [assignment];
    graph.matches[0]!.officialIds = [assignment];

    expect(() =>
      validateAndNormalizeSerializedGraph("event_1", graph),
    ).not.toThrow();
  });
  it("persists phase-owned serialized matches to their phase division", async () => {
    const tx = {};

    await persistSerializedScheduleGraph({
      tx: tx as any,
      eventId: "event_1",
      graph: {
        event: {
          eventType: "LEAGUE",
          start: "2026-08-24T08:00:00.000Z",
          end: "2026-08-24T17:00:00.000Z",
          divisionDetails: [
            {
              id: "entry",
              kind: "LEAGUE",
              role: "ENTRY",
              phase: "LEAGUE",
              phaseSettings: {},
            },
          ],
          playoffDivisionDetails: [],
          teams: [],
        },
        matches: [
          {
            id: "match_phase",
            matchId: 1,
            phase: "POOL",
            sourceDivisionId: "entry",
            phaseDivisionId: "phase_pool",
            division: "entry",
            placementState: "UNPLACED",
          },
        ],
      },
    });
    expect(persistScheduledRosterTeams).toHaveBeenCalledWith(
      {
        eventId: "event_1",
        scheduled: expect.objectContaining({
          id: "event_1",
          teams: {},
        }),
      },
      tx,
    );

    const [, matches] = (saveMatches as jest.Mock).mock.calls[0] ?? [];
    expect(matches).toEqual([
      expect.objectContaining({
        division: expect.objectContaining({
          id: "phase_pool",
          role: "PHASE",
          sourceDivisionId: "entry",
          phase: "POOL",
        }),
      }),
    ]);
  });
  it("persists the proposed generated end without rebuilding the graph", async () => {
    await persistSerializedScheduleGraph({
      tx: {} as any,
      eventId: "event_1",
      graph: {
        event: {
          id: "event_1",
          eventType: "LEAGUE",
          noFixedEndDateTime: true,
          start: "2026-08-24T08:00:00.000Z",
          end: "2026-08-24T17:00:00.000Z",
          generatedScheduleEnd: "2026-08-24T16:30:00.000Z",
          divisionDetails: [],
          playoffDivisionDetails: [],
          teams: [],
        },
        matches: [],
      },
    });

    expect(saveEventSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "event_1",
        generatedScheduleEnd: new Date("2026-08-24T16:30:00.000Z"),
      }),
      expect.anything(),
    );
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

  it("keeps failed partial placements as unplaced graph nodes", () => {
    const event = buildLeague("event_partial", false, 0, 4, 1);
    const builder = new EventBuilder(event, context, {
      allowPartialPlacement: true,
      canUseCandidate: () => false,
    });

    const scheduled = builder.buildSchedule();
    const matches = Object.values(scheduled.matches);

    expect(builder.placementFailures).toHaveLength(matches.length);
    expect(matches.every((match) => (
      match.placementState === "UNPLACED"
      && match.field === null
      && match.officialAssignments.length === 0
    ))).toBe(true);
  });
  it("rewires protected graph references by structural role after ID and order changes", () => {
    const event = buildLeague("event_merge_protected", false, 0, 4, 1);
    const division = event.divisions[0]!;
    const start = new Date("2026-01-05T08:00:00.000Z");
    const makeMatch = (id: string, matchId: number) => new Match({
      id,
      matchId,
      start,
      end: new Date(start.getTime() + 60 * 60 * 1000),
      division,
      bufferMs: 0,
      eventId: event.id,
    });

    const oldProtected = makeMatch("old:protected", 101);
    oldProtected.locked = true;
    oldProtected.status = "COMPLETE";
    oldProtected.team1Points = [7];
    const oldReplaceable = makeMatch("old:replaceable", 202);
    const regeneratedProtected = makeMatch("new:protected", 901);
    const regeneratedReplaceable = makeMatch("new:replaceable", 703);
    const regeneratedTail = makeMatch("new:tail", 1);

    oldProtected.winnerNextMatch = oldReplaceable;
    oldProtected.loserNextMatch = oldReplaceable;
    regeneratedTail.previousLeftMatch = oldReplaceable;
    regeneratedTail.previousRightMatch = oldReplaceable;
    regeneratedTail.winnerNextMatch = regeneratedProtected;
    regeneratedTail.loserNextMatch = regeneratedProtected;

    const merged = mergeProtectedMatches(
      event,
      [regeneratedTail, regeneratedReplaceable, regeneratedProtected],
      [oldProtected, oldReplaceable],
      new Set([oldProtected.id]),
    );
    const mergedById = new Map(merged.map((match) => [match.id, match]));

    expect(mergedById.get(oldProtected.id)).toBe(oldProtected);
    expect(oldProtected.locked).toBe(true);
    expect(oldProtected.status).toBe("COMPLETE");
    expect(oldProtected.team1Points).toEqual([7]);
    expect(mergedById.has(oldReplaceable.id)).toBe(true);
    expect(mergedById.has(regeneratedReplaceable.id)).toBe(false);
    expect(mergedById.has(regeneratedTail.id)).toBe(false);
    expect(oldProtected.winnerNextMatch).toBe(oldReplaceable);
    expect(oldProtected.loserNextMatch).toBe(oldReplaceable);
    expect(Object.keys(event.matches).sort()).toEqual([...mergedById.keys()].sort());

    const mergedIds = new Set(merged.map((match) => match.id));
    for (const match of merged) {
      for (const reference of [
        match.winnerNextMatch,
        match.loserNextMatch,
        match.previousLeftMatch,
        match.previousRightMatch,
      ]) {
        expect(reference === null || mergedIds.has(reference.id)).toBe(true);
      }
    }
  });
  it("renumbers mutable matches when regeneration collides with a protected match number", () => {
    const event = buildLeague("event_merge_match_numbers", false, 0, 2, 1);
    const division = event.divisions[0]!;
    const start = new Date("2026-01-05T08:00:00.000Z");
    const makeMatch = (id: string, matchId: number) => new Match({
      id,
      matchId,
      start,
      end: new Date(start.getTime() + 60 * 60 * 1000),
      division,
      bufferMs: 0,
      eventId: event.id,
    });

    const oldProtected = makeMatch("old:protected", 2);
    oldProtected.locked = true;
    const regeneratedProtected = makeMatch("new:protected", 99);
    const regeneratedMutable = makeMatch("new:mutable", 2);
    regeneratedMutable.losersBracket = true;

    const merged = mergeProtectedMatches(
      event,
      [regeneratedProtected, regeneratedMutable],
      [oldProtected],
      new Set([oldProtected.id]),
    );
    const mergedById = new Map(merged.map((match) => [match.id, match]));

    expect(mergedById.get(oldProtected.id)).toBe(oldProtected);
    expect(oldProtected.matchId).toBe(2);
    expect(new Set(merged.map((match) => match.matchId)).size).toBe(merged.length);
    expect(mergedById.get(regeneratedMutable.id)).toBeUndefined();
  });


  it("reserves protected field occupancy while rebuilding the graph", async () => {
    const event = buildLeague("event_protected_collision", false, 0, 4, 1);
    const graphBuilder = new EventBuilder(event, context, {
      includePlaceholderTeams: false,
    });
    graphBuilder.buildMatchGraph();
    const protectedMatch = Object.values(event.matches)[0]!;
    const protectedEnd = new Date(event.start.getTime() + 60 * 60 * 1000);
    protectedMatch.start = event.start;
    protectedMatch.end = protectedEnd;
    protectedMatch.field = event.fields.field_1!;
    protectedMatch.placementState = "PLACED";
    protectedMatch.locked = true;
    event.fields.field_1!.matches = [protectedMatch];

    const previousMatchIds = Object.keys(event.matches);
    const tx = {
      events: {
        findUnique: jest.fn().mockResolvedValue({
          id: event.id,
          eventType: "LEAGUE",
        }),
      },
    } as unknown as Parameters<typeof reconcileEventSchedule>[0]["tx"];
    (loadEventWithRelations as jest.Mock).mockResolvedValue(event);

    const result = await reconcileEventSchedule({
      tx,
      eventId: event.id,
      mode: "REBUILD",
      historyPolicy: "ALLOW_PROTECTED",
      includePlaceholderTeams: false,
      persist: false,

      protectedMatchIds: new Set([protectedMatch.id]),
      regenerateGraph: true,
    });

    const retainedProtected = result.matches.find(
      (match) => match.id === protectedMatch.id,
    );
    expect(retainedProtected).toBe(protectedMatch);
    expect(retainedProtected?.start).toEqual(event.start);
    expect(result.matches.filter((match) => previousMatchIds.includes(match.id))).toHaveLength(
      previousMatchIds.length,
    );
    expect(retainedProtected?.end).toEqual(protectedEnd);
    const overlapsProtected = result.matches.some((match) => (
      match.id !== protectedMatch.id
      && match.placementState === "PLACED"
      && match.field?.id === protectedMatch.field?.id
      && match.start.getTime() < protectedMatch.end.getTime()
      && match.end.getTime() > protectedMatch.start.getTime()
    ));
    expect(overlapsProtected).toBe(false);
  });
  it("reports final staffing gaps after retaining protected Best Available assignments", async () => {
    const event = buildLeague("event_best_available_rebuild", false, 0, 4, 2);
    event.timeSlots.forEach((slot) => {
      slot.repeating = false;
      slot.endTimeMinutes = 9 * 60;
    });
    const division = event.divisions[0]!;
    const protectedDivision = buildDivision("protected_phase", "LEAGUE");
    const official = new UserData({
      id: "official_1",
      divisions: [division, protectedDivision],
    });
    const officialPosition = {
      id: "referee",
      name: "Referee",
      count: 1,
      order: 0,
    };
    const eventOfficial = {
      id: "event_official_1",
      userId: official.id,
      positionIds: [officialPosition.id],
      fieldIds: [],
      isActive: true,
    };
    event.staffingPriority = "BEST_AVAILABLE_COVERAGE";
    event.officials = [official];
    event.officialPositions = [officialPosition];
    event.eventOfficials = [eventOfficial];
    const protectedEnd = new Date(event.start.getTime() + 60 * 60 * 1000);
    event.registeredTeamIds = Object.keys(event.teams);
    division.teamIds = [...event.registeredTeamIds];
    const protectedMatch = new Match({
      id: `${event.id}:protected`,
      matchId: 1,
      placementState: "PLACED",
      start: event.start,
      end: protectedEnd,
      division: protectedDivision,
      field: event.fields.field_1!,
      bufferMs: 0,
      eventId: event.id,
      official,
      officialAssignments: [{
        positionId: officialPosition.id,
        slotIndex: 0,
        holderType: "OFFICIAL",
        userId: official.id,
        eventOfficialId: eventOfficial.id,
        checkedIn: false,
        hasConflict: false,
      }],
    });
    event.matches = { [protectedMatch.id]: protectedMatch };
    event.fields.field_1!.matches = [protectedMatch];

    const tx = {
      events: {
        findUnique: jest.fn().mockResolvedValue({
          id: event.id,
          eventType: "LEAGUE",
        }),
      },
      matches: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "stored_field_blocker_1",
            eventId: "other_event",
            fieldId: "field_1",
            start: new Date("2026-01-05T09:00:00.000Z"),
            end: new Date("2026-01-05T22:00:00.000Z"),
            placementState: "PLACED",
          },
          {
            id: "stored_field_blocker_2",
            eventId: "other_event",
            fieldId: "field_2",
            start: new Date("2026-01-05T09:00:00.000Z"),
            end: new Date("2026-01-05T22:00:00.000Z"),
            placementState: "PLACED",
          },
        ]),
      },
    } as unknown as Parameters<typeof reconcileEventSchedule>[0]["tx"];
    (loadEventWithRelations as jest.Mock).mockResolvedValue(event);

    const result = await reconcileEventSchedule({
      tx,
      eventId: event.id,
      mode: "REBUILD",
      historyPolicy: "ALLOW_PROTECTED",
      includePlaceholderTeams: false,
      allowPartialPlacement: true,
      persist: false,
      protectedMatchIds: new Set([protectedMatch.id]),
      regenerateGraph: true,
    });
    const retained = result.matches.find((match) => match.id === protectedMatch.id);

    const generatedWithGap = result.matches.find((match) => (
      match.id !== protectedMatch.id
      && match.placementState === "PLACED"
      && match.start.getTime() === protectedMatch.start.getTime()
      && match.field?.id === "field_2"
      && match.officialAssignments.some((assignment) => (
        assignment.positionId === officialPosition.id
        && assignment.userId === null
      ))
    ));
    expect(retained?.officialAssignments).toEqual([
      expect.objectContaining({
        positionId: officialPosition.id,
        userId: official.id,
        eventOfficialId: eventOfficial.id,
      }),
    ]);
    expect(result.matches.some((match) => match.placementState === "UNPLACED")).toBe(true);
    expect(generatedWithGap).toBeDefined();
    const unresolvedTeamDutyMatchIds = result.matches
      .filter((match) => (
        match.field !== null
        && match.placementState !== "UNPLACED"
        && match.requiresTeamOfficial
        && match.teamOfficial === null
      ))
      .map((match) => match.id)
      .sort((left, right) => left.localeCompare(right));
    const unresolvedNamedOfficialMatchIds = result.matches
      .filter((match) => (
        match.field !== null
        && match.placementState !== "UNPLACED"
        && match.officialAssignments.some((assignment) => (
          assignment.userId === null
        ))
      ))
      .map((match) => match.id)
      .sort((left, right) => left.localeCompare(right));
    expect(result.warnings).toEqual([
      {
        code: "UNRESOLVED_TEAM_DUTY",
        message: "Some placed matches do not have a Team-duty assignment.",
        matchIds: unresolvedTeamDutyMatchIds,
      },
      {
        code: "UNRESOLVED_NAMED_OFFICIAL_POSITION",
        message: "Some placed matches have an unbound named Official Position.",
        matchIds: unresolvedNamedOfficialMatchIds,
      },
    ]);
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
  it("places a reusable open-ended graph after a stale generated end", async () => {
    const fixture = buildReadinessGraphLeague();
    const staleGeneratedEnd = new Date("2026-01-04T22:00:00.000Z");
    const eventStart = new Date("2026-01-05T08:00:00.000Z");
    const recurringSlotStart = eventStart;
    const recurringSlotEnd = new Date("2026-01-05T22:00:00.000Z");
    fixture.event.noFixedEndDateTime = true;
    fixture.event.end = staleGeneratedEnd;
    fixture.event.generatedScheduleEnd = staleGeneratedEnd;
    const reusableMatchIds = Object.keys(fixture.event.matches).sort();
    const tx = {
      events: {
        findUnique: jest.fn().mockResolvedValue({
          id: fixture.event.id,
          eventType: "LEAGUE",
        }),
      },
    } as unknown as Parameters<typeof reconcileEventSchedule>[0]["tx"];
    (loadEventWithRelations as jest.Mock).mockResolvedValue(fixture.event);

    const result = await reconcileEventSchedule({
      tx,
      eventId: fixture.event.id,
      mode: "BUILD",
    });

    expect(result.matches.map((match) => match.id).sort()).toEqual(
      reusableMatchIds,
    );
    expect(
      result.matches.every(
        (match) =>
          match.placementState === "PLACED" &&
          match.field &&
          match.start.getTime() >= recurringSlotStart.getTime() &&
          match.end.getTime() > match.start.getTime() &&
          match.end.getTime() <= recurringSlotEnd.getTime(),
      ),
    ).toBe(true);
    expect(result.matches.every((match) => match.start.getTime() > staleGeneratedEnd.getTime())).toBe(
      true,
    );
    const latestMatchEnd = Math.max(
      ...result.matches.map((match) => match.end.getTime()),
    );
    expect(result.event.end.getTime()).toBe(latestMatchEnd);
    expect(result.event.generatedScheduleEnd?.getTime()).toBe(latestMatchEnd);
  });

  it("places a generated open-ended graph within the recurring slot", async () => {
    const fixture = buildLeague("event_generated_stale", false, 0, 4, 1);
    const staleGeneratedEnd = new Date("2026-01-04T22:00:00.000Z");
    const recurringSlotStart = new Date("2026-01-05T08:00:00.000Z");
    const recurringSlotEnd = new Date("2026-01-05T22:00:00.000Z");
    fixture.noFixedEndDateTime = true;
    fixture.end = staleGeneratedEnd;
    fixture.generatedScheduleEnd = staleGeneratedEnd;
    const tx = {
      events: {
        findUnique: jest.fn().mockResolvedValue({
          id: fixture.id,
          eventType: "LEAGUE",
        }),
      },
    } as unknown as Parameters<typeof reconcileEventSchedule>[0]["tx"];
    (loadEventWithRelations as jest.Mock).mockResolvedValue(fixture);

    const result = await reconcileEventSchedule({
      tx,
      eventId: fixture.id,
      mode: "BUILD",
    });

    expect(
      result.matches.every(
        (match) =>
          match.placementState === "PLACED" &&
          match.field &&
          match.start.getTime() >= recurringSlotStart.getTime() &&
          match.end.getTime() <= recurringSlotEnd.getTime(),
      ),
    ).toBe(true);
    const latestMatchEnd = Math.max(
      ...result.matches.map((match) => match.end.getTime()),
    );
    expect(result.event.end.getTime()).toBe(latestMatchEnd);
    expect(result.event.generatedScheduleEnd?.getTime()).toBe(latestMatchEnd);
    expect(result.event.end.getTime()).toBeLessThanOrEqual(
      recurringSlotEnd.getTime(),
    );
  });

  it("restores the original open-ended Event end when every partial Match is unplaced", async () => {
    const event = buildLeague("event_partial_end_restore", false, 0, 4, 1);
    event.noFixedEndDateTime = true;
    const originalEnd = new Date("2026-01-04T22:00:00.000Z");
    const originalGeneratedEnd = new Date("2026-01-04T21:30:00.000Z");
    event.end = originalEnd;
    event.generatedScheduleEnd = originalGeneratedEnd;
    const tx = {
      events: {
        findUnique: jest.fn().mockResolvedValue({
          id: event.id,
          eventType: "LEAGUE",
        }),
      },
      matches: {
        findMany: jest.fn().mockResolvedValue([{
          id: "stored_full_day_blocker",
          eventId: "other_event",
          fieldId: "field_1",
          start: new Date("2026-01-01T00:00:00.000Z"),
          end: new Date("2030-01-01T00:00:00.000Z"),
          placementState: "PLACED",
        }]),
      },
    } as unknown as Parameters<typeof reconcileEventSchedule>[0]["tx"];
    (loadEventWithRelations as jest.Mock).mockResolvedValue(event);

    const result = await reconcileEventSchedule({
      tx,
      eventId: event.id,
      mode: "BUILD",
      allowPartialPlacement: true,
      includePlaceholderTeams: false,
      persist: false,
    });

    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches.every((match) => (
      match.placementState === "UNPLACED"
      && match.field === null
    ))).toBe(true);
    expect(result.placementFailures.length).toBe(result.matches.length);
    expect(result.event.end).toEqual(originalEnd);
    expect(result.event.generatedScheduleEnd).toEqual(originalGeneratedEnd);
  });

  it("avoids a stored Field blocker before persisting a proposed match", async () => {
    const event = buildLeague("event_field_blocked", false, 0, 4, 1);
    const tx = {
      events: {
        findUnique: jest.fn().mockResolvedValue({
          id: event.id,
          eventType: "LEAGUE",
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      matches: {
        findMany: jest.fn().mockResolvedValue([{
          id: "stored_match",
          eventId: "other_event",
          fieldId: "field_1",
          start: new Date("2026-01-05T08:00:00.000Z"),
          end: new Date("2026-01-05T09:00:00.000Z"),
          placementState: "PLACED",
        }]),
      },
    } as unknown as Parameters<typeof reconcileEventSchedule>[0]["tx"];
    (loadEventWithRelations as jest.Mock).mockResolvedValue(event);

    const result = await reconcileEventSchedule({
      tx,
      eventId: event.id,
      mode: "BUILD",
    });

    expect(
      result.matches.every(
        (match) =>
          match.end.getTime() <= new Date("2026-01-05T08:00:00.000Z").getTime() ||
          match.start.getTime() >= new Date("2026-01-05T09:00:00.000Z").getTime(),
      ),
    ).toBe(true);
    expect(saveMatches).toHaveBeenCalledWith(event.id, result.matches, tx);
  });

  it("rejects a far-future Match blocked by one unbounded Weekly Event rule", async () => {
    const event = buildLeague("event_recurring_field_blocked", false, 0, 4, 1);
    event.timeSlots[0].endTimeMinutes = 9 * 60;
    const tx = {
      events: {
        findUnique: jest.fn().mockResolvedValue({
          id: event.id,
          eventType: "LEAGUE",
        }),
        findMany: jest.fn().mockResolvedValue([{
          id: "weekly_blocker",
          eventType: "WEEKLY_EVENT",
          parentEvent: null,
          start: new Date("2026-01-05T00:00:00.000Z"),
          end: null,
          scheduleEndConstraint: null,
          generatedScheduleEnd: null,
          noFixedEndDateTime: true,
          timeZone: "UTC",
          fieldIds: ["field_1"],
          timeSlotIds: ["weekly_blocker_slot"],
          state: "PUBLISHED",
          archivedAt: null,
        }]),
      },
      matches: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      timeSlots: {
        findMany: jest.fn().mockResolvedValue([{
          id: "weekly_blocker_slot",
          repeating: true,
          startDate: new Date("2026-01-05T00:00:00.000Z"),
          endDate: null,
          daysOfWeek: [0],
          startTimeMinutes: 8 * 60,
          endTimeMinutes: 9 * 60,
          timeZone: "UTC",
          scheduledFieldIds: ["field_1"],
          divisions: [],
        }]),
      },
    } as unknown as Parameters<typeof reconcileEventSchedule>[0]["tx"];
    (loadEventWithRelations as jest.Mock).mockResolvedValue(event);

    await expect(reconcileEventSchedule({
      tx,
      eventId: event.id,
      mode: "BUILD",
    })).rejects.toThrow(/Not enough time is allotted|No available time slots remaining/);
    expect(saveMatches).not.toHaveBeenCalled();
  });
});
