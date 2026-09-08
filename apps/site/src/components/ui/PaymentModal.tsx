"use client";

import type { Event, PaymentIntent } from "@/types";
import {
  Modal,
  Alert,
} from "@/components/organization/organization-operation-ui";
import { StripePaymentCheckout } from "./StripePaymentCheckout";
import { PaymentResultView } from "./PaymentResultView";
import { usePaymentDialogState } from "./usePaymentDialogState";

export type PaymentEventSummary = Partial<Event> & {
  name: string;
  location: string;
  eventType: Event["eventType"];
  price: number;
};

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: PaymentEventSummary;
  paymentData: PaymentIntent | null;
  payerName?: string | null;
  onPaymentSuccess: () => Promise<void> | void;
  onPaymentPending?: () => Promise<void> | void;
}

const titles = {
  payment: "Payment",
  pending: "Payment Pending",
  success: "Payment Complete",
};

export default function PaymentModal(props: PaymentModalProps) {
  const state = usePaymentDialogState(props);
  const data = state.activePaymentData;
  const publishableKey =
    data?.publishableKey || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  const close = () => {
    props.onClose();
    state.reset();
  };
  if (!props.isOpen) return null;
  return (
    <Modal
      opened
      onClose={close}
      title={publishableKey ? titles[state.view] : "Configuration Error"}
      size="lg"
      centered
    >
      {state.error && (
        <Alert color="red" mb="md">
          {state.error}
        </Alert>
      )}
      {state.view === "payment" ? (
        <StripePaymentCheckout
          publishableKey={publishableKey}
          paymentIntent={data?.paymentIntent}
          feeBreakdown={data?.feeBreakdown}
          onClose={close}
          onSuccess={state.handleSuccess}
          onPending={state.handlePending}
          onError={state.setError}
          eventName={props.event.name ?? 'Event'}
          billingAddress={state.billingAddress}
          billingEmail={state.billingEmail}
          billingName={props.payerName}
          onFeeBreakdownChange={state.updateFees}
        />
      ) : (
        <PaymentResultView
          view={state.view}
          reloading={state.reloading}
          copy={state.copy}
          onClose={close}
        />
      )}
    </Modal>
  );
}
