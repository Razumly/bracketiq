import React, { useEffect, useState } from "react";
import {
  useStripe,
  useElements,
  PaymentElement,
} from "@stripe/react-stripe-js";
import type { BillingAddress, FeeBreakdown } from "@/types";
import { formatPrice } from "@/types";
import { Button } from "@/components/organization/organization-operation-ui";

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
  onFeeBreakdownChange?: (feeBreakdown: FeeBreakdown) => void;
}

const normalizeCents = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0;

const getVisibleTaxAmount = (feeBreakdown: FeeBreakdown): number => {
  const taxAmount = normalizeCents(feeBreakdown.taxAmount);
  return taxAmount > 0 ? taxAmount : 0;
};

const getVisibleTotalCharge = (feeBreakdown: FeeBreakdown): number =>
  normalizeCents(feeBreakdown.eventPrice) + getVisibleTaxAmount(feeBreakdown);

export default function PaymentForm({
  onSuccess,
  onPending,
  onError,
  eventName,
  feeBreakdown: initialFeeBreakdown,
  paymentIntent,
  billingAddress,
  billingEmail,
  billingName,
}: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [feeBreakdown, setFeeBreakdown] = useState(initialFeeBreakdown);
  const amount = getVisibleTotalCharge(feeBreakdown);
  const reportPending = () => (onPending ?? onSuccess)();

  useEffect(() => {
    setFeeBreakdown(initialFeeBreakdown);
  }, [initialFeeBreakdown, paymentIntent]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) return;
    setLoading(true);

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
        reportPending();
      } else {
        onSuccess();
      }
    } catch (err) {
      onError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="text-foreground mb-2 font-medium">Payment Details</h3>
        <p className="text-muted-foreground mb-4 text-sm">
          Paying for <strong>{eventName}</strong>
        </p>
      </div>

      <PaymentElement
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

      <div className="border-border border-t pt-4">
        <div className="border-border bg-muted text-muted-foreground org-radius-surface mb-3 border px-3 py-2 text-sm">
          <span>Processing fees are included in the online price.</span>
        </div>
        <div className="mb-4 flex items-center justify-between text-lg font-semibold">
          <span>Total:</span>
          <span>{formatPrice(amount)}</span>
        </div>

        <Button
          type="submit"
          disabled={!stripe || !elements}
          loading={loading}
          fullWidth
        >
          {loading ? "Processing..." : `Pay ${formatPrice(amount)}`}
        </Button>
      </div>
    </form>
  );
}
