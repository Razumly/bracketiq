/** @jest-environment jsdom */

import {
  mapOrganizationTeamCustomerRow,
  mapOrganizationUserRow,
} from "../organizationCustomerModel";

describe("Organization customer response mapping", () => {
  it("normalizes bill amounts without losing paid, discount, or refund data", () => {
    const customer = mapOrganizationUserRow({
      userId: "user-1",
      fullName: "  Casey Morgan  ",
      bills: [
        {
          billId: "bill-1",
          ownerType: "USER",
          ownerId: "user-1",
          ownerName: "Casey Morgan",
          totalAmountCents: "2500.4",
          discountAmountCents: "500",
          paidAmountCents: -10,
          refundedAmountCents: "125.5",
          refundableAmountCents: 2374,
          payments: [
            { id: "payment-1", status: "PAID", amountCents: "2500.4" },
            {
              paymentId: "payment-2",
              status: "PAID",
              amountCents: 500,
              paidAmountCents: 0,
            },
            { paymentId: "", amountCents: 100 },
          ],
          discounts: [
            {
              id: "discount-1",
              discountAmountCents: "500",
              discountedAmountCents: "2000",
            },
            null,
          ],
        },
        { billId: "" },
      ],
    });

    expect(customer.fullName).toBe("Casey Morgan");
    expect(customer.bills).toHaveLength(1);
    expect(customer.bills[0]).toMatchObject({
      billId: "bill-1",
      totalAmountCents: 2500,
      originalAmountCents: 2500,
      discountedAmountCents: 2000,
      discountAmountCents: 500,
      paidAmountCents: 0,
      refundedAmountCents: 126,
      refundableAmountCents: 2374,
      payments: [
        {
          paymentId: "payment-1",
          billId: "bill-1",
          amountCents: 2500,
          paidAmountCents: 2500,
        },
        {
          paymentId: "payment-2",
          billId: "bill-1",
          amountCents: 500,
          paidAmountCents: 0,
        },
      ],
      discounts: [
        {
          id: "discount-1",
          discountAmountCents: 500,
          discountedAmountCents: 2000,
        },
      ],
    });
  });

  it("keeps document evidence and membership data while removing rows without identifiers", () => {
    const customer = mapOrganizationUserRow({
      userId: "user-1",
      events: [
        {
          eventId: "event-1",
          eventName: "  Autumn League ",
          imageId: " image-1 ",
        },
        {},
      ],
      teams: [
        {
          teamId: "team-1",
          teamName: " River City ",
          isCaptain: true,
          jerseyNumber: "7",
        },
        {},
      ],
      documents: [
        {
          signedDocumentRecordId: "signed-1",
          title: " Waiver ",
          type: "TEXT",
          content: "Signed terms",
          documentRequirementTitle: " Adult waiver ",
          versionSequence: 2,
          provenance: "IMPORTED",
          historicalSigningDate: "2026-08-01",
          scopeType: "EVENT",
          scopeId: "event-1",
        },
        {},
      ],
    });

    expect(customer.events).toMatchObject([
      { eventId: "event-1", eventName: "Autumn League", imageId: "image-1" },
    ]);
    expect(customer.teams).toMatchObject([
      {
        teamId: "team-1",
        teamName: "River City",
        isCaptain: true,
        jerseyNumber: "7",
      },
    ]);
    expect(customer.documents).toMatchObject([
      {
        signedDocumentRecordId: "signed-1",
        title: "Waiver",
        type: "TEXT",
        content: "Signed terms",
        documentRequirementTitle: "Adult waiver",
        versionSequence: 2,
        provenance: "IMPORTED",
        historicalSigningDate: "2026-08-01",
        scopeType: "EVENT",
        scopeId: "event-1",
      },
    ]);
  });

  it("preserves team relationships and reports missing names without exposing record identifiers", () => {
    const team = mapOrganizationTeamCustomerRow({
      canonicalTeamId: "team-private-id",
      name: "River City",
      teamSize: "12",
      manager: {
        userId: "manager-1",
        fullName: "Casey Morgan",
        role: "MANAGER",
      },
      headCoach: null,
      assistantCoaches: [
        { userId: "coach-1", fullName: "Alex Green", role: "ASSISTANT_COACH" },
        {},
      ],
      members: [
        { userId: "member-1", fullName: "Jordan Smith", isCaptain: true },
      ],
      registrations: [
        {
          eventId: "event-1",
          eventTeamId: "private-event-team",
          billIds: ["bill-1", null],
          memberCount: "4",
        },
      ],
      bills: [
        {
          billId: "bill-1",
          ownerId: "private-owner-id",
          totalAmountCents: 1000,
        },
      ],
      totals: {
        totalAmountCents: "1000",
        paidAmountCents: "600",
        refundableAmountCents: -10,
      },
    });

    expect(team).toMatchObject({
      teamSize: 12,
      manager: { userId: "manager-1", role: "MANAGER" },
      headCoach: null,
      assistantCoaches: [{ userId: "coach-1", role: "ASSISTANT_COACH" }],
      members: [{ userId: "member-1", isCaptain: true }],
      registrations: [
        {
          eventTeamId: "private-event-team",
          eventTeamName: "Team name unavailable",
          billIds: ["bill-1"],
          memberCount: 4,
        },
      ],
      bills: [{ billId: "bill-1", ownerName: "Customer name unavailable" }],
      totals: {
        totalAmountCents: 1000,
        paidAmountCents: 600,
        refundableAmountCents: 0,
      },
    });
  });
});
