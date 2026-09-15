"use client";

import { useState, type ReactNode } from "react";
import type { Event, PaymentIntent } from "@/types";
import {
  Modal,
  Alert,
} from "@/components/organization/organization-operation-ui";
import { StripePaymentCheckout } from "./StripePaymentCheckout";
import { PaymentOrderSummary, PaymentResultView } from "./PaymentResultView";
import { usePaymentDialogState } from "./usePaymentDialogState";
import { isStripePaymentIntentClientSecret } from "@/lib/stripeClientSecret";

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
  summary?: ReactNode;
  originalPrice?: number;
}

const titles = {
  payment: "Payment",
  pending: "Payment Pending",
  success: "Payment Complete",
};

export default function PaymentModal(props: PaymentModalProps) {
  const [processing, setProcessing] = useState(false);
  const state = usePaymentDialogState(props);
  const data = state.activePaymentData;
  const publishableKey =
    data?.publishableKey || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  const checkoutConfigured = Boolean(publishableKey && isStripePaymentIntentClientSecret(data?.paymentIntent));
  const close = () => {
    if (processing) return;
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
      withCloseButton={!processing}
    >
      {props.summary && <div className="mb-5">{props.summary}</div>}
      {state.error && (
        <Alert color="red" mb="md">
          {state.error}
        </Alert>
      )}
      {state.view === "payment" && !checkoutConfigured && data?.feeBreakdown && (
        <div className="mb-5">
          <PaymentOrderSummary feeBreakdown={data.feeBreakdown} originalPrice={props.originalPrice} />
        </div>
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
          originalPrice={props.originalPrice}
          onBusyChange={setProcessing}
          onFeeBreakdownChange={state.updateFees}
        />
      ) : (
        <PaymentResultView
          view={state.view}
          reloading={state.reloading}
          copy={state.copy}
          onClose={close}
          orderName={props.event.name}
          orderDetail={props.event.location}
          originalPrice={props.originalPrice}
          feeBreakdown={data?.feeBreakdown}
        />
      )}
    </Modal>
  );
}
