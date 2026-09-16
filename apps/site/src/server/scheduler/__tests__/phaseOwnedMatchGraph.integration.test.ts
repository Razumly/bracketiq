/** @jest-environment node */

import { buildEventDivisionId } from "@/lib/divisionTypes";
import {
  loadEventWithRelations,
  persistScheduledRosterTeams,
  saveMatches,
  upsertEventFromPayload,
} from "@/server/repositories/events";
import { scheduleEvent } from "@/server/scheduler/scheduleEvent";
import { matchDemandFromGraph } from "@/server/scheduler/matchGraph";
import {
  persistCreateOnlyMatchGraph,
  type CreateOnlyMatchGraphPersistenceResult,
} from "@/server/scheduler/eventScheduleMutation";
type Row = Record<string, any>;
type Store = Map<string, Row>;

const cloneValue = <T>(value: T): T => structuredClone(value);

type ValueMatcher = (value: unknown, operand: unknown) => boolean;

const comparisonMatchers: Record<string, ValueMatcher> = {
  lt: (value, operand) => (value as any) < operand,
  lte: (value, operand) => (value as any) <= operand,
  gt: (value, operand) => (value as any) > operand,
  gte: (value, operand) => (value as any) >= operand,
};

const matchesComparisonOperators = (
  value: unknown,
  operators: Record<string, unknown>,
): boolean =>
  Object.entries(comparisonMatchers).every(([key, matcher]) =>
    !(key in operators) || matcher(value, operators[key]),
  );

const isValueOperatorObject = (
  value: unknown,
): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function matchesValueOperators(
  value: unknown,
  operators: Record<string, unknown>,
): boolean {
  if ("in" in operators) {
    return Array.isArray(operators.in) && operators.in.includes(value);
  }
  if ("not" in operators && valueMatches(value, operators.not)) {
    return false;
  }
  if ("hasSome" in operators) {
    return Array.isArray(value)
      && Array.isArray(operators.hasSome)
      && operators.hasSome.some((entry) => value.includes(entry));
  }
  return matchesComparisonOperators(value, operators);
}

function valueMatches(value: unknown, condition: unknown): boolean {
  if (!isValueOperatorObject(condition)) {
    return value === condition;
  }
  return matchesValueOperators(value, condition);
}

type TeamLike = {
  id: string;
  kind?: unknown;
  division?: {
    id?: string;
    kind?: unknown;
    phase?: unknown;
  } | null;
};

const isPlaceholderTeam = (team: TeamLike): boolean =>
  String(team.kind ?? "").trim().toUpperCase() === "PLACEHOLDER";

const isBracketPhase = (value: unknown): boolean =>
  ["BRACKET", "PLAYOFF"].includes(String(value ?? "").trim().toUpperCase());

const collectPlaceholderTeamIds = (
  teams: Record<string, TeamLike>,
): string[] =>
  Object.values(teams)
    .filter(isPlaceholderTeam)
    .map((team) => team.id)
    .sort();

const collectBracketPlaceholderTeamIds = (
  teams: Record<string, TeamLike>,
): string[] =>
  Object.values(teams)
    .filter((team) =>
      isPlaceholderTeam(team)
      && isBracketPhase(team.division?.phase ?? team.division?.kind),
    )
    .map((team) => team.id)
    .sort();

const requireTeams = (
  teams: Record<string, TeamLike>,
  teamIds: string[],
): TeamLike[] =>
  teamIds.map((teamId) => {
    const team = teams[teamId];
    if (!team) {
      throw new Error(`Missing persisted team ${teamId}`);
    }
    return team;
  });

const collectNonPlaceholderTeamIds = (
  teams: Record<string, TeamLike>,
): string[] =>
  Object.values(teams)
    .filter((team) => !isPlaceholderTeam(team))
    .map((team) => team.id)
    .sort();
const requireValue = <T>(
  value: T | null | undefined,
  label: string,
): T => {
  if (!value) {
    throw new Error(`Missing ${label}`);
  }
  return value;
};

const rowMatches = (row: Row, where: unknown): boolean => {
  if (!where || typeof where !== "object") return true;
  const filters = where as Record<string, unknown>;
  if (Array.isArray(filters.OR) && !filters.OR.some((entry) => rowMatches(row, entry))) {
    return false;
  }
  if (Array.isArray(filters.AND) && !filters.AND.every((entry) => rowMatches(row, entry))) {
    return false;
  }
  if (filters.NOT && rowMatches(row, filters.NOT)) return false;
  return Object.entries(filters).every(([key, condition]) => {
    if (["OR", "AND", "NOT"].includes(key)) return true;
    return valueMatches(row[key], condition);
  });
};

const rowKeyForWhere = (where: Row): string | null => {
  if (typeof where.id === "string") return where.id;
  return null;
};

class InMemoryClient {
  state: Record<string, Store>;

  constructor(state?: Record<string, Store>) {
    this.state = state ?? {};
  }

  private storeFor(model: string): Store {
    return (this.state[model] ??= new Map<string, Row>());
  }

  private delegate(model: string) {
    const client = this;
    const store = () => client.storeFor(model);
    return {
      findUnique: async ({ where }: { where: Row }) => {
        const key = rowKeyForWhere(where);
        const row = key ? store().get(key) : [...store().values()].find((candidate) => rowMatches(candidate, where));
        return row ? cloneValue(row) : null;
      },
      findFirst: async ({ where }: { where?: Row } = {}) => {
        const row = [...store().values()].find((candidate) => rowMatches(candidate, where));
        return row ? cloneValue(row) : null;
      },
      findMany: async ({ where, orderBy }: { where?: Row; orderBy?: any } = {}) => {
        const rows = [...store().values()].filter((candidate) => rowMatches(candidate, where));
        const orders = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
        rows.sort((left, right) => {
          for (const order of orders) {
            const [field, direction] = Object.entries(order as Row)[0] ?? [];
            if (!field) continue;
            const leftValue = left[field];
            const rightValue = right[field];
            if (leftValue === rightValue) continue;
            const comparison = leftValue < rightValue ? -1 : 1;
            return direction === "desc" ? -comparison : comparison;
          }
          return 0;
        });
        return rows.map(cloneValue);
      },
      count: async ({ where }: { where?: Row } = {}) =>
        [...store().values()].filter((candidate) => rowMatches(candidate, where)).length,
      create: async ({ data }: { data: Row }) => {
        const row = cloneValue(data);
        store().set(String(row.id), row);
        return cloneValue(row);
      },
      createMany: async ({ data }: { data: Row[] }) => {
        for (const entry of data) {
          const row = cloneValue(entry);
          store().set(String(row.id), row);
        }
        return { count: data.length };
      },
      upsert: async ({ where, create, update }: { where: Row; create: Row; update: Row }) => {
        const key = rowKeyForWhere(where);
        const existing = key ? store().get(key) : [...store().values()].find((candidate) => rowMatches(candidate, where));
        const row = existing ? { ...existing, ...cloneValue(update) } : cloneValue(create);
        const resolvedKey = String(row.id ?? key ?? JSON.stringify(where));
        store().set(resolvedKey, row);
        return cloneValue(row);
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const key = rowKeyForWhere(where);
        const existing = key ? store().get(key) : [...store().values()].find((candidate) => rowMatches(candidate, where));
        if (!existing) throw new Error(`Missing ${model} row`);
        const row = { ...existing, ...cloneValue(data) };
        store().set(String(row.id), row);
        return cloneValue(row);
      },
      updateMany: async ({ where, data }: { where?: Row; data: Row }) => {
        let count = 0;
        for (const [key, existing] of store()) {
          if (!rowMatches(existing, where)) continue;
          store().set(key, { ...existing, ...cloneValue(data) });
          count += 1;
        }
        return { count };
      },
      deleteMany: async ({ where }: { where?: Row } = {}) => {
        let count = 0;
        for (const [key, existing] of store()) {
          if (!rowMatches(existing, where)) continue;
          store().delete(key);
          count += 1;
        }
        return { count };
      },
      delete: async ({ where }: { where: Row }) => {
        const key = rowKeyForWhere(where);
        if (key) store().delete(key);
        return {};
      },
    };
  }

  get events() { return this.delegate("events"); }
  get divisions() { return this.delegate("divisions"); }
  get eventDivisionPhaseSources() { return this.delegate("eventDivisionPhaseSources"); }
  get eventDivisionPhaseParticipants() { return this.delegate("eventDivisionPhaseParticipants"); }
  get fields() { return this.delegate("fields"); }
  get teams() { return this.delegate("teams"); }
  get timeSlots() { return this.delegate("timeSlots"); }
  get matches() { return this.delegate("matches"); }
  get sports() { return this.delegate("sports"); }
  get userData() { return this.delegate("userData"); }
  get organizations() { return this.delegate("organizations"); }
  get eventOfficials() { return this.delegate("eventOfficials"); }
  get eventRegistrations() { return this.delegate("eventRegistrations"); }
  get eventTeamStaffAssignments() { return this.delegate("eventTeamStaffAssignments"); }
  get matchSegments() { return this.delegate("matchSegments"); }
  get matchIncidents() { return this.delegate("matchIncidents"); }
  get leagueScoringConfigs() { return this.delegate("leagueScoringConfigs"); }
  get registrationQuestions() { return this.delegate("registrationQuestions"); }
  get rentalBookingItems() { return this.delegate("rentalBookingItems"); }
  get rentalBookings() { return this.delegate("rentalBookings"); }
  get eventTags() { return this.delegate("eventTags"); }
  get eventTypeTags() { return this.delegate("eventTypeTags"); }
  get broadcasts() { return this.delegate("broadcasts"); }
  get broadcastOverlayStates() { return this.delegate("broadcastOverlayStates"); }
  get staffMembers() { return this.delegate("staffMembers"); }
  get invites() { return this.delegate("invites"); }

  async $executeRaw() { return 0; }

  async $transaction<T>(callback: (client: InMemoryClient) => Promise<T>): Promise<T> {
    const clonedState: Record<string, Store> = {};
    for (const [model, rows] of Object.entries(this.state)) {
      clonedState[model] = new Map(
        [...rows.entries()].map(([key, value]) => [key, cloneValue(value)]),
      );
    }
    const transaction = new InMemoryClient(clonedState);
    const result = await callback(transaction);
    this.state = transaction.state;
    return result;
  }
}
const seedPoolTeams = (
  client: InMemoryClient,
  eventRow: Row,
  teamRows: ReadonlyArray<readonly [string, string]>,
): void => {
  eventRow.teamIds = teamRows.map(([teamId]) => teamId);
  const teamStore = client.state.teams ?? (client.state.teams = new Map());
  for (const [teamId, divisionId] of teamRows) {
    teamStore.set(teamId, {
      id: teamId,
      captainId: `${teamId}_captain`,
      division: divisionId,
      name: teamId,
      playerIds: [],
    });
  }
};

const findPhaseId = (rows: Row[], phase: string): string =>
  String(
    rows.find(
      (row) => row.role === "PHASE" && row.phase === phase,
    )?.id ?? "",
  );

const findSourceEntryId = (rows: Row[], phaseDivisionId: string): string =>
  String(
    rows.find((row) => row.phaseDivisionId === phaseDivisionId)
      ?.entryDivisionId ?? "",
  );

const setMaxParticipants = (
  divisions: Array<{ maxParticipants: number | null }>,
  maxParticipants: number,
): void => {
  for (const division of divisions) {
    division.maxParticipants = maxParticipants;
  }
};


const leaguePayload = (eventId: string) => {
  const entryDivisionId = buildEventDivisionId(eventId, "open");
  return {
    id: eventId,
    name: "Phase-owned League",
    eventType: "LEAGUE",
    sportIds: [],
    hostId: "host-1",
    start: "2026-09-01T09:00:00.000Z",
    end: "2026-09-30T18:00:00.000Z",
    noFixedEndDateTime: false,
    timeZone: "UTC",
    state: "UNPUBLISHED",
    location: "Main Gym",
    address: "",
    coordinates: [0, 0],
    fields: [{ id: "field-1", name: "Court A", location: "Main Gym", divisions: [entryDivisionId] }],
    fieldIds: ["field-1"],
    timeSlots: [],
    timeSlotIds: [],
    divisions: [entryDivisionId],
    divisionDetails: [{
      id: entryDivisionId,
      key: "open",
      name: "Open",
      kind: "LEAGUE",
      maxParticipants: 4,
      fieldIds: ["field-1"],
      teamIds: [],
      gamesPerOpponent: 1,
      matchDurationMinutes: 60,
    }],
    playoffDivisionDetails: [],
    singleDivision: true,
    teamSignup: true,
    maxParticipants: 4,
    registrationPaymentMode: "ONLINE",
    price: 0,
    includePlayoffs: false,
    teams: [],
    userIds: [],
    teamIds: [],
    waitListIds: [],
    freeAgentIds: [],
    tags: [],
    requiredTemplateIds: [],
    eventOfficials: [],
    officialPositions: [],
    staffingPriority: "BEST_AVAILABLE_COVERAGE",
    assistantHostIds: [],
  };
};

describe("phase-owned Match Graph persistence", () => {
  it("hydrates persisted Entry and Phase Divisions before creating stable unplaced graph nodes", async () => {
    const client = new InMemoryClient();
    const eventId = "event-phase-owned-integration";
    let graphResult: CreateOnlyMatchGraphPersistenceResult | undefined;

    await client.$transaction(async (tx) => {
      await upsertEventFromPayload(leaguePayload(eventId), tx as any);
      graphResult = await persistCreateOnlyMatchGraph({
        tx: tx as any,
        eventId,
        includePlaceholderTeams: true,
      });
    });

    const entryDivisionId = buildEventDivisionId(eventId, "open");
    const phaseRows = [...(client.state.divisions ?? new Map()).values()]
      .filter((row) => row.role === "PHASE");
    const sourceRows = [...(client.state.eventDivisionPhaseSources ?? new Map()).values()];
    const matchRows = [...(client.state.matches ?? new Map()).values()];
    const participantRows = [
      ...(client.state.eventDivisionPhaseParticipants ?? new Map()).values(),
    ];

    expect(phaseRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: `${entryDivisionId}__phase__league`,
        role: "PHASE",
        phase: "LEAGUE",
        sourceDivisionId: entryDivisionId,
      }),
    ]));
    expect(sourceRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        entryDivisionId,
        phaseDivisionId: `${entryDivisionId}__phase__league`,
        phase: "LEAGUE",
      }),
    ]));
    expect(participantRows.length).toBeGreaterThan(0);
    expect(participantRows.every((row) => (
      row.phaseDivisionId === `${entryDivisionId}__phase__league`
    ))).toBe(true);
    expect(new Set(participantRows.map((row) => row.eventTeamId))).toEqual(
      new Set([...client.state.teams.values()].map((row) => row.id)),
    );
    expect(graphResult?.matches.length).toBeGreaterThan(0);
    expect(matchRows).toHaveLength(graphResult?.matches.length ?? 0);
    expect(matchRows.every((row) => (
      row.eventId === eventId
      && row.division === `${entryDivisionId}__phase__league`
      && row.placementState === "UNPLACED"
      && row.fieldId === null
      && row.start === null
      && row.end === null
    ))).toBe(true);
    expect(graphResult?.demand).toEqual(expect.objectContaining({
      placed: 0,
      unplaced: graphResult?.matches.length,
    }));
  });

  it("persists create-only Tournament bracket ownership without placement", async () => {
    const client = new InMemoryClient();
    const eventId = "event-phase-owned-tournament";
    let graphResult: CreateOnlyMatchGraphPersistenceResult | undefined;

    await client.$transaction(async (tx) => {
      await upsertEventFromPayload({
        ...leaguePayload(eventId),
        name: "Phase-owned Tournament",
        eventType: "TOURNAMENT",
        includePlayoffs: false,
      }, tx as any);
      graphResult = await persistCreateOnlyMatchGraph({
        tx: tx as any,
        eventId,
        includePlaceholderTeams: true,
      });
    });

    const entryDivisionId = buildEventDivisionId(eventId, "open");
    const phaseId = `${entryDivisionId}__phase__bracket`;
    expect([...client.state.divisions.values()]).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: phaseId,
        role: "PHASE",
        phase: "BRACKET",
        sourceDivisionId: entryDivisionId,
      }),
    ]));
    expect(graphResult?.matches.length).toBeGreaterThan(0);
    expect(graphResult?.demand.byPhase).toEqual(
      expect.objectContaining({ BRACKET: graphResult?.matches.length }),
    );
    expect([...client.state.matches.values()].every((row) => (
      row.division === phaseId
      && row.placementState === "UNPLACED"
      && row.fieldId === null
      && row.start === null
      && row.end === null
    ))).toBe(true);
    expect((client.state.eventRegistrations ?? new Map()).size).toBe(0);
  });
  it("loads persisted League Time Slot scope across regular-season and non-split playoff phases", async () => {
    const client = new InMemoryClient();
    const eventId = "event-persisted-league-phase-scope";
    const openEntryId = buildEventDivisionId(eventId, "open");
    const mastersEntryId = buildEventDivisionId(eventId, "masters");
    const openLeaguePhaseId = `${openEntryId}__phase__league`;
    const openPlayoffPhaseId = `${openEntryId}__phase__playoff`;
    const mastersLeaguePhaseId = `${mastersEntryId}__phase__league`;
    const mastersPlayoffPhaseId = `${mastersEntryId}__phase__playoff`;

    await client.$transaction(async (tx) => {
      await upsertEventFromPayload({
        ...leaguePayload(eventId),
        name: "Persisted League Phase Scope",
        start: "2026-08-22T09:00:00.000Z",
        end: "2027-08-22T23:59:00.000Z",
        singleDivision: false,
        includePlayoffs: true,
        splitLeaguePlayoffDivisions: false,
        playoffTeamCount: 8,
        maxParticipants: 16,
        divisions: [openEntryId, mastersEntryId],
        fieldIds: ["field-1"],
        fields: [{
          id: "field-1",
          name: "Court A",
          location: "Main Gym",
          divisions: [openEntryId, mastersEntryId],
        }],
        timeSlotIds: ["slot-weekend"],
        timeSlots: [{
          id: "slot-weekend",
          dayOfWeek: 5,
          daysOfWeek: [5, 6],
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 24 * 60,
          startDate: "2026-08-22T09:00:00.000Z",
          endDate: "2027-08-22T23:59:00.000Z",
          repeating: true,
          scheduledFieldId: "field-1",
          scheduledFieldIds: ["field-1"],
          divisions: [openEntryId, mastersEntryId],
          timeZone: "UTC",
        }],
        divisionDetails: [
          {
            id: openEntryId,
            key: "open",
            name: "Open",
            kind: "LEAGUE",
            maxParticipants: 8,
            playoffTeamCount: 8,
            fieldIds: ["field-1"],
            teamIds: [],
            gamesPerOpponent: 1,
            matchDurationMinutes: 60,
            restTimeMinutes: 24 * 60,
          },
          {
            id: mastersEntryId,
            key: "masters",
            name: "Masters",
            kind: "LEAGUE",
            maxParticipants: 8,
            playoffTeamCount: 8,
            fieldIds: ["field-1"],
            teamIds: [],
            gamesPerOpponent: 1,
            matchDurationMinutes: 60,
            restTimeMinutes: 24 * 60,
          },
        ],
        playoffDivisionDetails: [],
      }, tx as unknown as Parameters<typeof upsertEventFromPayload>[1]);
    });
    await client.timeSlots.update({
      where: { id: "slot-weekend" },
      data: { divisions: [openLeaguePhaseId, mastersLeaguePhaseId] },
    });

    const loaded = await loadEventWithRelations(
      eventId,
      client as unknown as Parameters<typeof loadEventWithRelations>[1],
    );
    const loadedSlot = loaded.timeSlots.find((slot) => slot.id === "slot-weekend");
    expect(new Set(loadedSlot?.divisions.map((division) => division.id))).toEqual(
      new Set([
        openLeaguePhaseId,
        openPlayoffPhaseId,
        mastersLeaguePhaseId,
        mastersPlayoffPhaseId,
      ]),
    );

    const scheduled = scheduleEvent(
      { event: loaded, includePlaceholderTeams: true },
      { log: () => {}, error: () => {} },
    );
    expect(scheduled.matches).toHaveLength(70);
    expect(new Set(scheduled.matches.map((match) => match.start.getUTCDay()))).toEqual(
      new Set([0, 6]),
    );
    expect(scheduled.matches.every((match) => (
      match.field?.id === "field-1"
      && match.start.getTime() < match.end.getTime()
    ))).toBe(true);
  });

  it("keeps split League Time Slot scope within each mapped Entry Division", async () => {
    const client = new InMemoryClient();
    const eventId = "event-persisted-split-league-scope";
    const openEntryId = buildEventDivisionId(eventId, "open");
    const mastersEntryId = buildEventDivisionId(eventId, "masters");
    const openLeaguePhaseId = `${openEntryId}__phase__league`;
    const mastersLeaguePhaseId = `${mastersEntryId}__phase__league`;
    const openPlayoffPhaseId = buildEventDivisionId(eventId, "open_playoff");
    const mastersPlayoffPhaseId = buildEventDivisionId(eventId, "masters_playoff");

    await client.$transaction(async (tx) => {
      await upsertEventFromPayload({
        ...leaguePayload(eventId),
        name: "Persisted Split League Scope",
        singleDivision: false,
        includePlayoffs: true,
        splitLeaguePlayoffDivisions: true,
        maxParticipants: 8,
        divisions: [openEntryId, mastersEntryId],
        fieldIds: ["field-1"],
        fields: [{
          id: "field-1",
          name: "Court A",
          location: "Main Gym",
          divisions: [openEntryId, mastersEntryId],
        }],
        timeSlotIds: ["slot-split-league"],
        timeSlots: [{
          id: "slot-split-league",
          dayOfWeek: 1,
          daysOfWeek: [1],
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 20 * 60,
          startDate: "2026-09-01T09:00:00.000Z",
          endDate: "2026-09-01T20:00:00.000Z",
          repeating: false,
          scheduledFieldId: "field-1",
          scheduledFieldIds: ["field-1"],
          divisions: [openEntryId],
          timeZone: "UTC",
        }],
        divisionDetails: [
          {
            id: openEntryId,
            key: "open",
            name: "Open",
            kind: "LEAGUE",
            maxParticipants: 4,
            playoffTeamCount: 3,
            playoffPlacementDivisionIds: [openPlayoffPhaseId, openPlayoffPhaseId, openPlayoffPhaseId],
            fieldIds: ["field-1"],
            teamIds: [],
            gamesPerOpponent: 1,
            matchDurationMinutes: 60,
          },
          {
            id: mastersEntryId,
            key: "masters",
            name: "Masters",
            kind: "LEAGUE",
            maxParticipants: 4,
            playoffTeamCount: 3,
            playoffPlacementDivisionIds: [mastersPlayoffPhaseId, mastersPlayoffPhaseId, mastersPlayoffPhaseId],
            fieldIds: ["field-1"],
            teamIds: [],
            gamesPerOpponent: 1,
            matchDurationMinutes: 60,
          },
        ],
        playoffDivisionDetails: [
          {
            id: openPlayoffPhaseId,
            sourceDivisionId: openEntryId,
            key: "open_playoff",
            name: "Open Playoff",
            kind: "PLAYOFF",
            maxParticipants: 3,
            playoffTeamCount: 3,
            fieldIds: ["field-1"],
            playoffConfig: {
              fieldCount: 1,
              matchDurationMinutes: 60,
              restTimeMinutes: 0,
            },
          },
          {
            id: mastersPlayoffPhaseId,
            sourceDivisionId: mastersEntryId,
            key: "masters_playoff",
            name: "Masters Playoff",
            kind: "PLAYOFF",
            maxParticipants: 3,
            playoffTeamCount: 3,
            fieldIds: ["field-1"],
            playoffConfig: {
              fieldCount: 1,
              matchDurationMinutes: 60,
              restTimeMinutes: 0,
            },
          },
        ],
      }, tx as unknown as Parameters<typeof upsertEventFromPayload>[1]);
    });

    const loadWithSlotScope = async (divisionIds: string[]) => {
      await client.timeSlots.update({
        where: { id: "slot-split-league" },
        data: { divisions: divisionIds },
      });
      return loadEventWithRelations(
        eventId,
        client as unknown as Parameters<typeof loadEventWithRelations>[1],
      );
    };

    const leagueScoped = await loadWithSlotScope([openLeaguePhaseId]);
    expect(new Set(
      leagueScoped.timeSlots
        .find((slot) => slot.id === "slot-split-league")
        ?.divisions.map((division) => division.id) ?? [],
    )).toEqual(new Set([openLeaguePhaseId, openPlayoffPhaseId]));

    const playoffScoped = await loadWithSlotScope([openPlayoffPhaseId]);
    expect(new Set(
      playoffScoped.timeSlots
        .find((slot) => slot.id === "slot-split-league")
        ?.divisions.map((division) => division.id) ?? [],
    )).toEqual(new Set([openLeaguePhaseId, openPlayoffPhaseId]));
    expect(
      playoffScoped.timeSlots
        .find((slot) => slot.id === "slot-split-league")
        ?.divisions.some((division) => (
          division.id === mastersLeaguePhaseId
          || division.id === mastersPlayoffPhaseId
        )),
    ).toBe(false);
  });

  it("maps persisted Tournament Pool Time Slot scope across Entry, Pool, and Bracket phases before scheduling", async () => {
    const client = new InMemoryClient();
    const eventId = "event-persisted-multi-pool-scope";
    const entryDivisionId = buildEventDivisionId(eventId, "open");
    const bracketDivisionId = entryDivisionId;

    await client.$transaction(async (tx) => {
      await upsertEventFromPayload({
        ...leaguePayload(eventId),
        name: "Persisted Multi-Pool Tournament",
        eventType: "TOURNAMENT",
        includePlayoffs: true,
        singleDivision: true,
        divisions: [entryDivisionId],
        fieldIds: ["field-1"],
        fields: [{
          id: "field-1",
          name: "Court A",
          location: "Main Gym",
          divisions: [entryDivisionId],
        }],
        timeSlotIds: ["slot-bracket"],
        timeSlots: [{
          id: "slot-bracket",
          dayOfWeek: 1,
          daysOfWeek: [1],
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 20 * 60,
          startDate: "2026-09-01T09:00:00.000Z",
          endDate: "2026-09-01T20:00:00.000Z",
          repeating: false,
          scheduledFieldId: "field-1",
          scheduledFieldIds: ["field-1"],
          divisions: [entryDivisionId],
          timeZone: "UTC",
        }],
        divisionDetails: [{
          id: entryDivisionId,
          key: "open",
          name: "Open",
          kind: "LEAGUE",
          divisionTypeId: "skill_open_age_18plus",
          divisionTypeName: "Open",
          ratingType: "SKILL",
          gender: "M",
          maxParticipants: 16,
          playoffTeamCount: 8,
          poolCount: 2,
          fieldIds: ["field-1"],
          playoffPlacementDivisionIds: [bracketDivisionId],
          gamesPerOpponent: 1,
          matchDurationMinutes: 60,
        }],
        playoffDivisionDetails: [{
          id: bracketDivisionId,
          key: "open_playoff",
          name: "Open Bracket",
          kind: "PLAYOFF",
          divisionTypeId: "skill_open_age_18plus",
          divisionTypeName: "Open",
          ratingType: "SKILL",
          gender: "M",
          maxParticipants: 16,
          playoffTeamCount: 8,
          poolCount: 2,
          fieldIds: ["field-1"],
          playoffConfig: {
            fieldCount: 1,
            matchDurationMinutes: 60,
            restTimeMinutes: 0,
          },
        }],
      }, tx as unknown as Parameters<typeof upsertEventFromPayload>[1]);
    });

    const eventRow = requireValue(
      client.state.events.get(eventId),
      `persisted event ${eventId}`,
    );
    const poolPhaseIds = [...client.state.divisions.values()]
      .filter((row) => row.role === "PHASE" && row.phase === "POOL")
      .sort((left, right) => Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0))
      .map((row) => String(row.id));
    expect(poolPhaseIds).toHaveLength(2);
    const teamRows = [
      ["team_pool_a_1", poolPhaseIds[0]],
      ["team_pool_a_2", poolPhaseIds[0]],
      ["team_pool_b_1", poolPhaseIds[1]],
      ["team_pool_b_2", poolPhaseIds[1]],
    ] as const;
    seedPoolTeams(client, eventRow, teamRows);

    const sourceRows = [...client.state.eventDivisionPhaseSources.values()];
    const bracketPhaseId = findPhaseId(
      [...client.state.divisions.values()],
      "BRACKET",
    );
    const firstPoolEntryId = findSourceEntryId(sourceRows, poolPhaseIds[0]);
    expect(bracketPhaseId).not.toBe("");
    expect(firstPoolEntryId).not.toBe("");

    const loadWithSlotScope = async (divisionIds: string[]) => {
      await client.timeSlots.update({
        where: { id: "slot-bracket" },
        data: { divisions: divisionIds },
      });
      return loadEventWithRelations(
        eventId,
        client as unknown as Parameters<typeof loadEventWithRelations>[1],
      );
    };

    const entryScoped = await loadWithSlotScope([firstPoolEntryId]);
    expect(new Set(
      entryScoped.timeSlots
        .find((slot) => slot.id === "slot-bracket")
        ?.divisions.map((division) => division.id) ?? [],
    )).toEqual(new Set([poolPhaseIds[0], bracketPhaseId]));

    const poolScoped = await loadWithSlotScope([poolPhaseIds[0]]);
    expect(new Set(
      poolScoped.timeSlots
        .find((slot) => slot.id === "slot-bracket")
        ?.divisions.map((division) => division.id) ?? [],
    )).toEqual(new Set([poolPhaseIds[0], bracketPhaseId]));

    const bracketScoped = await loadWithSlotScope([bracketPhaseId]);
    expect(new Set(
      bracketScoped.timeSlots
        .find((slot) => slot.id === "slot-bracket")
        ?.divisions.map((division) => division.id) ?? [],
    )).toEqual(new Set([...poolPhaseIds, bracketPhaseId]));

    const scheduled = scheduleEvent(
      { event: bracketScoped, includePlaceholderTeams: false },
      { log: () => {}, error: () => {} },
    );
    const poolMatches = scheduled.matches.filter((match) => match.division.phase === "POOL");
    expect(new Set(poolMatches.map((match) => match.division.id))).toEqual(
      new Set(poolPhaseIds),
    );
    expect(poolMatches.every((match) => match.field?.id === "field-1")).toBe(true);
    const bracketMatches = scheduled.matches.filter(
      (match) => match.division.phase === "BRACKET",
    );
    expect(bracketMatches).toHaveLength(3);
    expect(new Set(bracketMatches.map((match) => match.division.id))).toEqual(
      new Set([bracketPhaseId]),
    );
    expect(bracketMatches.every((match) => match.field?.id === "field-1")).toBe(true);

    const firstDemand = matchDemandFromGraph(scheduled.matches);
    const firstRealTeamIds = collectNonPlaceholderTeamIds(
      scheduled.event.teams,
    );
    const firstBracketSeedIds = collectBracketPlaceholderTeamIds(
      scheduled.event.teams,
    );
    expect(firstBracketSeedIds).toHaveLength(4);

    await persistScheduledRosterTeams(
      {
        eventId,
        scheduled: scheduled.event,
      },
      client as unknown as Parameters<typeof persistScheduledRosterTeams>[1],
    );
    await saveMatches(
      eventId,
      scheduled.matches,
      client as unknown as Parameters<typeof saveMatches>[2],
    );
    const persistedMatchIds = [...client.state.matches.keys()].sort();

    const rehydrated = await loadEventWithRelations(
      eventId,
      client as unknown as Parameters<typeof loadEventWithRelations>[1],
    );
    expect(Object.keys(rehydrated.matches).sort()).toEqual(persistedMatchIds);
    const rehydratedBracketDivision = requireValue(
      rehydrated.playoffDivisions.find((division) =>
        isBracketPhase(division.phase ?? division.kind),
      ),
      "rehydrated bracket division",
    );
    const rehydratedBracketSeedIds = [...rehydratedBracketDivision.teamIds].sort();
    expect(rehydratedBracketSeedIds).toEqual(firstBracketSeedIds);
    const rehydratedBracketSeeds = requireTeams(
      rehydrated.teams,
      rehydratedBracketSeedIds,
    );
    expect(rehydratedBracketSeeds.every(isPlaceholderTeam)).toBe(true);
    expect(
      rehydratedBracketSeeds.every((team) =>
        team.division?.id !== rehydratedBracketDivision.id,
      ),
    ).toBe(true);
    expect(collectPlaceholderTeamIds(rehydrated.teams)).toEqual(
      firstBracketSeedIds,
    );

    rehydrated.maxParticipants = 4;
    setMaxParticipants(rehydrated.divisions, 2);
    setMaxParticipants(rehydrated.playoffDivisions, 4);
    const rebuilt = scheduleEvent(
      { event: rehydrated, includePlaceholderTeams: true },
      { log: () => {}, error: () => {} },
    );
    expect(matchDemandFromGraph(rebuilt.matches)).toEqual(firstDemand);
    expect(collectNonPlaceholderTeamIds(rebuilt.event.teams)).toEqual(
      firstRealTeamIds,
    );
    const rebuiltBracketSeedIds = collectBracketPlaceholderTeamIds(
      rebuilt.event.teams,
    );
    expect(rebuiltBracketSeedIds).toEqual(firstBracketSeedIds);
    expect(collectPlaceholderTeamIds(rebuilt.event.teams)).toEqual(
      firstBracketSeedIds,
    );
    const rebuiltPoolParticipantIds = rebuilt.matches
      .filter((match) => match.division.phase === "POOL")
      .flatMap((match) => [match.team1?.id, match.team2?.id])
      .filter((teamId): teamId is string => Boolean(teamId));
    expect(rebuiltPoolParticipantIds.some((teamId) => (
      firstBracketSeedIds.includes(teamId)
    ))).toBe(false);
    expect(
      Object.values(rebuilt.event.teams).filter((team) => (
        String(team.kind ?? "").trim().toUpperCase() === "PLACEHOLDER"
        && ["BRACKET", "PLAYOFF"].includes(
          String(team.division.phase ?? "").trim().toUpperCase(),
        )
      )),
    ).toHaveLength(firstBracketSeedIds.length);
  });
});
