"use client";

import type {
  Dispatch,
  KeyboardEvent,
  MouseEvent,
  SetStateAction,
} from "react";
import {
  Badge,
  Button,
  Group,
  NumberInput,
  Paper,
  Stack,
  Text,
} from "@/components/organization/organization-operation-ui";
import { formatPrice } from "@/types";
import { formatBillPaidProgress } from "@/lib/billDisplay";
import type {
  OrganizationBillPaymentSummary,
  OrganizationBillSummary,
} from "./organizationCustomerModel";
import {
  formatCustomerMetaToken,
  formatSummaryDate,
} from "./organizationCustomerPresentation";

type Payment = OrganizationBillPaymentSummary;
type Bill = OrganizationBillSummary;
type BillingControls = {
  isOwner: boolean;
  canManageFinance: boolean;
  cancellingPlanId: string | null;
  cancellingPaymentId: string | null;
  refundingPaymentId: string | null;
  refundAmounts: Record<string, number>;
  setRefundAmounts: Dispatch<SetStateAction<Record<string, number>>>;
  onEdit: (bill: Bill) => void;
  onCancelPlan: (bill: Bill) => void | Promise<void>;
  onRefund: (bill: Bill, payment: Payment) => void | Promise<void>;
  onCancelPayment: (bill: Bill, payment: Payment) => void | Promise<void>;
};

function canEditBill(bill: Bill, controls: BillingControls) {
  return (
    controls.canManageFinance &&
    !bill.eventId &&
    (!bill.sourceType || bill.sourceType === "MANUAL_CUSTOMER_BILL")
  );
}

function editableCardProps(bill: Bill, controls: BillingControls) {
  if (!canEditBill(bill, controls)) return {};
  const isChildControl = (event: MouseEvent | KeyboardEvent) => {
    const control = (event.target as HTMLElement).closest(
      'button, input, [role="button"]',
    );
    return control && control !== event.currentTarget;
  };
  return {
    onClick: (event: MouseEvent<HTMLDivElement>) => {
      if (!isChildControl(event)) controls.onEdit(bill);
    },
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      if (isChildControl(event)) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        controls.onEdit(bill);
      }
    },
    role: "button",
    tabIndex: 0,
    "aria-label": `Edit bill ${bill.label ?? bill.eventName ?? "Customer bill"}`,
    style: { cursor: "pointer" },
  };
}

function billSummary(bill: Bill, payments: Payment[]) {
  const meta = [
    bill.ownerName,
    bill.ownerType,
    formatCustomerMetaToken(bill.status) ?? "Open",
    bill.paymentPlanEnabled ? "Payment plan" : null,
  ].filter(Boolean);
  const firstDueDate = payments[0]?.dueDate;
  const paymentLine = [
    formatBillPaidProgress(bill),
    firstDueDate ? `Due ${formatSummaryDate(firstDueDate)}` : null,
    bill.refundedAmountCents > 0
      ? `${formatPrice(bill.refundedAmountCents)} refunded`
      : null,
    bill.refundableAmountCents > 0
      ? `${formatPrice(bill.refundableAmountCents)} refundable`
      : null,
  ].filter(Boolean);
  return { meta: meta.join(" • "), paymentLine: paymentLine.join(" • ") };
}

function canCancelPlan(bill: Bill, controls: BillingControls) {
  return (
    controls.isOwner &&
    bill.paymentPlanEnabled &&
    bill.status !== "CANCELLED" &&
    bill.payments.some(
      (payment) => payment.status !== "PAID" && payment.status !== "VOID",
    )
  );
}

function canRefund(payment: Payment, controls: BillingControls) {
  return Boolean(
    controls.isOwner &&
      payment.isRefundable &&
      payment.paymentIntentId &&
      payment.refundableAmountCents > 0,
  );
}

function RefundAction({
  bill,
  payment,
  controls,
}: {
  bill: Bill;
  payment: Payment;
  controls: BillingControls;
}) {
  const max = payment.refundableAmountCents / 100;
  const onChange = (value: string | number) => {
    const amount = typeof value === "number" ? value : Number(value);
    controls.setRefundAmounts((current) => ({
      ...current,
      [payment.paymentId]: Number.isFinite(amount)
        ? Math.min(max, Math.max(0, amount))
        : 0,
    }));
  };
  return (
    <>
      <NumberInput
        aria-label={`Refund amount for payment ${payment.sequence || 1}`}
        min={0}
        max={max}
        decimalScale={2}
        fixedDecimalScale
        prefix="$"
        value={controls.refundAmounts[payment.paymentId] ?? max}
        onChange={onChange}
        w={132}
        size="xs"
      />
      <Button
        size="compact-xs"
        loading={controls.refundingPaymentId === payment.paymentId}
        disabled={Boolean(
          controls.refundingPaymentId &&
            controls.refundingPaymentId !== payment.paymentId,
        )}
        onClick={() => void controls.onRefund(bill, payment)}
      >
        Refund
      </Button>
    </>
  );
}

function PaymentActions({
  bill,
  payment,
  controls,
}: {
  bill: Bill;
  payment: Payment;
  controls: BillingControls;
}) {
  const isRefundable = canRefund(payment, controls);
  const isCancellable = controls.isOwner && payment.status === "PROCESSING";
  if (!isRefundable && !isCancellable) return null;
  return (
    <Group gap="xs" align="flex-end" wrap="wrap">
      {isRefundable && (
        <RefundAction bill={bill} payment={payment} controls={controls} />
      )}
      {isCancellable && (
        <Button
          size="compact-xs"
          variant="light"
          color="red"
          loading={controls.cancellingPaymentId === payment.paymentId}
          disabled={Boolean(
            controls.cancellingPaymentId &&
              controls.cancellingPaymentId !== payment.paymentId,
          )}
          onClick={() => void controls.onCancelPayment(bill, payment)}
        >
          Cancel pending
        </Button>
      )}
    </Group>
  );
}

function PaymentRow({
  bill,
  payment,
  controls,
}: {
  bill: Bill;
  payment: Payment;
  controls: BillingControls;
}) {
  const statusLabel = formatCustomerMetaToken(payment.status) ?? "Pending";
  const statusColor =
    payment.status === "PAID"
      ? "green"
      : payment.status === "PROCESSING"
        ? "yellow"
        : "gray";
  return (
    <Stack gap={6} className="rounded-md bg-slate-50 px-3 py-2">
      <Group justify="space-between" gap="xs" wrap="wrap">
        <Group gap={6}>
          <Text size="xs" fw={600}>
            Payment #{payment.sequence || 1}
          </Text>
          <Badge size="xs" variant="light" color={statusColor}>
            {statusLabel}
          </Badge>
        </Group>
        <Text size="xs" c="dimmed">
          {formatPrice(payment.amountCents)}
          {payment.refundedAmountCents > 0
            ? ` • ${formatPrice(payment.refundedAmountCents)} refunded`
            : ""}
        </Text>
      </Group>
      <PaymentActions bill={bill} payment={payment} controls={controls} />
    </Stack>
  );
}

function CustomerBillCard({
  bill,
  controls,
}: {
  bill: Bill;
  controls: BillingControls;
}) {
  const payments = bill.payments
    .slice()
    .sort((a, b) => a.sequence - b.sequence);
  const summary = billSummary(bill, payments);
  return (
    <Paper
      withBorder
      radius="md"
      p="sm"
      className="org-customer-detail-item org-customer-bill-card"
      {...editableCardProps(bill, controls)}
    >
      <Group justify="space-between" align="flex-start" gap="xs" wrap="wrap">
        <Stack gap={0} className="min-w-0">
          <Text size="sm" fw={500}>
            {bill.eventName ?? bill.label ?? "Customer bill"}
          </Text>
          <Text size="xs" c="dimmed">
            {summary.meta}
          </Text>
          {summary.paymentLine && (
            <Text size="xs" c="dimmed">
              {summary.paymentLine}
            </Text>
          )}
        </Stack>
        {canCancelPlan(bill, controls) && (
          <Button
            size="compact-xs"
            variant="light"
            color="red"
            loading={controls.cancellingPlanId === bill.billId}
            onClick={() => void controls.onCancelPlan(bill)}
          >
            Cancel plan
          </Button>
        )}
      </Group>
      {payments.length > 0 && (
        <Stack gap={6}>
          {payments.map((payment) => (
            <PaymentRow
              key={payment.paymentId}
              bill={bill}
              payment={payment}
              controls={controls}
            />
          ))}
        </Stack>
      )}
    </Paper>
  );
}

export default function OrganizationCustomerBills({
  bills,
  controls,
  emptyText = "No bills.",
}: {
  bills: Bill[];
  controls: BillingControls;
  emptyText?: string;
}) {
  if (bills.length === 0)
    return (
      <Text size="xs" c="dimmed">
        {emptyText}
      </Text>
    );
  return (
    <Stack gap="sm">
      {bills.map((bill) => (
        <CustomerBillCard key={bill.billId} bill={bill} controls={controls} />
      ))}
    </Stack>
  );
}
