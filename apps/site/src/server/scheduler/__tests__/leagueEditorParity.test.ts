/** @jest-environment node */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  EVENT_EDITOR_CONTRACT_VERSION,
  parseCreateEventEditorCommand,
  type CreateEventEditorCommand,
  type EventEditorDraft,
} from "@/contracts/eventEditor";
import { EventBuilder } from "@/server/scheduler/EventBuilder";
import { matchDemandFromGraph } from "@/server/scheduler/matchGraph";
import {
  Division,
  League,
  PlayingField,
  TimeSlot,
} from "@/server/scheduler/types";

const context = {
  log: () => {},
  error: () => {},
};
const sharedParityDraft = JSON.parse(
  readFileSync(
    resolve(
      __dirname,
      "../../../../../../test-fixtures/event-editor/league-parity-draft.json",
    ),
    "utf8",
  ),
) as EventEditorDraft;
type LeagueParityWebGolden = {
  command: CreateEventEditorCommand;
  matchDemand: ReturnType<typeof matchDemandFromGraph>;
};
const sharedParityWebGolden = JSON.parse(
  readFileSync(
    resolve(
      __dirname,
      "../../../../../../test-fixtures/event-editor/league-parity-web-golden.json",
    ),
    "utf8",
  ),
) as LeagueParityWebGolden;
const sharedParityCommand = parseCreateEventEditorCommand(
  sharedParityWebGolden.command,
);


const buildParityLeague = (draft: EventEditorDraft): League => {
  const entryDetail = draft.competition.divisionDetails[0];
  const playoffDetail = draft.competition.playoffDivisionDetails[0];
  const entryDivision = new Division(
    entryDetail.id,
    entryDetail.name,
    entryDetail.fieldIds,
    entryDetail.price,
    entryDetail.maxParticipants,
    entryDetail.playoffTeamCount,
    "LEAGUE",
    entryDetail.playoffPlacementDivisionIds,
    entryDetail.standingsOverrides,
    entryDetail.standingsConfirmedAt ? new Date(entryDetail.standingsConfirmedAt) : null,
    entryDetail.standingsConfirmedBy,
    null,
    entryDetail.teamIds,
    {
      gamesPerOpponent: draft.competition.gamesPerOpponent ?? 1,
      usesSets: draft.competition.usesSets,
      setsPerMatch: draft.competition.setsPerMatch ?? 1,
      setDurationMinutes: draft.competition.setDurationMinutes ?? 0,
      matchDurationMinutes: draft.competition.matchDurationMinutes ?? 0,
      restTimeMinutes: draft.competition.restTimeMinutes ?? 0,
      pointsToVictory: draft.competition.pointsToVictory,
    },
    {},
    "PHASE",
    "LEAGUE",
    entryDetail.sourceDivisionId,
    entryDetail.isSystemGenerated ?? false,
  );
  const playoffDivision = new Division(
    playoffDetail.id,
    playoffDetail.name,
    playoffDetail.fieldIds,
    playoffDetail.price,
    playoffDetail.maxParticipants,
    playoffDetail.playoffTeamCount,
    "PLAYOFF",
    playoffDetail.playoffPlacementDivisionIds,
    playoffDetail.standingsOverrides,
    playoffDetail.standingsConfirmedAt ? new Date(playoffDetail.standingsConfirmedAt) : null,
    playoffDetail.standingsConfirmedBy,
    null,
    playoffDetail.teamIds,
    null,
    {},
    "PHASE",
    "PLAYOFF",
    playoffDetail.sourceDivisionId,
    playoffDetail.isSystemGenerated ?? false,
  );
  const field = new PlayingField({
    id: draft.resources.fields[0].id as string,
    divisions: [entryDivision, playoffDivision],
    name: draft.resources.fields[0].name as string,
  });
  const timeSlot = new TimeSlot({
    id: draft.resources.timeSlots[0].id as string,
    dayOfWeek: 2,
    daysOfWeek: [2, 4],
    startTimeMinutes: 600,
    endTimeMinutes: 660,
    startDate: new Date(draft.basics.start),
    endDate: new Date(draft.schedule.endConstraint as string),
    timeZone: draft.basics.timeZone,
    scheduledFieldIds: [field.id],
    divisions: [entryDivision.id],
    repeating: false,
  });
  return new League({
    id: "event_editor_league_parity",
    name: draft.basics.name,
    description: draft.basics.description,
    start: new Date(draft.basics.start),
    end: new Date(draft.schedule.endConstraint as string),
    maxParticipants: draft.participation.maxParticipants as number,
    teamSignup: draft.participation.teamSignup,
    singleDivision: draft.participation.singleDivision,
    eventType: draft.basics.eventType,
    divisions: [entryDivision],
    playoffDivisions: [playoffDivision],
    fields: { [field.id]: field },
    timeSlots: [timeSlot],
    teams: {},
    gamesPerOpponent: draft.competition.gamesPerOpponent as number,
    includePlayoffs: draft.competition.includePlayoffs,
    playoffTeamCount: draft.competition.playoffTeamCount as number,
    splitLeaguePlayoffDivisions: draft.competition.splitLeaguePlayoffDivisions,
    doubleElimination: draft.competition.doubleElimination,
    winnerSetCount: draft.competition.winnerSetCount as number,
    loserSetCount: draft.competition.loserSetCount as number,
    winnerBracketPointsToVictory: draft.competition.winnerBracketPointsToVictory,
    loserBracketPointsToVictory: draft.competition.loserBracketPointsToVictory,
    usesSets: draft.competition.usesSets,
    setsPerMatch: draft.competition.setsPerMatch as number,
    setDurationMinutes: draft.competition.setDurationMinutes as number,
    matchDurationMinutes: draft.competition.matchDurationMinutes as number,
    restTimeMinutes: draft.competition.restTimeMinutes as number,
    pointsToVictory: draft.competition.pointsToVictory,
  });
};

describe("League editor parity", () => {
  it("matches the canonical web command fields used by mobile", () => {
    const command = sharedParityCommand;
    expect(command.contractVersion).toBe(EVENT_EDITOR_CONTRACT_VERSION);
    expect(command.draft).toEqual(sharedParityDraft);

    expect(command.draft).toMatchObject({
      basics: {
        eventType: "LEAGUE",
        name: "Canonical League",
        sportIds: ["sport_pickleball"],
      },
      participation: {
        teamSignup: true,
        singleDivision: false,
        maxParticipants: 4,
      },
      registration: {
        payment: { mode: "FREE", priceCents: 0 },
      },
      competition: {
        divisionIds: ["division-1"],
        includePlayoffs: true,
        playoffTeamCount: 4,
        doubleElimination: true,
        usesSets: true,
        setsPerMatch: 3,
        gamesPerOpponent: 2,
        matchDurationMinutes: 60,
        setDurationMinutes: 20,
        restTimeMinutes: 10,
        divisionDetails: [{ id: "division-1", maxParticipants: 4, playoffTeamCount: 4 }],
        playoffDivisionDetails: [{ id: "playoff-division-1", kind: "PLAYOFF" }],
      },
      schedule: {
        mode: "FIXED_END",
        endConstraint: sharedParityCommand.draft.schedule.endConstraint,
        isAutomatedScheduling: true,
      },
      resources: {
        fieldIds: ["field-1"],
        timeSlotIds: ["slot-1"],
      },
      staff: {
        staffingPriority: "OFFICIAL_COVERAGE_REQUIRED",
        officialIds: ["official-1"],
        teamCheckInMode: "MATCH",
      },
    });
    expect(command.contractVersion).toBe(sharedParityWebGolden.command.contractVersion);
    expect(command.createOperationId).toBe(sharedParityWebGolden.command.createOperationId);
    expect(command.expectedRevisions).toEqual(sharedParityWebGolden.command.expectedRevisions);
    expect(command.completion).toEqual(sharedParityWebGolden.command.completion);
    expect(command.hasScheduleProposalSupport).toBe(
      sharedParityWebGolden.command.hasScheduleProposalSupport,
    );
  });

  it("derives the shared League Match Demand from the canonical web command", () => {
    const graph = new EventBuilder(
      buildParityLeague(sharedParityCommand.draft),
      context,
    ).buildMatchGraph();

    expect(matchDemandFromGraph(Object.values(graph.matches))).toEqual(
      sharedParityWebGolden.matchDemand,
    );
  });

});
