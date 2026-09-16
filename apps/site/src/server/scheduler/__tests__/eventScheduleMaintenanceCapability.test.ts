/** @jest-environment node */

jest.mock("@/contracts/eventEditor", () => {
  const actual = jest.requireActual("@/contracts/eventEditor");
  return {
    ...actual,
    eventEditorMaintenanceProposalSchema: { parse: (value: unknown) => value },
    eventEditorMaintenanceScheduleOutcomeSchema: { parse: (value: unknown) => value },
  };
});
jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/server/repositories/locks", () => ({
  acquireEventLock: jest.fn().mockResolvedValue(undefined),
  acquireFieldLocks: jest.fn().mockResolvedValue(undefined),
  acquireTimeSlotLocks: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/server/accessControl", () => ({
  canManageEvent: jest.fn().mockResolvedValue(true),
}));
jest.mock("@/server/repositories/events", () => ({
  loadEventWithRelations: jest.fn(),
}));
jest.mock("@/server/events/eventEditorSnapshot", () => ({
  loadEventScheduleState: jest.fn().mockResolvedValue({ revision: "schedule-1" }),
}));
jest.mock("@/server/events/eventProtectedHistory", () => ({
  loadEventProtectedHistory: jest.fn().mockResolvedValue({ protectedMatchIds: new Set() }),
}));
jest.mock("@/server/scheduler/eventScheduleMutation", () => ({
  editorMatchProjectionsFor: jest.fn().mockReturnValue([]),
  persistSerializedScheduleGraph: jest.fn(),
  reconcileEventSchedule: jest.fn(),
  validateAndNormalizeSerializedGraph: jest.fn((_, graph) => graph),
}));
jest.mock("@/server/scheduler/serialize", () => ({
  serializeEvent: jest.fn().mockReturnValue({ id: "event_1" }),
  serializeMatches: jest.fn().mockReturnValue([]),
}));
jest.mock("@/server/matchScheduleNotifications", () => ({
  collectMatchScheduleChanges: jest.fn(() => []),
  snapshotMatchScheduleState: jest.fn(() => new Map()),
}));

import {
  createMaintenanceProposal,
  type MaintenanceClient,
} from "@/server/scheduler/eventScheduleMaintenance";
import { canManageEvent } from "@/server/accessControl";
import { loadEventWithRelations } from "@/server/repositories/events";
import { reconcileEventSchedule } from "@/server/scheduler/eventScheduleMutation";
import type { EventEditorMaintenanceRequest } from "@/contracts/eventEditor";
import type { League } from "@/server/scheduler/types";

const request = (): EventEditorMaintenanceRequest => ({
  contractVersion: 3,
  eventId: "event_1",
  operation: "BUILD",
  operationId: "operation_1",
});

const loadedEvent = (): League => ({
  id: "event_1",
  eventType: "LEAGUE",
  matches: {},
  fields: {},
  timeSlots: [],
  officialPositions: [],
  name: "League",
} as unknown as League);

const clientFor = (automatedScheduling: boolean) => ({
  events: {
    findUnique: jest.fn().mockResolvedValue({
      id: "event_1",
      hostId: "host_1",
      assistantHostIds: [],
      organizationId: null,
      automatedScheduling,
    }),
  },
  eventEditorMaintenanceOperations: {
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
  },
}) as unknown as MaintenanceClient;

describe("maintenance automated scheduling capability", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (loadEventWithRelations as jest.Mock).mockResolvedValue(loadedEvent());
    (reconcileEventSchedule as jest.Mock).mockResolvedValue({
      event: loadedEvent(),
      matches: [],
      warnings: [],
      placementFailures: [],
      previousMatchCount: 0,
      notification: null,
    });
  });

  it("permits a proposal when authoritative automatedScheduling is true", async () => {
    const client = clientFor(true);
    await expect(createMaintenanceProposal({
      tx: client,
      actor: { userId: "host_1", isAdmin: false },
      request: request(),
    })).resolves.toEqual(expect.objectContaining({
      status: "PROPOSED",
      eventId: "event_1",
      operation: "BUILD",
    }));
    expect((client.eventEditorMaintenanceOperations.create as jest.Mock)).toHaveBeenCalledTimes(1);
  });

  it("rejects a proposal when authoritative automatedScheduling is false", async () => {
    const client = clientFor(false);
    await expect(createMaintenanceProposal({
      tx: client,
      actor: { userId: "host_1", isAdmin: false },
      request: request(),
    })).rejects.toMatchObject({
      code: "EDITOR_MAINTENANCE_INVALID",
    });
    expect(canManageEvent).toHaveBeenCalled();
    expect(reconcileEventSchedule).not.toHaveBeenCalled();
    expect((client.eventEditorMaintenanceOperations.create as jest.Mock)).not.toHaveBeenCalled();
  });
});
