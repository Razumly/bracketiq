/** @jest-environment jsdom */

import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import OrganizationCustomerBills from "../OrganizationCustomerBills";
import { mapOrganizationUserRow } from "../organizationCustomerModel";

const bill = mapOrganizationUserRow({
  bills: [
    {
      billId: "bill-1",
      ownerType: "USER",
      ownerId: "user-1",
      ownerName: "Casey Morgan",
      label: "Membership dues",
      sourceType: "MANUAL_CUSTOMER_BILL",
      totalAmountCents: 2000,
      paymentPlanEnabled: true,
      payments: [
        {
          paymentId: "payment-1",
          sequence: 1,
          status: "PROCESSING",
          amountCents: 2000,
          refundableAmountCents: 1250,
          isRefundable: true,
          paymentIntentId: "payment-intent-1",
        },
      ],
    },
  ],
}).bills[0];

const onEdit = jest.fn();
const onRefund = jest.fn();
const onCancelPlan = jest.fn();
const onCancelPayment = jest.fn();

function BillingExample({
  isOwner = true,
  canManageFinance = true,
  eventId = null,
}: {
  isOwner?: boolean;
  canManageFinance?: boolean;
  eventId?: string | null;
}) {
  const [refundAmounts, setRefundAmounts] = useState<Record<string, number>>(
    {},
  );
  return (
    <OrganizationCustomerBills
      bills={[{ ...bill, eventId }]}
      controls={{
        isOwner,
        canManageFinance,
        cancellingPlanId: null,
        cancellingPaymentId: null,
        refundingPaymentId: null,
        refundAmounts,
        setRefundAmounts,
        onEdit,
        onRefund,
        onCancelPlan,
        onCancelPayment,
      }}
    />
  );
}

beforeEach(() => jest.clearAllMocks());

it("opens a manual bill from the card without treating nested actions as card clicks", () => {
  render(<BillingExample />);
  fireEvent.click(screen.getByText("Membership dues"));
  expect(onEdit).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(
    screen.getByRole("button", { name: "Edit bill Membership dues" }),
    { key: "Enter" },
  );
  expect(onEdit).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("button", { name: "Refund", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel plan" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel pending" }));
  expect(onEdit).toHaveBeenCalledTimes(2);
  expect(onRefund).toHaveBeenCalledWith(
    expect.objectContaining({ billId: "bill-1" }),
    expect.objectContaining({ paymentId: "payment-1" }),
  );
  expect(onCancelPlan).toHaveBeenCalledWith(
    expect.objectContaining({ billId: "bill-1" }),
  );
  expect(onCancelPayment).toHaveBeenCalledWith(
    expect.objectContaining({ billId: "bill-1" }),
    expect.objectContaining({ paymentId: "payment-1" }),
  );
});

it("clamps a refund draft to the refundable amount without opening the bill editor", () => {
  render(<BillingExample />);
  const amount = screen.getByRole("spinbutton", {
    name: "Refund amount for payment 1",
  });
  fireEvent.change(amount, { target: { value: "99" } });
  expect(amount).toHaveValue(12.5);
  fireEvent.change(amount, { target: { value: "-1" } });
  expect(amount).toHaveValue(0);
  expect(onEdit).not.toHaveBeenCalled();
});

it("keeps financial actions unavailable to viewers and does not edit event bills", () => {
  const { rerender } = render(
    <BillingExample isOwner={false} canManageFinance={false} />,
  );
  fireEvent.click(screen.getByText("Membership dues"));
  expect(onEdit).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("button", { name: "Refund", exact: true }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Cancel plan" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Cancel pending" }),
  ).not.toBeInTheDocument();
  rerender(<BillingExample eventId="event-1" />);
  fireEvent.click(screen.getByText("Membership dues"));
  expect(onEdit).not.toHaveBeenCalled();
});
