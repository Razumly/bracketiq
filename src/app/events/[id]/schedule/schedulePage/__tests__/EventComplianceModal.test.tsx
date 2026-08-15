import { fireEvent, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";

import type { TeamComplianceSummary } from "@/lib/eventTeamCompliance";
import { renderWithMantine } from "../../../../../../../test/utils/renderWithMantine";
import EventComplianceModal from "../EventComplianceModal";

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

const renderModal = (teamId: string) => (
  <MantineProvider>
    <EventComplianceModal
      opened
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
});
