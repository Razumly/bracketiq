/** @jest-environment node */

jest.mock("@/lib/prisma", () => ({
  prisma: {},
}));

import { saveMatches } from "@/server/repositories/events";

describe("saveMatches", () => {
  it("replaces persisted match segments and incidents in batches when bulk writes are available", async () => {
    const client = {
      matches: {
        upsert: jest.fn().mockResolvedValue(undefined),
      },
      matchSegments: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        upsert: jest.fn(),
      },
      matchIncidents: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        upsert: jest.fn(),
      },
    };

    await saveMatches(
      "event_1",
      [
        {
          id: "match_1",
          matchId: 1,
          locked: false,
          losersBracket: false,
          team1Points: [25, 18],
          team2Points: [21, 16],
          segments: [
            {
              id: "match_1_segment_1",
              sequence: 1,
              status: "COMPLETE",
              scores: { team_1: 25, team_2: 21 },
              winnerEventTeamId: "team_1",
              startedAt: "2026-04-22T18:00:00.000Z",
              endedAt: "2026-04-22T18:20:00.000Z",
            },
            {
              id: "match_1_segment_2",
              sequence: 2,
              status: "IN_PROGRESS",
              scores: { team_1: 18, team_2: 16 },
              winnerEventTeamId: null,
              startedAt: "2026-04-22T18:22:00.000Z",
              endedAt: null,
            },
          ],
          incidents: [
            {
              id: "incident_1",
              segmentId: "match_1_segment_2",
              eventTeamId: "team_1",
              eventRegistrationId: "registration_1",
              participantUserId: "player_1",
              officialUserId: "official_1",
              incidentType: "POINT",
              sequence: 1,
              linkedPointDelta: 1,
            },
          ],
        },
        {
          id: "match_2",
          matchId: 2,
          locked: true,
          losersBracket: false,
          team1Points: [],
          team2Points: [],
        },
      ] as any,
      client as any,
    );

    expect(client.matches.upsert).toHaveBeenCalledTimes(2);

    expect(client.matchSegments.deleteMany).toHaveBeenCalledWith({
      where: { matchId: { in: ["match_1"] } },
    });
    expect(client.matchSegments.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          id: "match_1_segment_1",
          eventId: "event_1",
          matchId: "match_1",
          sequence: 1,
          status: "COMPLETE",
          scores: { team_1: 25, team_2: 21 },
          winnerEventTeamId: "team_1",
        }),
        expect.objectContaining({
          id: "match_1_segment_2",
          eventId: "event_1",
          matchId: "match_1",
          sequence: 2,
          status: "IN_PROGRESS",
          scores: { team_1: 18, team_2: 16 },
          winnerEventTeamId: null,
        }),
      ],
    });
    expect(client.matchSegments.upsert).not.toHaveBeenCalled();

    expect(client.matchIncidents.deleteMany).toHaveBeenCalledWith({
      where: { matchId: { in: ["match_1"] } },
    });
    expect(client.matchIncidents.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          id: "incident_1",
          eventId: "event_1",
          matchId: "match_1",
          segmentId: "match_1_segment_2",
          incidentType: "POINT",
          linkedPointDelta: 1,
        }),
      ],
    });
    expect(client.matchIncidents.upsert).not.toHaveBeenCalled();
  });
  it("persists Match Graph nodes as unplaced without schedule boundaries", async () => {
    const client = {
      matches: {
        upsert: jest.fn().mockResolvedValue(undefined),
      },
    };

    await saveMatches(
      "event_graph",
      [
        {
          id: "event_graph:match:1",
          matchId: 1,
          placementState: "UNPLACED",
          start: new Date("2026-04-22T18:00:00.000Z"),
          end: new Date("2026-04-22T19:00:00.000Z"),
          field: null,
          division: { id: "division_1" },
          team1: null,
          team2: null,
          official: null,
          officialAssignments: [],
          teamOfficial: null,
          previousLeftMatch: null,
          previousRightMatch: null,
          winnerNextMatch: null,
          loserNextMatch: null,
          team1Points: [],
          team2Points: [],
          segments: [],
          incidents: [],
        },
      ] as any,
      client as any,
    );

    expect(client.matches.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          id: "event_graph:match:1",
          matchId: 1,
          placementState: "UNPLACED",
          start: null,
          end: null,
          fieldId: null,
        }),
      }),
    );
  });
  it("persists phase-specific official slots for bracket matches", async () => {
    const upsert = jest.fn().mockResolvedValue(undefined);
    const client = {
      events: {
        findUnique: jest.fn().mockResolvedValue({
          start: new Date("2026-04-22T17:00:00.000Z"),
          end: new Date("2026-04-22T20:00:00.000Z"),
          officialPositions: [
            { id: "event_referee", name: "Event Referee", count: 1, order: 0 },
          ],
        }),
      },
      matches: { upsert, findMany: jest.fn().mockResolvedValue([]) },
    };
    const phasePositions = [
      { id: "bracket_referee", name: "Bracket Referee", count: 2, order: 0 },
    ];

    await saveMatches(
      "event_phase_positions",
      [
        {
          id: "match_bracket",
          matchId: 1,
          locked: true,
          placementState: "PLACED",
          start: new Date("2026-04-22T18:00:00.000Z"),
          end: new Date("2026-04-22T19:00:00.000Z"),
          field: { id: "field_1" },
          division: {
            id: "division_playoff",
            kind: "PLAYOFF",
            phase: "BRACKET",
            phaseSettings: {
              BRACKET: { officialPositions: phasePositions },
            },
          },
          official: { id: "official_1" },
          officialCheckedIn: true,
          officialAssignments: [{
            positionId: "bracket_referee",
            slotIndex: 0,
            holderType: "OFFICIAL",
            userId: "official_1",
            eventOfficialId: "event_official_1",
            checkedIn: true,
            hasConflict: false,
          }],
          team1Points: [],
          team2Points: [],
        },
      ] as any,
      client as any,
    );

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        officialId: "official_1",
        officialIds: [
          expect.objectContaining({
            positionId: "bracket_referee",
            slotIndex: 0,
            userId: "official_1",
          }),
          expect.objectContaining({
            positionId: "bracket_referee",
            slotIndex: 1,
            userId: null,
          }),
        ],
      }),
    }));
  });
});
