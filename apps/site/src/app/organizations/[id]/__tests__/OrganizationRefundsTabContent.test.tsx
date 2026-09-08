import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import OrganizationRefundsTabContent from "../OrganizationRefundsTabContent";
import type { RefundRequest } from "@/types";

jest.mock("@/lib/refundRequestService", () => ({
  __esModule: true,
  refundRequestService: {
    listRefundRequests: jest.fn(),
    updateRefundStatus: jest.fn(),
  },
}));
jest.mock("@/lib/eventService", () => ({
  eventService: { getEventById: jest.fn() },
}));
jest.mock("@/lib/userService", () => ({
  userService: { getUsersByIds: jest.fn() },
}));
jest.mock("@/lib/organizationService", () => ({
  organizationService: { getOrganizationsByIds: jest.fn() },
}));
jest.mock("@/lib/teamService", () => ({
  teamService: { getTeamsByIds: jest.fn() },
}));

const { refundRequestService } = jest.requireMock(
  "@/lib/refundRequestService",
) as {
  refundRequestService: {
    listRefundRequests: jest.Mock;
    updateRefundStatus: jest.Mock;
  };
};
const { eventService } = jest.requireMock("@/lib/eventService") as {
  eventService: { getEventById: jest.Mock };
};
const { userService } = jest.requireMock("@/lib/userService") as {
  userService: { getUsersByIds: jest.Mock };
};
const { organizationService } = jest.requireMock(
  "@/lib/organizationService",
) as {
  organizationService: { getOrganizationsByIds: jest.Mock };
};
const { teamService } = jest.requireMock("@/lib/teamService") as {
  teamService: { getTeamsByIds: jest.Mock };
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const pendingRefund: RefundRequest = {
  $id: "refund-1",
  eventId: "event-1",
  userId: "user-1",
  hostId: "host-1",
  organizationId: "org-1",
  reason: "Duplicate registration",
  status: "WAITING",
};

describe("OrganizationRefundsTabContent", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    refundRequestService.listRefundRequests.mockResolvedValue([
      {
        $id: "refund-1",
        eventId: "event-1",
        userId: "user-1",
        hostId: "host-1",
        organizationId: "org-1",
        reason: "Duplicate registration",
        status: "WAITING",
        $createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    eventService.getEventById.mockResolvedValue({
      $id: "event-1",
      name: "Winter Open",
    });
    userService.getUsersByIds.mockResolvedValue([
      { $id: "user-1", firstName: "Test", lastName: "User" },
      { $id: "host-1", firstName: "Host", lastName: "User" },
    ]);
    organizationService.getOrganizationsByIds.mockResolvedValue([
      { $id: "org-1", name: "Test Organization" },
    ]);
    teamService.getTeamsByIds.mockResolvedValue([]);
  });

  it("loads the organization-scoped refund list through the organization tab", async () => {
    render(<OrganizationRefundsTabContent organizationId="org-1" />);

    await waitFor(() =>
      expect(refundRequestService.listRefundRequests).toHaveBeenCalledWith({
        organizationId: "org-1",
        userId: undefined,
        hostId: undefined,
      }),
    );

    expect((await screen.findAllByText("Winter Open")).length).toBeGreaterThan(
      0,
    );
    expect(
      screen.getAllByText("Duplicate registration").length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Search refund requests" }),
      { target: { value: "Missing request" } },
    );
    expect(
      screen.queryByText("Duplicate registration"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("No refund requests match these filters."),
    ).toBeInTheDocument();
  });

  it("keeps a refund status filter selected before the request completes", async () => {
    let resolveRequest!: (value: unknown[]) => void;
    const request = new Promise<unknown[]>((resolve) => {
      resolveRequest = resolve;
    });
    refundRequestService.listRefundRequests.mockReturnValueOnce(request);
    render(<OrganizationRefundsTabContent organizationId="org-1" />);
    const denied = screen.getByRole("button", { name: /^Denied/ });
    fireEvent.click(denied);
    expect(denied).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Loading refunds")).toBeInTheDocument();
    await act(async () => {
      resolveRequest([
        {
          $id: "pending",
          eventId: "event-1",
          organizationId: "org-1",
          userId: "user-1",
          status: "WAITING",
          reason: "Pending refund",
        },
      ]);
      await request;
    });
    await waitFor(() =>
      expect(screen.queryByText("Loading refunds")).not.toBeInTheDocument(),
    );
    expect(denied).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Pending refund")).not.toBeInTheDocument();
  });

  it("shows a name-load failure without an empty result or actionable request", async () => {
    userService.getUsersByIds.mockRejectedValueOnce(
      new Error("Customer lookup failed"),
    );
    render(<OrganizationRefundsTabContent organizationId="org-1" />);
    fireEvent.change(
      screen.getByRole("textbox", { name: "Search refund requests" }),
      { target: { value: "Test" } },
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Customer lookup failed",
    );
    expect(
      screen.getByRole("textbox", { name: "Search refund requests" }),
    ).toHaveValue("Test");
    expect(
      screen.queryByText("No refund requests match these filters."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Deny" }),
    ).not.toBeInTheDocument();
    expect(refundRequestService.updateRefundStatus).not.toHaveBeenCalled();
  });

  it("rejects a missing display name instead of displaying a user identifier", async () => {
    userService.getUsersByIds.mockResolvedValueOnce([
      { $id: "user-1", userName: "internal-user-name" },
      { $id: "host-1", firstName: "Host", lastName: "User" },
    ]);
    render(<OrganizationRefundsTabContent organizationId="org-1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load the customer or host name",
    );
    expect(screen.queryByText("internal-user-name")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Deny" }),
    ).not.toBeInTheDocument();
  });

  it("does not replace the current organization when an earlier name load finishes", async () => {
    const oldNames = deferred<Array<{ $id: string; name: string }>>();
    organizationService.getOrganizationsByIds.mockReturnValueOnce(
      oldNames.promise,
    );
    const { rerender } = render(
      <OrganizationRefundsTabContent organizationId="org-1" />,
    );
    await waitFor(() =>
      expect(organizationService.getOrganizationsByIds).toHaveBeenCalledWith([
        "org-1",
      ]),
    );
    refundRequestService.listRefundRequests.mockResolvedValueOnce([
      {
        ...pendingRefund,
        $id: "refund-2",
        organizationId: "org-2",
        reason: "Current request",
      },
    ]);
    organizationService.getOrganizationsByIds.mockResolvedValueOnce([
      { $id: "org-2", name: "Current Organization" },
    ]);
    rerender(<OrganizationRefundsTabContent organizationId="org-2" />);
    await screen.findAllByText("Current request");
    await act(async () => {
      oldNames.resolve([{ $id: "org-1", name: "Old Organization" }]);
    });
    expect(screen.getAllByText("Current request").length).toBeGreaterThan(0);
    expect(
      screen.queryByText("Duplicate registration"),
    ).not.toBeInTheDocument();
  });

  it("ignores an earlier request failure after the organization changes", async () => {
    const oldRequest = deferred<RefundRequest[]>();
    refundRequestService.listRefundRequests.mockReturnValueOnce(
      oldRequest.promise,
    );
    const { rerender } = render(
      <OrganizationRefundsTabContent organizationId="old-org" />,
    );
    rerender(<OrganizationRefundsTabContent organizationId="org-1" />);
    await screen.findAllByText("Duplicate registration");
    await act(async () => {
      oldRequest.reject(new Error("Old request failed"));
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.getAllByText("Duplicate registration").length,
    ).toBeGreaterThan(0);
  });

  it("keeps a failed decision pending and allows the user to retry", async () => {
    refundRequestService.updateRefundStatus.mockRejectedValueOnce(
      new Error("Decision unavailable"),
    );
    render(<OrganizationRefundsTabContent organizationId="org-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Deny" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Decision unavailable",
    );
    expect(screen.getByRole("button", { name: "Deny" })).toBeEnabled();
    refundRequestService.updateRefundStatus.mockResolvedValueOnce({
      ...pendingRefund,
      status: "REJECTED",
    });
    fireEvent.click(screen.getByRole("button", { name: "Deny" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Deny" })).toBeDisabled(),
    );
    expect(refundRequestService.updateRefundStatus).toHaveBeenLastCalledWith(
      "refund-1",
      "REJECTED",
      undefined,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Pending/ }));
    expect(
      screen.queryByText("Duplicate registration"),
    ).not.toBeInTheDocument();
  });

  it("loads repeated references once and resolves team names in a batch", async () => {
    refundRequestService.listRefundRequests.mockResolvedValueOnce([
      { ...pendingRefund, teamId: "team-1" },
      {
        ...pendingRefund,
        $id: "refund-2",
        teamId: "team-2",
        reason: "Second request",
      },
    ]);
    teamService.getTeamsByIds.mockResolvedValueOnce([
      { $id: "team-1", name: "First team" },
      { $id: "team-2", name: "Second team" },
    ]);
    render(<OrganizationRefundsTabContent organizationId="org-1" />);
    expect(await screen.findByText("First team")).toBeInTheDocument();
    expect(eventService.getEventById).toHaveBeenCalledTimes(1);
    expect(userService.getUsersByIds).toHaveBeenCalledWith([
      "user-1",
      "host-1",
    ]);
    expect(organizationService.getOrganizationsByIds).toHaveBeenCalledWith([
      "org-1",
    ]);
    expect(teamService.getTeamsByIds).toHaveBeenCalledWith(
      ["team-1", "team-2"],
      true,
    );
  });
});
