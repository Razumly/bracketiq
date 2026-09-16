import {
  assertRepeatingTimeSlotsResolvable,
  enumerateRepeatingTimeSlotOccurrences,
  listRepeatingTimeSlotDstAdjustments,
  resolveRepeatingTimeSlotOccurrence,
} from "../repeatingTimeSlotAvailability";

const slot = (overrides: Record<string, unknown> = {}) => ({
  id: "weekly-slot-1",
  daysOfWeek: [5],
  startDate: "2026-02-01",
  endDate: "2026-03-31",
  startTimeMinutes: 22 * 60,
  endTimeMinutes: 2 * 60,
  timeZone: "America/New_York",
  scheduledFieldIds: ["field-1"],
  divisions: ["division-1"],
  ...overrides,
});

describe("repeating Time Slot availability", () => {
  it("resolves an overnight interval on the next local date", () => {
    const resolved = resolveRepeatingTimeSlotOccurrence(slot(), "2026-02-28");

    expect(resolved.occurrenceDate).toBe("2026-02-28");
    expect(resolved.endDate).toBe("2026-03-01");
    expect(resolved.start.toISOString()).toBe("2026-03-01T03:00:00.000Z");
    expect(resolved.end.toISOString()).toBe("2026-03-01T07:00:00.000Z");
    expect(resolved.durationMinutes).toBe(240);
    expect(resolved.nextWeekday).toBe("Sunday");
  });

  it("treats equal repeating start and end times as a full local day", () => {
    const resolved = resolveRepeatingTimeSlotOccurrence(
      slot({
        daysOfWeek: [5],
        startDate: "2026-02-28",
        endDate: "2026-02-28",
        startTimeMinutes: 10 * 60,
        endTimeMinutes: 10 * 60,
        timeZone: "UTC",
      }),
      "2026-02-28",
    );

    expect(resolved.endDate).toBe("2026-03-01");
    expect(resolved.durationMinutes).toBe(24 * 60);
    expect(resolved.nextWeekday).toBe("Sunday");
  });

  it("preserves actual elapsed duration when an overnight interval crosses DST", () => {
    const resolved = resolveRepeatingTimeSlotOccurrence(
      slot({
        daysOfWeek: [5],
        startDate: "2026-03-07",
        endDate: "2026-03-09",
        startTimeMinutes: 23 * 60,
        endTimeMinutes: 4 * 60,
      }),
      "2026-03-07",
    );

    expect(resolved.start.toISOString()).toBe("2026-03-08T04:00:00.000Z");
    expect(resolved.end.toISOString()).toBe("2026-03-08T08:00:00.000Z");
    expect(resolved.durationMinutes).toBe(240);
  });

  it("shifts a nonexistent local time forward during a DST gap", () => {
    const resolved = resolveRepeatingTimeSlotOccurrence(
      slot({
        daysOfWeek: [6],
        startDate: "2026-03-08",
        endDate: "2026-03-08",
        startTimeMinutes: 2 * 60 + 30,
        endTimeMinutes: 4 * 60,
      }),
      "2026-03-08",
    );

    expect(resolved.start.toISOString()).toBe("2026-03-08T07:30:00.000Z");
    expect(resolved.end.toISOString()).toBe("2026-03-08T08:00:00.000Z");
    expect(resolved.durationMinutes).toBe(30);
    expect(resolved.dstAdjustments).toHaveLength(1);
    expect(resolved.dstAdjustments[0]).toMatchObject({
      boundary: "start",
      kind: "GAP_SHIFT_FORWARD",
      requestedDate: "2026-03-08",
      requestedTimeMinutes: 150,
      effectiveDate: "2026-03-08",
      effectiveTimeMinutes: 210,
    });
  });

  it("uses the earlier instant during a DST fold", () => {
    const resolved = resolveRepeatingTimeSlotOccurrence(
      slot({
        daysOfWeek: [6],
        startDate: "2026-11-01",
        endDate: "2026-11-01",
        startTimeMinutes: 1 * 60 + 30,
        endTimeMinutes: 3 * 60,
      }),
      "2026-11-01",
    );

    expect(resolved.start.toISOString()).toBe("2026-11-01T05:30:00.000Z");
    expect(resolved.end.toISOString()).toBe("2026-11-01T08:00:00.000Z");
    expect(resolved.durationMinutes).toBe(150);
    expect(resolved.dstAdjustments).toEqual([
      expect.objectContaining({
        boundary: "start",
        kind: "FOLD_EARLIER",
        requestedDate: "2026-11-01",
        requestedTimeMinutes: 90,
        effectiveDate: "2026-11-01",
        effectiveTimeMinutes: 90,
      }),
    ]);
  });

  it("resolves the reported overnight DST gap", () => {
    const reportedSlot = slot({
      id: "reported-overnight-dst-gap",
      daysOfWeek: [5, 6],
      startDate: "2026-03-10",
      endDate: undefined,
      startTimeMinutes: 11 * 60,
      endTimeMinutes: 2 * 60,
      timeZone: "America/Los_Angeles",
    });
    const resolved = resolveRepeatingTimeSlotOccurrence(
      reportedSlot,
      "2027-03-13",
    );

    expect(resolved.endDate).toBe("2027-03-14");
    expect(resolved.end.toISOString()).toBe("2027-03-14T10:00:00.000Z");
    expect(resolved.durationMinutes).toBe(15 * 60);
    expect(resolved.dstAdjustments).toEqual([
      expect.objectContaining({
        boundary: "end",
        kind: "GAP_SHIFT_FORWARD",
        requestedDate: "2027-03-14",
        requestedTimeMinutes: 2 * 60,
        effectiveDate: "2027-03-14",
        effectiveTimeMinutes: 3 * 60,
      }),
    ]);
    const normalOccurrence = resolveRepeatingTimeSlotOccurrence(
      reportedSlot,
      "2027-03-14",
    );
    expect(normalOccurrence.end.toISOString()).toBe("2027-03-15T09:00:00.000Z");
    expect(normalOccurrence.dstAdjustments).toEqual([]);
  });

  it("accepts a daylight-saving gap after the event validation window", () => {
    expect(() =>
      assertRepeatingTimeSlotsResolvable({
        slots: [
          slot({
            id: "future-dst-gap",
            daysOfWeek: [6],
            startDate: "2030-03-10",
            endDate: undefined,
            startTimeMinutes: 2 * 60 + 30,
            endTimeMinutes: 4 * 60,
          }),
        ],
        eventStart: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ).not.toThrow();
  });
  it("bounds an open recurrence by a finite Event End", () => {
    expect(() =>
      assertRepeatingTimeSlotsResolvable({
        slots: [
          slot({
            id: "finite-event-end",
            endDate: undefined,
          }),
        ],
        eventStart: new Date("2026-02-01T00:00:00.000Z"),
        eventEnd: new Date("2026-03-02T00:00:00.000Z"),
      }),
    ).not.toThrow();
  });
  it("rejects finite recurrence occurrences beyond Event End", () => {
    expect(() =>
      assertRepeatingTimeSlotsResolvable({
        slots: [
          slot({
            endDate: "2026-03-31",
            id: "finite-range-beyond-event-end",
          }),
        ],
        eventStart: new Date("2026-02-01T00:00:00.000Z"),
        eventEnd: new Date("2026-03-02T00:00:00.000Z"),
      }),
    ).toThrow(
      "Schedule Boundary Error: Repeating Time Slot is outside the Event boundary; Time Slots are rejected rather than clipped.",
    );
  });
  it("rejects a configured range with no selected weekday occurrence", () => {
    expect(() =>
      assertRepeatingTimeSlotsResolvable({
        slots: [
          slot({
            id: "no-occurrence",
            daysOfWeek: [0],
            startDate: "2026-08-18",
            endDate: "2026-08-19",
            timeZone: "UTC",
          }),
        ],
        eventStart: new Date("2026-08-18T00:00:00.000Z"),
      }),
    ).toThrow(
      "The selected date range contains no occurrence for the selected weekdays. Choose another date range or weekday.",
    );
  });

  it("rejects a finite recurrence range that ends before Event Start", () => {
    expect(() =>
      assertRepeatingTimeSlotsResolvable({
        slots: [
          slot({
            id: "range-before-event-start",
            daysOfWeek: [0],
            startDate: undefined,
            endDate: "2026-08-01",
            timeZone: "UTC",
          }),
        ],
        eventStart: new Date("2026-08-10T00:00:00.000Z"),
      }),
    ).toThrow(
      "The selected date range contains no occurrence for the selected weekdays. Choose another date range or weekday.",
    );
  });

  it("rejects repeating occurrences before the Event Start boundary", () => {
    expect(() =>
      assertRepeatingTimeSlotsResolvable({
        slots: [
          slot({
            id: "outside-event-start",
            daysOfWeek: [0],
            startDate: "2026-08-10",
            endDate: undefined,
            timeZone: "UTC",
          }),
        ],
        eventStart: new Date("2026-08-17T00:00:00.000Z"),
      }),
    ).toThrow(
      "Schedule Boundary Error: Repeating Time Slot is outside the Event boundary; Time Slots are rejected rather than clipped.",
    );
  });
  it("checks the first occurrence when startDate has a stored clock", () => {
    expect(() =>
      assertRepeatingTimeSlotsResolvable({
        slots: [
          slot({
            id: "stored-clock-before-event-start",
            daysOfWeek: [0],
            startDate: "2026-08-17T09:00:00",
            endDate: "2026-08-17T23:59:00",
            startTimeMinutes: 7 * 60,
            endTimeMinutes: 8 * 60,
            timeZone: "UTC",
          }),
        ],
        eventStart: new Date("2026-08-17T08:00:00.000Z"),
        eventEnd: new Date("2026-08-18T00:00:00.000Z"),
      }),
    ).toThrow(
      "Schedule Boundary Error: Repeating Time Slot is outside the Event boundary; Time Slots are rejected rather than clipped.",
    );
  });
  it('rejects a repeating slot assigned to an unavailable Resource', () => {
    expect(() =>
      assertRepeatingTimeSlotsResolvable({
        slots: [slot({ scheduledFieldIds: ['resource_2'] })],
        eventStart: new Date('2026-02-01T00:00:00.000Z'),
        eligibleResourceIds: ['resource_1'],
      }),
    ).toThrow('references unavailable Resource "resource_2"');
  });

  it("reports DST adjustments only through the final generated end", () => {
    const sharedOptions = {
      slot: slot({
        id: "future-next-year-dst-gap",
        daysOfWeek: [6],
        startDate: "2026-03-10",
        endDate: undefined,
        startTimeMinutes: 2 * 60 + 30,
        endTimeMinutes: 4 * 60,
      }),
      eventStart: new Date("2026-03-01T00:00:00.000Z"),
    };
    expect(listRepeatingTimeSlotDstAdjustments(sharedOptions)).toEqual([]);


    expect(
      listRepeatingTimeSlotDstAdjustments({
        ...sharedOptions,
        finalGeneratedEnd: new Date("2027-03-14T06:00:00.000Z"),
      }),
    ).toEqual([]);

    const adjustments = listRepeatingTimeSlotDstAdjustments({
      ...sharedOptions,
      finalGeneratedEnd: new Date("2027-03-14T08:00:00.000Z"),
    });
    expect(adjustments).toEqual([
      expect.objectContaining({
        boundary: "start",
        kind: "GAP_SHIFT_FORWARD",
        requestedDate: "2027-03-14",
        requestedTimeMinutes: 2 * 60 + 30,
        effectiveDate: "2027-03-14",
        effectiveTimeMinutes: 3 * 60 + 30,
      }),
    ]);
  });
  it("filters occurrences outside configured local date bounds", () => {
    const occurrences = enumerateRepeatingTimeSlotOccurrences({
      slot: slot({
        daysOfWeek: [1],
        startDate: "2026-03-10",
        endDate: "2026-03-31",
      }),
      windowStart: new Date("2026-03-01T00:00:00.000Z"),
      windowEnd: new Date("2026-04-10T00:00:00.000Z"),
    });

    expect(occurrences.map((occurrence) => occurrence.occurrenceDate)).toEqual([
      "2026-03-10",
      "2026-03-17",
      "2026-03-24",
      "2026-03-31",
    ]);
  });

  it("enumerates occurrences across a date range and keeps overnight windows", () => {
    const occurrences = enumerateRepeatingTimeSlotOccurrences({
      slot: slot({
        endDate: "2026-03-31",
        daysOfWeek: [5],
        endTimeMinutes: 60,
      }),
      windowStart: new Date("2026-03-06T00:00:00.000Z"),
      windowEnd: new Date("2026-03-16T00:00:00.000Z"),
    });

    expect(occurrences.map((occurrence) => occurrence.occurrenceDate)).toEqual([
      "2026-03-07",
      "2026-03-14",
    ]);
  });
});
