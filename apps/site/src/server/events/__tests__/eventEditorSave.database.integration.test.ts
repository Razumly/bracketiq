/** @jest-environment node */

import { randomUUID } from "crypto";
import { NextRequest } from "next/server";

const requireSessionMock = jest.fn();

jest.mock("@/lib/permissions", () => ({
  requireSession: (...args: unknown[]) => requireSessionMock(...args),
}));

import { prisma } from "@/lib/prisma";
import {
  parseEventEditorAcceptMaintenanceProposal,
  parseEventEditorCreateProposal,
  parseEventEditorCreateResult,
  parseEventEditorMaintenanceRequest,
  parseEventEditorMaintenanceResponse,
  type EventEditorAcceptMaintenanceProposal,
  type EventEditorCreateProposal,
  type EventEditorCreateResult,
  type EventEditorDraft,
  type EventEditorMaintenanceAcceptedResult,
  type EventEditorMaintenanceOperation,
  type EventEditorMaintenanceRequest,
} from "@/contracts/eventEditor";
import { buildEventDivisionId } from "@/lib/divisionTypes";
import { loadEventEditorSnapshot } from "@/server/events/eventEditorSnapshot";
import { saveEventEditor } from "@/server/events/eventEditorSave";
import { upsertEventFromPayload } from "@/server/repositories/events";
import { persistCreateOnlyMatchGraph } from "@/server/scheduler/eventScheduleMutation";
import {
  POST as scheduleEventPost,
  PUT as scheduleEventPut,
} from "@/app/api/events/[eventId]/schedule/route";
import {
  GET as eventEditorGet,
  POST as eventEditorPost,
  PUT as eventEditorPut,
} from "@/app/api/events/editor/route";

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
    automatedScheduling: true,
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
): Promise<{
  graph: EventEditorMaintenanceAcceptedResult["graph"];
  matches: EventEditorMaintenanceAcceptedResult["graph"]["matches"];
}> => {
  const operation: EventEditorMaintenanceOperation = replaceExistingMatches
    ? "COMPLETE"
    : "BUILD";
  const proposalRequest: EventEditorMaintenanceRequest =
    parseEventEditorMaintenanceRequest({
      contractVersion: 3,
      eventId: fixture.eventId,
      operation,
      operationId: `issue-95-${operation.toLowerCase()}-${randomUUID()}`,
    });
  const proposalResponse = await scheduleEventPost(
    new NextRequest(`http://localhost/api/events/${fixture.eventId}/schedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(proposalRequest),
    }),
    { params: Promise.resolve({ eventId: fixture.eventId }) },
  );
  expect(proposalResponse.status).toBe(200);
  const proposal = parseEventEditorMaintenanceResponse(
    await proposalResponse.json(),
  );
  expect(proposal.status).toBe("PROPOSED");
  if (proposal.status !== "PROPOSED") {
    throw new Error("Expected a schedule maintenance proposal.");
  }
  expect(proposal.eventId).toBe(fixture.eventId);
  expect(proposal.operation).toBe(operation);
  expect(proposal.operationId).toBe(proposalRequest.operationId);

  const acceptanceRequest: EventEditorAcceptMaintenanceProposal =
    parseEventEditorAcceptMaintenanceProposal({
      contractVersion: 3,
      eventId: proposal.eventId,
      operation: proposal.operation,
      operationId: proposal.operationId,
      proposalRevision: proposal.proposalRevision,
      acceptanceOperationId: `issue-95-${operation.toLowerCase()}-acceptance-${randomUUID()}`,
    });
  const acceptanceResponse = await scheduleEventPut(
    new NextRequest(`http://localhost/api/events/${fixture.eventId}/schedule`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(acceptanceRequest),
    }),
    { params: Promise.resolve({ eventId: fixture.eventId }) },
  );
  expect(acceptanceResponse.status).toBe(200);
  const accepted = parseEventEditorMaintenanceResponse(
    await acceptanceResponse.json(),
  );
  expect(accepted.status).toBe("ACCEPTED");
  if (accepted.status !== "ACCEPTED") {
    throw new Error("Expected the schedule maintenance proposal to be accepted.");
  }
  expect(accepted.eventId).toBe(proposal.eventId);
  expect(accepted.operation).toBe(proposal.operation);
  expect(accepted.operationId).toBe(proposal.operationId);
  expect(accepted.proposalRevision).toBe(proposal.proposalRevision);
  expect(accepted.acceptanceOperationId).toBe(
    acceptanceRequest.acceptanceOperationId,
  );
  return {
    graph: accepted.graph,
    matches: accepted.graph.matches,
  };
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

const expectIssue95InitialEvent = (
  event: {
    start: Date;
    end: Date | null;
    generatedScheduleEnd: Date | null;
    noFixedEndDateTime: boolean;
  } | null,
): void => {
  expect(event).not.toBeNull();
  expect(event!.noFixedEndDateTime).toBe(true);
  expect(event!.end).not.toBeNull();
  expect(event!.end!.getTime()).toBeLessThan(event!.start.getTime());
  expect(event!.generatedScheduleEnd).not.toBeNull();
  expect(event!.generatedScheduleEnd!.getTime()).toBeLessThan(event!.start.getTime());
};

const expectIssue95PlayoffSave = (
  savedEvent: { playoffTeamCount: number | null } | null,
  savedDivisions: Array<{ phase: string | null; playoffTeamCount: number | null }>,
  before: MatchRow[],
  after: MatchRow[],
): void => {
  expect(savedEvent?.playoffTeamCount).toBe(4);
  const storedPlayoffCounts = savedDivisions
    .map((division) => division.playoffTeamCount)
    .filter((count): count is number => typeof count === "number");
  expect(storedPlayoffCounts.length).toBeGreaterThan(0);
  expect(storedPlayoffCounts.every((count) => count === 4)).toBe(true);
  expect(after.map(canonicalMatchFields)).toEqual(
    before.map(canonicalMatchFields),
  );
};

const buildIssue95PlayoffDraft = (
  snapshot: { draft: EventEditorDraft },
): EventEditorDraft => ({
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
});

const expectIssue95SelectedMatch = (
  match: MatchRow | undefined,
  fixture: Issue95Fixture,
): void => {
  if (!fixture.selectedMatchId) {
    throw new Error("Issue-95 fixture has no selected Match.");
  }
  expect(match).not.toBeUndefined();
  expect(match?.placementState).toBe("UNPLACED");
  expect(match?.start).toBeNull();
  expect(match?.end).toBeNull();
  expect(match?.fieldId).toBeNull();
  expect(match?.locked).toBe(true);
  expect(match?.team1Points).toEqual([21, 18]);
  expect(match?.team2Points).toEqual([17, 15]);
  expect(match?.teamOfficialId).toBe(`${fixture.eventId}:team-official`);
};

type Issue95StaleEvent = {
  noFixedEndDateTime: boolean;
  end: Date | null;
  generatedScheduleEnd: Date | null;
  start: Date;
};

const expectIssue95StaleEvents = (events: Issue95StaleEvent[]): void => {
  expect(events).toHaveLength(2);
  expect(events.every((event) => (
    event.noFixedEndDateTime
    && event.end !== null
    && event.generatedScheduleEnd !== null
    && event.end.getTime() < event.start.getTime()
    && event.generatedScheduleEnd.getTime() < event.start.getTime()
  ))).toBe(true);
};

type Issue95RecurringSlot = {
  repeating: boolean;
  startDate: Date;
  endDate: Date | null;
};

const expectIssue95RecurringSlots = (slots: Issue95RecurringSlot[]): void => {
  expect(slots).toHaveLength(2);
  expect(slots.every((slot) => (
    slot.repeating
    && slot.endDate === null
    && slot.startDate.getTime() > new Date(ISSUE95_START).getTime()
  ))).toBe(true);
};

const expectIssue95UnplacedMatches = (
  matches: Array<{
    id: string;
    placementState: string;
    start: Date | null;
    end: Date | null;
  }>,
  expectedIds: string[],
): void => {
  expect(matches.map((match) => match.id).sort()).toEqual(expectedIds);
  expect(matches.every((match) => (
    match.placementState === "UNPLACED"
    && match.start === null
    && match.end === null
  ))).toBe(true);
};

type Issue95ScheduleEvent = {
  noFixedEndDateTime: boolean | null;
  end: Date | null;
  generatedScheduleEnd: Date | null;
};

const expectIssue95SchedulePersistence = (
  generatedEvent: Issue95ScheduleEvent | null,
  generatedMatches: Array<{
    start: Date | null;
    end: Date | null;
    placementState: string;
    fieldId: string | null;
  }>,
  generatedFixture: Issue95Fixture,
  reusableEvent: Issue95ScheduleEvent | null,
  reusableMatches: Array<{
    id: string;
    start: Date | null;
    end: Date | null;
    placementState: string;
    fieldId: string | null;
  }>,
  reusableFixture: Issue95Fixture,
): void => {
  expect(generatedEvent).not.toBeNull();
  expect(generatedEvent!.noFixedEndDateTime).toBe(true);
  expect(generatedEvent!.end).not.toBeNull();
  expect(generatedEvent!.generatedScheduleEnd).not.toBeNull();
  expectCanonicalMatchBounds(
    generatedMatches,
    new Date(ISSUE95_START),
    generatedEvent!.end!,
    generatedFixture.fieldId,
  );
  const generatedLatestEnd = Math.max(
    ...generatedMatches.map((match) => match.end?.getTime() ?? 0),
  );
  expect(generatedEvent!.end!.getTime()).toBe(generatedLatestEnd);
  expect(generatedEvent!.generatedScheduleEnd!.getTime()).toBe(generatedLatestEnd);

  expect(reusableEvent).not.toBeNull();
  expect(reusableEvent!.noFixedEndDateTime).toBe(true);
  expect(reusableEvent!.end).not.toBeNull();
  expect(reusableEvent!.generatedScheduleEnd).not.toBeNull();
  expectCanonicalMatchBounds(
    reusableMatches,
    new Date(ISSUE95_START),
    reusableEvent!.end!,
    reusableFixture.fieldId,
  );
  expect(reusableMatches.map((match) => match.id).sort()).toEqual(
    reusableFixture.reusableMatchIds,
  );
  const reusableLatestEnd = Math.max(
    ...reusableMatches.map((match) => match.end?.getTime() ?? 0),
  );
  expect(reusableEvent!.end!.getTime()).toBe(reusableLatestEnd);
  expect(reusableEvent!.generatedScheduleEnd!.getTime()).toBe(reusableLatestEnd);
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
    const initialEvent = await prisma.events.findUnique({
      where: { id: fixture.eventId },
      select: {
        start: true,
        end: true,
        generatedScheduleEnd: true,
        noFixedEndDateTime: true,
      },
    });
    expectIssue95InitialEvent(initialEvent);

    const before = await prisma.matches.findMany({
      where: { eventId: fixture.eventId },
      orderBy: [{ matchId: "asc" }, { id: "asc" }],
    }) as MatchRow[];
    const selectedBefore = before.find((match) => match.id === fixture.selectedMatchId);
    expectIssue95SelectedMatch(selectedBefore, fixture);

    const actor = { userId: ISSUE95_HOST_ID, isAdmin: false };
    const snapshot = await loadEventEditorSnapshot(fixture.eventId, { actor });
    expect(snapshot.draft.basics.eventType).toBe("LEAGUE");
    expect(snapshot.draft.competition.playoffTeamCount).toBe(3);

    const draft = buildIssue95PlayoffDraft(snapshot);
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

    expectIssue95PlayoffSave(savedEvent, savedDivisions, before, after);
  });

  it("builds and completes open-ended schedules inside canonical recurring bounds", async () => {
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
    expectIssue95StaleEvents(staleEvents);
    const recurringSlotIds = [
      generatedFixture.timeSlotId,
      reusableFixture.timeSlotId,
    ].filter(Boolean) as string[];
    const recurringSlots = await prisma.timeSlots.findMany({
      where: { id: { in: recurringSlotIds } },
      select: { repeating: true, startDate: true, endDate: true },
    });
    expectIssue95RecurringSlots(recurringSlots);


    const reusableBefore = await prisma.matches.findMany({
      where: { eventId: reusableFixture.eventId },
      select: { id: true, placementState: true, start: true, end: true },
    });
    expectIssue95UnplacedMatches(reusableBefore, reusableFixture.reusableMatchIds);

    const generatedBody = await scheduleEventThroughRoute(generatedFixture, false);
    const reusableBody = await scheduleEventThroughRoute(reusableFixture, true);

    expect(reusableBody.matches.map((match) => match.id).sort()).toEqual(
      reusableFixture.reusableMatchIds,
    );

    const [generatedEvent, generatedMatches, reusableEvent, reusableMatches] = await Promise.all([
      prisma.events.findUnique({ where: { id: generatedFixture.eventId } }),
      prisma.matches.findMany({ where: { eventId: generatedFixture.eventId } }),
      prisma.events.findUnique({ where: { id: reusableFixture.eventId } }),
      prisma.matches.findMany({ where: { eventId: reusableFixture.eventId } }),
    ]);

    expectIssue95SchedulePersistence(
      generatedEvent,
      generatedMatches,
      generatedFixture,
      reusableEvent,
      reusableMatches,
      reusableFixture,
    );
  });
});
type Issue34TournamentFailureFixture = {
  eventId: string;
  fieldId: string;
  timeSlotId: string;
  divisionId: string;
};

type Issue34BootstrapResponse = {
  contractVersion: number;
  createOperationId: string;
  snapshot: {
    editorRevision: string;
    staffRevision: string | null;
    scheduleState: { revision: string };
    draft: EventEditorDraft;
  };
};

type Issue34CreateProposalResponse = {
  status: "PROPOSED";
  createOperationId: string;
  eventId: string;
  proposalRevision: string;
};

const ISSUE34_HOST_ID = "issue-34-tournament-host";
const ISSUE34_START = "2026-10-03T08:00:00.000Z";
const ISSUE34_END = "2026-10-03T20:00:00.000Z";
const issue34OperationIds: string[] = [];
const issue34EventIds: string[] = [];
const issue34FieldIds: string[] = [];
const issue34TimeSlotIds: string[] = [];
const issue34UserIds: string[] = [];

type Issue34RichTournamentFixture = Issue34TournamentFailureFixture & {
  officialId: string;
  assistantHostId: string;
  scorekeeperId: string;
  refereePositionId: string;
  scorekeeperPositionId: string;
};

const ISSUE34_RICH_MATCH_RULES = {
  scoringModel: "SETS",
  segmentCount: 3,
  segmentLabel: "Set",
  setPointTargets: [25, 23, 21],
  supportsDraw: false,
  supportsOvertime: false,
  supportsShootout: false,
  canUseOvertime: false,
  canUseShootout: false,
} as const;

const ISSUE34_RICH_PLAYOFF_CONFIG = {
  doubleElimination: true,
  winnerSetCount: 3,
  loserSetCount: 2,
  winnerBracketPointsToVictory: [31, 29, 27],
  loserBracketPointsToVictory: [17, 15],
  prize: "Issue 34 Rich Bracket",
  fieldCount: 1,
  restTimeMinutes: 3,
  matchDurationMinutes: 30,
  setDurationMinutes: 5,
} as const;

const buildIssue34RichTournamentDraft = (
  base: EventEditorDraft,
  fixture: Issue34RichTournamentFixture,
  isAutomatedScheduling: boolean,
): EventEditorDraft => {
  const simpleDraft = buildIssue34TournamentDraft(base, fixture);
  const sourceDivision = simpleDraft.competition.divisionDetails[0]!;
  const playoffDivisionId = `${fixture.divisionId}:playoff`;
  const phaseMatchRules = {
    matchRulesOverride: ISSUE34_RICH_MATCH_RULES,
    doTeamsOfficiate: false,
  };
  return {
    ...simpleDraft,
    basics: {
      ...simpleDraft.basics,
      name: "Issue 34 Tournament rich semantics",
    },
    competition: {
      ...simpleDraft.competition,
      divisionDetails: [{
        ...sourceDivision,
        poolPlay: true,
        poolCount: 2,
        usesSets: true,
        setsPerMatch: 3,
        setDurationMinutes: 5,
        restTimeMinutes: 2,
        matchDurationMinutes: 15,
        pointsToVictory: [25, 23, 21],
        phaseSettings: { POOL: phaseMatchRules },
      }],
      playoffDivisionDetails: [{
        ...sourceDivision,
        id: playoffDivisionId,
        sourceDivisionId: fixture.divisionId,
        key: "playoffs",
        name: "Playoffs",
        kind: "PLAYOFF",
        poolPlay: false,
        usesSets: true,
        setsPerMatch: 3,
        setDurationMinutes: 5,
        restTimeMinutes: 2,
        matchDurationMinutes: 15,
        pointsToVictory: [25, 23, 21],
        phaseSettings: { BRACKET: phaseMatchRules },
        playoffConfig: ISSUE34_RICH_PLAYOFF_CONFIG,
      }],
      divisionFieldIds: {
        [fixture.divisionId]: [fixture.fieldId],
        [playoffDivisionId]: [fixture.fieldId],
      },
      winnerSetCount: ISSUE34_RICH_PLAYOFF_CONFIG.winnerSetCount,
      loserSetCount: ISSUE34_RICH_PLAYOFF_CONFIG.loserSetCount,
      doubleElimination: true,
      includePlayoffs: true,
      playoffTeamCount: 4,
      pointsToVictory: [25, 23, 21],
      winnerBracketPointsToVictory:
        ISSUE34_RICH_PLAYOFF_CONFIG.winnerBracketPointsToVictory,
      loserBracketPointsToVictory:
        ISSUE34_RICH_PLAYOFF_CONFIG.loserBracketPointsToVictory,
      usesSets: true,
      setsPerMatch: 3,
      setDurationMinutes: 5,
      restTimeMinutes: 2,
      matchDurationMinutes: 15,
      matchRulesOverride: ISSUE34_RICH_MATCH_RULES,
    },
    schedule: {
      ...simpleDraft.schedule,
      isAutomatedScheduling,
    },
    staff: {
      ...simpleDraft.staff,
      staffingPriority: "OFFICIAL_COVERAGE_REQUIRED",
      doTeamsOfficiate: false,
      teamOfficialsMaySwap: false,
      teamCheckInMode: "EVENT",
      teamCheckInOpenMinutesBefore: 15,
      allowMatchRosterEdits: true,
      allowTemporaryMatchPlayers: true,
      officialIds: [fixture.officialId, fixture.scorekeeperId],
      officialPositions: [
        {
          id: fixture.refereePositionId,
          name: "Lead Referee",
          count: 1,
          order: 0,
        },
        {
          id: fixture.scorekeeperPositionId,
          name: "Scorekeeper",
          count: 1,
          order: 1,
        },
      ],
      eventOfficials: [
        {
          id: `${fixture.officialId}:assignment`,
          userId: fixture.officialId,
          positionIds: [fixture.refereePositionId],
          fieldIds: [fixture.fieldId],
          isActive: true,
        },
        {
          id: `${fixture.scorekeeperId}:assignment`,
          userId: fixture.scorekeeperId,
          positionIds: [fixture.scorekeeperPositionId],
          fieldIds: [fixture.fieldId],
          isActive: true,
        },
      ],
      assistantHostIds: [fixture.assistantHostId],
    },
  };
};

const seedIssue34StaffUsers = async (
  fixture: Issue34RichTournamentFixture,
): Promise<void> => {
  const users = [
    {
      id: fixture.officialId,
      firstName: "Issue 34 Official",
      lastName: "Referee",
    },
    {
      id: fixture.scorekeeperId,
      firstName: "Issue 34 Official",
      lastName: "Scorekeeper",
    },
    {
      id: fixture.assistantHostId,
      firstName: "Issue 34 Assistant",
      lastName: "Host",
    },
  ];
  issue34UserIds.push(...users.map((user) => user.id));
  await Promise.all(users.map((user) => prisma.userData.create({
    data: {
      id: user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      firstName: user.firstName,
      lastName: user.lastName,
      dateOfBirth: new Date("1990-01-01T00:00:00.000Z"),
      friendIds: [],
      followingIds: [],
      uploadedImages: [],
      userName: user.id,
    },
  })));
};


const buildIssue34TournamentDraft = (
  base: EventEditorDraft,
  fixture: Issue34TournamentFailureFixture,
): EventEditorDraft => {
  const divisionDetail = {
    id: fixture.divisionId,
    key: "open",
    name: "Open",
    kind: "LEAGUE" as const,
    poolPlay: false,
    divisionTypeId: "open",
    skillDivisionTypeId: "open",
    ageDivisionTypeId: "open",
    divisionTypeName: "Open",
    ratingType: "OPEN",
    gender: "OPEN",
    maxParticipants: 4,
    playoffTeamCount: 4,
    fieldIds: [fixture.fieldId],
    teamIds: [],
    gamesPerOpponent: 1,
    restTimeMinutes: 0,
    usesSets: false,
    matchDurationMinutes: 60,
    pointsToVictory: [21],
  };
  const timeSlot = {
    id: fixture.timeSlotId,
    daysOfWeek: [6],
    startTimeMinutes: 8 * 60,
    endTimeMinutes: 20 * 60,
    startDate: "2026-10-03T00:00:00.000Z",
    endDate: "2026-10-03T23:59:59.999Z",
    timeZone: "UTC",
    scheduledFieldIds: [fixture.fieldId],
    divisions: [fixture.divisionId],
    repeating: false,
    sourceType: "EVENT",
  };

  return {
    ...base,
    basics: {
      ...base.basics,
      name: "Issue 34 Tournament rollback",
      description: "Database integration failure fixture",
      eventType: "TOURNAMENT",
      sportIds: [],
      start: ISSUE34_START,
      timeZone: "UTC",
      location: "Issue 34 Test Facility",
      address: "1 Test Street",
      coordinates: [0, 0],
      affiliateUrl: "",
      parentEvent: null,
      organizationId: null,
      hostId: ISSUE34_HOST_ID,
      state: "UNPUBLISHED",
      imageId: null,
      tags: [],
    },
    participation: {
      ...base.participation,
      teamSignup: true,
      singleDivision: false,
      registrationByDivisionType: false,
      teamSizeLimit: 2,
      maxParticipants: 4,
      minAge: null,
      maxAge: null,
      cancellationRefundHours: null,
      registrationCutoffHours: 0,
      allowTeamSplitDefault: false,
      waitListIds: [],
      freeAgentIds: [],
    },
    registration: {
      ...base.registration,
      payment: {
        ...base.registration.payment,
        mode: "FREE",
        priceCents: 0,
        taxHandling: "STRIPE_TAX",
        organizerManualTaxRateBps: 0,
        manualPaymentInstructions: null,
        manualPaymentLinks: [],
        allowPaymentPlans: false,
        installmentCount: null,
        installmentDueDates: [],
        installmentDueRelativeDays: [],
        installmentAmounts: [],
      },
      questions: [],
      requiredDocumentIds: [],
    },
    competition: {
      ...base.competition,
      divisionIds: [fixture.divisionId],
      divisionDetails: [divisionDetail],
      playoffDivisionDetails: [],
      divisionFieldIds: { [fixture.divisionId]: [fixture.fieldId] },
      winnerSetCount: null,
      loserSetCount: null,
      doubleElimination: false,
      includePlayoffs: false,
      splitLeaguePlayoffDivisions: false,
      playoffTeamCount: null,
      pointsToVictory: [21],
      winnerBracketPointsToVictory: [21],
      loserBracketPointsToVictory: [21],
      usesSets: false,
      setsPerMatch: null,
      setDurationMinutes: null,
      restTimeMinutes: 0,
      matchDurationMinutes: 60,
      gamesPerOpponent: 1,
      matchRulesOverride: null,
      leagueScoringConfig: null,
    },
    schedule: {
      mode: "FIXED_END",
      endConstraint: ISSUE34_END,
      isAutomatedScheduling: true,
    },
    resources: {
      ...base.resources,
      fieldIds: [fixture.fieldId],
      fields: [{
        id: fixture.fieldId,
        name: "Issue 34 Court",
        location: "Issue 34 Test Facility",
        address: "1 Test Street",
        lat: null,
        long: null,
        heading: null,
        inUse: false,
        rentalSlotIds: [],
        sportIds: [],
        createdBy: null,
        archivedAt: null,
        archivedByUserId: null,
        archiveReason: null,
        organizationId: null,
        facilityId: null,
        latitude: null,
        longitude: null,
      }],
      timeSlotIds: [fixture.timeSlotId],
      timeSlots: [timeSlot],
      requiredTemplateIds: [],
      immutableFieldIds: [],
      rentalBookingId: null,
      rentalBookingItemId: null,
    },
    staff: {
      ...base.staff,
      staffingPriority: "BEST_AVAILABLE_COVERAGE",
      doTeamsOfficiate: false,
      teamOfficialsMaySwap: false,
      teamCheckInMode: "OFF",
      teamCheckInOpenMinutesBefore: 60,
      allowMatchRosterEdits: false,
      allowTemporaryMatchPlayers: false,
      autoCreatePointMatchIncidents: false,
      officialIds: [],
      officialPositions: [],
      eventOfficials: [],
      assistantHostIds: [],
      pendingInvites: [],
    },
  };
};

const cleanupIssue34Fixtures = async (): Promise<void> => {
  const operationIds = issue34OperationIds.splice(0);
  const eventIds = new Set(issue34EventIds.splice(0));
  const fields = issue34FieldIds.splice(0);
  const timeSlots = issue34TimeSlotIds.splice(0);
  if (operationIds.length) {
    const operations = await prisma.eventEditorCreateOperations.findMany({
      where: { createOperationId: { in: operationIds } },
      select: { eventId: true },
    });
    operations.forEach((operation) => eventIds.add(operation.eventId));
  }

  for (const eventId of eventIds) {
    const matches = await prisma.matches.findMany({
      where: { eventId },
      select: { id: true },
    });
    const matchIds = matches.map((match) => match.id);
    if (matchIds.length) {
      await prisma.matchSegments.deleteMany({ where: { matchId: { in: matchIds } } });
      await prisma.matchIncidents.deleteMany({ where: { matchId: { in: matchIds } } });
      await prisma.matchRosterEntries.deleteMany({ where: { matchId: { in: matchIds } } });
    }
    await prisma.teamCheckIns.deleteMany({ where: { eventId } });
    await prisma.matches.deleteMany({ where: { eventId } });
    const teams = await prisma.teams.findMany({
      where: { eventId },
      select: { id: true },
    });
    const teamIds = teams.map((team) => team.id);
    if (teamIds.length) {
      await prisma.eventTeamStaffAssignments.deleteMany({
        where: { eventTeamId: { in: teamIds } },
      });
    }
    await prisma.eventDivisionPhaseParticipants.deleteMany({ where: { eventId } });
    await prisma.eventDivisionPhaseSources.deleteMany({ where: { eventId } });
    await prisma.eventOfficials.deleteMany({ where: { eventId } });
    await prisma.eventStaffAssignments.deleteMany({ where: { eventId } });
    await prisma.eventTagAssignments.deleteMany({ where: { eventId } });
    await prisma.invites.deleteMany({ where: { eventId } });
    await prisma.divisions.deleteMany({ where: { eventId } });
    await prisma.teams.deleteMany({ where: { eventId } });
    await prisma.events.deleteMany({ where: { id: eventId } });
  }
  if (fields.length) {
    await prisma.fields.deleteMany({ where: { id: { in: fields } } });
  }
  if (timeSlots.length) {
    await prisma.timeSlots.deleteMany({ where: { id: { in: timeSlots } } });
  }
  if (operationIds.length) {
    await prisma.eventEditorCreateOperations.deleteMany({
      where: { createOperationId: { in: operationIds } },
    });
  }
  const userIds = issue34UserIds.splice(0);
  if (userIds.length) {
    await prisma.userData.deleteMany({ where: { id: { in: userIds } } });
  }
};

type Issue34ProposalMatch = EventEditorCreateProposal["graph"]["matches"][number];

type Issue34MatchGraphNode = {
  id: string;
  winnerNextMatchId: string | null;
  loserNextMatchId: string | null;
  previousLeftId: string | null;
  previousRightId: string | null;
};

const expectIssue34MatchReferenceIds = (
  match: Issue34MatchGraphNode,
  matchIds: ReadonlySet<string>,
): void => {
  const references = [
    match.winnerNextMatchId,
    match.loserNextMatchId,
    match.previousLeftId,
    match.previousRightId,
  ];
  references.forEach((reference) => {
    if (reference === null) return;
    expect(reference).not.toBe(match.id);
    expect(matchIds.has(reference)).toBe(true);
  });
};

const expectIssue34NextMatchReciprocity = (
  matchId: string,
  nextMatchId: string | null,
  matchesById: ReadonlyMap<string, Issue34MatchGraphNode>,
): void => {
  if (!nextMatchId) return;
  const next = matchesById.get(nextMatchId);
  expect(
    next?.previousLeftId === matchId
    || next?.previousRightId === matchId,
  ).toBe(true);
};

const expectIssue34PreviousMatchReciprocity = (
  matchId: string,
  previousMatchId: string | null,
  matchesById: ReadonlyMap<string, Issue34MatchGraphNode>,
): void => {
  if (!previousMatchId) return;
  const previous = matchesById.get(previousMatchId);
  expect(
    previous?.winnerNextMatchId === matchId
    || previous?.loserNextMatchId === matchId,
  ).toBe(true);
};

const expectIssue34MatchEdges = <T extends Issue34MatchGraphNode>(
  match: T,
  matchIds: ReadonlySet<string>,
  matchesById: ReadonlyMap<string, T>,
): void => {
  expectIssue34MatchReferenceIds(match, matchIds);
  expectIssue34NextMatchReciprocity(match.id, match.winnerNextMatchId, matchesById);
  expectIssue34NextMatchReciprocity(match.id, match.loserNextMatchId, matchesById);
  expectIssue34PreviousMatchReciprocity(match.id, match.previousLeftId, matchesById);
  expectIssue34PreviousMatchReciprocity(match.id, match.previousRightId, matchesById);
};

const expectIssue34GraphConnections = (
  matches: ReadonlyArray<Issue34MatchGraphNode>,
): void => {
  expect(
    matches.some(
      (match) => match.previousLeftId !== null || match.previousRightId !== null,
    ),
  ).toBe(true);
  expect(
    matches.some(
      (match) => match.winnerNextMatchId !== null || match.loserNextMatchId !== null,
    ),
  ).toBe(true);
};

const expectIssue34ProposalMatchPlacement = (
  match: Issue34ProposalMatch,
  eventId: string,
  fieldId: string,
  eventStart: Date,
  fixedEnd: Date,
): void => {
  expect(match.eventId).toBe(eventId);
  expect(match.placementState).toBe("PLACED");
  expect(match.fieldId).toBe(fieldId);
  expect(match.start).not.toBeNull();
  expect(match.end).not.toBeNull();
  const matchStart = new Date(match.start as string);
  const matchEnd = new Date(match.end as string);
  expect(matchStart.getTime()).toBeGreaterThanOrEqual(eventStart.getTime());
  expect(matchEnd.getTime()).toBeGreaterThan(matchStart.getTime());
  expect(matchEnd.getTime()).toBeLessThanOrEqual(fixedEnd.getTime());
};

const expectIssue34ProposalGraph = (
  proposal: EventEditorCreateProposal,
  fixture: Issue34TournamentFailureFixture,
): void => {
  const matches = proposal.graph.matches;
  const matchIds = new Set(matches.map((match) => match.id));
  const matchesById = new Map(
    matches.map((match): [string, Issue34ProposalMatch] => [match.id, match]),
  );
  expect(matchIds.size).toBe(matches.length);
  const eventStart = new Date(ISSUE34_START);
  const fixedEnd = new Date(ISSUE34_END);
  for (const match of matches) {
    expectIssue34ProposalMatchPlacement(
      match,
      proposal.eventId,
      fixture.fieldId,
      eventStart,
      fixedEnd,
    );
    expectIssue34MatchEdges(match, matchIds, matchesById);
  }
  expectIssue34GraphConnections(matches);
};
const expectIssue34RichGraphSemantics = (
  graph: EventEditorCreateProposal["graph"],
  fixture: Issue34RichTournamentFixture,
): void => {
  expect(graph.event).toMatchObject({
    officialIds: [fixture.officialId, fixture.scorekeeperId],
    staffingPriority: "OFFICIAL_COVERAGE_REQUIRED",
    doTeamsOfficiate: false,
    teamCheckInMode: "EVENT",
    teamCheckInOpenMinutesBefore: 15,
    allowMatchRosterEdits: true,
    allowTemporaryMatchPlayers: true,
    winnerSetCount: 3,
    loserSetCount: 2,
    doubleElimination: true,
    winnerBracketPointsToVictory: [31, 29, 27],
    loserBracketPointsToVictory: [17, 15],
    usesSets: true,
    setsPerMatch: 3,
    setDurationMinutes: 5,
  });
  expect(graph.event.officialPositions).toEqual([
    {
      id: fixture.refereePositionId,
      name: "Lead Referee",
      count: 1,
      order: 0,
    },
    {
      id: fixture.scorekeeperPositionId,
      name: "Scorekeeper",
      count: 1,
      order: 1,
    },
  ]);
  expect(graph.event.eventOfficials).toEqual([
    expect.objectContaining({
      userId: fixture.officialId,
      positionIds: [fixture.refereePositionId],
      fieldIds: [fixture.fieldId],
      isActive: true,
    }),
    expect.objectContaining({
      userId: fixture.scorekeeperId,
      positionIds: [fixture.scorekeeperPositionId],
      fieldIds: [fixture.fieldId],
      isActive: true,
    }),
  ]);
  expect(graph.matches.filter((match) => match.eventId !== graph.event.id)).toEqual([]);
  expect(graph.event.divisionDetails.some((division) => division.phase === "POOL")).toBe(true);
  expect(graph.event.divisionDetails.some((division) => division.phase === "BRACKET")).toBe(true);
  const divisionDetailIds = graph.event.divisionDetails.map((division) => division.id);
  expect(new Set(divisionDetailIds).size).toBe(divisionDetailIds.length);
  expect(new Set(graph.event.divisions)).toEqual(new Set(divisionDetailIds));
  const playoffDivisionIds = graph.event.playoffDivisionDetails.map(
    (division) => division.id,
  );
  expect(new Set(playoffDivisionIds).size).toBe(playoffDivisionIds.length);
  expect(playoffDivisionIds.every((id) => divisionDetailIds.includes(id))).toBe(true);
  const poolMatches = graph.matches.filter((match) => match.phase === "POOL");
  const bracketMatches = graph.matches.filter((match) => match.phase === "BRACKET");
  expect(poolMatches.length).toBeGreaterThan(0);
  expect(bracketMatches.length).toBeGreaterThan(0);
  expect(bracketMatches.some((match) => match.losersBracket)).toBe(true);
  expect(bracketMatches.some((match) => match.loserNextMatchId !== null)).toBe(true);
  expect(bracketMatches.every((match) => {
    const snapshot = match.matchRulesSnapshot;
    return snapshot !== null
      && isIssue34Record(snapshot)
      && snapshot.scoringModel === "SETS";
  })).toBe(true);
};

const expectIssue34CreateOnlyGraph = (
  result: EventEditorCreateResult,
  fixture: Issue34RichTournamentFixture,
): void => {
  expect(result.status).toBe("SAVED");
  expect(result.scheduleOutcome).toMatchObject({
    status: "NOT_REQUESTED",
    warnings: [],
  });
  expect(result.scheduleOutcome.matchCount).toBeGreaterThan(0);
  const graph = result.graph;
  if (!graph) {
    throw new Error("Issue 34 CREATE_ONLY result did not include its graph.");
  }
  expect(graph.event.id).toBe(result.snapshot.eventId);
  expect(graph.event.fields).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: fixture.fieldId })]),
  );
  expect(graph.event.timeSlots).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: fixture.timeSlotId })]),
  );
  expect(graph.event.teams.length).toBeGreaterThanOrEqual(4);
  graph.matches.forEach((match) => {
    expect(match.eventId).toBe(result.snapshot.eventId);
    expect(match.placementState).toBe("UNPLACED");
    expect(match.start).toBeNull();
    expect(match.end).toBeNull();
    expect(match.fieldId).toBeNull();
    expect(match.official).toBeNull();
    expect(match.officialAssignments.every((assignment) => (
      assignment.userId === null && assignment.eventOfficialId === null
    ))).toBe(true);
    expect(match.teamOfficial).toBeNull();
  });
  expectIssue34RichGraphSemantics(graph, fixture);
};

const expectedIssue34PersistedDivision = (match: Issue34ProposalMatch): string | null => (
  match.phaseDivisionId ?? match.division ?? match.sourceDivisionId
);

const expectIssue34PersistedMatch = (
  proposalMatch: Issue34ProposalMatch,
  match: MatchRow,
  fixture: Issue34TournamentFailureFixture,
  eventStart: Date,
  fixedEnd: Date,
): void => {
  expect(match.eventId).toBe(fixture.eventId);
  expect(match.placementState).toBe("PLACED");
  expect(match.fieldId).toBe(fixture.fieldId);
  expect(match.start?.toISOString()).toBe(proposalMatch.start);
  expect(match.end?.toISOString()).toBe(proposalMatch.end);
  expect(match.start?.getTime()).toBeGreaterThanOrEqual(eventStart.getTime());
  expect(match.end?.getTime()).toBeGreaterThan(match.start?.getTime() ?? 0);
  expect(match.end?.getTime()).toBeLessThanOrEqual(fixedEnd.getTime());
  expect(match.division).toBe(expectedIssue34PersistedDivision(proposalMatch));
  expect(match.team1Id).toBe(proposalMatch.team1Id);
  expect(match.team2Id).toBe(proposalMatch.team2Id);
  expect(match.team1Seed).toBe(proposalMatch.team1Seed);
  expect(match.team2Seed).toBe(proposalMatch.team2Seed);
  expect(match.winnerNextMatchId).toBe(proposalMatch.winnerNextMatchId);
  expect(match.loserNextMatchId).toBe(proposalMatch.loserNextMatchId);
  expect(match.previousLeftId).toBe(proposalMatch.previousLeftId);
  expect(match.previousRightId).toBe(proposalMatch.previousRightId);
};

const expectIssue34PersistedGraph = (
  proposal: EventEditorCreateProposal,
  matches: MatchRow[],
  fixture: Issue34TournamentFailureFixture,
): void => {
  expect(matches.length).toBe(proposal.graph.matches.length);
  expect(matches.length).toBeGreaterThan(0);
  const matchesById = new Map(
    matches.map((match): [string, MatchRow] => [match.id, match]),
  );
  expect(matchesById.size).toBe(matches.length);
  const matchIds = new Set(matches.map((match) => match.id));
  const eventStart = new Date(ISSUE34_START);
  const fixedEnd = new Date(ISSUE34_END);
  for (const proposalMatch of proposal.graph.matches) {
    const match = matchesById.get(proposalMatch.id);
    if (!match) {
      throw new Error(`Persisted Match Graph node ${proposalMatch.id} is missing.`);
    }
    expectIssue34PersistedMatch(proposalMatch, match, fixture, eventStart, fixedEnd);
    expectIssue34MatchEdges(match, matchIds, matchesById);
  }
};


type Issue34PersistedEvent = {
  id: string;
  name: string;
  eventType: string | null;
  start: Date;
  end: Date | null;
  scheduleEndConstraint: Date | null;
  generatedScheduleEnd: Date | null;
  noFixedEndDateTime: boolean;
  automatedScheduling: boolean;
  timeZone: string;
  fieldIds: string[];
  timeSlotIds: string[];
  maxParticipants: number | null;
  teamSizeLimit: number;
  teamSignup: boolean | null;
  assistantHostIds: string[];
  officialSchedulingMode: string;
  staffingPriority: string;
  doTeamsOfficiate: boolean | null;
  teamOfficialsMaySwap: boolean | null;
  teamCheckInMode: string;
  teamCheckInOpenMinutesBefore: number;
  allowMatchRosterEdits: boolean;
  allowTemporaryMatchPlayers: boolean;
  officialPositions: unknown;
  matchRulesOverride: unknown;
  autoCreatePointMatchIncidents: boolean | null;
  winnerSetCount: number | null;
  loserSetCount: number | null;
  doubleElimination: boolean | null;
  winnerBracketPointsToVictory: number[];
  loserBracketPointsToVictory: number[];
  pointsToVictory: number[];
  usesSets: boolean | null;
  matchDurationMinutes: number | null;
  setDurationMinutes: number | null;
  setsPerMatch: number | null;
};

type Issue34PersistedDivision = {
  id: string;
  key: string;
  name: string;
  kind: string;
  role: string;
  phase: string | null;
  isSystemGenerated: boolean;
  sourceDivisionId: string | null;
  fieldIds: string[];
  teamIds: string[];
  playoffTeamCount: number | null;
  phaseSettings: unknown;
  standingsOverrides: unknown;
  gamesPerOpponent: number | null;
  restTimeMinutes: number | null;
  usesSets: boolean | null;
  matchDurationMinutes: number | null;
  setDurationMinutes: number | null;
  setsPerMatch: number | null;
  pointsToVictory: number[];
  playoffDoubleElimination: boolean | null;
  playoffWinnerSetCount: number | null;
  playoffLoserSetCount: number | null;
  playoffWinnerBracketPointsToVictory: number[];
  playoffLoserBracketPointsToVictory: number[];
  playoffPrize: string | null;
  playoffFieldCount: number | null;
  playoffRestTimeMinutes: number | null;
  playoffMatchDurationMinutes: number | null;
  playoffSetDurationMinutes: number | null;
};


type Issue34PersistedTeam = {
  id: string;
  eventId: string;
  kind: string;
  division: string | null;
  name: string;
  teamSize: number;
};

type Issue34PersistedPhaseSource = {
  id: string;
  eventId: string;
  entryDivisionId: string;
  phaseDivisionId: string;
  phase: string;
};

type Issue34PersistedPhaseParticipant = {
  id: string;
  eventId: string;
  phaseDivisionId: string;
  eventTeamId: string;
  sourceEntryDivisionId: string;
};

type Issue34PersistedField = {
  id: string;
  name: string;
  location: string;
  rentalSlotIds: string[];
  sportIds: string[];
};

type Issue34PersistedTimeSlot = {
  id: string;
  daysOfWeek: number[];
  startTimeMinutes: number;
  endTimeMinutes: number;
  startDate: Date;
  endDate: Date | null;
  timeZone: string;
  scheduledFieldIds: string[];
  divisions: string[];
  repeating: boolean;
  sourceType: string | null;
};
type Issue34PersistedOfficial = {
  id: string;
  eventId: string;
  userId: string;
  positionIds: string[];
  fieldIds: string[];
  isActive: boolean | null;
};

type Issue34AcceptanceReceipt = {
  eventId: string | null;
  responseStatus: number | null;
  responseJson: unknown;
  proposalJson: unknown;
  proposalRevision: string | null;
  proposalStatus: string;
  emailDelivery: string;
};

const expectIssue34PersistedEvent = (
  event: Issue34PersistedEvent | null,
  draft: EventEditorDraft,
  fixture: Issue34TournamentFailureFixture,
): void => {
  expect(event).not.toBeNull();
  expect(event!.id).toBe(fixture.eventId);
  expect(event!.name).toBe(draft.basics.name);
  expect(event!.eventType).toBe("TOURNAMENT");
  expect(event!.start.getTime()).toBe(new Date(ISSUE34_START).getTime());
  expect(event!.end).not.toBeNull();
  expect(event!.end!.getTime()).toBe(new Date(ISSUE34_END).getTime());
  expect(event!.scheduleEndConstraint).not.toBeNull();
  expect(event!.scheduleEndConstraint!.getTime()).toBe(new Date(ISSUE34_END).getTime());
  expect(event!.generatedScheduleEnd).toBeNull();
  expect(event!.noFixedEndDateTime).toBe(false);
  expect(event!.automatedScheduling).toBe(draft.schedule.isAutomatedScheduling);
  expect(event!.timeZone).toBe("UTC");
  expect(event!.fieldIds).toEqual([fixture.fieldId]);
  expect(event!.timeSlotIds).toEqual([fixture.timeSlotId]);
  expect(event!.maxParticipants).toBe(4);
  expect(event!.teamSizeLimit).toBe(2);
  expect(event!.teamSignup).toBe(true);
  expect(event!.assistantHostIds).toEqual(draft.staff.assistantHostIds);
  expect(event!.staffingPriority).toBe(draft.staff.staffingPriority);
  expect(event!.doTeamsOfficiate).toBe(draft.staff.doTeamsOfficiate);
  expect(event!.teamOfficialsMaySwap).toBe(draft.staff.teamOfficialsMaySwap);
  expect(event!.teamCheckInMode).toBe(draft.staff.teamCheckInMode);
  expect(event!.teamCheckInOpenMinutesBefore).toBe(
    draft.staff.teamCheckInOpenMinutesBefore,
  );
  expect(event!.allowMatchRosterEdits).toBe(draft.staff.allowMatchRosterEdits);
  expect(event!.allowTemporaryMatchPlayers).toBe(
    draft.staff.allowTemporaryMatchPlayers,
  );
  expect(event!.officialPositions).toEqual(draft.staff.officialPositions);
  expect(event!.matchRulesOverride).toEqual(
    draft.competition.matchRulesOverride,
  );
  expect(event!.autoCreatePointMatchIncidents).toBe(
    draft.staff.autoCreatePointMatchIncidents,
  );
  expect(event!.winnerSetCount).toBe(draft.competition.winnerSetCount);
  expect(event!.loserSetCount).toBe(draft.competition.loserSetCount);
  expect(event!.doubleElimination).toBe(draft.competition.doubleElimination);
  expect(event!.winnerBracketPointsToVictory).toEqual(
    draft.competition.winnerBracketPointsToVictory,
  );
  expect(event!.loserBracketPointsToVictory).toEqual(
    draft.competition.loserBracketPointsToVictory,
  );
  expect(event!.pointsToVictory).toEqual(draft.competition.pointsToVictory);
  expect(event!.usesSets).toBe(draft.competition.usesSets);
  expect(event!.matchDurationMinutes).toBe(
    draft.competition.matchDurationMinutes,
  );
  expect(event!.setDurationMinutes).toBe(
    draft.competition.setDurationMinutes,
  );
  expect(event!.setsPerMatch).toBe(draft.competition.setsPerMatch);
};

const findIssue34SourceDivision = (
  divisions: Issue34PersistedDivision[],
): Issue34PersistedDivision => {
  const sourceDivision = divisions.find((division) => (
    division.role === "ENTRY"
    && division.isSystemGenerated === false
    && division.key === "open"
  ));
  if (!sourceDivision) {
    throw new Error("The accepted Tournament source division is missing.");
  }
  return sourceDivision;
};

const expectIssue34PhaseDivisions = (
  phaseDivisions: Issue34PersistedDivision[],
  sourceDivisionId: string,
  fieldId: string,
): Set<string> => {
  expect(phaseDivisions.length).toBeGreaterThanOrEqual(2);
  const phaseDivisionIds = new Set(phaseDivisions.map((division) => division.id));
  const poolDivisions = phaseDivisions.filter((division) => division.phase === "POOL");
  const bracketDivisions = phaseDivisions.filter(
    (division) => division.phase === "BRACKET",
  );
  expect(poolDivisions).not.toHaveLength(0);
  expect(bracketDivisions).not.toHaveLength(0);
  expect(
    phaseDivisions.every((division) => (
      division.sourceDivisionId === sourceDivisionId
      && division.fieldIds.includes(fieldId)
    )),
  ).toBe(true);
  expect(poolDivisions[0]).toMatchObject({
    usesSets: true,
    setsPerMatch: 3,
    setDurationMinutes: 5,
    matchDurationMinutes: 15,
    pointsToVictory: [25, 23, 21],
  });
  expect(bracketDivisions[0]?.standingsOverrides).toMatchObject({
    doubleElimination: true,
    winnerSetCount: 3,
    loserSetCount: 2,
    winnerBracketPointsToVictory: [31, 29, 27],
    loserBracketPointsToVictory: [17, 15],
    prize: "Issue 34 Rich Bracket",
    fieldCount: 1,
    restTimeMinutes: 3,
    matchDurationMinutes: 30,
    setDurationMinutes: 5,
  });
  return phaseDivisionIds;
};

const expectIssue34PhaseSources = (
  sources: Issue34PersistedPhaseSource[],
  phaseDivisionIds: ReadonlySet<string>,
  phaseDivisionCount: number,
  sourceDivisionId: string,
): void => {
  expect(sources.length).toBe(phaseDivisionCount);
  expect(
    sources.every((source) => (
      phaseDivisionIds.has(source.phaseDivisionId)
      && source.entryDivisionId === sourceDivisionId
      && ["POOL", "BRACKET"].includes(source.phase)
    )),
  ).toBe(true);
  expect([...new Set(sources.map((source) => source.phase))].sort()).toEqual(
    ["BRACKET", "POOL"],
  );
};

const expectIssue34PhaseParticipants = (
  participants: Issue34PersistedPhaseParticipant[],
  phaseDivisionIds: ReadonlySet<string>,
  persistedTeamIds: ReadonlySet<string>,
  sourceDivisionId: string,
): void => {
  expect(participants.length).toBeGreaterThan(0);
  expect(
    participants.every((participant) => (
      phaseDivisionIds.has(participant.phaseDivisionId)
      && persistedTeamIds.has(participant.eventTeamId)
      && participant.sourceEntryDivisionId === sourceDivisionId
    )),
  ).toBe(true);
  expect(new Set(participants.map((participant) => participant.eventTeamId))).toEqual(
    persistedTeamIds,
  );
  expect(
    [...phaseDivisionIds].every((phaseDivisionId) => (
      participants.some(
        (participant) => participant.phaseDivisionId === phaseDivisionId,
      )
    )),
  ).toBe(true);
};

const expectIssue34PersistedDivisionState = (
  divisions: Issue34PersistedDivision[],
  teams: Issue34PersistedTeam[],
  phaseSources: Issue34PersistedPhaseSource[],
  phaseParticipants: Issue34PersistedPhaseParticipant[],
  fixture: Issue34TournamentFailureFixture,
): string => {
  const sourceDivision = findIssue34SourceDivision(divisions);
  expect(sourceDivision).toMatchObject({
    id: sourceDivision.id,
    key: "open",
    name: "Open",
    kind: "LEAGUE",
    role: "ENTRY",
    phase: null,
    isSystemGenerated: false,
    sourceDivisionId: null,
    fieldIds: [fixture.fieldId],
  });
  const phaseDivisions = divisions.filter(
    (division) => division.role === "PHASE",
  );
  const phaseDivisionIds = expectIssue34PhaseDivisions(
    phaseDivisions,
    sourceDivision.id,
    fixture.fieldId,
  );
  expectIssue34PhaseSources(
    phaseSources,
    phaseDivisionIds,
    phaseDivisions.length,
    sourceDivision.id,
  );
  const persistedTeamIds = new Set(teams.map((team) => team.id));
  expectIssue34PhaseParticipants(
    phaseParticipants,
    phaseDivisionIds,
    persistedTeamIds,
    sourceDivision.id,
  );
  return sourceDivision.id;
};

const expectIssue34PersistedTeams = (
  teams: Issue34PersistedTeam[],
  proposal: EventEditorCreateProposal,
  fixture: Issue34TournamentFailureFixture,
  sourceDivisionId: string,
): void => {
  expect(teams.length).toBeGreaterThanOrEqual(4);
  expect(teams.length).toBe(proposal.graph.event.teams.length);
  expect(new Set(teams.map((team) => team.id))).toEqual(
    new Set(proposal.graph.event.teams.map((team) => team.id)),
  );
  expect(
    teams.every((team) => (
      team.eventId === fixture.eventId
      && team.kind === "PLACEHOLDER"
      && team.teamSize === 2
      && team.division === sourceDivisionId
    )),
  ).toBe(true);
};

const expectIssue34PersistedResources = (
  fields: Issue34PersistedField[],
  timeSlots: Issue34PersistedTimeSlot[],
  fixture: Issue34TournamentFailureFixture,
  sourceDivisionId: string,
): void => {
  expect(fields).toHaveLength(1);
  expect(fields[0]).toMatchObject({
    id: fixture.fieldId,
    name: "Issue 34 Court",
    location: "Issue 34 Test Facility",
    rentalSlotIds: [],
    sportIds: [],
  });
  expect(timeSlots).toHaveLength(1);
  expect(timeSlots[0]).toMatchObject({
    id: fixture.timeSlotId,
    daysOfWeek: [5],
    startTimeMinutes: 480,
    endTimeMinutes: 1200,
    timeZone: "UTC",
    scheduledFieldIds: [fixture.fieldId],
    divisions: [sourceDivisionId],
    repeating: false,
    sourceType: "EVENT",
  });
  expect(timeSlots[0]?.startDate.getTime()).toBe(
    new Date("2026-10-03T08:00:00.000Z").getTime(),
  );
  expect(timeSlots[0]?.endDate?.getTime()).toBe(
    new Date("2026-10-03T20:00:00.000Z").getTime(),
  );
};

const expectIssue34AcceptedReceipt = (
  receipt: Issue34AcceptanceReceipt | null,
  operationId: string,
  fixture: Issue34TournamentFailureFixture,
  proposal: EventEditorCreateProposal,
): void => {
  expect(receipt).toMatchObject({
    eventId: fixture.eventId,
    responseStatus: 201,
    proposalRevision: proposal.proposalRevision,
    proposalStatus: "ACCEPTED",
    emailDelivery: "NOT_REQUESTED",
  });
  expect(receipt?.proposalJson).not.toBeNull();
  expect(receipt?.responseJson).not.toBeNull();
  const storedResult = receipt?.responseJson as {
    status?: string;
    createOperationId?: string;
    snapshot?: { eventId?: string | null };
    scheduleOutcome?: { status?: string; matchCount?: number };
  } | null;
  expect(storedResult).toMatchObject({
    status: "SAVED",
    createOperationId: operationId,
    snapshot: { eventId: fixture.eventId },
    scheduleOutcome: {
      status: "BUILT",
      matchCount: proposal.graph.matches.length,
    },
  });
};

const expectIssue34ProposalResponse = (
  responseStatus: number,
  responseBody: unknown,
  operationId: string,
  fixture: Issue34TournamentFailureFixture,
): EventEditorCreateProposal => {
  if (responseStatus !== 202) {
    throw new Error(
      `Issue 34 successful proposal failed: ${JSON.stringify(responseBody)}`,
    );
  }
  const proposal = parseEventEditorCreateProposal(responseBody);
  expect(proposal.status).toBe("PROPOSED");
  expect(proposal.createOperationId).toBe(operationId);
  expect(proposal.eventId).toBeTruthy();
  expect(proposal.completion.mode).toBe("CREATE_AND_BUILD_SCHEDULE");
  expect(proposal.scheduleOutcome.status).toBe("BUILT");
  expect(proposal.scheduleOutcome.matchCount).toBeGreaterThan(0);
  expect(proposal.graph.event.id).toBe(proposal.eventId);
  expect(proposal.graph.matches).toHaveLength(proposal.scheduleOutcome.matchCount);
  expect(proposal.graph.matches.length).toBeGreaterThan(0);
  expectIssue34ProposalGraph(proposal, fixture);
  return proposal;
};

const expectIssue34AcceptedResponse = (
  responseStatus: number,
  responseBody: unknown,
  operationId: string,
  eventId: string,
  proposal: EventEditorCreateProposal,
): EventEditorCreateResult => {
  if (responseStatus !== 201) {
    throw new Error(
      `Issue 34 successful acceptance failed: ${JSON.stringify(responseBody)}`,
    );
  }
  const accepted = parseEventEditorCreateResult(responseBody);
  expect(accepted.status).toBe("SAVED");
  expect(accepted.createOperationId).toBe(operationId);
  expect(accepted.snapshot.eventId).toBe(eventId);
  expect(accepted.scheduleOutcome.status).toBe("BUILT");
  expect(accepted.scheduleOutcome.matchCount).toBe(proposal.graph.matches.length);
  expect(accepted.graph?.matches).toHaveLength(proposal.graph.matches.length);
  return accepted;
};

const expectIssue34ProposalNotPersisted = async (eventId: string): Promise<void> => {
  const [proposalEvent, proposalDivisions, proposalMatches] = await Promise.all([
    prisma.events.findUnique({ where: { id: eventId } }),
    prisma.divisions.findMany({ where: { eventId } }),
    prisma.matches.findMany({ where: { eventId } }),
  ]);
  expect(proposalEvent).toBeNull();
  expect(proposalDivisions).toHaveLength(0);
  expect(proposalMatches).toHaveLength(0);
};

type Issue34PersistedAcceptanceState = {
  event: Issue34PersistedEvent | null;
  divisions: Issue34PersistedDivision[];
  teams: Issue34PersistedTeam[];
  matches: MatchRow[];
  phaseSources: Issue34PersistedPhaseSource[];
  phaseParticipants: Issue34PersistedPhaseParticipant[];
  fields: Issue34PersistedField[];
  timeSlots: Issue34PersistedTimeSlot[];
  officials: Issue34PersistedOfficial[];
  receipt: Issue34AcceptanceReceipt | null;
};
const loadIssue34DirectState = async (
  eventId: string,
  operationId: string,
  fieldId: string,
  timeSlotId: string,
): Promise<Issue34PersistedAcceptanceState> => {
  const [
    event,
    divisions,
    teams,
    matches,
    phaseSources,
    phaseParticipants,
    fields,
    timeSlots,
    officials,
    receipt,
  ] = await Promise.all([
    prisma.events.findUnique({ where: { id: eventId } }),
    prisma.divisions.findMany({ where: { eventId } }),
    prisma.teams.findMany({ where: { eventId } }),
    prisma.matches.findMany({ where: { eventId } }),
    prisma.eventDivisionPhaseSources.findMany({ where: { eventId } }),
    prisma.eventDivisionPhaseParticipants.findMany({ where: { eventId } }),
    prisma.fields.findMany({ where: { id: fieldId } }),
    prisma.timeSlots.findMany({ where: { id: timeSlotId } }),
    prisma.eventOfficials.findMany({ where: { eventId } }),
    prisma.eventEditorCreateOperations.findUnique({
      where: { createOperationId: operationId },
    }),
  ]);
  const state = {
    event,
    divisions,
    teams,
    matches,
    phaseSources,
    phaseParticipants,
    fields,
    timeSlots,
    officials,
    receipt,
  };
  return state as unknown as Issue34PersistedAcceptanceState;
};
const expectIssue34DirectPersistence = (
  state: Issue34PersistedAcceptanceState,
  result: EventEditorCreateResult,
  fixture: Issue34RichTournamentFixture,
): void => {
  expect(state.event).toMatchObject({
    id: fixture.eventId,
    eventType: "TOURNAMENT",
    automatedScheduling: false,
    scheduleEndConstraint: new Date(ISSUE34_END),
    fieldIds: [fixture.fieldId],
    timeSlotIds: [fixture.timeSlotId],
  });
  expect(state.divisions.some((division) => (
    division.role === "ENTRY" && division.key === "open"
  ))).toBe(true);
  expect(state.divisions.some((division) => (
    division.role === "PHASE" && division.phase === "POOL"
  ))).toBe(true);
  expect(state.divisions.some((division) => (
    division.role === "PHASE" && division.phase === "BRACKET"
  ))).toBe(true);
  expect(state.teams.length).toBeGreaterThanOrEqual(4);
  expect(state.teams.every((team) => (
    team.eventId === fixture.eventId && team.kind === "PLACEHOLDER"
  ))).toBe(true);
  expect(state.phaseSources.length).toBeGreaterThanOrEqual(2);
  expect(state.phaseSources.map((source) => source.phase).sort()).toEqual(
    ["BRACKET", "POOL"],
  );
  expect(state.phaseParticipants.length).toBeGreaterThan(0);
  expect(state.fields).toHaveLength(1);
  expect(state.fields[0]?.id).toBe(fixture.fieldId);
  expect(state.timeSlots).toHaveLength(1);
  expect(state.timeSlots[0]?.id).toBe(fixture.timeSlotId);
  expect(state.matches).toHaveLength(result.scheduleOutcome.matchCount);
  expect(state.matches.every((match) => (
    match.eventId === fixture.eventId
    && match.placementState === "UNPLACED"
    && match.start === null
    && match.end === null
    && match.fieldId === null
    && match.officialId === null
    && match.teamOfficialId === null
  ))).toBe(true);
  expect(state.matches.some((match) => match.losersBracket === true)).toBe(true);
  expect(state.matches.some((match) => match.loserNextMatchId !== null)).toBe(true);
  expect(state.matches.every((match) => (
    isIssue34Record(match.matchRulesSnapshot)
    && match.matchRulesSnapshot.scoringModel === "SETS"
  ))).toBe(true);
  expect(state.officials).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        userId: fixture.officialId,
        positionIds: [fixture.refereePositionId],
        fieldIds: [fixture.fieldId],
      }),
    ]),
  );
  expect(state.receipt).toMatchObject({
    eventId: fixture.eventId,
    responseStatus: 201,
    responseJson: expect.anything(),
    proposalStatus: "NONE",
    emailDelivery: "NOT_REQUESTED",
  });
};

const expectIssue34DurableAcceptance = (
  state: Issue34PersistedAcceptanceState,
  draft: EventEditorDraft,
  proposal: EventEditorCreateProposal,
  fixture: Issue34TournamentFailureFixture,
  operationId: string,
): void => {
  expectIssue34PersistedEvent(state.event, draft, fixture);
  const sourceDivisionId = expectIssue34PersistedDivisionState(
    state.divisions,
    state.teams,
    state.phaseSources,
    state.phaseParticipants,
    fixture,
  );
  expectIssue34PersistedTeams(state.teams, proposal, fixture, sourceDivisionId);
  expectIssue34PersistedGraph(proposal, state.matches, fixture);
  expectIssue34PersistedResources(
    state.fields,
    state.timeSlots,
    fixture,
    sourceDivisionId,
  );
  expectIssue34AcceptedReceipt(state.receipt, operationId, fixture, proposal);
  expect(state.officials).toHaveLength(draft.staff.eventOfficials.length);
  expect(state.officials).toEqual(
    expect.arrayContaining(
      draft.staff.eventOfficials.map((official) => expect.objectContaining({
        userId: official.userId,
        positionIds: official.positionIds,
        fieldIds: official.fieldIds,
        isActive: true,
      })),
    ),
  );
};

type Issue34PrismaClient = {
  $transaction: (...args: unknown[]) => Promise<unknown>;
};

type Issue34FailureState = {
  injectedFailure: boolean;
  graphMatchPersisted: boolean;
};

const isIssue34Record = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === "object" && !Array.isArray(value)
);

const shouldInjectIssue34Failure = (
  update: unknown,
  eventId: string,
  graphMatchPersisted: boolean,
): boolean => {
  if (!graphMatchPersisted) return false;
  if (!isIssue34Record(update)) return false;
  const where = update.where;
  if (!isIssue34Record(where)) return false;
  return where.id === eventId;
};

const runIssue34EventUpdate = async (
  method: (...args: unknown[]) => unknown,
  target: object,
  args: unknown[],
  eventId: string,
  state: Issue34FailureState,
): Promise<unknown> => {
  const result = await Reflect.apply(method, target, args);
  if (shouldInjectIssue34Failure(args[0], eventId, state.graphMatchPersisted)) {
    state.injectedFailure = true;
    throw new Error(
      "Issue 34 injected acceptance failure after schedule persistence",
    );
  }
  return result;
};

const createIssue34GuardedEventDelegate = (
  events: object,
  eventId: string,
  state: Issue34FailureState,
): object => new Proxy(events, {
  get(target, property, receiver) {
    const method = Reflect.get(target, property, receiver);
    if (property !== "update" || typeof method !== "function") {
      return method;
    }
    return (...args: unknown[]) => runIssue34EventUpdate(
      method as (...methodArgs: unknown[]) => unknown,
      target,
      args,
      eventId,
      state,
    );
  },
});

const runIssue34MatchUpsert = async (
  method: (...args: unknown[]) => unknown,
  target: object,
  args: unknown[],
  state: Issue34FailureState,
): Promise<unknown> => {
  const result = await Reflect.apply(method, target, args);
  state.graphMatchPersisted = true;
  return result;
};

const createIssue34GuardedMatchesDelegate = (
  matches: object,
  state: Issue34FailureState,
): object => new Proxy(matches, {
  get(target, property, receiver) {
    const method = Reflect.get(target, property, receiver);
    if (property !== "upsert" || typeof method !== "function") {
      return method;
    }
    return (...args: unknown[]) => runIssue34MatchUpsert(
      method as (...methodArgs: unknown[]) => unknown,
      target,
      args,
      state,
    );
  },
});

const createIssue34GuardedTransactionClient = (
  transactionClient: unknown,
  eventId: string,
  state: Issue34FailureState,
): object => {
  const delegates = transactionClient as {
    events: object;
    matches: object;
  };
  const guardedEventDelegate = createIssue34GuardedEventDelegate(
    delegates.events,
    eventId,
    state,
  );
  const guardedMatchesDelegate = createIssue34GuardedMatchesDelegate(
    delegates.matches,
    state,
  );
  return new Proxy(delegates, {
    get(target, property, receiver) {
      if (property === "events") {
        return guardedEventDelegate;
      }
      if (property === "matches") {
        return guardedMatchesDelegate;
      }
      return Reflect.get(target, property, receiver);
    },
  });
};


const runIssue34Transaction = (
  originalTransaction: (...args: unknown[]) => Promise<unknown>,
  transactionOrQueries: unknown,
  options: unknown,
  eventId: string,
  state: Issue34FailureState,
): Promise<unknown> => {
  if (typeof transactionOrQueries !== "function") {
    return options === undefined
      ? originalTransaction(transactionOrQueries)
      : originalTransaction(transactionOrQueries, options);
  }
  const guardedCallback = async (transactionClient: unknown) => (
    (transactionOrQueries as (client: unknown) => unknown)(
      createIssue34GuardedTransactionClient(transactionClient, eventId, state),
    )
  );
  return options === undefined
    ? originalTransaction(guardedCallback)
    : originalTransaction(guardedCallback, options);
};

const createIssue34GuardedPrismaClient = (
  databaseClient: Issue34PrismaClient,
  eventId: string,
  state: Issue34FailureState,
): Issue34PrismaClient => {
  const originalTransaction = databaseClient.$transaction.bind(databaseClient);
  return new Proxy(databaseClient, {
    get(target, property, receiver) {
      if (property !== "$transaction") {
        return Reflect.get(target, property, receiver);
      }
      return (transactionOrQueries: unknown, options?: unknown) => (
        runIssue34Transaction(
          originalTransaction,
          transactionOrQueries,
          options,
          eventId,
          state,
        )
      );
    },
  }) as Issue34PrismaClient;
};
describeDatabase("Issue 34 Tournament Event Editor create rollback", () => {
  afterEach(async () => {
    await cleanupIssue34Fixtures();
    requireSessionMock.mockReset();
  });

  it("persists and replays a direct Tournament CREATE_ONLY graph", async () => {
    const operationId = `issue-34-direct-${randomUUID()}`;
    const fixture: Issue34RichTournamentFixture = {
      eventId: "",
      fieldId: `${operationId}:field`,
      timeSlotId: `${operationId}:time-slot`,
      divisionId: `${operationId}:division`,
      officialId: `issue34-official-${operationId.slice(-8)}`,
      assistantHostId: `issue34-assistant-${operationId.slice(-8)}`,
      refereePositionId: `${operationId}:referee-position`,
      scorekeeperId: `issue34-scorekeeper-${operationId.slice(-8)}`,
      scorekeeperPositionId: `${operationId}:scorekeeper-position`,
    };
    issue34OperationIds.push(operationId);
    issue34FieldIds.push(fixture.fieldId);
    issue34TimeSlotIds.push(fixture.timeSlotId);
    await seedIssue34StaffUsers(fixture);
    requireSessionMock.mockResolvedValue({
      userId: ISSUE34_HOST_ID,
      isAdmin: false,
    });

    const bootstrapResponse = await eventEditorGet(new NextRequest(
      `http://localhost/api/events/editor?mode=CREATE&eventType=TOURNAMENT&start=${encodeURIComponent(ISSUE34_START)}`,
    ));
    expect(bootstrapResponse.status).toBe(200);
    const bootstrap = await bootstrapResponse.json() as Issue34BootstrapResponse;
    const draft = buildIssue34RichTournamentDraft(
      bootstrap.snapshot.draft,
      fixture,
      false,
    );
    const command = {
      contractVersion: bootstrap.contractVersion,
      createOperationId: operationId,
      draft,
      completion: { mode: "CREATE_ONLY" },
      hasScheduleProposalSupport: false,
      expectedRevisions: {
        editorRevision: bootstrap.snapshot.editorRevision,
        staffRevision: bootstrap.snapshot.staffRevision,
        scheduleRevision: bootstrap.snapshot.scheduleState.revision,
      },
    };

    const firstResponse = await eventEditorPost(new NextRequest(
      "http://localhost/api/events/editor",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(command),
      },
    ));
    const firstBody = await firstResponse.json();
    expect(firstResponse.status).toBe(201);
    const firstResult = parseEventEditorCreateResult(firstBody);
    expect(firstResult.createOperationId).toBe(operationId);
    expect(firstResult.snapshot.eventId).toBeTruthy();
    fixture.eventId = firstResult.snapshot.eventId!;
    issue34EventIds.push(fixture.eventId);
    expectIssue34CreateOnlyGraph(firstResult, fixture);
    const firstState = await loadIssue34DirectState(
      fixture.eventId,
      operationId,
      fixture.fieldId,
      fixture.timeSlotId,
    );
    expectIssue34DirectPersistence(firstState, firstResult, fixture);

    const secondResponse = await eventEditorPost(new NextRequest(
      "http://localhost/api/events/editor",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(command),
      },
    ));
    const secondBody = await secondResponse.json();
    expect(secondResponse.status).toBe(201);
    const secondResult = parseEventEditorCreateResult(secondBody);
    expect(secondBody).toEqual(firstBody);
    expect(secondResult).toEqual(firstResult);
    const secondState = await loadIssue34DirectState(
      fixture.eventId,
      operationId,
      fixture.fieldId,
      fixture.timeSlotId,
    );
    expect(secondState.event?.id).toBe(firstState.event?.id);
    expect(secondState.matches.map((match) => match.id)).toEqual(
      firstState.matches.map((match) => match.id),
    );
    expect(secondState.divisions).toHaveLength(firstState.divisions.length);
    expect(secondState.teams).toHaveLength(firstState.teams.length);
    expect(secondState.matches).toHaveLength(firstState.matches.length);
    expect(secondState.phaseSources).toHaveLength(firstState.phaseSources.length);
    expect(secondState.phaseParticipants).toHaveLength(
      firstState.phaseParticipants.length,
    );
    expect(secondState.fields).toHaveLength(firstState.fields.length);
    expect(secondState.timeSlots).toHaveLength(firstState.timeSlots.length);
    expect(secondState.officials).toHaveLength(firstState.officials.length);
  });

});
describeDatabase("Issue 34 Tournament Event Editor create rollback", () => {
  afterEach(async () => {
    await cleanupIssue34Fixtures();
    requireSessionMock.mockReset();
  });

  it("rolls back Tournament domain writes when proposal acceptance fails after schedule persistence", async () => {
    const operationId = `issue-34-create-${randomUUID()}`;
    const fixture: Issue34TournamentFailureFixture = {
      eventId: "",
      fieldId: `${operationId}:field`,
      timeSlotId: `${operationId}:time-slot`,
      divisionId: `${operationId}:division`,
    };
    issue34OperationIds.push(operationId);
    issue34FieldIds.push(fixture.fieldId);
    issue34TimeSlotIds.push(fixture.timeSlotId);
    const actor = { userId: ISSUE34_HOST_ID, isAdmin: false };
    requireSessionMock.mockResolvedValue(actor);

    const bootstrapResponse = await eventEditorGet(new NextRequest(
      `http://localhost/api/events/editor?mode=CREATE&eventType=TOURNAMENT&start=${encodeURIComponent(ISSUE34_START)}`,
    ));
    expect(bootstrapResponse.status).toBe(200);
    const bootstrap = await bootstrapResponse.json() as Issue34BootstrapResponse;
    const draft = buildIssue34TournamentDraft(bootstrap.snapshot.draft, fixture);
    const proposalResponse = await eventEditorPost(new NextRequest(
      "http://localhost/api/events/editor",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contractVersion: bootstrap.contractVersion,
          createOperationId: operationId,
          draft,
          completion: { mode: "CREATE_AND_BUILD_SCHEDULE" },
          hasScheduleProposalSupport: true,
          expectedRevisions: {
            editorRevision: bootstrap.snapshot.editorRevision,
            staffRevision: bootstrap.snapshot.staffRevision,
            scheduleRevision: bootstrap.snapshot.scheduleState.revision,
          },
        }),
      },
    ));
    const proposalResponseBody = await proposalResponse.json() as Issue34CreateProposalResponse & {
      error?: string;
      details?: string;
    };
    if (proposalResponse.status !== 202) {
      throw new Error(
        `Issue 34 proposal failed: ${JSON.stringify(proposalResponseBody)}`,
      );
    }
    const proposal = proposalResponseBody;
    expect(proposal.status).toBe("PROPOSED");
    expect(proposal.createOperationId).toBe(operationId);
    fixture.eventId = proposal.eventId;
    issue34EventIds.push(fixture.eventId);

    const proposalRows = await prisma.eventEditorCreateOperations.findMany({
      where: { createOperationId: operationId },
      select: {
        eventId: true,
        responseStatus: true,
        responseJson: true,
        proposalJson: true,
        proposalRevision: true,
        proposalStatus: true,
        emailDelivery: true,
      },
    });
    expect(proposalRows).toHaveLength(1);
    expect(proposalRows[0]).toMatchObject({
      eventId: fixture.eventId,
      responseStatus: 202,
      responseJson: null,
      proposalRevision: proposal.proposalRevision,
      proposalStatus: "PENDING",
      emailDelivery: "PROPOSED",
    });
    expect(proposalRows[0]?.proposalJson).not.toBeNull();

    const [proposalEvent, proposalDivisions, proposalMatches] = await Promise.all([
      prisma.events.findUnique({ where: { id: fixture.eventId } }),
      prisma.divisions.findMany({ where: { eventId: fixture.eventId } }),
      prisma.matches.findMany({ where: { eventId: fixture.eventId } }),
    ]);
    expect(proposalEvent).toBeNull();
    expect(proposalDivisions).toHaveLength(0);
    expect(proposalMatches).toHaveLength(0);

    // The real acceptance transaction writes the Event, Divisions, and Match Graph
    // before `persistSerializedScheduleGraph` updates the Event schedule. Wrap the
    // transaction client and throw after that schedule update because no production
    // failure hook can inject at this boundary.
    await prisma.events.count();
    const globalPrisma = globalThis as { prisma?: Issue34PrismaClient };
    const databaseClient = globalPrisma.prisma;
    if (!databaseClient) {
      throw new Error("The global Prisma client was not initialized.");
    }
    const failureState: Issue34FailureState = {
      injectedFailure: false,
      graphMatchPersisted: false,
    };
    const guardedDatabaseClient = createIssue34GuardedPrismaClient(
      databaseClient,
      fixture.eventId,
      failureState,
    );
    globalPrisma.prisma = guardedDatabaseClient;

    let acceptanceResponse: Response;
    try {
      acceptanceResponse = await eventEditorPut(new NextRequest(
        "http://localhost/api/events/editor",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contractVersion: bootstrap.contractVersion,
            createOperationId: operationId,
            proposalRevision: proposal.proposalRevision,
            draft,
          }),
        },
      ));
    } finally {
      globalPrisma.prisma = databaseClient;
    }

    const acceptanceBody = await acceptanceResponse.json() as {
      error?: string;
    };
    expect(failureState.graphMatchPersisted).toBe(true);
    expect(failureState.injectedFailure).toBe(true);
    expect(acceptanceResponse.status).toBe(500);
    expect(acceptanceBody.error).toContain(
      "Unable to save event editor configuration.",
    );
    expect(acceptanceBody.error).toContain(
      "Issue 34 injected acceptance failure after schedule persistence",
    );

    const [
      event,
      divisions,
      teams,
      matches,
      phaseSources,
      phaseParticipants,
      fields,
      timeSlots,
      receipt,
    ] = await Promise.all([
      prisma.events.findUnique({ where: { id: fixture.eventId } }),
      prisma.divisions.findMany({
        where: { eventId: fixture.eventId },
        select: { id: true, role: true },
      }),
      prisma.teams.findMany({ where: { eventId: fixture.eventId } }),
      prisma.matches.findMany({
        where: { eventId: fixture.eventId },
        select: { id: true, placementState: true, start: true, end: true, fieldId: true },
      }),
      prisma.eventDivisionPhaseSources.findMany({
        where: { eventId: fixture.eventId },
      }),
      prisma.eventDivisionPhaseParticipants.findMany({
        where: { eventId: fixture.eventId },
      }),
      prisma.fields.findMany({ where: { id: fixture.fieldId } }),
      prisma.timeSlots.findMany({ where: { id: fixture.timeSlotId } }),
      prisma.eventEditorCreateOperations.findUnique({
        where: { createOperationId: operationId },
        select: {
          eventId: true,
          responseStatus: true,
          responseJson: true,
          proposalJson: true,
          proposalRevision: true,
          proposalStatus: true,
          emailDelivery: true,
        },
      }),
    ]);

    expect(event).toBeNull();
    expect(divisions).toHaveLength(0);
    expect(teams).toHaveLength(0);
    expect(matches).toHaveLength(0);
    expect(phaseSources).toHaveLength(0);
    expect(phaseParticipants).toHaveLength(0);
    expect(fields).toHaveLength(0);
    expect(timeSlots).toHaveLength(0);
    expect(receipt).toMatchObject({
      eventId: fixture.eventId,
      responseStatus: 202,
      responseJson: null,
      proposalRevision: proposal.proposalRevision,
      proposalStatus: "PENDING",
      emailDelivery: "PROPOSED",
    });
    expect(receipt?.proposalJson).not.toBeNull();
  });
  it("accepts a Tournament schedule proposal into durable domain state", async () => {
    const operationId = `issue-34-accept-${randomUUID()}`;
    const fixture: Issue34RichTournamentFixture = {
      eventId: "",
      fieldId: `${operationId}:field`,
      timeSlotId: `${operationId}:time-slot`,
      divisionId: `${operationId}:division`,
      officialId: `issue34-official-${operationId.slice(-8)}`,
      assistantHostId: `issue34-assistant-${operationId.slice(-8)}`,
      refereePositionId: `${operationId}:referee-position`,
      scorekeeperId: `issue34-scorekeeper-${operationId.slice(-8)}`,
      scorekeeperPositionId: `${operationId}:scorekeeper-position`,
    };
    issue34OperationIds.push(operationId);
    issue34FieldIds.push(fixture.fieldId);
    issue34TimeSlotIds.push(fixture.timeSlotId);
    await seedIssue34StaffUsers(fixture);
    const actor = { userId: ISSUE34_HOST_ID, isAdmin: false };
    requireSessionMock.mockResolvedValue(actor);

    const bootstrapResponse = await eventEditorGet(new NextRequest(
      `http://localhost/api/events/editor?mode=CREATE&eventType=TOURNAMENT&start=${encodeURIComponent(ISSUE34_START)}`,
    ));
    expect(bootstrapResponse.status).toBe(200);
    const bootstrap = await bootstrapResponse.json() as Issue34BootstrapResponse;
    const draft = buildIssue34RichTournamentDraft(
      bootstrap.snapshot.draft,
      fixture,
      true,
    );
    const proposalResponse = await eventEditorPost(new NextRequest(
      "http://localhost/api/events/editor",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contractVersion: bootstrap.contractVersion,
          createOperationId: operationId,
          draft,
          completion: { mode: "CREATE_AND_BUILD_SCHEDULE" },
          hasScheduleProposalSupport: true,
          expectedRevisions: {
            editorRevision: bootstrap.snapshot.editorRevision,
            staffRevision: bootstrap.snapshot.staffRevision,
            scheduleRevision: bootstrap.snapshot.scheduleState.revision,
          },
        }),
      },
    ));
    const proposalResponseBody = await proposalResponse.json();
    const proposal = expectIssue34ProposalResponse(
      proposalResponse.status,
      proposalResponseBody,
      operationId,
      fixture,
    );
    expectIssue34RichGraphSemantics(proposal.graph, fixture);

    fixture.eventId = proposal.eventId;
    issue34EventIds.push(fixture.eventId);

    await expectIssue34ProposalNotPersisted(fixture.eventId);

    const acceptanceResponse = await eventEditorPut(new NextRequest(
      "http://localhost/api/events/editor",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contractVersion: bootstrap.contractVersion,
          createOperationId: operationId,
          proposalRevision: proposal.proposalRevision,
          draft,
        }),
      },
    ));
    const acceptanceResponseBody = await acceptanceResponse.json();
    expectIssue34AcceptedResponse(
      acceptanceResponse.status,
      acceptanceResponseBody,
      operationId,
      fixture.eventId,
      proposal,
    );

    const persistedState = await loadIssue34DirectState(
      fixture.eventId,
      operationId,
      fixture.fieldId,
      fixture.timeSlotId,
    );
    const acceptanceState =
      persistedState as unknown as Issue34PersistedAcceptanceState;
    expectIssue34DurableAcceptance(
      acceptanceState,
      draft,
      proposal,
      fixture,
      operationId,
    );
  });
});
