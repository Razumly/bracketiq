/** @jest-environment node */

import {
  validateRentalSelections,
  type RentalAvailabilitySlot,
} from "@/server/rentals/selectionValidation";

const organization = { timeZone: "UTC" };
const fields = [
  {
    id: "field-1",
    name: "Court 1",
    facilityId: "facility-1",
    rentalSlotIds: ["slot-1"],
  },
];

const validate = (
  slot: RentalAvailabilitySlot,
  startDate: string,
  endDate: string,
) =>
  validateRentalSelections({
    selections: [
      {
        scheduledFieldIds: ["field-1"],
        startDate,
        endDate,
        timeZone: "UTC",
        repeating: true,
      },
    ],
    fields,
    organization,
    slots: [slot],
  });

describe("rental repeating slot validation", () => {
  it("treats equal local endpoints as a full-day availability window", () => {
    const result = validate(
      {
        id: "slot-1",
        daysOfWeek: [0],
        startDate: "2026-08-24",
        endDate: "2026-08-24",
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 9 * 60,
        timeZone: "UTC",
        repeating: true,
        price: 10,
      },
      "2026-08-24T10:00:00",
      "2026-08-24T11:00:00",
    );

    expect(result.ok).toBe(true);
  });

  it("treats a final-date 24:00 endpoint as the following local midnight", () => {
    const result = validate(
      {
        id: "slot-1",
        daysOfWeek: [0],
        startDate: "2026-08-24",
        endDate: "2026-08-24",
        startTimeMinutes: 9 * 60,
        endTimeMinutes: 24 * 60,
        timeZone: "UTC",
        repeating: true,
        price: 10,
      },
      "2026-08-24T23:00:00",
      "2026-08-25T00:00:00",
    );

    expect(result.ok).toBe(true);
  });
  it("covers the post-midnight portion from the previous local weekday", () => {
    const result = validate(
      {
        id: "slot-1",
        daysOfWeek: [0],
        startDate: "2026-08-24",
        endDate: "2026-08-31",
        startTimeMinutes: 22 * 60,
        endTimeMinutes: 2 * 60,
        timeZone: "UTC",
        repeating: true,
        price: 10,
      },
      "2026-08-25T00:30:00",
      "2026-08-25T01:30:00",
    );

    expect(result.ok).toBe(true);
  });
});
