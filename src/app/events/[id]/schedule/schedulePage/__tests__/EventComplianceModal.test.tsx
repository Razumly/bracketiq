import { fireEvent, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";

import type { TeamComplianceSummary } from "@/lib/eventTeamCompliance";
import { renderWithMantine } from "../../../../../../../test/utils/renderWithMantine";
import EventComplianceModal, {
  buildEventComplianceContextKey,
} from "../EventComplianceModal";

const buildSummary = (teamId: string): TeamComplianceSummary => ({
  teamId,
  teamName: teamId === "team_1" ? "Summit United" : "Harbor Strikers",
  payment: {
    hasBill: false,
    billId: null,
    totalAmountCents: 0,
    paidAmountCents: 0,
    originalAmountCents: 0,
    discountAmountCents: 0,
    discountedAmountCents: 0,
    discounts: [],
    status: null,
    isPaidInFull: false,
  },
  documents: { signedCount: 0, requiredCount: 0 },
  users: [
    {
      userId: "user_1",
      fullName: "Alex Rivera",
      isMinorAtEvent: false,
      registrationType: "ADULT",
      payment: {
        hasBill: false,
        billId: null,
        totalAmountCents: 0,
        paidAmountCents: 0,
        originalAmountCents: 0,
        discountAmountCents: 0,
        discountedAmountCents: 0,
        discounts: [],
        status: null,
        isPaidInFull: false,
      },
      documents: { signedCount: 0, requiredCount: 0 },
      requiredDocuments: [],
    },
  ],
});

const renderModal = (teamId: string, opened = true, contextKey = teamId) => (
  <MantineProvider>
    <EventComplianceModal
      opened={opened}
      contextKey={contextKey}
      fullScreen={false}
      summary={buildSummary(teamId)}
      loading={false}
      onClose={jest.fn()}
    />
  </MantineProvider>
);

describe("EventComplianceModal", () => {
  it("does not carry expanded users into a different team context", () => {
    const { rerender } = renderWithMantine(renderModal("team_1"));

    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(
      screen.getByRole("button", { name: "Collapse" }),
    ).toBeInTheDocument();

    rerender(renderModal("team_2"));

    expect(screen.getByRole("button", { name: "Expand" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Collapse" }),
    ).not.toBeInTheDocument();
  });

  it("starts a fresh expansion context when the modal is reopened", () => {
    const { rerender } = renderWithMantine(renderModal("team_1"));

    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(screen.getByRole("button", { name: "Collapse" })).toBeInTheDocument();

    rerender(renderModal("team_1", false));
    rerender(renderModal("team_1"));

    expect(screen.getByRole("button", { name: "Expand" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Collapse" })).not.toBeInTheDocument();
  });

  it("does not carry expansion into a replacement compliance context for the same team", () => {
    const { rerender } = renderWithMantine(
      renderModal("team_1", true, "event_1:team_1"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(screen.getByRole("button", { name: "Collapse" })).toBeInTheDocument();

    rerender(renderModal("team_1", true, "event_2:team_1"));

    expect(screen.getByRole("button", { name: "Expand" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Collapse" })).not.toBeInTheDocument();
  });

  it("builds collision-safe identities from every compliance context dimension", () => {
    const baseIdentity = {
      eventId: "event_1",
      occurrenceSlotId: "slot_1",
      occurrenceDate: "2026-08-15",
      teamId: "team_1",
    };
    const baseKey = buildEventComplianceContextKey(baseIdentity);

    expect(baseKey).not.toBeNull();
    expect(
      buildEventComplianceContextKey({
        ...baseIdentity,
        eventId: "event_2",
      }),
    ).not.toBe(baseKey);
    expect(
      buildEventComplianceContextKey({
        ...baseIdentity,
        occurrenceSlotId: "slot_2",
      }),
    ).not.toBe(baseKey);
    expect(
      buildEventComplianceContextKey({
        ...baseIdentity,
        occurrenceDate: "2026-08-16",
      }),
    ).not.toBe(baseKey);
    expect(
      buildEventComplianceContextKey({
        ...baseIdentity,
        teamId: "team_2",
      }),
    ).not.toBe(baseKey);
    expect(
      buildEventComplianceContextKey({
        ...baseIdentity,
        eventId: "event_1:slot",
        occurrenceSlotId: "slot_1",
      }),
    ).not.toBe(
      buildEventComplianceContextKey({
        ...baseIdentity,
        eventId: "event_1",
        occurrenceSlotId: "slot:slot_1",
      }),
    );
    expect(
      buildEventComplianceContextKey({
        ...baseIdentity,
        teamId: null,
      }),
    ).toBeNull();
  });
});
