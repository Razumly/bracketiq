"use client";

import React, { useState } from "react";
import {
  useStripe,
  useElements,
  PaymentElement,
} from "@stripe/react-stripe-js";
import type { BillingAddress, FeeBreakdown } from "@/types";
import { formatPrice } from "@/types";
import { Button } from "@/components/organization/organization-operation-ui";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { PaymentOrderSummary } from "./PaymentResultView";

interface PaymentFormProps {
  onSuccess: () => void;
  onPending?: () => void;
  onError: (error: string) => void;
  eventName: string;
  feeBreakdown: FeeBreakdown;
  paymentIntent: string;
  billingAddress?: BillingAddress | null;
  billingEmail?: string | null;
  billingName?: string | null;
  originalPrice?: number;
  onBusyChange?: (busy: boolean) => void;
  onFeeBreakdownChange?: (feeBreakdown: FeeBreakdown) => void;
}

export default function PaymentForm({
  onSuccess,
  onPending,
  onError,
  eventName,
  feeBreakdown,
  paymentIntent,
  billingAddress,
  billingEmail,
  billingName,
  originalPrice,
  onBusyChange,
}: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [elementReady, setElementReady] = useState(false);
  const amount = feeBreakdown.totalCharge;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements || !elementReady || loading) return;
    setLoading(true);
    onBusyChange?.(true);

    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        onError(submitError.message || "Payment details are incomplete.");
        return;
      }

      const { error, paymentIntent: confirmedPaymentIntent } =
        await stripe.confirmPayment({
          elements,
          clientSecret: paymentIntent,
          confirmParams: {
            return_url: `${window.location.origin}/payment-success`,
          },
          redirect: "if_required",
        });

      if (error) {
        onError(error.message || "Payment failed");
      } else if (confirmedPaymentIntent?.status === "processing") {
        onPending?.();
      } else if (confirmedPaymentIntent?.status === "succeeded") {
        onSuccess();
      } else {
        onError("Payment is not complete. Review the Stripe form before trying again.");
      }
    } catch (err) {
      onError("An unexpected error occurred");
    } finally {
      setLoading(false);
      onBusyChange?.(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="text-foreground mb-2 flex items-center gap-2 font-semibold">
          <ShieldCheck aria-hidden="true" className="size-5" /> Pay securely with Stripe
        </h3>
        <p className="text-muted-foreground text-sm">Paying for <strong>{eventName}</strong>. Stripe collects and protects your payment details.</p>
      </div>

      <PaymentElement
        onReady={() => setElementReady(true)}
        onLoadError={() => onError("The Stripe payment form could not load. Close payment and try again. Your order is kept.")}
        options={{
          layout: {
            type: "tabs",
            defaultCollapsed: false,
          },
          defaultValues: billingAddress
            ? {
                billingDetails: {
                  name: billingName ?? undefined,
                  email: billingEmail ?? undefined,
                  address: {
                    line1: billingAddress.line1,
                    line2: billingAddress.line2 ?? undefined,
                    city: billingAddress.city,
                    state: billingAddress.state,
                    postal_code: billingAddress.postalCode,
                    country: billingAddress.countryCode,
                  },
                },
              }
            : undefined,
        }}
      />

      <div className="border-border space-y-4 border-t pt-4">
        <PaymentOrderSummary feeBreakdown={feeBreakdown} originalPrice={originalPrice} />
        <p id="stripe-payment-readiness" role="status" className="text-sm text-muted-foreground">
          {loading ? "Processing payment. Keep this window open." : !stripe || !elements || !elementReady ? "Loading the secure Stripe payment form. Wait before paying." : "Payment details stay with Stripe, not BracketIQ."}
        </p>
        <Button
          type="submit"
          disabled={!stripe || !elements || !elementReady}
          loading={loading}
          aria-describedby="stripe-payment-readiness"
          leftSection={<LockKeyhole aria-hidden="true" className="size-4" />}
          fullWidth
        >
          {loading ? "Processing..." : `Pay ${formatPrice(amount)}`}
        </Button>
      </div>
    </form>
  );
}
