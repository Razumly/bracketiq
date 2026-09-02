import type { EventEditorSnapshot } from "@/contracts/eventEditor";
import { serializeEventEditorSnapshot } from "../eventEditorWireCompatibility";

describe("event editor wire compatibility", () => {
  it("preserves the canonical scheduling key and adds the legacy mobile key", () => {
    const snapshot = {
      draft: {
        schedule: {
          mode: "FIXED_END",
          endConstraint: "2026-09-01T18:00:00.000Z",
          isAutomatedScheduling: false,
        },
      },
      revisionBinding: {
        editorRevision: "binding-editor",
        staffRevision: null,
        scheduleRevision: "binding-schedule",
        fieldRevisions: { field_1: "field-revision" },
        timeSlotRevisions: { slot_1: "slot-revision" },
        rentalBookingRevision: null,
        rentalBookingRevisions: {},
        rentalBookingItemRevisions: {},
        availabilityRevision: "availability-revision",
      },
    } as unknown as EventEditorSnapshot;

    const serialized = serializeEventEditorSnapshot(snapshot);
    expect(serialized.revisionBinding).toEqual(snapshot.revisionBinding);

    expect(serialized.draft.schedule.isAutomatedScheduling).toBe(false);
    expect(serialized.draft.schedule.automatedScheduling).toBe(false);
  });
});
