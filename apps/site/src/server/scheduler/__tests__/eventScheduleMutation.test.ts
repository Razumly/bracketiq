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

const buildLeague = (id = "event_graph", includePlayoffs = true) => {
  const division = buildDivision("phase_open", "LEAGUE");
  const playoffDivision = buildDivision(
    "phase_open__phase__playoff",
    "PLAYOFF",
  );
  const teams = Object.fromEntries(
    Array.from({ length: 4 }, (_, index) => {
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
  const field = new PlayingField({
    id: "field_1",
    divisions: includePlayoffs ? [division, playoffDivision] : [division],
  });
  const timeSlot = new TimeSlot({
    id: "slot_1",
    dayOfWeek: 0,
    startDate: new Date("2026-01-05T08:00:00.000Z"),
    repeating: true,
    startTimeMinutes: 8 * 60,
    endTimeMinutes: 22 * 60,
    field: field.id,
  });
  return new League({
    id,
    name: "Graph League",
    start: new Date("2026-01-05T08:00:00.000Z"),
    end: new Date("2026-01-31T22:00:00.000Z"),
    maxParticipants: 4,
    teamSignup: true,
    eventType: "LEAGUE",
    teams,
    divisions: [division],
    playoffDivisions: includePlayoffs ? [playoffDivision] : [],
    fields: { [field.id]: field },
    timeSlots: [timeSlot],
    gamesPerOpponent: 1,
    includePlayoffs,
    playoffTeamCount: includePlayoffs ? 4 : null,
    usesSets: false,
    matchDurationMinutes: 60,
    restTimeMinutes: 0,
  });
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

  it("places the persisted graph without regenerating Match identities", async () => {
    const event = buildLeague();
    const graphTx = {
      teams: { upsert: jest.fn().mockResolvedValue(undefined) },
    } as any;
    (loadEventWithRelations as jest.Mock).mockResolvedValue(event);
    const persistedGraph = await persistCreateOnlyMatchGraph({
      tx: graphTx,
      eventId: event.id,
      includePlaceholderTeams: true,
    });
    const persistedIds = new Set(
      persistedGraph.matches.map((match) => match.id),
    );
    (loadEventWithRelations as jest.Mock).mockResolvedValue(persistedGraph.event);

    const result = await reconcileEventSchedule({
      tx: {
        events: {
          findUnique: jest.fn().mockResolvedValue({
            id: event.id,
            eventType: "LEAGUE",
          }),
        },
      } as any,
      eventId: event.id,
      mode: "BUILD",
    });

    expect(result.matches.map((match) => match.id).sort()).toEqual(
      [...persistedIds].sort(),
    );
    expect(result.matches.every((match) =>
      match.placementState === "PLACED" && match.field,
    )).toBe(true);
    expect(
      Object.values(result.event.teams).every(
        (team) => !/^Seed \d+$/i.test(team.name.trim()),
      ),
    ).toBe(true);
    expect(
      result.matches.every((match) =>
        [match.team1, match.team2, match.teamOfficial]
          .filter((team): team is NonNullable<typeof team> => Boolean(team))
          .every((team) => !/^Seed \d+$/i.test(team.name.trim())),
      ),
    ).toBe(true);
    expect(deletePristineScheduleByEvent).toHaveBeenCalledWith(
      event.id,
      expect.anything(),
    );
    expect(saveMatches).toHaveBeenCalledWith(
      event.id,
      result.matches,
      expect.anything(),
    );
    expect(persistScheduledRosterTeams).toHaveBeenCalled();
    expect(saveEventSchedule).toHaveBeenCalled();
  });
});
