/** @jest-environment node */

import { NextRequest } from "next/server";

const requireSessionMock = jest.fn();
const prismaMock = { $transaction: jest.fn() };
const createMaintenanceProposalMock = jest.fn();
const acceptMaintenanceProposalMock = jest.fn();
const rejectMaintenanceProposalMock = jest.fn();
const notifyTeamsOfMatchScheduleUpdateMock = jest.fn();
const refreshBroadcastPresentationForEventMock = jest.fn();
const scheduleEventMock = jest.fn();
const rescheduleEventMatchesPreservingLocksMock = jest.fn();
const transactionClient = { transactionClient: true };

class MockMaintenanceOperationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "MaintenanceOperationError";
    this.code = code;
  }
}

class MockEventScheduleMutationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "EventScheduleMutationError";
    this.code = code;
  }
}

class MockScheduleError extends Error {}

jest.mock("@/lib/permissions", () => ({
  requireSession: (...args: unknown[]) => requireSessionMock(...args),
}));
jest.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
jest.mock("@/server/scheduler/eventScheduleMaintenance", () => ({
  MaintenanceOperationError: MockMaintenanceOperationError,
  createMaintenanceProposal: (...args: unknown[]) => createMaintenanceProposalMock(...args),
  acceptMaintenanceProposal: (...args: unknown[]) => acceptMaintenanceProposalMock(...args),
  rejectMaintenanceProposal: (...args: unknown[]) => rejectMaintenanceProposalMock(...args),
}));
jest.mock("@/server/matchScheduleNotifications", () => ({
  notifyTeamsOfMatchScheduleUpdate: (...args: unknown[]) => notifyTeamsOfMatchScheduleUpdateMock(...args),
}));
jest.mock("@/server/broadcast/presentation", () => ({
  refreshBroadcastPresentationForEvent: (...args: unknown[]) => refreshBroadcastPresentationForEventMock(...args),
}));
jest.mock("@/server/scheduler/scheduleEvent", () => ({
  ScheduleError: MockScheduleError,
  scheduleEvent: (...args: unknown[]) => scheduleEventMock(...args),
}));
jest.mock("@/server/scheduler/reschedulePreservingLocks", () => ({
  rescheduleEventMatchesPreservingLocks: (...args: unknown[]) => rescheduleEventMatchesPreservingLocksMock(...args),
}));
jest.mock("@/server/scheduler/eventScheduleMutation", () => ({
  EventScheduleMutationError: MockEventScheduleMutationError,
}));
jest.mock("@/server/repositories/events", () => ({
  isEventFieldConfigurationError: () => false,
}));

import {
  DELETE as scheduleDelete,
  POST as schedulePost,
  PUT as schedulePut,
} from "@/app/api/events/[eventId]/schedule/route";

const eventId = "event_1";
const requestBody = {
  contractVersion: 3,
  eventId,
  operation: "REBUILD",
  operationId: "operation-1",
  expectedRevisions: {
    editorRevision: "editor-revision-1",
    staffRevision: "staff-revision-1",
    scheduleRevision: "schedule-revision-1",
    fieldRevisions: {},
    timeSlotRevisions: {},
    rentalBookingRevision: null,
    rentalBookingRevisions: {},
    rentalBookingItemRevisions: {},
    availabilityRevision: "availability-revision-1",
  },
  participantCount: 8,
  includePlaceholderTeams: false,
};
const acceptanceBody = {
  contractVersion: 3,
  eventId,
  operation: "REBUILD",
  operationId: "operation-1",
  proposalRevision: "proposal-revision-1",
  acceptanceOperationId: "acceptance-operation-1",
};
const rejectionBody = {
  contractVersion: 3,
  eventId,
  operation: "REBUILD",
  operationId: "operation-1",
  proposalRevision: "proposal-revision-1",
};

const jsonRequest = (url: string, body: unknown, method: "POST" | "PUT" | "DELETE") =>
  new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const routeContext = (routeEventId = eventId) => ({
  params: Promise.resolve({ eventId: routeEventId }),
});

describe("event schedule maintenance route", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    requireSessionMock.mockResolvedValue({ userId: "host_1", isAdmin: false });
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof transactionClient) => unknown) => callback(transactionClient),
    );
    notifyTeamsOfMatchScheduleUpdateMock.mockResolvedValue(undefined);
    refreshBroadcastPresentationForEventMock.mockResolvedValue(undefined);
  });

  const maintenanceRoutes = [
    ["POST", schedulePost, requestBody],
    ["PUT", schedulePut, acceptanceBody],
    ["DELETE", scheduleDelete, rejectionBody],
  ] as const;

  it.each(maintenanceRoutes)(
    "preserves a missing-session 401 Response for %s",
    async (method, handler, body) => {
      const authResponse = new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Bearer realm="BracketIQ"' },
      });
      requireSessionMock.mockRejectedValueOnce(authResponse);

      const response = await handler(
        jsonRequest("http://localhost/api/events/event_1/schedule", body, method),
        routeContext(),
      );

      expect(response).toBe(authResponse);
      expect(response.status).toBe(401);
      expect(response.headers.get("WWW-Authenticate")).toBe('Bearer realm="BracketIQ"');
      await expect(response.text()).resolves.toBe("Unauthorized");
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    },
  );

  it.each(maintenanceRoutes)(
    "preserves a forbidden-session 403 Response for %s",
    async (method, handler, body) => {
      const authResponse = new Response("Email verification required", {
        status: 403,
        headers: { "X-Auth-Reason": "email-verification-required" },
      });
      requireSessionMock.mockRejectedValueOnce(authResponse);

      const response = await handler(
        jsonRequest("http://localhost/api/events/event_1/schedule", body, method),
        routeContext(),
      );

      expect(response).toBe(authResponse);
      expect(response.status).toBe(403);
      expect(response.headers.get("X-Auth-Reason")).toBe("email-verification-required");
      await expect(response.text()).resolves.toBe("Email verification required");
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    },
  );

  it("returns PROPOSED and passes the exact request through the transaction", async () => {
    const proposal = { status: "PROPOSED", proposalRevision: "proposal-revision-1" };
    createMaintenanceProposalMock.mockResolvedValue(proposal);

    const response = await schedulePost(
      jsonRequest("http://localhost/api/events/event_1/schedule", requestBody, "POST"),
      routeContext(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(proposal);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.$transaction.mock.calls[0][1]).toEqual({ maxWait: 10_000, timeout: 60_000 });
    expect(createMaintenanceProposalMock).toHaveBeenCalledWith({
      tx: transactionClient,
      actor: { userId: "host_1", isAdmin: false },
      request: requestBody,
    });
    expect(notifyTeamsOfMatchScheduleUpdateMock).not.toHaveBeenCalled();
    expect(refreshBroadcastPresentationForEventMock).not.toHaveBeenCalled();
    expect(scheduleEventMock).not.toHaveBeenCalled();
    expect(rescheduleEventMatchesPreservingLocksMock).not.toHaveBeenCalled();
  });

  it("returns ACCEPTED and passes the exact acceptance fields through the transaction", async () => {
    const acceptedResponse = {
      status: "ACCEPTED",
      contractVersion: 3,
      eventId,
      operation: "REBUILD",
      operationId: "operation-1",
      proposalRevision: "proposal-revision-1",
      acceptanceOperationId: "acceptance-operation-1",
    };
    const notification = {
      eventId,
      eventName: "Spring League",
      changes: [{ matchId: "match-1", teamIds: ["team-1"], teamNames: ["Alpha"] }],
    };
    acceptMaintenanceProposalMock.mockResolvedValue({
      response: acceptedResponse,
      notification,
    });

    const response = await schedulePut(
      jsonRequest("http://localhost/api/events/event_1/schedule", acceptanceBody, "PUT"),
      routeContext(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(acceptedResponse);
    expect(acceptMaintenanceProposalMock).toHaveBeenCalledWith({
      tx: transactionClient,
      actor: { userId: "host_1", isAdmin: false },
      request: acceptanceBody,
    });
    expect(refreshBroadcastPresentationForEventMock).toHaveBeenCalledWith({
      eventId,
      reason: "SCHEDULE_CHANGE",
    });
    expect(notifyTeamsOfMatchScheduleUpdateMock).toHaveBeenCalledWith(notification);
    expect(scheduleEventMock).not.toHaveBeenCalled();
    expect(rescheduleEventMatchesPreservingLocksMock).not.toHaveBeenCalled();
  });

  it("returns REJECTED and passes the exact rejection fields through the transaction", async () => {
    const rejectedResponse = {
      status: "REJECTED",
      contractVersion: 3,
      eventId,
      operation: "REBUILD",
      operationId: "operation-1",
      proposalRevision: "proposal-revision-1",
    };
    rejectMaintenanceProposalMock.mockResolvedValue(rejectedResponse);

    const response = await scheduleDelete(
      jsonRequest("http://localhost/api/events/event_1/schedule", rejectionBody, "DELETE"),
      routeContext(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(rejectedResponse);
    expect(rejectMaintenanceProposalMock).toHaveBeenCalledWith({
      tx: transactionClient,
      actor: { userId: "host_1", isAdmin: false },
      request: rejectionBody,
    });
    expect(refreshBroadcastPresentationForEventMock).not.toHaveBeenCalled();
    expect(notifyTeamsOfMatchScheduleUpdateMock).not.toHaveBeenCalled();
    expect(scheduleEventMock).not.toHaveBeenCalled();
    expect(rescheduleEventMatchesPreservingLocksMock).not.toHaveBeenCalled();
  });

  it("returns 400 before opening a transaction when path and request event IDs differ", async () => {
    createMaintenanceProposalMock.mockResolvedValue({ status: "PROPOSED" });

    const response = await schedulePost(
      jsonRequest(
        "http://localhost/api/events/event_1/schedule",
        { ...requestBody, eventId: "event_2" },
        "POST",
      ),
      routeContext(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      code: "EDITOR_MAINTENANCE_INVALID",
    }));
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(createMaintenanceProposalMock).not.toHaveBeenCalled();
  });

  it("maps stale maintenance proposals to 409", async () => {
    createMaintenanceProposalMock.mockRejectedValueOnce(
      new MockMaintenanceOperationError("EDITOR_MAINTENANCE_STALE", "The schedule changed while you were editing."),
    );

    const response = await schedulePost(
      jsonRequest("http://localhost/api/events/event_1/schedule", requestBody, "POST"),
      routeContext(),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "The schedule changed while you were editing.",
      code: "EDITOR_MAINTENANCE_STALE",
    });
  });

  it("maps rejected maintenance proposals to 409", async () => {
    rejectMaintenanceProposalMock.mockRejectedValueOnce(
      new MockMaintenanceOperationError("EDITOR_MAINTENANCE_REJECTED", "The proposal has already been rejected."),
    );

    const response = await scheduleDelete(
      jsonRequest("http://localhost/api/events/event_1/schedule", rejectionBody, "DELETE"),
      routeContext(),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "The proposal has already been rejected.",
      code: "EDITOR_MAINTENANCE_REJECTED",
    });
  });

  it("maps unauthorized maintenance operations to 403", async () => {
    acceptMaintenanceProposalMock.mockRejectedValueOnce(
      new MockMaintenanceOperationError("EDITOR_MAINTENANCE_UNAUTHORIZED", "You cannot manage this event."),
    );

    const response = await schedulePut(
      jsonRequest("http://localhost/api/events/event_1/schedule", acceptanceBody, "PUT"),
      routeContext(),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "You cannot manage this event.",
      code: "EDITOR_MAINTENANCE_UNAUTHORIZED",
    });
  });
});
