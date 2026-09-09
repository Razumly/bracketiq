import { buildEvent, buildTimeSlot } from "../../../../../../../test/factories";

import {
  buildWeeklyOccurrenceOptionsInRange,
  resolveSelectedWeeklyOccurrenceOption,
} from "../helpers";

describe("weekly schedule occurrence options", () => {
  it("expands repeating slots but includes a fixed supplemental slot only once", () => {
    const event = buildEvent({
      eventType: "WEEKLY_EVENT",
      parentEvent: null,
      timeSlots: [
        buildTimeSlot({
          $id: "slot-weekly",
          repeating: true,
          dayOfWeek: undefined,
          daysOfWeek: [0],
          startDate: "2026-07-13",
          endDate: "2026-08-31",
        }),
        buildTimeSlot({
          $id: "slot-fixed",
          repeating: false,
          dayOfWeek: undefined,
          daysOfWeek: [],
          startDate: "2026-07-15",
          endDate: "2026-07-15",
          startTimeMinutes: 11 * 60,
          endTimeMinutes: 12 * 60,
        }),
      ],
    });

    const occurrences = buildWeeklyOccurrenceOptionsInRange(
      event,
      new Date(2026, 6, 13),
      new Date(2026, 6, 31),
    );

    expect(
      occurrences.filter((occurrence) => occurrence.slotId === "slot-weekly"),
    ).toHaveLength(3);
    expect(
      occurrences.filter((occurrence) => occurrence.slotId === "slot-fixed"),
    ).toEqual([
      expect.objectContaining({
        id: "slot-fixed:2026-07-15",
        occurrenceDate: "2026-07-15",
      }),
    ]);
  });
  it("keeps repeating overnight occurrences on their local start date", () => {
    const event = buildEvent({
      eventType: "WEEKLY_EVENT",
      parentEvent: null,
      timeSlots: [
        buildTimeSlot({
          $id: "slot-overnight",
          repeating: true,
          daysOfWeek: [0],
          dayOfWeek: 0,
          startDate: "2026-07-13",
          endDate: "2026-07-31",
          startTimeMinutes: 23 * 60,
          endTimeMinutes: 60,
          timeZone: "UTC",
        }),
      ],
    });

    const occurrences = buildWeeklyOccurrenceOptionsInRange(
      event,
      new Date(2026, 6, 13),
      new Date(2026, 6, 19),
    );

    expect(occurrences).toEqual([
      expect.objectContaining({
        id: "slot-overnight:2026-07-13",
        occurrenceDate: "2026-07-13",
        startMinutes: 23 * 60,
        endMinutes: 60,
      }),
    ]);
  });

  it("resolves equal repeating start and end times as a full local day", () => {
    const event = buildEvent({
      eventType: "WEEKLY_EVENT",
      parentEvent: null,
      timeSlots: [
        buildTimeSlot({
          $id: "slot-full-day",
          repeating: true,
          daysOfWeek: [0],
          dayOfWeek: 0,
          startDate: "2026-07-13",
          endDate: "2026-07-20",
          startTimeMinutes: 10 * 60,
          endTimeMinutes: 10 * 60,
          timeZone: "UTC",
        }),
      ],
    });

    const occurrences = buildWeeklyOccurrenceOptionsInRange(
      event,
      new Date("2026-07-13T00:00:00.000Z"),
      new Date("2026-07-27T00:00:00.000Z"),
    );

    expect(occurrences).toEqual([
      expect.objectContaining({
        id: "slot-full-day:2026-07-13",
        occurrenceDate: "2026-07-13",
        startMinutes: 10 * 60,
        endMinutes: 10 * 60,
      }),
      expect.objectContaining({
        id: "slot-full-day:2026-07-20",
        occurrenceDate: "2026-07-20",
        startMinutes: 10 * 60,
        endMinutes: 10 * 60,
      }),
    ]);
  });
  it("keeps the selected occurrence instant in the slot time zone", () => {
    const event = buildEvent({
      eventType: "WEEKLY_EVENT",
      parentEvent: null,
      timeSlots: [
        buildTimeSlot({
          $id: "slot-named-zone",
          repeating: true,
          daysOfWeek: [6],
          dayOfWeek: 6,
          startDate: "2026-03-08",
          endDate: "2026-03-15",
          startTimeMinutes: 18 * 60,
          endTimeMinutes: 19 * 60,
          timeZone: "America/Los_Angeles",
        }),
      ],
    });

    const selected = resolveSelectedWeeklyOccurrenceOption(event, {
      slotId: "slot-named-zone",
      occurrenceDate: "2026-03-08",
    });

    expect(selected?.label).toBe("Sun, 3/8/26 · 6:00 PM-7:00 PM");
  });
});
