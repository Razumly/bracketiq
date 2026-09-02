/** @jest-environment node */

import { normalizeEventStaffingResponse } from "@/server/events/eventResponse";

describe("normalizeEventStaffingResponse", () => {
  it("removes inapplicable Tryout official staffing state while keeping hosts", () => {
    const response = normalizeEventStaffingResponse({
      eventType: "TRYOUT",
      staffingPriority: "PER_EVENT",
      officialSchedulingMode: "TEAM_STAFFING",
      officialPositions: [{ id: "position_1" }],
      officialIds: ["official_1"],
      eventOfficials: [{ id: "event_official_1" }],
      staffInvites: [
        { email: "official@example.com", staffTypes: ["OFFICIAL"] },
        { email: "host@example.com", staffTypes: ["HOST", "OFFICIAL"] },
      ],
      pendingStaffInvites: [
        { email: "assistant@example.com", roles: ["ASSISTANT_HOST", "OFFICIAL"] },
      ],
      doTeamsOfficiate: true,
      teamOfficialsMaySwap: true,
      teamCheckInMode: "MATCH",
      teamCheckInOpenMinutesBefore: 10,
      allowMatchRosterEdits: true,
      allowTemporaryMatchPlayers: true,
      autoCreatePointMatchIncidents: true,
    });

    expect(response).toEqual(expect.objectContaining({
      staffingPriority: "FULL_COVERAGE_WITH_CONFLICTS_ALLOWED",
      officialSchedulingMode: "OFF",
      officialPositions: [],
      officialIds: [],
      eventOfficials: [],
      doTeamsOfficiate: false,
      teamOfficialsMaySwap: false,
      teamCheckInMode: "OFF",
      teamCheckInOpenMinutesBefore: 60,
      allowMatchRosterEdits: false,
      allowTemporaryMatchPlayers: false,
      autoCreatePointMatchIncidents: false,
    }));
    expect(response.staffInvites).toEqual([
      { email: "official@example.com", staffTypes: [] },
      { email: "host@example.com", staffTypes: ["HOST"] },
    ]);
    expect(response.pendingStaffInvites).toEqual([
      { email: "assistant@example.com", roles: ["ASSISTANT_HOST"] },
    ]);
  });
});
