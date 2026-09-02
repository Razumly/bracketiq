/** @jest-environment node */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseCreateEventEditorCommand,
  type CreateEventEditorCommand,
  type EventEditorDraft,
} from "@/contracts/eventEditor";
import { editorDraftToLegacyEvent } from "@/app/events/[id]/schedule/components/eventForm/editorContractAdapters";
import {
  loadEventWithRelations,
  upsertEventFromPayload,
} from "@/server/repositories/events";
import { EventBuilder } from "@/server/scheduler/EventBuilder";
import { matchDemandFromGraph, type MatchDemand } from "@/server/scheduler/matchGraph";
import type { Match } from "@/server/scheduler/types";
type ParityRow = Record<string, any> & { id: string };
type ParityWhere = Record<string, unknown>;
type OperatorKey =
  | "in"
  | "notIn"
  | "hasSome"
  | "has"
  | "not"
  | "gt"
  | "gte"
  | "lt"
  | "lte";
type OperatorObject = Record<string, unknown>;
type OperatorMatcher = (actual: unknown, operand: unknown) => boolean;

function matchesWhere(row: ParityRow, where: ParityWhere | undefined): boolean {
  if (!where) return true;

  return logicalMatchers.every((matcher) => matcher(row, where))
    && Object.entries(where)
      .filter(([key]) => !["AND", "OR", "NOT"].includes(key))
      .every(([key, expected]) =>
        isOperatorObject(expected)
          ? matchesOperator(row[key], expected)
          : matchesScalar(row[key], expected));
}

function isConditionList(value: unknown): value is ParityWhere[] {
  return Array.isArray(value);
}

const logicalMatchers: Array<(row: ParityRow, where: ParityWhere) => boolean> = [
  (row, where) =>
    !isConditionList(where.AND)
      || where.AND.every((entry) => matchesWhere(row, entry)),
  (row, where) =>
    !isConditionList(where.OR)
      || where.OR.some((entry) => matchesWhere(row, entry)),
  (row, where) => !where.NOT || !matchesWhere(row, where.NOT as ParityWhere),
];

function matchesScalar(actual: unknown, expected: unknown): boolean {
  return expected === null ? actual == null : actual === expected;
}

function isOperatorObject(value: unknown): value is OperatorObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const operatorMatchers: Record<OperatorKey, OperatorMatcher> = {
  in: (actual, operand) => (operand as unknown[]).includes(actual),
  notIn: (actual, operand) => !(operand as unknown[]).includes(actual),
  hasSome: (actual, operand) =>
    Array.isArray(actual)
      && (operand as unknown[]).some((value) => actual.includes(value)),
  has: (actual, operand) => Array.isArray(actual) && actual.includes(operand),
  not: (actual, operand) =>
    !matchesWhere({ value: actual } as ParityRow, { value: operand }),
  gt: (actual, operand) => (actual as number) > (operand as number),
  gte: (actual, operand) => (actual as number) >= (operand as number),
  lt: (actual, operand) => (actual as number) < (operand as number),
  lte: (actual, operand) => (actual as number) <= (operand as number),
};

const operatorKeys = Object.keys(operatorMatchers) as OperatorKey[];

function matchesOperator(actual: unknown, expected: OperatorObject): boolean {
  const operator = operatorKeys.find((key) =>
    Object.prototype.hasOwnProperty.call(expected, key));
  if (!operator) return matchesScalar(actual, expected);
  return operatorMatchers[operator](actual, expected[operator]);
}

const collectionDelegate = (
  rows: Map<string, ParityRow>,
  prefix: string,
) => {
  const findExisting = (where: Record<string, any> | undefined): ParityRow | null =>
    Array.from(rows.values()).find((row) => matchesWhere(row, where)) ?? null;
  const delegate = {
    findMany: jest.fn(async (args: { where?: Record<string, any> } = {}) =>
      Array.from(rows.values()).filter((row) => matchesWhere(row, args.where))),
    findUnique: jest.fn(async (args: { where?: Record<string, any> } = {}) =>
      findExisting(args.where)),
    findFirst: jest.fn(async (args: { where?: Record<string, any> } = {}) =>
      findExisting(args.where)),
    upsert: jest.fn(async (args: {
      where?: Record<string, any>;
      create: Record<string, any>;
      update: Record<string, any>;
    }) => {
      const existing = findExisting(args.where);
      const id = String(
        existing?.id
          ?? args.create.id
          ?? Object.values(args.where ?? {})[0]
          ?? `${prefix}-${rows.size + 1}`,
      );
      const row = {
        ...(existing ?? {}),
        ...args.create,
        ...(args.update ?? {}),
        id,
      };
      rows.set(id, row);
      return row;
    }),
    create: jest.fn(async (args: { data: Record<string, any> }) => {
      const id = String(args.data.id ?? `${prefix}-${rows.size + 1}`);
      const row = { ...args.data, id };
      rows.set(id, row);
      return row;
    }),
    createMany: jest.fn(async (args: { data: Array<Record<string, any>> }) => {
      args.data.forEach((data) => {
        const id = String(data.id ?? `${prefix}-${rows.size + 1}`);
        rows.set(id, { ...data, id });
      });
      return { count: args.data.length };
    }),
    deleteMany: jest.fn(async (args: { where?: Record<string, any> } = {}) => {
      const deleted = Array.from(rows.values()).filter((row) => matchesWhere(row, args.where));
      deleted.forEach((row) => rows.delete(row.id));
      return { count: deleted.length };
    }),
    updateMany: jest.fn(async (args: {
      where?: Record<string, any>;
      data: Record<string, any>;
    }) => {
      const updated = Array.from(rows.values()).filter((row) => matchesWhere(row, args.where));
      updated.forEach((row) => Object.assign(row, args.data));
      return { count: updated.length };
    }),
  };
  return delegate;
};

const createParityPersistenceClient = () => {
  const rows = {
    events: new Map<string, ParityRow>(),
    divisions: new Map<string, ParityRow>(),
    fields: new Map<string, ParityRow>(),
    timeSlots: new Map<string, ParityRow>(),
    teams: new Map<string, ParityRow>(),
    matches: new Map<string, ParityRow>(),
    eventOfficials: new Map<string, ParityRow>(),
    eventDivisionPhaseSources: new Map<string, ParityRow>(),
    eventDivisionPhaseParticipants: new Map<string, ParityRow>(),
    eventTags: new Map<string, ParityRow>(),
    eventTagAssignments: new Map<string, ParityRow>(),
    leagueScoringConfigs: new Map<string, ParityRow>(),
    rentalBookingItems: new Map<string, ParityRow>(),
    rentalBookings: new Map<string, ParityRow>(),
  };

  return {
    $executeRaw: jest.fn().mockResolvedValue(0),
    events: collectionDelegate(rows.events, "event"),
    divisions: collectionDelegate(rows.divisions, "division"),
    fields: {
      ...collectionDelegate(rows.fields, "field"),
      count: jest.fn().mockResolvedValue(1),
    },
    timeSlots: collectionDelegate(rows.timeSlots, "time-slot"),
    teams: collectionDelegate(rows.teams, "team"),
    matches: collectionDelegate(rows.matches, "match"),
    eventOfficials: collectionDelegate(rows.eventOfficials, "event-official"),
    eventDivisionPhaseSources: collectionDelegate(
      rows.eventDivisionPhaseSources,
      "phase-source",
    ),
    eventDivisionPhaseParticipants: collectionDelegate(
      rows.eventDivisionPhaseParticipants,
      "phase-participant",
    ),
    eventTags: collectionDelegate(rows.eventTags, "event-tag"),
    eventTagAssignments: collectionDelegate(
      rows.eventTagAssignments,
      "event-tag-assignment",
    ),
    leagueScoringConfigs: collectionDelegate(
      rows.leagueScoringConfigs,
      "league-scoring-config",
    ),
    rentalBookingItems: collectionDelegate(
      rows.rentalBookingItems,
      "rental-booking-item",
    ),
    rentalBookings: collectionDelegate(rows.rentalBookings, "rental-booking"),
    sports: {
      findMany: jest.fn().mockResolvedValue([{ id: "sport_pickleball" }]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    organizations: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    staffMembers: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    invites: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    userData: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
};

/**
 * Mirror only the production create boundary: the editor adapter projects
 * scalar fields, while the save route supplies the draft-owned resources and
 * division rows to `upsertEventFromPayload`. The resulting persisted rows are
 * then hydrated through the repository read path before scheduling.
 */
const hydrateParityTournament = async (
  draft: EventEditorDraft,
) => {
  const eventId = "event-tournament-parity";
  const projected = editorDraftToLegacyEvent(draft, eventId);
  const payload: Record<string, unknown> = {
    ...projected,
    id: eventId,
    fieldIds: draft.resources.fieldIds,
    timeSlotIds: draft.resources.timeSlotIds,
    fields: draft.resources.fields,
    timeSlots: draft.resources.timeSlots,
    divisionDetails: draft.competition.divisionDetails,
    playoffDivisionDetails: draft.competition.playoffDivisionDetails,
    divisionFieldIds: draft.competition.divisionFieldIds,
    tags: draft.basics.tags,
  };
  const client = createParityPersistenceClient();
  await upsertEventFromPayload(
    payload,
    client as unknown as Parameters<typeof upsertEventFromPayload>[1],
  );
  return loadEventWithRelations(eventId, client);
};

const context = {
  log: () => {},
  error: () => {},
};

const rawSharedParityDraft = JSON.parse(
  readFileSync(
    resolve(
      __dirname,
      "../../../../../../test-fixtures/event-editor/tournament-parity-draft.json",
    ),
    "utf8",
  ),
) as Record<string, unknown>;

type TournamentParityWebGolden = {
  command: CreateEventEditorCommand;
  matchDemand: MatchDemand;
};

const sharedParityWebGolden = JSON.parse(
  readFileSync(
    resolve(
      __dirname,
      "../../../../../../test-fixtures/event-editor/tournament-parity-web-golden.json",
    ),
    "utf8",
  ),
) as TournamentParityWebGolden;
const scheduledParityWebGolden = JSON.parse(
  readFileSync(
    resolve(
      __dirname,
      "../../../../../../test-fixtures/event-editor/tournament-parity-scheduled-web-golden.json",
    ),
    "utf8",
  ),
) as TournamentParityWebGolden;

const scheduledParityCommand = parseCreateEventEditorCommand(
  scheduledParityWebGolden.command,
);

const sharedParityCommand = parseCreateEventEditorCommand(
  sharedParityWebGolden.command,
);
const sharedParityDraft = parseCreateEventEditorCommand({
  ...sharedParityWebGolden.command,
  draft: rawSharedParityDraft,
}).draft;
type CanonicalGraphMatch = {
  key: string;
  divisionId: string;
  phase: string | null;
  team1Seed: number | null;
  team2Seed: number | null;
  previousLeftKey: string | null;
  previousRightKey: string | null;
  winnerNextKey: string | null;
  loserNextKey: string | null;
  losersBracket: boolean | null;
  placementState: string;
  fieldId: string | null;
  start: string | null;
  end: string | null;
  bufferMs: number;
  rules: Record<string, unknown> | null;
  requiresTeamOfficial: boolean;
  reservesTeamOfficial: boolean;
};

type CanonicalMatchLinks = Pick<
  CanonicalGraphMatch,
  "previousLeftKey" | "previousRightKey" | "winnerNextKey" | "loserNextKey"
>;

const canonicalMatchStart = "2026-10-03T08:00:00.000Z";

const canonicalIncidentTypeDefinitions = [
  {
    code: "POINT",
    label: "Point",
    kind: "SCORING",
    requiresTeam: true,
    requiresParticipant: false,
    defaultEnabled: true,
    linkedPointDelta: 1,
    metadata: null,
  },
  {
    code: "DISCIPLINE",
    label: "Penalty or card",
    kind: "DISCIPLINE",
    requiresTeam: false,
    requiresParticipant: false,
    defaultEnabled: true,
    linkedPointDelta: null,
    metadata: null,
  },
  {
    code: "NOTE",
    label: "Match note",
    kind: "NOTE",
    requiresTeam: false,
    requiresParticipant: false,
    defaultEnabled: true,
    linkedPointDelta: null,
    metadata: null,
  },
  {
    code: "ADMIN",
    label: "Admin note",
    kind: "ADMIN",
    requiresTeam: false,
    requiresParticipant: false,
    defaultEnabled: true,
    linkedPointDelta: null,
    metadata: null,
  },
];

const canonicalResolvedRules = (
  segmentCount: number,
): Record<string, unknown> => ({
  scoringModel: "SETS",
  segmentCount,
  segmentLabel: "Set",
  supportsDraw: false,
  supportsOvertime: false,
  supportsShootout: false,
  canUseOvertime: false,
  canUseShootout: false,
  officialRoles: ["Referee"],
  supportedIncidentTypes: ["POINT", "DISCIPLINE", "NOTE", "ADMIN"],
  incidentTypeDefinitions: canonicalIncidentTypeDefinitions,
  autoCreatePointIncidentType: "POINT",
  pointIncidentRequiresParticipant: true,
  timekeeping: {
    timerMode: "NONE",
    segmentDurationMinutes: null,
    segmentDurationMinutesBySequence: [],
    segmentBreakDurationMinutes: 0,
    canUseAddedTime: false,
    addedTimeEnabled: false,
    stopAtRegulationEnd: true,
  },
});

const canonicalMatch = (
  key: string,
  divisionId: string,
  phase: string,
  rules: Record<string, unknown>,
  seeds: [number | null, number | null],
  links: CanonicalMatchLinks,
  losersBracket: boolean,
  bufferMs: number,
): CanonicalGraphMatch => ({
  key,
  divisionId,
  phase,
  team1Seed: seeds[0],
  team2Seed: seeds[1],
  ...links,
  losersBracket,
  placementState: "UNPLACED",
  fieldId: null,
  start: canonicalMatchStart,
  end: canonicalMatchStart,
  bufferMs,
  rules,
  requiresTeamOfficial: false,
  reservesTeamOfficial: false,
});

const canonicalPoolMatches = (
  divisionId: string,
  rules: Record<string, unknown>,
): CanonicalGraphMatch[] =>
  [1, 2, 3, 4, 5, 6].map((ordinal) =>
    canonicalMatch(
      `${divisionId}:pool-${ordinal}`,
      divisionId,
      "POOL",
      rules,
      [null, null],
      {
        previousLeftKey: null,
        previousRightKey: null,
        winnerNextKey: null,
        loserNextKey: null,
      },
      false,
      600_000,
    ));

const canonicalBracketMatches = (
  divisionId: string,
  winnerRules: Record<string, unknown>,
  loserRules: Record<string, unknown>,
  bufferMs: number,
): CanonicalGraphMatch[] => {
  const key = (matchId: number) => `${divisionId}:match-${matchId}`;
  return [
    canonicalMatch(
      key(1),
      divisionId,
      "BRACKET",
      winnerRules,
      [1, 4],
      {
        previousLeftKey: null,
        previousRightKey: null,
        winnerNextKey: key(4),
        loserNextKey: key(5),
      },
      false,
      bufferMs,
    ),
    canonicalMatch(
      key(2),
      divisionId,
      "BRACKET",
      winnerRules,
      [2, 3],
      {
        previousLeftKey: null,
        previousRightKey: null,
        winnerNextKey: key(4),
        loserNextKey: key(5),
      },
      false,
      bufferMs,
    ),
    canonicalMatch(
      key(4),
      divisionId,
      "BRACKET",
      winnerRules,
      [null, null],
      {
        previousLeftKey: key(1),
        previousRightKey: key(2),
        winnerNextKey: key(7),
        loserNextKey: key(6),
      },
      false,
      bufferMs,
    ),
    canonicalMatch(
      key(5),
      divisionId,
      "BRACKET",
      loserRules,
      [null, null],
      {
        previousLeftKey: key(1),
        previousRightKey: key(2),
        winnerNextKey: key(6),
        loserNextKey: null,
      },
      true,
      bufferMs,
    ),
    canonicalMatch(
      key(6),
      divisionId,
      "BRACKET",
      loserRules,
      [null, null],
      {
        previousLeftKey: key(5),
        previousRightKey: key(4),
        winnerNextKey: key(7),
        loserNextKey: null,
      },
      true,
      bufferMs,
    ),
    canonicalMatch(
      key(7),
      divisionId,
      "BRACKET",
      winnerRules,
      [null, null],
      {
        previousLeftKey: key(4),
        previousRightKey: key(6),
        winnerNextKey: key(8),
        loserNextKey: key(8),
      },
      false,
      bufferMs,
    ),
    canonicalMatch(
      key(8),
      divisionId,
      "BRACKET",
      winnerRules,
      [null, null],
      {
        previousLeftKey: key(7),
        previousRightKey: key(7),
        winnerNextKey: null,
        loserNextKey: null,
      },
      false,
      bufferMs,
    ),
  ];
};

const canonicalPoolRules = canonicalResolvedRules(3);
const canonicalPoolAWinnerRules = canonicalResolvedRules(4);
const canonicalPoolALoserRules = canonicalResolvedRules(1);
const canonicalPoolBWinnerRules = canonicalResolvedRules(5);
const canonicalPoolBLoserRules = canonicalResolvedRules(3);

const canonicalGraphOracle: CanonicalGraphMatch[] = [
  ...canonicalPoolMatches(
    "event-tournament-parity__division__pool_a_pool_a__phase__pool",
    canonicalPoolRules,
  ),
  ...canonicalPoolMatches(
    "event-tournament-parity__division__pool_a_pool_b__phase__pool",
    canonicalPoolRules,
  ),
  ...canonicalPoolMatches(
    "event-tournament-parity__division__pool_b_pool_a__phase__pool",
    canonicalPoolRules,
  ),
  ...canonicalPoolMatches(
    "event-tournament-parity__division__pool_b_pool_b__phase__pool",
    canonicalPoolRules,
  ),
  ...canonicalBracketMatches(
    "event-tournament-parity__division__tournament_pool_a",
    canonicalPoolAWinnerRules,
    canonicalPoolALoserRules,
    480_000,
  ),
  ...canonicalBracketMatches(
    "event-tournament-parity__division__tournament_pool_b",
    canonicalPoolBWinnerRules,
    canonicalPoolBLoserRules,
    360_000,
  ),
];

const canonicalFallbackDivisionIds = [
  "event-tournament-parity__division__pool_a_pool_a__phase__pool",
  "event-tournament-parity__division__pool_a_pool_b__phase__pool",
  "event-tournament-parity__division__pool_b_pool_a__phase__pool",
  "event-tournament-parity__division__pool_b_pool_b__phase__pool",
  "event-tournament-parity__division__tournament_pool_a",
  "event-tournament-parity__division__tournament_pool_b",
];

const normalizeRules = (
  rules: unknown,
): Record<string, unknown> | null =>
  rules && typeof rules === "object"
    ? (JSON.parse(JSON.stringify(rules)) as Record<string, unknown>)
    : null;

const isoDate = (value: unknown): string | null =>
  value instanceof Date ? value.toISOString() : null;

const normalizeMatchGraph = (
  matches: Match[],
): CanonicalGraphMatch[] => {
  const keyByMatch = new Map<Match, string>();
  const poolOrdinals = new Map<string, number>();
  for (const match of matches) {
    if (match.division.phase === "POOL") {
      const ordinal = (poolOrdinals.get(match.division.id) ?? 0) + 1;
      poolOrdinals.set(match.division.id, ordinal);
      keyByMatch.set(
        match,
        `${match.division.id}:pool-${ordinal}`,
      );
      continue;
    }
    keyByMatch.set(
      match,
      `${match.division.id}:match-${match.matchId ?? "missing"}`,
    );
  }
  const linkedKey = (match: Match | null): string | null =>
    match ? keyByMatch.get(match) ?? `missing:${match.id}` : null;
  return matches
    .map((match) => ({
      key: keyByMatch.get(match) ?? `missing:${match.id}`,
      divisionId: match.division.id,
      phase: match.division.phase,
      team1Seed: match.team1Seed,
      team2Seed: match.team2Seed,
      previousLeftKey: linkedKey(match.previousLeftMatch),
      previousRightKey: linkedKey(match.previousRightMatch),
      winnerNextKey: linkedKey(match.winnerNextMatch),
      loserNextKey: linkedKey(match.loserNextMatch),
      losersBracket: match.losersBracket ?? null,
      placementState: match.placementState,
      fieldId: match.field?.id ?? null,
      start: isoDate(match.start),
      end: isoDate(match.end),
      bufferMs: match.bufferMs,
      rules: normalizeRules(match.resolvedMatchRules),
      requiresTeamOfficial: match.requiresTeamOfficial,
      reservesTeamOfficial: match.reservesTeamOfficial,
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
};

type PlayoffConfigOracle = {
  doubleElimination: boolean;
  winnerSetCount: number;
  loserSetCount: number;
  winnerBracketPointsToVictory: number[];
  loserBracketPointsToVictory: number[];
  prize: string;
  fieldCount: number;
  restTimeMinutes: number;
  matchDurationMinutes: number;
  setDurationMinutes: number;
};

const expectedPlayoffConfigs: Record<string, PlayoffConfigOracle> = {
  "tournament-pool-a": {
    doubleElimination: true,
    winnerSetCount: 4,
    loserSetCount: 1,
    winnerBracketPointsToVictory: [27, 25, 21, 15],
    loserBracketPointsToVictory: [23],
    prize: "Pool A Championship Trophy",
    fieldCount: 1,
    restTimeMinutes: 8,
    matchDurationMinutes: 40,
    setDurationMinutes: 12,
  },
  "tournament-pool-b": {
    doubleElimination: true,
    winnerSetCount: 5,
    loserSetCount: 3,
    winnerBracketPointsToVictory: [31, 29, 27, 25, 15],
    loserBracketPointsToVictory: [23, 21, 15],
    prize: "Pool B Championship Trophy",
    fieldCount: 1,
    restTimeMinutes: 6,
    matchDurationMinutes: 50,
    setDurationMinutes: 10,
  },
};

describe("Tournament editor parity", () => {
  it("matches the intentionally unscheduled Tournament command fields used by mobile", () => {
    expect(rawSharedParityDraft.schedule).toHaveProperty("isAutomatedScheduling", false);
    expect(sharedParityCommand.draft).toEqual(sharedParityDraft);
    expect(sharedParityCommand.draft.schedule.isAutomatedScheduling).toBe(false);
    expect(sharedParityCommand.draft.competition.matchDurationMinutes).toBe(45);
    expect(sharedParityCommand.draft.competition.divisionDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "tournament-pool-a",
          maxParticipants: 6,
          poolCount: 2,
          poolTeamCount: 3,
          playoffTeamCount: 4,
          matchDurationMinutes: 45,
          playoffPlacementDivisionIds: ["tournament-pool-a"],
        }),
        expect.objectContaining({
          id: "tournament-pool-b",
          maxParticipants: 6,
          poolCount: 2,
          poolTeamCount: 3,
          playoffTeamCount: 4,
          matchDurationMinutes: 45,
          playoffPlacementDivisionIds: ["tournament-pool-b"],
        }),
      ]),
    );
    expect(sharedParityCommand.draft.competition.playoffDivisionDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "tournament-pool-a", kind: "PLAYOFF", maxParticipants: 6 }),
        expect.objectContaining({ id: "tournament-pool-b", kind: "PLAYOFF", maxParticipants: 6 }),
      ]),
    );
    expect(
      sharedParityCommand.draft.competition.playoffDivisionDetails.map(
        ({ id, playoffConfig }) => ({ id, playoffConfig }),
      ),
    ).toEqual([
      { id: "tournament-pool-a", playoffConfig: expectedPlayoffConfigs["tournament-pool-a"] },
      { id: "tournament-pool-b", playoffConfig: expectedPlayoffConfigs["tournament-pool-b"] },
    ]);
    expect(expectedPlayoffConfigs["tournament-pool-a"]).not.toEqual(
      expectedPlayoffConfigs["tournament-pool-b"],
    );
    expect(expectedPlayoffConfigs["tournament-pool-a"].winnerSetCount).not.toBe(
      sharedParityCommand.draft.competition.winnerSetCount,
    );
    expect(expectedPlayoffConfigs["tournament-pool-b"].winnerSetCount).not.toBe(
      sharedParityCommand.draft.competition.winnerSetCount,
    );
    expect(sharedParityCommand.draft.staff).toEqual(
      expect.objectContaining({
        doTeamsOfficiate: true,
        teamOfficialsMaySwap: true,
      }),
    );
    expect(sharedParityCommand.completion.mode).toBe("CREATE_ONLY");
    expect(sharedParityCommand.hasScheduleProposalSupport).toBe(false);
  });

  it("derives intentionally unscheduled Tournament Match Demand and graph semantics from hydrated scheduling output", async () => {
    const projected = editorDraftToLegacyEvent(sharedParityCommand.draft, "event-tournament-parity");
    expect(projected.matchDurationMinutes).toBe(45);
    expect(projected.doTeamsOfficiate).toBe(true);
    expect(projected.teamOfficialsMaySwap).toBe(true);

    const hydratedTournament = await hydrateParityTournament(sharedParityCommand.draft);
    expect(
      hydratedTournament.playoffDivisions
        .map(({ id, kind, phase, playoffConfig }) => ({
          id,
          kind,
          phase,
          playoffConfig,
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    ).toEqual([
      {
        id: "event-tournament-parity__division__tournament_pool_a",
        kind: "PLAYOFF",
        phase: "BRACKET",
        playoffConfig: expectedPlayoffConfigs["tournament-pool-a"],
      },
      {
        id: "event-tournament-parity__division__tournament_pool_b",
        kind: "PLAYOFF",
        phase: "BRACKET",
        playoffConfig: expectedPlayoffConfigs["tournament-pool-b"],
      },
    ]);

    const graph = new EventBuilder(hydratedTournament, context).buildMatchGraph();
    const matches = Object.values(graph.matches);
    const demand = matchDemandFromGraph(matches);
    expect(demand).toEqual(sharedParityWebGolden.matchDemand);
    expect(demand).toEqual({
      total: 38,
      byDivision: {
        "event-tournament-parity__division__pool_a_pool_a__phase__pool": 6,
        "event-tournament-parity__division__pool_a_pool_b__phase__pool": 6,
        "event-tournament-parity__division__pool_b_pool_a__phase__pool": 6,
        "event-tournament-parity__division__pool_b_pool_b__phase__pool": 6,
        "event-tournament-parity__division__tournament_pool_a": 7,
        "event-tournament-parity__division__tournament_pool_b": 7,
      },
      byPhase: {
        POOL: 24,
        BRACKET: 14,
      },
      placed: 0,
      unplaced: 38,
    });
    expect(normalizeMatchGraph(matches)).toEqual(canonicalGraphOracle);
  });

  it("matches the scheduled Tournament command and exact Match Demand", async () => {
    expect(scheduledParityCommand.createOperationId).toBe(
      "create-operation-tournament-parity-scheduled",
    );
    expect(scheduledParityCommand.createOperationId).not.toBe(
      sharedParityCommand.createOperationId,
    );
    expect(scheduledParityCommand.draft).toEqual({
      ...sharedParityDraft,
      schedule: {
        ...sharedParityDraft.schedule,
        isAutomatedScheduling: true,
      },
    });
    expect(scheduledParityCommand.draft.schedule).toEqual({
      mode: "FIXED_END",
      endConstraint: "2026-10-03T20:00:00Z",
      isAutomatedScheduling: true,
    });
    expect(scheduledParityCommand.completion).toEqual({
      mode: "CREATE_AND_BUILD_SCHEDULE",
    });
    expect(scheduledParityCommand.hasScheduleProposalSupport).toBe(true);

    const hydratedTournament = await hydrateParityTournament(
      scheduledParityCommand.draft,
    );
    const graph = new EventBuilder(hydratedTournament, context).buildMatchGraph();
    const matches = Object.values(graph.matches);
    const demand = matchDemandFromGraph(matches);

    expect(demand).toEqual(scheduledParityWebGolden.matchDemand);
    expect(demand).toEqual({
      total: 38,
      byDivision: {
        "event-tournament-parity__division__pool_a_pool_a__phase__pool": 6,
        "event-tournament-parity__division__pool_a_pool_b__phase__pool": 6,
        "event-tournament-parity__division__pool_b_pool_a__phase__pool": 6,
        "event-tournament-parity__division__pool_b_pool_b__phase__pool": 6,
        "event-tournament-parity__division__tournament_pool_a": 7,
        "event-tournament-parity__division__tournament_pool_b": 7,
      },
      byPhase: {
        POOL: 24,
        BRACKET: 14,
      },
      placed: 0,
      unplaced: 38,
    });
    expect(normalizeMatchGraph(matches)).toEqual(canonicalGraphOracle);
  });

  it("assigns every unscoped field and time slot to the canonical division list", async () => {
    const fallbackDraft = JSON.parse(
      JSON.stringify(sharedParityCommand.draft),
    ) as EventEditorDraft;
    fallbackDraft.competition.divisionFieldIds = {};
    fallbackDraft.competition.divisionDetails =
      fallbackDraft.competition.divisionDetails.map((detail) => ({
        ...detail,
        fieldIds: [],
      }));
    fallbackDraft.competition.playoffDivisionDetails =
      fallbackDraft.competition.playoffDivisionDetails.map((detail) => ({
        ...detail,
        fieldIds: [],
      }));
    fallbackDraft.resources.timeSlots = fallbackDraft.resources.timeSlots.map(
      (slot) => ({ ...slot, divisions: [] }),
    );

    const fallbackTournament = await hydrateParityTournament(fallbackDraft);
    expect(fallbackTournament.divisions.map((division) => division.id)).toEqual(
      canonicalFallbackDivisionIds.slice(0, 4),
    );
    expect(
      fallbackTournament.playoffDivisions.map((division) => division.id),
    ).toEqual(canonicalFallbackDivisionIds.slice(4));
    expect(
      Object.values(fallbackTournament.fields).map((field) => ({
        id: field.id,
        divisions: field.getGroups().map((division) => division.id),
      })),
    ).toEqual([
      { id: "tournament-field-1", divisions: canonicalFallbackDivisionIds },
    ]);
    expect(
      fallbackTournament.timeSlots.map((slot) => ({
        id: slot.id,
        divisions: slot.divisions.map((division) => division.id),
      })),
    ).toEqual([
      { id: "tournament-slot-1", divisions: canonicalFallbackDivisionIds },
    ]);
  });
});
