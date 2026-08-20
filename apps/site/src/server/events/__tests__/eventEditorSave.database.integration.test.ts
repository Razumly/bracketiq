/** @jest-environment node */

import { randomUUID } from "crypto";
import { NextRequest } from "next/server";

const requireSessionMock = jest.fn();

jest.mock("@/lib/permissions", () => ({
  requireSession: (...args: unknown[]) => requireSessionMock(...args),
}));

import { prisma } from "@/lib/prisma";
import { buildEventDivisionId } from "@/lib/divisionTypes";
import { loadEventEditorSnapshot } from "@/server/events/eventEditorSnapshot";
import { saveEventEditor } from "@/server/events/eventEditorSave";
import { upsertEventFromPayload } from "@/server/repositories/events";
import { persistCreateOnlyMatchGraph } from "@/server/scheduler/eventScheduleMutation";
import { POST as scheduleEventPost } from "@/app/api/events/[eventId]/schedule/route";

type Issue95FixtureOptions = {
  includePlayoffs?: boolean;
  includeRecurringTimeSlot?: boolean;
  reusableGraph?: boolean;
  selectedMatch?: boolean;
};

type Issue95Fixture = {
  eventId: string;
  fieldId: string;
  timeSlotId: string | null;
  selectedMatchId: string | null;
  reusableMatchIds: string[];
};

type MatchRow = {
  id: string;
  eventId: string;
  matchId: number;
  start: Date | null;
  end: Date | null;
  locked: boolean;
  placementState: string;
  division: string | null;
  side: string | null;
  fieldId: string | null;
  losersBracket: boolean | null;
  team1Id: string | null;
  team2Id: string | null;
  team1Seed: number | null;
  team2Seed: number | null;
  winnerNextMatchId: string | null;
  loserNextMatchId: string | null;
  previousLeftId: string | null;
  previousRightId: string | null;
  team1Points: number[];
  team2Points: number[];
  status: string | null;
  resultStatus: string | null;
  resultType: string | null;
  actualStart: Date | null;
  actualEnd: Date | null;
  statusReason: string | null;
  winnerEventTeamId: string | null;
  matchRulesSnapshot: unknown;
  officialCheckedIn: boolean | null;
  officialId: string | null;
  officialIds: unknown;
  teamOfficialId: string | null;
};

const isDatabaseIntegrationEnabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const describeDatabase = isDatabaseIntegrationEnabled ? describe : describe.skip;

const ISSUE95_HOST_ID = "issue-95-host";
const ISSUE95_START = "2026-01-05T08:00:00.000Z";
const ISSUE95_STALE_END = "2026-01-04T22:00:00.000Z";
const ISSUE95_SLOT_START = "2026-01-05T09:00:00.000Z";
const ISSUE95_SLOT_START_MINUTES = 9 * 60;
const ISSUE95_SLOT_END_MINUTES = 12 * 60;

const issue95EventIds: string[] = [];

const cleanupIssue95Fixture = async (eventId: string): Promise<void> => {

  await prisma.matchOperationReceipts.deleteMany({ where: { eventId } });
  await prisma.teamCheckIns.deleteMany({ where: { eventId } });
  await prisma.matchRosterEntries.deleteMany({ where: { eventId } });
  await prisma.matchSegments.deleteMany({ where: { eventId } });
  await prisma.matchIncidents.deleteMany({ where: { eventId } });
  await prisma.broadcastOverlayActions.deleteMany({ where: { eventId } });
  await prisma.eventTagAssignments.deleteMany({ where: { eventId } });
  await prisma.eventRegistrations.deleteMany({ where: { eventId } });
  await prisma.eventOfficials.deleteMany({ where: { eventId } });
  await prisma.invites.deleteMany({ where: { eventId } });
  await prisma.registrationQuestions.deleteMany({
    where: { scopeType: "EVENT", scopeId: eventId },
  });
  await prisma.eventDivisionPhaseParticipants.deleteMany({ where: { eventId } });
  await prisma.eventDivisionPhaseSources.deleteMany({ where: { eventId } });
  await prisma.matches.deleteMany({ where: { eventId } });
  await prisma.teams.deleteMany({ where: { eventId } });
  await prisma.divisions.deleteMany({ where: { eventId } });
  await prisma.fields.deleteMany({
    where: { id: `${eventId}:field` },
  });
  await prisma.timeSlots.deleteMany({
    where: { id: `${eventId}:slot` },
  });
  await prisma.events.deleteMany({ where: { id: eventId } });

};

const createIssue95Fixture = async (
  label: string,
  options: Issue95FixtureOptions = {},
): Promise<Issue95Fixture> => {
  const eventId = `issue-95-${label}-${randomUUID()}`;
  const fieldId = `${eventId}:field`;
  const timeSlotId = options.includeRecurringTimeSlot ? `${eventId}:slot` : null;
  const entryDivisionId = buildEventDivisionId(eventId, "open");
  const includePlayoffs = options.includePlayoffs === true;
  const timeSlots = timeSlotId
    ? [{
        id: timeSlotId,
        dayOfWeek: 1,
        daysOfWeek: [1],
        startTimeMinutes: ISSUE95_SLOT_START_MINUTES,
        endTimeMinutes: ISSUE95_SLOT_END_MINUTES,
        startDate: ISSUE95_SLOT_START,
        endDate: null,
        timeZone: "UTC",
        repeating: true,
        scheduledFieldId: fieldId,
        scheduledFieldIds: [fieldId],
        divisions: [entryDivisionId],
      }]
    : [];
  const divisionDetails = [{
    id: entryDivisionId,
    key: "open",
    name: "Open",
    kind: "LEAGUE",
    maxParticipants: 4,
    playoffTeamCount: includePlayoffs ? 3 : null,
    fieldIds: [fieldId],
    teamIds: [],
    gamesPerOpponent: 1,
    matchDurationMinutes: 60,
    restTimeMinutes: 0,
    pointsToVictory: [21],
  }];
  const payload = {
    id: eventId,
    name: `Issue 95 ${label}`,
    eventType: "LEAGUE",
    sportIds: [],
    hostId: ISSUE95_HOST_ID,
    start: ISSUE95_START,
    end: ISSUE95_STALE_END,
    scheduleEndConstraint: null,
    generatedScheduleEnd: ISSUE95_STALE_END,
    noFixedEndDateTime: true,
    timeZone: "UTC",
    state: "UNPUBLISHED",
    location: "Issue 95 Gym",
    address: "1 Issue 95 Lane",
    coordinates: [0, 0],
    fields: [{
      id: fieldId,
      name: "Issue 95 Court",
      location: "Issue 95 Gym",
      divisions: [entryDivisionId],
    }],
    fieldIds: [fieldId],
    timeSlots,
    timeSlotIds: timeSlotId ? [timeSlotId] : [],
    divisions: [entryDivisionId],
    divisionDetails,
    playoffDivisionDetails: [],
    divisionFieldIds: { [entryDivisionId]: [fieldId] },
    singleDivision: true,
    splitLeaguePlayoffDivisions: false,
    teamSignup: true,
    teamSizeLimit: 2,
    maxParticipants: 4,
    registrationPaymentMode: "ONLINE",
    price: 0,
    includePlayoffs,
    doubleElimination: false,
    winnerSetCount: 1,
    loserSetCount: 1,
    pointsToVictory: [21],
    winnerBracketPointsToVictory: [],
    loserBracketPointsToVictory: [],
    usesSets: false,
    setsPerMatch: null,
    setDurationMinutes: null,
    restTimeMinutes: 0,
    matchDurationMinutes: 60,
    gamesPerOpponent: 1,
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

  issue95EventIds.push(eventId);
  let selectedMatchId: string | null = null;
  let reusableMatchIds: string[] = [];
  await prisma.$transaction(async (tx) => {
    await upsertEventFromPayload(payload, tx);
    if (!options.reusableGraph && !options.selectedMatch) return;

    const graph = await persistCreateOnlyMatchGraph({
      tx,
      eventId,
      includePlaceholderTeams: true,
    });
    reusableMatchIds = graph.matches.map((match) => match.id).sort();
    if (!options.selectedMatch) return;

    selectedMatchId = graph.matches[0]?.id ?? null;
    if (!selectedMatchId) {
      throw new Error("Issue-95 fixture graph has no selected Match.");
    }
    await tx.matches.update({
      where: { id: selectedMatchId },
      data: {
        team1Points: [21, 18],
        team2Points: [17, 15],
        status: "COMPLETED",
        resultStatus: "FINAL",
        resultType: "WIN",
        statusReason: "Issue-95 stored result",
        locked: true,
        officialCheckedIn: true,
        teamOfficialId: `${eventId}:team-official`,
      },
    });
  });

  return {
    eventId,
    fieldId,
    timeSlotId,
    selectedMatchId,
    reusableMatchIds,
  };
};

const canonicalMatchFields = (match: MatchRow) => ({
  identity: {
    id: match.id,
    eventId: match.eventId,
    matchId: match.matchId,
    division: match.division,
    side: match.side,
    losersBracket: match.losersBracket,
    team1Id: match.team1Id,
    team2Id: match.team2Id,
    team1Seed: match.team1Seed,
    team2Seed: match.team2Seed,
    winnerNextMatchId: match.winnerNextMatchId,
    loserNextMatchId: match.loserNextMatchId,
    previousLeftId: match.previousLeftId,
    previousRightId: match.previousRightId,
  },
  placement: {
    placementState: match.placementState,
    start: match.start?.toISOString() ?? null,
    end: match.end?.toISOString() ?? null,
    fieldId: match.fieldId,
  },
  result: {
    team1Points: match.team1Points,
    team2Points: match.team2Points,
    status: match.status,
    resultStatus: match.resultStatus,
    resultType: match.resultType,
    actualStart: match.actualStart?.toISOString() ?? null,
    actualEnd: match.actualEnd?.toISOString() ?? null,
    statusReason: match.statusReason,
    winnerEventTeamId: match.winnerEventTeamId,
    matchRulesSnapshot: match.matchRulesSnapshot,
  },
  lock: match.locked,
  official: {
    officialCheckedIn: match.officialCheckedIn,
    officialId: match.officialId,
    officialIds: match.officialIds,
    teamOfficialId: match.teamOfficialId,
  },
});


const scheduleEventThroughRoute = async (
  fixture: Issue95Fixture,
  replaceExistingMatches: boolean,
) => {
  const response = await scheduleEventPost(
    new NextRequest(`http://localhost/api/events/${fixture.eventId}/schedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        includePlaceholderTeams: true,
        replaceExistingMatches,
      }),
    }),
    { params: Promise.resolve({ eventId: fixture.eventId }) },
  );
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.error).toBeUndefined();
  expect(Array.isArray(body.matches)).toBe(true);
  return body as { matches: Array<{ id: string }> };
};

const expectCanonicalMatchBounds = (
  matches: Array<{
    start: Date | null;
    end: Date | null;
    placementState: string;
    fieldId: string | null;
  }>,
  eventStart: Date,
  eventEnd: Date,
  fieldId: string,
): void => {
  expect(matches.length).toBeGreaterThan(0);
  expect(matches.every((match) => (
    match.placementState === "PLACED"
      && match.fieldId === fieldId
      && match.start instanceof Date
      && match.end instanceof Date
      && match.start.getTime() >= eventStart.getTime()
      && match.end.getTime() > match.start.getTime()
      && match.end.getTime() <= eventEnd.getTime()
  ))).toBe(true);
};

describeDatabase("Issue 95 Event Editor and schedule persistence", () => {
  afterEach(async () => {
    const eventIds = issue95EventIds.splice(0);
    for (const eventId of eventIds) {
      await cleanupIssue95Fixture(eventId);
    }
    requireSessionMock.mockReset();
  });

  it("preserves a reusable Match Graph during a same-type PRESERVE Save", async () => {
    const fixture = await createIssue95Fixture("save", {
      includePlayoffs: true,
      reusableGraph: true,
      selectedMatch: true,
    });
    if (!fixture.selectedMatchId) {
      throw new Error("Issue-95 fixture has no selected Match.");
    }
    const initialEvent = await prisma.events.findUnique({
      where: { id: fixture.eventId },
      select: {
        start: true,
        end: true,
        generatedScheduleEnd: true,
        noFixedEndDateTime: true,
      },
    });
    expect(initialEvent?.noFixedEndDateTime).toBe(true);
    expect(initialEvent?.end?.getTime()).toBeLessThan(
      initialEvent?.start?.getTime() ?? Number.POSITIVE_INFINITY,
    );
    expect(initialEvent?.generatedScheduleEnd?.getTime()).toBeLessThan(
      initialEvent?.start?.getTime() ?? Number.POSITIVE_INFINITY,
    );

    const before = await prisma.matches.findMany({
      where: { eventId: fixture.eventId },
      orderBy: [{ matchId: "asc" }, { id: "asc" }],
    }) as MatchRow[];
    const selectedBefore = before.find((match) => match.id === fixture.selectedMatchId);
    expect(selectedBefore).not.toBeUndefined();
    expect(selectedBefore?.placementState).toBe("UNPLACED");
    expect(selectedBefore?.start).toBeNull();
    expect(selectedBefore?.end).toBeNull();
    expect(selectedBefore?.fieldId).toBeNull();
    expect(selectedBefore?.locked).toBe(true);
    expect(selectedBefore?.team1Points).toEqual([21, 18]);
    expect(selectedBefore?.team2Points).toEqual([17, 15]);
    expect(selectedBefore?.teamOfficialId).toBe(`${fixture.eventId}:team-official`);

    const actor = { userId: ISSUE95_HOST_ID, isAdmin: false };
    const snapshot = await loadEventEditorSnapshot(fixture.eventId, { actor });
    expect(snapshot.draft.basics.eventType).toBe("LEAGUE");
    expect(snapshot.draft.competition.playoffTeamCount).toBe(3);

    const draft = {
      ...snapshot.draft,
      competition: {
        ...snapshot.draft.competition,
        playoffTeamCount: 4,
        divisionDetails: snapshot.draft.competition.divisionDetails.map((detail) => (
          detail.playoffTeamCount === null
            ? detail
            : { ...detail, playoffTeamCount: 4 }
        )),
        playoffDivisionDetails: snapshot.draft.competition.playoffDivisionDetails.map((detail) => (
          detail.playoffTeamCount === null
            ? detail
            : { ...detail, playoffTeamCount: 4 }
        )),
      },
    };
    const result = await saveEventEditor(
      actor,
      {
        contractVersion: snapshot.contractVersion,
        editorRevision: snapshot.editorRevision,
        staffRevision: snapshot.staffRevision,
        draft,
        scheduleTransition: { mode: "PRESERVE" },
      },
      fixture.eventId,
    );

    expect(result.scheduleOutcome.status).toBe("NOT_REQUESTED");

    const [savedEvent, savedDivisions, after] = await Promise.all([
      prisma.events.findUnique({
        where: { id: fixture.eventId },
        select: { playoffTeamCount: true },
      }),
      prisma.divisions.findMany({
        where: { eventId: fixture.eventId, status: "ACTIVE" },
        select: { phase: true, playoffTeamCount: true },
      }),
      prisma.matches.findMany({
        where: { eventId: fixture.eventId },
        orderBy: [{ matchId: "asc" }, { id: "asc" }],
      }) as Promise<MatchRow[]>,
    ]);

    expect(savedEvent?.playoffTeamCount).toBe(4);
    const storedPlayoffCounts = savedDivisions
      .map((division) => division.playoffTeamCount)
      .filter((count): count is number => typeof count === "number");
    expect(storedPlayoffCounts.length).toBeGreaterThan(0);
    expect(storedPlayoffCounts.every((count) => count === 4)).toBe(true);
    expect(after.map(canonicalMatchFields)).toEqual(
      before.map(canonicalMatchFields),
    );
  });

  it("builds and rebuilds open-ended schedules inside canonical recurring bounds", async () => {
    const generatedFixture = await createIssue95Fixture("generated", {
      includeRecurringTimeSlot: true,
    });
    const reusableFixture = await createIssue95Fixture("reusable", {
      includeRecurringTimeSlot: true,
      reusableGraph: true,
    });
    const actor = { userId: ISSUE95_HOST_ID, isAdmin: false };
    requireSessionMock.mockResolvedValue(actor);
    const staleEvents = await prisma.events.findMany({
      where: {
        id: { in: [generatedFixture.eventId, reusableFixture.eventId] },
      },
      select: {
        start: true,
        end: true,
        generatedScheduleEnd: true,
        noFixedEndDateTime: true,
      },
    });
    expect(staleEvents).toHaveLength(2);
    expect(staleEvents.every((event) => (
      event.noFixedEndDateTime
      && event.end !== null
      && event.generatedScheduleEnd !== null
      && event.end.getTime() < event.start.getTime()
      && event.generatedScheduleEnd.getTime() < event.start.getTime()
    ))).toBe(true);
    const recurringSlotIds = [
      generatedFixture.timeSlotId,
      reusableFixture.timeSlotId,
    ].filter(Boolean) as string[];
    const recurringSlots = await prisma.timeSlots.findMany({
      where: { id: { in: recurringSlotIds } },
      select: { repeating: true, startDate: true, endDate: true },
    });
    expect(recurringSlots).toHaveLength(2);
    expect(recurringSlots.every((slot) => (
      slot.repeating
      && slot.endDate === null
      && slot.startDate.getTime() > new Date(ISSUE95_START).getTime()
    ))).toBe(true);


    const reusableBefore = await prisma.matches.findMany({
      where: { eventId: reusableFixture.eventId },
      select: { id: true, placementState: true, start: true, end: true },
    });
    expect(reusableBefore.map((match) => match.id).sort()).toEqual(
      reusableFixture.reusableMatchIds,
    );
    expect(reusableBefore.every((match) => (
      match.placementState === "UNPLACED"
      && match.start === null
      && match.end === null
    ))).toBe(true);

    const generatedBody = await scheduleEventThroughRoute(generatedFixture, false);
    const reusableBody = await scheduleEventThroughRoute(reusableFixture, true);

    expect(generatedBody.matches.length).toBeGreaterThan(0);
    expect(reusableBody.matches.map((match) => match.id).sort()).toEqual(
      reusableFixture.reusableMatchIds,
    );

    const [generatedEvent, generatedMatches, reusableEvent, reusableMatches] = await Promise.all([
      prisma.events.findUnique({ where: { id: generatedFixture.eventId } }),
      prisma.matches.findMany({ where: { eventId: generatedFixture.eventId } }),
      prisma.events.findUnique({ where: { id: reusableFixture.eventId } }),
      prisma.matches.findMany({ where: { eventId: reusableFixture.eventId } }),
    ]);

    expect(generatedEvent?.noFixedEndDateTime).toBe(true);
    expect(generatedEvent?.end).not.toBeNull();
    expect(generatedEvent?.generatedScheduleEnd).not.toBeNull();
    expectCanonicalMatchBounds(
      generatedMatches,
      new Date(ISSUE95_START),
      generatedEvent?.end ?? new Date(0),
      generatedFixture.fieldId,
    );
    const generatedLatestEnd = Math.max(
      ...generatedMatches.map((match) => match.end?.getTime() ?? 0),
    );
    expect(generatedEvent?.end?.getTime()).toBe(generatedLatestEnd);
    expect(generatedEvent?.generatedScheduleEnd?.getTime()).toBe(generatedLatestEnd);

    expect(reusableEvent?.noFixedEndDateTime).toBe(true);
    expect(reusableEvent?.end).not.toBeNull();
    expect(reusableEvent?.generatedScheduleEnd).not.toBeNull();
    expectCanonicalMatchBounds(
      reusableMatches,
      new Date(ISSUE95_START),
      reusableEvent?.end ?? new Date(0),
      reusableFixture.fieldId,
    );
    expect(reusableMatches.map((match) => match.id).sort()).toEqual(
      reusableFixture.reusableMatchIds,
    );
    const reusableLatestEnd = Math.max(
      ...reusableMatches.map((match) => match.end?.getTime() ?? 0),
    );
    expect(reusableEvent?.end?.getTime()).toBe(reusableLatestEnd);
    expect(reusableEvent?.generatedScheduleEnd?.getTime()).toBe(reusableLatestEnd);
  });
});
