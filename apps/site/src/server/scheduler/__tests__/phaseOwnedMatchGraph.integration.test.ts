/** @jest-environment node */

import { buildEventDivisionId } from "@/lib/divisionTypes";
import { loadEventWithRelations, upsertEventFromPayload } from "@/server/repositories/events";
import { scheduleEvent } from "@/server/scheduler/scheduleEvent";
import {
  persistCreateOnlyMatchGraph,
  type CreateOnlyMatchGraphPersistenceResult,
} from "@/server/scheduler/eventScheduleMutation";
type Row = Record<string, any>;
type Store = Map<string, Row>;

const cloneValue = <T>(value: T): T => structuredClone(value);

const valueMatches = (value: unknown, condition: unknown): boolean => {
  if (condition && typeof condition === "object" && !Array.isArray(condition)) {
    const operators = condition as Record<string, unknown>;
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
    if ("lt" in operators && !(value as any < operators.lt)) return false;
    if ("lte" in operators && !(value as any <= operators.lte)) return false;
    if ("gt" in operators && !(value as any > operators.gt)) return false;
    if ("gte" in operators && !(value as any >= operators.gte)) return false;
    return true;
  }
  return value === condition;
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
    officialSchedulingMode: "OFF",
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
  it("loads a persisted multi-Pool Tournament scope before scheduling", async () => {
    const client = new InMemoryClient();
    const eventId = "event-persisted-multi-pool-scope";
    const entryDivisionId = buildEventDivisionId(eventId, "open");
    const bracketDivisionId = entryDivisionId;
    const bracketPhaseId = `${bracketDivisionId}__phase__bracket`;

    await client.$transaction(async (tx) => {
      await upsertEventFromPayload({
        ...leaguePayload(eventId),
        name: "Persisted Multi-Pool Tournament",
        eventType: "TOURNAMENT",
        includePlayoffs: true,
        singleDivision: false,
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
          divisions: [bracketPhaseId],
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

    const eventRow = client.state.events.get(eventId);
    if (!eventRow) throw new Error(`Missing persisted event ${eventId}`);
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

    const loaded = await loadEventWithRelations(
      eventId,
      client as unknown as Parameters<typeof loadEventWithRelations>[1],
    );
    const loadedSlot = loaded.timeSlots.find((slot) => slot.id === "slot-bracket");
    expect(loadedSlot?.divisions.map((division) => division.id)).toEqual(
      expect.arrayContaining(poolPhaseIds),
    );

    const scheduled = scheduleEvent(
      { event: loaded, includePlaceholderTeams: false },
      { log: () => {}, error: () => {} },
    );
    const poolMatches = scheduled.matches.filter((match) => match.division.phase === "POOL");
    expect(new Set(poolMatches.map((match) => match.division.id))).toEqual(
      new Set(poolPhaseIds),
    );
    expect(poolMatches.every((match) => match.field?.id === "field-1")).toBe(true);
  });
});
