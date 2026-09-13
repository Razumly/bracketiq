import type { LeagueSlotForm } from "@/app/discover/components/LeagueFields";

import {
  computeOneTimeSlotBoundsError,
  computeRepeatingSlotBoundsError,
  computeRepeatingSlotTemporalError,
  computeSlotError,
} from "../slotValidation";

const buildSlot = (
  overrides: Partial<LeagueSlotForm> = {},
): LeagueSlotForm => ({
  key: "slot-1",
  scheduledFieldId: "resource-1",
  scheduledFieldIds: ["resource-1"],
  dayOfWeek: 0,
  daysOfWeek: [0],
  divisions: ["division-1"],
  startDate: "2026-08-17T09:00:00",
  endDate: "2026-08-17T10:00:00",
  startTimeMinutes: 9 * 60,
  endTimeMinutes: 10 * 60,
  timeZone: "UTC",
  repeating: false,
  conflicts: [],
  checking: false,
  error: undefined,
  ...overrides,
});

describe("One-Time Time Slot editor validation", () => {
  it("accepts an ongoing slot but rejects an end equal to or before now", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-17T09:30:00Z"));
    try {
      const options = {
        slot: buildSlot(),
        eventStart: new Date("2026-08-17T00:00:00Z"),
        eventEnd: new Date("2026-08-18T00:00:00Z"),
      };
      expect(computeOneTimeSlotBoundsError(options)).toBeUndefined();
      jest.setSystemTime(new Date("2026-08-17T10:00:00Z"));
      expect(computeOneTimeSlotBoundsError(options)).toMatch(/future/i);
      jest.setSystemTime(new Date("2026-08-17T11:00:00Z"));
      expect(computeOneTimeSlotBoundsError(options)).toMatch(/future/i);
    } finally {
      jest.useRealTimers();
    }
  });

  it("identifies the conflicting Resource, local date, and both intervals", () => {
    const slots = [
      buildSlot(),
      buildSlot({
        key: "slot-2",
        startDate: "2026-08-17T09:30:00",
        endDate: "2026-08-17T10:30:00",
        startTimeMinutes: 9 * 60 + 30,
        endTimeMinutes: 10 * 60 + 30,
      }),
    ];

    expect(computeSlotError(slots, 0, "LEAGUE")).toMatch(
      /Resource "resource-1".*2026-08-17 09:00–10:00.*2026-08-17 09:30–10:30/,
    );
  });

  it("allows adjacency but rejects shared-Resource overlaps across disjoint Division scopes", () => {
    expect(
      computeSlotError(
        [
          buildSlot(),
          buildSlot({
            key: "adjacent",
            startDate: "2026-08-17T10:00:00",
            endDate: "2026-08-17T11:00:00",
            startTimeMinutes: 10 * 60,
            endTimeMinutes: 11 * 60,
          }),
        ],
        0,
        "LEAGUE",
      ),
    ).toBeUndefined();

    expect(
      computeSlotError(
        [
          buildSlot(),
          buildSlot({ key: "other-division", divisions: ["division-2"] }),
        ],
        0,
        "LEAGUE",
      ),
    ).toMatch(/Resource "resource-1".*disjoint Division scopes/);
  });

  it("reports fixed Event-bound violations instead of clipping", () => {
    expect(
      computeOneTimeSlotBoundsError({
        slot: buildSlot(),
        eventStart: new Date("2026-08-17T09:30:00.000Z"),
        eventEnd: new Date("2026-08-17T11:00:00.000Z"),
      }),
    ).toMatch(/outside the Event boundary.*rejected rather than clipped/);
  });
  it("reports a repeating slot with no matching weekday", () => {
    const repeatingSlot = buildSlot({
      repeating: true,
      daysOfWeek: [0],
      dayOfWeek: 0,
      startDate: "2026-08-18T00:00:00",
      endDate: "2026-08-19T00:00:00",
      startTimeMinutes: 9 * 60,
      endTimeMinutes: 10 * 60,
    });

    expect(
      computeRepeatingSlotTemporalError({
        slot: repeatingSlot,
        eventStart: new Date("2026-08-18T00:00:00.000Z"),
        eventEnd: new Date("2026-08-20T00:00:00.000Z"),
      }),
    ).toBe(
      "The selected date range contains no occurrence for the selected weekdays. Choose another date range or weekday.",
    );
  });

  it("reports a repeating slot outside an open Event Start boundary", () => {
    expect(
      computeRepeatingSlotBoundsError({
        slot: buildSlot({
          repeating: true,
          startDate: "2026-08-10T00:00:00",
          endDate: undefined,
        }),
        eventStart: new Date("2026-08-17T00:00:00.000Z"),
        eventEnd: null,
      }),
    ).toMatch(/Schedule Boundary Error: Repeating Time Slot is outside the Event boundary/);
  });
  it("reports an early occurrence before Event Start", () => {
    expect(
      computeRepeatingSlotBoundsError({
        slot: buildSlot({
          endDate: "2026-08-17T23:59:00",
          startDate: "2026-08-17T09:00:00",
          startTimeMinutes: 7 * 60,
          endTimeMinutes: 8 * 60,
          repeating: true,
        }),
        eventStart: new Date("2026-08-17T08:00:00.000Z"),
        eventEnd: new Date("2026-08-18T00:00:00.000Z"),
      }),
    ).toMatch(/Schedule Boundary Error: Repeating Time Slot is outside the Event boundary/);
  });
  it("bounds an open repeating slot by a finite Event End", () => {
    expect(
      computeRepeatingSlotBoundsError({
        slot: buildSlot({
          repeating: true,
          endDate: undefined,
        }),
        eventStart: new Date("2026-08-17T00:00:00.000Z"),
        eventEnd: new Date("2026-09-18T00:00:00.000Z"),
      }),
    ).toBeUndefined();
  });
  it("reports finite repeating occurrences beyond Event End", () => {
    expect(
      computeRepeatingSlotBoundsError({
        slot: buildSlot({
          endDate: "2026-03-31T00:00:00",
          repeating: true,
          startDate: "2026-02-01T00:00:00",
        }),
        eventStart: new Date("2026-02-01T00:00:00.000Z"),
        eventEnd: new Date("2026-03-02T00:00:00.000Z"),
      }),
    ).toMatch(/Schedule Boundary Error: Repeating Time Slot is outside the Event boundary/);
  });

  it("accepts DST gaps during repeating temporal validation", () => {
    const repeatingSlot = buildSlot({
      key: "slot-dst-gap",
      daysOfWeek: [6],
      startDate: "2026-03-08T05:00:00.000Z",
      endDate: "2026-03-09T04:00:00.000Z",
      timeZone: "America/New_York",
      startTimeMinutes: 2 * 60 + 30,
      endTimeMinutes: 4 * 60,
      repeating: true,
    });

    expect(
      computeRepeatingSlotTemporalError({
        slot: repeatingSlot,
        eventStart: new Date("2026-03-08T00:00:00.000Z"),
        eventEnd: new Date("2026-03-09T00:00:00.000Z"),
      }),
    ).toBeUndefined();
  });

  it("reports conflicts for open-ended repeating slots that start far apart", () => {
    const first = buildSlot({
      key: "slot-open-ended-first",
      daysOfWeek: [6],
      startDate: "2026-01-04",
      endDate: undefined,
      startTimeMinutes: 10 * 60,
      endTimeMinutes: 11 * 60,
      repeating: true,
    });
    const second = buildSlot({
      key: "slot-open-ended-second",
      daysOfWeek: [6],
      startDate: "2029-01-07",
      endDate: undefined,
      startTimeMinutes: 10 * 60,
      endTimeMinutes: 11 * 60,
      repeating: true,
    });

    expect(
      computeSlotError([first, second], 0, "LEAGUE", null, {
        eventStart: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ).toBe("Overlaps with another timeslot in this form.");
    expect(
      computeSlotError([first, second], 1, "LEAGUE", null, {
        eventStart: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ).toBe("Overlaps with another timeslot in this form.");
  });
  it("reports a far-future one-time conflict with an open-ended repeat", () => {
    const repeatingSlot = buildSlot({
      key: "slot-open-ended",
      daysOfWeek: [0],
      startDate: "2026-01-05",
      endDate: undefined,
      startTimeMinutes: 10 * 60,
      endTimeMinutes: 11 * 60,
      repeating: true,
    });
    const oneTimeSlot = buildSlot({
      key: "slot-future-one-time",
      startDate: "2029-01-01T10:00:00",
      endDate: "2029-01-01T11:00:00",
      startTimeMinutes: 10 * 60,
      endTimeMinutes: 11 * 60,
      repeating: false,
    });

    expect(
      computeSlotError([repeatingSlot, oneTimeSlot], 0, "LEAGUE", null, {
        eventStart: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ).toBe("Overlaps with another timeslot in this form.");
    expect(
      computeSlotError([repeatingSlot, oneTimeSlot], 1, "LEAGUE", null, {
        eventStart: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ).toBe("Overlaps with another timeslot in this form.");
  });
});
