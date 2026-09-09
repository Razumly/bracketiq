import { act, renderHook, waitFor } from "@testing-library/react";

import type { Field, TimeSlot, UserData } from "@/types";
import {
  updateSelectionWithCalendarRange,
  usePublicRentalSelections,
} from "./usePublicRentalSelections";

const getFieldEventsMatchesMock = jest.fn();

jest.mock("@/lib/fieldService", function mockFieldServiceModule() {
  return {
    fieldService: {
      getFieldEventsMatches: function getFieldEventsMatches(
        ...args: unknown[]
      ) {
        return getFieldEventsMatchesMock(...args);
      },
    },
  };
});

jest.mock("@mantine/notifications", function mockNotificationsModule() {
  return {
    notifications: {
      show: function showNotification() {},
    },
  };
});

type RentalListing = {
  field: Field;
  slot: TimeSlot;
  nextOccurrence: Date;
};

type HookProps = {
  canManage: boolean;
  fields: Field[];
  rentalListings: RentalListing[];
  selectionContextKey: string;
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

const currentUser = { $id: "renter_1" } as UserData;

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function rangesOverlap(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date,
): boolean {
  return startA < endB && endA > startB;
}

function buildRentalAvailability(
  fieldId: string,
  start: Date,
  end: Date,
): { field: Field; listing: RentalListing } {
  const slot = {
    $id: `slot_${fieldId}`,
    repeating: false,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    startTimeMinutes: start.getHours() * 60 + start.getMinutes(),
    endTimeMinutes: end.getHours() * 60 + end.getMinutes(),
    scheduledFieldId: fieldId,
    scheduledFieldIds: [fieldId],
  } as TimeSlot;
  const field = {
    $id: fieldId,
    name: fieldId,
    rentalSlotIds: [slot.$id],
    rentalSlots: [slot],
    events: [],
    matches: [],
  } as Field;
  return {
    field,
    listing: { field, slot, nextOccurrence: new Date(start) },
  };
}

function withoutConflicts(field: Field): Field {
  return { ...field, events: [], matches: [] };
}

function withConflict(field: Field, start: Date, end: Date): Field {
  return {
    ...field,
    events: [
      {
        $id: "event_conflict",
        name: "Conflict",
        eventType: "EVENT",
        start: start.toISOString(),
        end: end.toISOString(),
      },
    ],
    matches: [],
  } as Field;
}

function renderRentalSelections(initialProps: HookProps) {
  return renderHook(
    (props: HookProps) =>
      usePublicRentalSelections({
        ...props,
        currentUser,
        facilityFilteredFields: props.fields,
        compareRanges: rangesOverlap,
      }),
    { initialProps },
  );
}

describe("usePublicRentalSelections context lifecycle", () => {
  beforeEach(() => {
    getFieldEventsMatchesMock.mockReset();
    getFieldEventsMatchesMock.mockImplementation(async function resolveField(
      field: Field,
    ) {
      return withoutConflicts(field);
    });
  });

  it("initializes once when availability becomes usable and keeps that default through refreshes", async () => {
    const firstStart = new Date("2030-06-10T10:00:00");
    const firstEnd = new Date("2030-06-10T11:00:00");
    const secondStart = new Date("2030-06-11T12:00:00");
    const secondEnd = new Date("2030-06-11T13:00:00");
    const first = buildRentalAvailability("field_first", firstStart, firstEnd);
    const second = buildRentalAvailability(
      "field_second",
      secondStart,
      secondEnd,
    );
    const hook = renderRentalSelections({
      canManage: false,
      fields: [],
      rentalListings: [],
      selectionContextKey: "org_1",
    });

    expect(hook.result.current.rentalSelections).toEqual([]);

    hook.rerender({
      canManage: false,
      fields: [first.field],
      rentalListings: [first.listing],
      selectionContextKey: "org_1",
    });

    await waitFor(() => {
      expect(hook.result.current.hasPendingConflictChecks).toBe(false);
      expect(hook.result.current.rentalSelectionValidations[0]?.errors).toEqual(
        [],
      );
    });
    const initializedSelection = hook.result.current.rentalSelections[0];
    expect(initializedSelection.scheduledFieldIds).toEqual(["field_first"]);

    hook.rerender({
      canManage: false,
      fields: [second.field, first.field],
      rentalListings: [second.listing, first.listing],
      selectionContextKey: "org_1",
    });

    expect(hook.result.current.rentalSelections[0]).toEqual(
      initializedSelection,
    );
  });

  it("accepts a public selection inside an overnight repeating rental slot", async () => {
    const timeZone =
      Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const slot = {
      $id: "slot_overnight",
      dayOfWeek: 0,
      daysOfWeek: [0],
      startDate: "2030-06-10T00:00:00",
      endDate: "2030-06-17T00:00:00",
      startTimeMinutes: 23 * 60,
      endTimeMinutes: 60,
      timeZone,
      repeating: true,
      scheduledFieldId: "field_overnight",
      scheduledFieldIds: ["field_overnight"],
    } as TimeSlot;
    const field = {
      $id: "field_overnight",
      name: "Overnight Court",
      rentalSlots: [slot],
      events: [],
      matches: [],
    } as Field;
    const hook = renderRentalSelections({
      canManage: false,
      fields: [field],
      rentalListings: [{
        field,
        slot,
        nextOccurrence: new Date(2030, 5, 10, 23, 0, 0, 0),
      }],
      selectionContextKey: "org_overnight",
    });

    await waitFor(() => {
      expect(hook.result.current.hasPendingConflictChecks).toBe(false);
      expect(hook.result.current.rentalSelectionValidations[0]?.errors).toEqual(
        [],
      );
    });
  });

  it("waits for a usable listing when fields arrive first", async () => {
    const start = new Date("2030-06-10T10:00:00");
    const end = new Date("2030-06-10T11:00:00");
    const availability = buildRentalAvailability("field_1", start, end);
    const hook = renderRentalSelections({
      canManage: false,
      fields: [],
      rentalListings: [],
      selectionContextKey: "org_1",
    });

    hook.rerender({
      canManage: false,
      fields: [availability.field],
      rentalListings: [],
      selectionContextKey: "org_1",
    });

    expect(hook.result.current.rentalSelections).toEqual([]);

    hook.rerender({
      canManage: false,
      fields: [availability.field],
      rentalListings: [availability.listing],
      selectionContextKey: "org_1",
    });

    expect(hook.result.current.rentalSelections[0]).toEqual(
      expect.objectContaining({
        scheduledFieldIds: ["field_1"],
        startDate: "2030-06-10T10:00:00",
        endDate: "2030-06-10T11:00:00",
      }),
    );
    await waitFor(() => {
      expect(hook.result.current.hasPendingConflictChecks).toBe(false);
    });
  });

  it("preserves a user edit through later field and listing refreshes", async () => {
    const slotStart = new Date("2030-06-10T10:00:00");
    const slotEnd = new Date("2030-06-10T14:00:00");
    const editedStart = new Date("2030-06-10T12:00:00");
    const editedEnd = new Date("2030-06-10T13:00:00");
    const availability = buildRentalAvailability("field_1", slotStart, slotEnd);
    availability.listing.slot.endTimeMinutes = 11 * 60;
    const hook = renderRentalSelections({
      canManage: false,
      fields: [availability.field],
      rentalListings: [availability.listing],
      selectionContextKey: "org_1",
    });

    await waitFor(() => {
      expect(hook.result.current.hasPendingConflictChecks).toBe(false);
    });
    const selectionKey = hook.result.current.rentalSelections[0].key;
    act(() => {
      hook.result.current.updateRentalSelection(selectionKey, (selection) =>
        updateSelectionWithCalendarRange(selection, editedStart, editedEnd),
      );
    });

    const refreshed = buildRentalAvailability("field_1", slotStart, slotEnd);
    refreshed.listing.slot.endTimeMinutes = 11 * 60;
    hook.rerender({
      canManage: false,
      fields: [refreshed.field],
      rentalListings: [refreshed.listing],
      selectionContextKey: "org_1",
    });

    expect(hook.result.current.rentalSelections[0].startDate).toBe(
      "2030-06-10T12:00:00",
    );
    expect(hook.result.current.rentalSelections[0].endDate).toBe(
      "2030-06-10T13:00:00",
    );
    await waitFor(() => {
      expect(hook.result.current.hasPendingConflictChecks).toBe(false);
    });
  });

  it("exposes no public state in management mode and rejects a late public conflict response", async () => {
    const start = new Date("2030-06-10T10:00:00");
    const end = new Date("2030-06-10T11:00:00");
    const availability = buildRentalAvailability("field_1", start, end);
    const lateResponse = createDeferred<Field>();
    getFieldEventsMatchesMock.mockImplementationOnce(
      function loadPublicConflicts() {
        return lateResponse.promise;
      },
    );
    const hook = renderRentalSelections({
      canManage: false,
      fields: [availability.field],
      rentalListings: [availability.listing],
      selectionContextKey: "org_1",
    });

    await waitFor(() =>
      expect(getFieldEventsMatchesMock).toHaveBeenCalledTimes(1),
    );
    expect(hook.result.current.hasPendingConflictChecks).toBe(true);

    hook.rerender({
      canManage: true,
      fields: [availability.field],
      rentalListings: [availability.listing],
      selectionContextKey: "org_1",
    });

    expect(hook.result.current.rentalSelections).toEqual([]);
    expect(hook.result.current.rentalSelectionValidations).toEqual([]);
    expect(hook.result.current.hasPendingConflictChecks).toBe(false);

    await act(async () => {
      lateResponse.resolve(withConflict(availability.field, start, end));
      await lateResponse.promise;
    });

    expect(hook.result.current.rentalSelectionValidations).toEqual([]);
    expect(hook.result.current.hasPendingConflictChecks).toBe(false);

    hook.rerender({
      canManage: false,
      fields: [availability.field],
      rentalListings: [availability.listing],
      selectionContextKey: "org_1",
    });

    await waitFor(() =>
      expect(getFieldEventsMatchesMock).toHaveBeenCalledTimes(2),
    );
    await waitFor(() => {
      expect(
        hook.result.current.rentalSelectionValidations[0]?.conflictCount,
      ).toBe(0);
    });
  });

  it("rejects an old-context conflict response after the rental context changes", async () => {
    const firstStart = new Date("2030-06-10T10:00:00");
    const firstEnd = new Date("2030-06-10T11:00:00");
    const secondStart = new Date("2030-06-11T12:00:00");
    const secondEnd = new Date("2030-06-11T13:00:00");
    const first = buildRentalAvailability("field_first", firstStart, firstEnd);
    const second = buildRentalAvailability(
      "field_second",
      secondStart,
      secondEnd,
    );
    const firstResponse = createDeferred<Field>();
    getFieldEventsMatchesMock
      .mockImplementationOnce(function loadFirstContextConflicts() {
        return firstResponse.promise;
      })
      .mockImplementationOnce(async function loadSecondContextConflicts(
        field: Field,
      ) {
        return withoutConflicts(field);
      });
    const hook = renderRentalSelections({
      canManage: false,
      fields: [first.field],
      rentalListings: [first.listing],
      selectionContextKey: "org_1",
    });

    await waitFor(() =>
      expect(getFieldEventsMatchesMock).toHaveBeenCalledTimes(1),
    );
    expect(hook.result.current.hasPendingConflictChecks).toBe(true);

    hook.rerender({
      canManage: false,
      fields: [second.field],
      rentalListings: [second.listing],
      selectionContextKey: "org_2",
    });
    await waitFor(() =>
      expect(getFieldEventsMatchesMock).toHaveBeenCalledTimes(2),
    );
    await waitFor(() => {
      expect(hook.result.current.hasPendingConflictChecks).toBe(false);
      expect(
        hook.result.current.rentalSelectionValidations[0]?.conflictCount,
      ).toBe(0);
    });

    await act(async () => {
      firstResponse.resolve(withConflict(first.field, firstStart, firstEnd));
      await firstResponse.promise;
    });

    expect(
      hook.result.current.rentalSelections[0]?.scheduledFieldIds,
    ).toEqual(["field_second"]);
    expect(
      hook.result.current.rentalSelectionValidations[0]?.conflictCount,
    ).toBe(0);
    expect(hook.result.current.canReserveRentalResources).toBe(true);
  });
  it("rejects an older conflict response after the active selection changes", async () => {
    const slotStart = new Date("2030-06-10T10:00:00");
    const slotEnd = new Date("2030-06-10T14:00:00");
    const editedStart = new Date("2030-06-10T12:00:00");
    const editedEnd = new Date("2030-06-10T13:00:00");
    const availability = buildRentalAvailability("field_1", slotStart, slotEnd);
    availability.listing.slot.endTimeMinutes = 11 * 60;
    const firstResponse = createDeferred<Field>();
    const secondResponse = createDeferred<Field>();
    getFieldEventsMatchesMock
      .mockImplementationOnce(function loadInitialSelectionConflicts() {
        return firstResponse.promise;
      })
      .mockImplementationOnce(function loadEditedSelectionConflicts() {
        return secondResponse.promise;
      });
    const hook = renderRentalSelections({
      canManage: false,
      fields: [availability.field],
      rentalListings: [availability.listing],
      selectionContextKey: "org_1",
    });

    await waitFor(() =>
      expect(getFieldEventsMatchesMock).toHaveBeenCalledTimes(1),
    );
    const selectionKey = hook.result.current.rentalSelections[0].key;
    act(() => {
      hook.result.current.updateRentalSelection(selectionKey, (selection) =>
        updateSelectionWithCalendarRange(selection, editedStart, editedEnd),
      );
    });
    await waitFor(() =>
      expect(getFieldEventsMatchesMock).toHaveBeenCalledTimes(2),
    );

    await act(async () => {
      secondResponse.resolve(withoutConflicts(availability.field));
      await secondResponse.promise;
    });
    await waitFor(() =>
      expect(hook.result.current.hasPendingConflictChecks).toBe(false),
    );

    await act(async () => {
      firstResponse.resolve(
        withConflict(availability.field, slotStart, slotEnd),
      );
      await firstResponse.promise;
    });

    expect(
      hook.result.current.rentalSelectionValidations[0].conflictCount,
    ).toBe(0);
    expect(hook.result.current.rentalSelectionValidations[0].errors).toEqual(
      [],
    );
    expect(hook.result.current.canReserveRentalResources).toBe(true);
  });
});
