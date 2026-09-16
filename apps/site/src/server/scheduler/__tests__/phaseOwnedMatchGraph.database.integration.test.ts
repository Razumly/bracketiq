/** @jest-environment node */

import { prisma } from "@/lib/prisma";
import { upsertEventFromPayload } from "@/server/repositories/events";
import { persistCreateOnlyMatchGraph } from "@/server/scheduler/eventScheduleMutation";

const isDatabaseIntegrationEnabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const describeDatabase = isDatabaseIntegrationEnabled ? describe : describe.skip;

type DatabaseClient = typeof prisma;

const eventPayload = (eventId: string) => ({
  id: eventId,
  name: "Database Phase Graph",
  eventType: "LEAGUE",
  sportIds: [],
  hostId: "",
  start: "2026-09-01T09:00:00.000Z",
  end: "2026-09-30T18:00:00.000Z",
  noFixedEndDateTime: false,
  timeZone: "UTC",
  state: "UNPUBLISHED",
  location: "Main Gym",
  address: "",
  coordinates: [0, 0],
  fields: [
    {
      id: `${eventId}-field`,
      name: "Court A",
      location: "Main Gym",
      divisions: [`${eventId}__division__open`],
    },
  ],
  fieldIds: [`${eventId}-field`],
  timeSlots: [],
  timeSlotIds: [],
  divisions: [`${eventId}__division__open`],
  divisionDetails: [
    {
      id: `${eventId}__division__open`,
      key: "open",
      name: "Open",
      kind: "LEAGUE",
      maxParticipants: 4,
      fieldIds: [`${eventId}-field`],
      teamIds: [],
      gamesPerOpponent: 1,
      matchDurationMinutes: 60,
    },
  ],
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
});

const removeEventRows = async (client: DatabaseClient, eventId: string) => {
  await client.matchSegments.deleteMany({ where: { eventId } });
  await client.matchIncidents.deleteMany({ where: { eventId } });
  await client.eventDivisionPhaseParticipants.deleteMany({ where: { eventId } });
  await client.eventDivisionPhaseSources.deleteMany({ where: { eventId } });
  await client.matches.deleteMany({ where: { eventId } });
  await client.teams.deleteMany({ where: { eventId } });
  await client.divisions.deleteMany({ where: { eventId } });
  await client.fields.deleteMany({ where: { id: `${eventId}-field` } });
  await client.events.deleteMany({ where: { id: eventId } });
};

describeDatabase("phase-owned Match Graph database persistence", () => {
  const eventIds: string[] = [];

  afterEach(async () => {
    for (const eventId of eventIds.splice(0)) {
      await removeEventRows(prisma, eventId);
    }
  });

  it("commits the Event, phase graph, and demand without placement", async () => {
    const eventId = `database-phase-graph-${Date.now()}-commit`;
    eventIds.push(eventId);

    const result = await prisma.$transaction(async (tx) => {
      await upsertEventFromPayload(eventPayload(eventId), tx);
      return persistCreateOnlyMatchGraph({
        tx,
        eventId,
        includePlaceholderTeams: true,
      });
    });

    const [event, divisions, phaseParticipants, matches, registrations] = await Promise.all([
      prisma.events.findUnique({ where: { id: eventId } }),
      prisma.divisions.findMany({ where: { eventId } }),
      prisma.eventDivisionPhaseParticipants.findMany({ where: { eventId } }),
      prisma.matches.findMany({ where: { eventId } }),
      prisma.eventRegistrations.count({ where: { eventId } }),
    ]);

    expect(event).not.toBeNull();
    expect(divisions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: "PHASE",
        phase: "LEAGUE",
        sourceDivisionId: `${eventId}__division__open`,
      }),
    ]));
    expect(phaseParticipants.length).toBeGreaterThan(0);
    expect(matches).toHaveLength(result.matches.length);
    expect(matches.every((match) => (
      match.placementState === "UNPLACED"
      && match.fieldId === null
      && match.start === null
      && match.end === null
    ))).toBe(true);
    expect(registrations).toBe(0);
    expect(result.demand).toEqual({
      total: matches.length,
      byDivision: {
        [`${eventId}__division__open__phase__league`]: matches.length,
      },
      byPhase: { LEAGUE: matches.length },
      placed: 0,
      unplaced: matches.length,
    });
  });

  it("rolls back the Event, phase rows, graph, and placeholders as one unit", async () => {
    const eventId = `database-phase-graph-${Date.now()}-rollback`;
    eventIds.push(eventId);

    await expect(prisma.$transaction(async (tx) => {
      await upsertEventFromPayload(eventPayload(eventId), tx);
      await persistCreateOnlyMatchGraph({
        tx,
        eventId,
        includePlaceholderTeams: true,
      });
      throw new Error("rollback graph transaction");
    })).rejects.toThrow("rollback graph transaction");

    const [event, divisions, phaseParticipants, matches, teams] = await Promise.all([
      prisma.events.findUnique({ where: { id: eventId } }),
      prisma.divisions.findMany({ where: { eventId } }),
      prisma.eventDivisionPhaseParticipants.findMany({ where: { eventId } }),
      prisma.matches.findMany({ where: { eventId } }),
      prisma.teams.findMany({ where: { eventId } }),
    ]);

    expect(event).toBeNull();
    expect(divisions).toHaveLength(0);
    expect(phaseParticipants).toHaveLength(0);
    expect(matches).toHaveLength(0);
    expect(teams).toHaveLength(0);
  });
});
