/** @jest-environment node */

import { EventBuilder } from "@/server/scheduler/EventBuilder";
import {
  assertPhaseOwnedMatchGraph,
  assertUnplacedMatchGraph,
  matchDemandFromGraph,
  matchDemandFromPersistedGraph,
  rekeyMatchGraph,
  serializeMatchGraph,
} from "@/server/scheduler/matchGraph";
import {
  Division,
  League,
  PlayingField,
  Team,
  TimeSlot,
  Tournament,
} from "@/server/scheduler/types";

const context = {
  log: () => {},
  error: () => {},
};

const buildDivision = (id = "entry_open") =>
  new Division(
    id,
    "Open",
    [],
    null,
    4,
    null,
    "LEAGUE",
    [],
    null,
    null,
    null,
    null,
    [],
    null,
    {},
    "PHASE",
    "LEAGUE",
  );

const buildTeams = (division: Division, count: number): Record<string, Team> =>
  Object.fromEntries(
    Array.from({ length: count }, (_, index) => {
      const id = `team_${index + 1}`;
      return [
        id,
        new Team({
          id,
          captainId: `captain_${index + 1}`,
          division,
          name: `Team ${index + 1}`,
        }),
      ];
    }),
  );

const buildEventFields = (
  division: Division,
): Record<string, PlayingField> => ({
  field_1: new PlayingField({
    id: "field_1",
    divisions: [division],
    name: "Field 1",
  }),
});

const buildTimeSlots = (): TimeSlot[] => [
  new TimeSlot({
    id: "slot_1",
    dayOfWeek: 0,
    startDate: new Date("2026-01-05T08:00:00.000Z"),
    repeating: true,
    startTimeMinutes: 8 * 60,
    endTimeMinutes: 22 * 60,
    field: "field_1",
  }),
];

describe("match graph construction", () => {
  it("builds a League graph without placement and reports demand from graph nodes", () => {
    const division = buildDivision();
    const league = new League({
      id: "league_graph",
      name: "Graph League",
      start: new Date("2026-01-05T08:00:00.000Z"),
      end: new Date("2026-01-31T22:00:00.000Z"),
      maxParticipants: 4,
      teamSignup: true,
      eventType: "LEAGUE",
      teams: buildTeams(division, 4),
      divisions: [division],
      fields: buildEventFields(division),
      timeSlots: buildTimeSlots(),
      gamesPerOpponent: 1,
      includePlayoffs: false,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
    });

    const builder = new EventBuilder(league, context);
    const graph = builder.buildMatchGraph();

    expect(Object.values(graph.matches)).toHaveLength(6);
    expect(
      Object.values(graph.matches).every((match) => match.field === null),
    ).toBe(true);
    expect(
      Object.values(graph.matches).every(
        (match) => match.placementState === "UNPLACED",
      ),
    ).toBe(true);
    expect(matchDemandFromGraph(Object.values(graph.matches))).toEqual({
      total: 6,
      byDivision: { entry_open: 6 },
      byPhase: { LEAGUE: 6 },
      placed: 0,
      unplaced: 6,
    });
    expect(
      serializeMatchGraph(Object.values(graph.matches)).every(
        (match) =>
          match.placementState === "UNPLACED" &&
          match.start === null &&
          match.end === null,
      ),
    ).toBe(true);
    const graphMatches = Object.values(graph.matches);
    expect(() => assertPhaseOwnedMatchGraph(graphMatches)).not.toThrow();
    expect(() => assertUnplacedMatchGraph(graphMatches)).not.toThrow();
    const stableMatches = rekeyMatchGraph("league_graph", graphMatches);
    const stableIds = new Set(stableMatches.map((match) => match.id));
    expect(stableMatches.map((match) => match.matchId)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    for (const match of stableMatches) {
      for (const dependency of match.getDependencies()) {
        expect(stableIds.has(dependency.id)).toBe(true);
      }
    }
    graph.matches = Object.fromEntries(
      stableMatches.map((match) => [match.id, match]),
    );
    const placed = new EventBuilder(graph, context, {
      includePlaceholderTeams: false,
    }).placeMatchGraph({ preserveMatchIds: true });
    expect(Object.values(placed.matches).map((match) => match.id).sort()).toEqual(
      [...stableIds].sort(),
    );
    expect(
      Object.values(placed.matches).every(
        (match) => match.placementState === "PLACED" && match.field,
      ),
    ).toBe(true);
  });
  it("derives the same demand from persisted unplaced graph rows", () => {
    expect(
      matchDemandFromPersistedGraph(
        [
          {
            divisionId: "entry_open",
            placementState: "UNPLACED",
            fieldId: null,
          },
          {
            divisionId: "entry_open",
            placementState: "UNPLACED",
            fieldId: null,
          },
          {
            divisionId: "entry_open",
            placementState: "PLACED",
            fieldId: "field_1",
          },
          {
            divisionId: "playoff_open",
            placementState: "UNPLACED",
            fieldId: null,
          },
        ],
        [
          { id: "entry_open", phase: "LEAGUE" },
          { id: "playoff_open", phase: "PLAYOFF" },
        ],
      ),
    ).toEqual({
      total: 4,
      byDivision: { entry_open: 3, playoff_open: 1 },
      byPhase: { LEAGUE: 3, PLAYOFF: 1 },
      placed: 1,
      unplaced: 3,
    });
  });

  it("normalizes persisted division identities before phase demand grouping", () => {
    const demand = matchDemandFromPersistedGraph(
      [
        {
          divisionId: "ENTRY_OPEN",
          placementState: "UNPLACED",
          fieldId: null,
        },
      ],
      [{ id: "entry_open", phase: "LEAGUE" }],
    );

    expect(demand.byPhase).toEqual({ LEAGUE: 1 });
  });

  it("builds a Tournament bracket graph with seeds and advancement dependencies before placement", () => {
    const division = new Division(
      "phase_bracket",
      "Bracket",
      [],
      null,
      null,
      null,
      "PLAYOFF",
      [],
      null,
      null,
      null,
      null,
      [],
      null,
      {},
      "PHASE",
      "BRACKET",
    );
    const tournament = new Tournament({
      id: "tournament_graph",
      name: "Graph Tournament",
      start: new Date("2026-01-05T08:00:00.000Z"),
      end: new Date("2026-01-31T22:00:00.000Z"),
      maxParticipants: 4,
      teamSignup: true,
      eventType: "TOURNAMENT",
      teams: buildTeams(division, 4),
      divisions: [division],
      fields: buildEventFields(division),
      timeSlots: buildTimeSlots(),
      doubleElimination: false,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
    });

    const graph = new EventBuilder(tournament, context).buildMatchGraph();
    const matches = Object.values(graph.matches);

    expect(matches).toHaveLength(3);
    expect(
      matches.some(
        (match) => match.previousLeftMatch || match.previousRightMatch,
      ),
    ).toBe(true);
    expect(
      matches.some((match) => match.team1Seed === 1 || match.team2Seed === 1),
    ).toBe(true);
    expect(matches.every((match) => match.field === null)).toBe(true);
    expect(matches.every((match) => match.placementState === "UNPLACED")).toBe(
      true,
    );
  });
  it("uses the persisted playoff phase division for a non-split League bracket", () => {
    const division = buildDivision();
    const playoffDivision = new Division(
      "entry_open__phase__playoff",
      "Open — Playoff",
      [],
      null,
      4,
      4,
      "PLAYOFF",
      [],
      null,
      null,
      null,
      {
        doubleElimination: false,
        winnerSetCount: 1,
        loserSetCount: 1,
        winnerBracketPointsToVictory: [21],
        loserBracketPointsToVictory: [21],
        prize: "",
        fieldCount: 1,
        restTimeMinutes: 0,
      },
      [],
      null,
      {},
      "PHASE",
      "PLAYOFF",
    );
    const league = new League({
      id: "league_phase_graph",
      name: "Phase League",
      start: new Date("2026-01-05T08:00:00.000Z"),
      end: new Date("2026-01-31T22:00:00.000Z"),
      maxParticipants: 4,
      teamSignup: true,
      eventType: "LEAGUE",
      teams: buildTeams(division, 4),
      divisions: [division],
      playoffDivisions: [playoffDivision],
      fields: buildEventFields(division),
      timeSlots: buildTimeSlots(),
      gamesPerOpponent: 1,
      includePlayoffs: true,
      playoffTeamCount: 4,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
    });

    const matches = Object.values(
      new EventBuilder(league, context).buildMatchGraph().matches,
    );
    const playoffMatches = matches.filter(
      (match) => match.division.phase === "PLAYOFF",
    );

    expect(matches).toHaveLength(9);
    expect(playoffMatches).toHaveLength(3);
    expect(
      playoffMatches.every((match) => match.division.id === playoffDivision.id),
    ).toBe(true);
  });
  it("routes each phase-owned league division to its matching playoff phase", () => {
    const divisionA = buildDivision("entry_a__phase__league");
    const divisionB = buildDivision("entry_b__phase__league");
    divisionA.maxParticipants = 4;
    divisionB.maxParticipants = 4;
    const playoffA = new Division(
      "entry_a__phase__playoff",
      "A — Playoff",
      [],
      null,
      4,
      3,
      "PLAYOFF",
      [],
      null,
      null,
      null,
      null,
      [],
      null,
      {},
      "PHASE",
      "PLAYOFF",
    );
    const playoffB = new Division(
      "entry_b__phase__playoff",
      "B — Playoff",
      [],
      null,
      4,
      3,
      "PLAYOFF",
      [],
      null,
      null,
      null,
      null,
      [],
      null,
      {},
      "PHASE",
      "PLAYOFF",
    );
    const teams = {
      a1: new Team({ id: "a1", captainId: "ca1", division: divisionA, name: "A1" }),
      a2: new Team({ id: "a2", captainId: "ca2", division: divisionA, name: "A2" }),
      a3: new Team({ id: "a3", captainId: "ca3", division: divisionA, name: "A3" }),
      a4: new Team({ id: "a4", captainId: "ca4", division: divisionA, name: "A4" }),
      b1: new Team({ id: "b1", captainId: "cb1", division: divisionB, name: "B1" }),
      b2: new Team({ id: "b2", captainId: "cb2", division: divisionB, name: "B2" }),
      b3: new Team({ id: "b3", captainId: "cb3", division: divisionB, name: "B3" }),
      b4: new Team({ id: "b4", captainId: "cb4", division: divisionB, name: "B4" }),
    };
    const field = new PlayingField({
      id: "field_1",
      divisions: [divisionA, divisionB, playoffA, playoffB],
      name: "Field 1",
    });
    const league = new League({
      id: "league_multi_phase_graph",
      name: "Multi-phase League",
      start: new Date("2026-01-05T08:00:00.000Z"),
      end: new Date("2026-01-31T22:00:00.000Z"),
      maxParticipants: 8,
      teamSignup: true,
      eventType: "LEAGUE",
      singleDivision: false,
      teams,
      divisions: [divisionA, divisionB],
      playoffDivisions: [playoffA, playoffB],
      fields: { [field.id]: field },
      timeSlots: buildTimeSlots(),
      gamesPerOpponent: 1,
      includePlayoffs: true,
      splitLeaguePlayoffDivisions: true,
      playoffTeamCount: 4,
      usesSets: false,
      matchDurationMinutes: 60,
      restTimeMinutes: 0,
    });

    const matches = Object.values(
      new EventBuilder(league, context).buildMatchGraph().matches,
    );
    const playoffMatchesByDivision = new Map<string, Match[]>();
    for (const match of matches.filter((entry) => entry.division.phase === "PLAYOFF")) {
      const divisionMatches = playoffMatchesByDivision.get(match.division.id) ?? [];
      divisionMatches.push(match);
      playoffMatchesByDivision.set(match.division.id, divisionMatches);
    }

    expect(playoffMatchesByDivision.get(playoffA.id)).toHaveLength(3);
    expect(playoffMatchesByDivision.get(playoffB.id)).toHaveLength(3);
  });
});
