import type { EventEditorSnapshot } from "@/contracts/eventEditor";

const loadEventWithRelationsMock = jest.fn();
const loadMaintenanceRevisionBindingMock = jest.fn();

jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/server/repositories/events", () => ({
  loadEventWithRelations: (...args: unknown[]) => loadEventWithRelationsMock(...args),
}));
jest.mock("@/server/scheduler/eventScheduleMaintenanceRevisionBinding", () => ({
  loadMaintenanceRevisionBinding: (...args: unknown[]) =>
    loadMaintenanceRevisionBindingMock(...args),
}));

import { attachEventEditorRevisionBinding } from "../eventEditorRevisionBinding";

const snapshot = (availableMaintenanceOperations: string[]): EventEditorSnapshot => ({
  mode: "EDIT",
  eventId: "event_1",
  editorRevision: "editor-1",
  staffRevision: "staff-1",
  draft: {
    schedule: { mode: "GENERATED_END", isAutomatedScheduling: true },
  },
  scheduleState: {
    availableMaintenanceOperations: availableMaintenanceOperations as never,
    revision: "schedule-1",
  },
} as unknown as EventEditorSnapshot);

const revisionBinding = {
  editorRevision: "binding-editor-1",
  staffRevision: "staff-1",
  scheduleRevision: "schedule-1",
  fieldRevisions: { field_1: "field-1" },
  timeSlotRevisions: { slot_1: "slot-1" },
  rentalBookingRevision: null,
  rentalBookingRevisions: {},
  rentalBookingItemRevisions: {},
  availabilityRevision: "availability-1",
};

describe("attachEventEditorRevisionBinding", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    loadEventWithRelationsMock.mockResolvedValue({ id: "event_1" });
    loadMaintenanceRevisionBindingMock.mockResolvedValue(revisionBinding);
  });

  it("attaches the shared full binding for an eligible edit snapshot", async () => {
    const result = await attachEventEditorRevisionBinding(snapshot(["REBUILD"]), {
      actor: { userId: "host-1", isAdmin: false },
    });

    expect(result.revisionBinding).toEqual(revisionBinding);
    expect(loadEventWithRelationsMock).toHaveBeenCalledWith("event_1", {});
    expect(loadMaintenanceRevisionBindingMock).toHaveBeenCalledWith(
      { id: "event_1" },
      "schedule-1",
      { userId: "host-1", isAdmin: false },
      {},
      expect.objectContaining({
        includeCheckIns: true,
        automatedScheduling: true,
        snapshot: { editorRevision: "editor-1", staffRevision: "staff-1" },
        computeRevision: expect.any(Function),
      }),
    );
  });

  it("does not load a binding for snapshots without maintenance capability", async () => {
    const current = snapshot([]);

    await expect(
      attachEventEditorRevisionBinding(current, {
        actor: { userId: "host-1", isAdmin: false },
      }),
    ).resolves.toBe(current);
    expect(loadEventWithRelationsMock).not.toHaveBeenCalled();
    expect(loadMaintenanceRevisionBindingMock).not.toHaveBeenCalled();
  });
});
