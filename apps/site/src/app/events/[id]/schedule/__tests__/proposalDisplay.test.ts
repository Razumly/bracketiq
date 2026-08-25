import {
  formatProposalTime,
  proposalAssignmentLabels,
  proposalDisplayErrors,
  proposalDisplayWarnings,
} from "../proposalDisplay";

describe("schedule proposal display", () => {
  it("resolves serialized official and team assignment IDs to labels", () => {
    const graphEvent = {
      officialPositions: [{ id: "position_referee", name: "Referee" }],
      officials: [
        { id: "official_riley", firstName: "Riley", lastName: "Referee" },
      ],
      eventOfficials: [
        { id: "event_official_riley", userId: "official_riley" },
      ],
      teams: [{ id: "team_court", name: "Court Legends" }],
    };
    const match = {
      officialAssignments: [
        {
          positionId: "position_referee",
          userId: "official_riley",
          eventOfficialId: "event_official_riley",
        },
      ],
      teamOfficialId: "team_court",
    };

    expect(proposalAssignmentLabels(match, graphEvent)).toEqual([
      "Referee: Riley Referee",
      "Team official: Court Legends",
    ]);
    expect(proposalAssignmentLabels(match, graphEvent).join(" ")).not.toContain(
      "official_riley",
    );
  });
  it("treats an unassigned officiating slot as an error", () => {
    const proposal = {
      snapshot: { draft: { basics: { timeZone: "UTC" } } },
      graph: {
        event: {
          fields: [],
          teams: [],
          officials: [],
          eventOfficials: [],
          officialPositions: [{ id: "position_referee", name: "Referee" }],
        },
        matches: [
          {
            id: "match-1",
            matchId: 1,
            officialAssignments: [
              {
                positionId: "position_referee",
                userId: null,
                eventOfficialId: null,
              },
            ],
          },
        ],
      },
      scheduleOutcome: {
        matchCount: 1,
        matches: [
          {
            matchId: 1,
            team1Id: null,
            team2Id: null,
            fieldId: null,
            start: "2026-01-05T05:00:00.000Z",
            end: "2026-01-05T06:00:00.000Z",
          },
        ],
      },
    } as unknown as Parameters<typeof proposalDisplayWarnings>[0];

    expect(proposalDisplayErrors(proposal)).not.toContain(
      "Match 1 has an unavailable official label.",
    );
    expect(proposalDisplayErrors(proposal)).toContain(
      "Match 1 has an unassigned officiating slot.",
    );
  });
  it("resolves phase-specific officiating positions and team duty", () => {
    const proposal = {
      snapshot: { draft: { basics: { timeZone: "UTC" } } },
      graph: {
        event: {
          fields: [{ id: "field-1", name: "Court 1" }],
          teams: [{ id: "team-1", name: "Team One" }],
          officials: [
            { id: "official-1", firstName: "Riley", lastName: "Referee" },
          ],
          eventOfficials: [],
          officialPositions: [],
          doTeamsOfficiate: false,
          divisionDetails: [
            {
              id: "phase-pool",
              sourceDivisionId: "entry",
              phaseSettings: {
                POOL: {
                  doTeamsOfficiate: true,
                  officialPositions: [
                    { id: "position_line", name: "Line judge", count: 1 },
                  ],
                },
              },
            },
          ],
        },
        matches: [
          {
            id: "match-1",
            matchId: 1,
            division: "entry",
            sourceDivisionId: "entry",
            phaseDivisionId: "phase-pool",
            phase: "POOL",
            placementState: "PLACED",
            start: "2026-01-05T05:00:00.000Z",
            end: "2026-01-05T06:00:00.000Z",
            fieldId: "field-1",
            officialAssignments: [
              {
                positionId: "position_line",
                slotIndex: 0,
                userId: "official-1",
              },
            ],
            teamOfficialId: "team-1",
          },
        ],
      },
      scheduleOutcome: {
        matchCount: 1,
        matches: [
          {
            matchId: 1,
            team1Id: null,
            team2Id: null,
            fieldId: "field-1",
            start: "2026-01-05T05:00:00.000Z",
            end: "2026-01-05T06:00:00.000Z",
          },
        ],
      },
    } as unknown as Parameters<typeof proposalDisplayWarnings>[0];

    expect(proposalDisplayErrors(proposal)).not.toEqual(
      expect.arrayContaining([
        "Match 1 has an unavailable officiating position.",
        "Match 1 has no proposed team official.",
      ]),
    );
  });



  it("formats proposed times in the event time zone", () => {
    expect(
      formatProposalTime("2026-01-05T05:00:00.000Z", "America/Detroit"),
    ).toBe("Jan 5, 12:00 AM");
  });
  it("blocks acceptance when a referenced display label is missing", () => {
    const proposal = {
      snapshot: { draft: { basics: { timeZone: "UTC" } } },
      graph: {
        event: {
          fields: [{ id: "field-1", name: "" }],
          teams: [{ id: "team-1", name: "" }],
          officials: [],
          eventOfficials: [],
          officialPositions: [],
        },
        matches: [
          { id: "match-1", matchId: 1, team1Id: "team-1", fieldId: "field-1" },
        ],
      },
      scheduleOutcome: {
        matchCount: 1,
        matches: [
          {
            matchId: 1,
            team1Id: "team-1",
            team2Id: null,
            fieldId: "field-1",
            start: "2026-01-05T05:00:00.000Z",
            end: "2026-01-05T06:00:00.000Z",
          },
        ],
      },
    } as unknown as Parameters<typeof proposalDisplayErrors>[0];

    expect(proposalDisplayErrors(proposal)).toEqual(
      expect.arrayContaining([
        "Match 1 has an unavailable team label.",
        "Match 1 has an unavailable resource label.",
      ]),
    );
  });
});
