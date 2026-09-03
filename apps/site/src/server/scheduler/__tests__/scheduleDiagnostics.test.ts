import {
  diagnoseScheduleProposal,
  canonicalResourceIntervalsFor,
} from "../scheduleDiagnostics";
import {
  Division,
  League,
  Match,
  PlayingField,
  TimeSlot,
} from "../types";

const start = new Date("2026-09-03T09:00:00.000Z");
const end = new Date("2026-09-03T12:00:00.000Z");

const createEvent = (
  timeSlots: TimeSlot[],
  matchCount: number,
  matchDurationMinutes = 30,
): {
  event: League;
  matches: Match[];
} => {
  const division = new Division("division-1", "Division 1", ["field-1"]);
  const field = new PlayingField({ id: "field-1", name: "Court 1" });
  const event = new League({
    id: "event-1",
    start,
    end,
    name: "Diagnostics Event",
    maxParticipants: 8,
    teamSignup: true,
    eventType: "LEAGUE",
    fields: { [field.id]: field },
    divisions: [division],
    timeSlots,
    matchDurationMinutes,
    noFixedEndDateTime: false,
  });
  const matches = Array.from({ length: matchCount }, (_, index) => new Match({
    id: `match-${index + 1}`,
    eventId: event.id,
    division,
    start,
    end,
    bufferMs: 0,
  }));
  return { event, matches };
};

const oneTimeSlot = (
  id: string,
  slotStart: string,
  slotEnd: string,
  options: { divisions?: Division[]; fieldIds?: string[] } = {},
): TimeSlot => new TimeSlot({
  id,
  dayOfWeek: 3,
  startDate: new Date(`2026-09-03T${slotStart}:00.000Z`),
  endDate: new Date(`2026-09-03T${slotEnd}:00.000Z`),
  repeating: false,
  startTimeMinutes: Number(slotStart.slice(0, 2)) * 60 + Number(slotStart.slice(3)),
  endTimeMinutes: Number(slotEnd.slice(0, 2)) * 60 + Number(slotEnd.slice(3)),
  fieldIds: options.fieldIds ?? ["field-1"],
  divisions: options.divisions ?? [],
  timeZone: "UTC",
});

describe("schedule diagnostics", () => {
  it("uses the complete Match Graph and de-duplicates overlapping Resource windows", () => {
    const { event, matches } = createEvent([
      oneTimeSlot("slot-1", "09:00", "10:30"),
      oneTimeSlot("slot-2", "10:00", "11:30"),
    ], 4);

    const diagnostics = diagnoseScheduleProposal({ event, matches });

    expect(canonicalResourceIntervalsFor(event)).toHaveLength(1);
    expect(diagnostics.matchDemand.total).toBe(4);
    expect(diagnostics.estimatedCapacity).toBe(5);
    expect(diagnostics.estimatedCapacityIsUpperBound).toBe(true);
    expect(diagnostics.minimumDeficitMatches).toBe(0);
    expect(diagnostics.message).toBe("Total Resource capacity is not proven insufficient.");
    expect(diagnostics.restrictingFactors).toEqual([]);
  });

  it("reports a minimum deficit when even the Resource upper bound is too small", () => {
    const { event, matches } = createEvent([
      oneTimeSlot("slot-1", "09:00", "10:00"),
    ], 3);

    const diagnostics = diagnoseScheduleProposal({ event, matches });

    expect(diagnostics.estimatedCapacity).toBe(2);
    expect(diagnostics.minimumDeficitMatches).toBe(1);
    expect(diagnostics.message).toContain("minimum capacity deficit is 1 Matches");
    expect(diagnostics.restrictingFactors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        factor: "RESOURCE",
        confidence: "PROVEN_GLOBAL_BOUND",
      }),
    ]));
    expect(diagnostics.remedies).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "ADD_OR_EXTEND_TIME_SLOTS" }),
    ]));
  });

  it("identifies fragmented windows only when pooling their minutes reaches demand", () => {
    const { event, matches } = createEvent([
      oneTimeSlot("slot-1", "09:00", "09:45"),
      oneTimeSlot("slot-2", "10:00", "11:15"),
    ], 2, 60);

    const diagnostics = diagnoseScheduleProposal({ event, matches });

    expect(diagnostics.estimatedCapacity).toBe(1);
    expect(diagnostics.minimumDeficitMatches).toBe(1);
    expect(diagnostics.restrictingFactors).toEqual(expect.arrayContaining([
      expect.objectContaining({ factor: "FRAGMENTED_WINDOWS" }),
    ]));
    expect(diagnostics.remedies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "ADD_OR_EXTEND_TIME_SLOTS",
        factor: "FRAGMENTED_WINDOWS",
      }),
    ]));
  });

  it("does not offer a Resource remedy for an observed failure when capacity meets demand", () => {
    const { event, matches } = createEvent([
      oneTimeSlot("slot-1", "09:00", "11:00"),
    ], 2);

    const diagnostics = diagnoseScheduleProposal({
      event,
      matches,
      placementFailures: [{
        matchId: "match-2",
        message: "A custom candidate guard rejected the attempted placement.",
        restrictingFactor: "RESOURCE",
        searchExhaustive: false,
      }],
    });

    expect(diagnostics.estimatedCapacity).toBe(4);
    expect(diagnostics.minimumDeficitMatches).toBe(0);
    expect(diagnostics.remedies).toEqual([]);
    expect(diagnostics.restrictingFactors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        factor: "RESOURCE",
        confidence: "OBSERVED",
      }),
    ]));
  });

  it("uses the canonical non-causal message when an attempted cause is not proven", () => {
    const { event, matches } = createEvent([
      oneTimeSlot("slot-1", "09:00", "11:00"),
    ], 2);

    const diagnostics = diagnoseScheduleProposal({
      event,
      matches,
      placementFailures: [{
        matchId: "match-2",
        message: "The search ended without a proven cause.",
        restrictingFactor: "UNKNOWN",
        searchExhaustive: false,
      }],
    });

    expect(diagnostics.message).toBe(
      "The scheduler could not place all Matches. It did not prove one restricting factor.",
    );
    expect(diagnostics.remedies).toEqual([]);
  });
});
