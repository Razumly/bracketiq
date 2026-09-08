"use client";

import { useMemo, useState, type ComponentProps } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import {
  Alert,
  Button,
} from "@/components/organization/organization-operation-ui";
import { isStripePaymentIntentClientSecret } from "@/lib/stripeClientSecret";
import { MOBILE_APP_THEME_TOKENS } from "@/app/theme/mobilePalette";
import PaymentForm from "./PaymentForm";

const stripePromiseByKey = new Map<string, ReturnType<typeof loadStripe>>();
const getStripePromise = (
  publishableKey: string,
): ReturnType<typeof loadStripe> => {
  const existing = stripePromiseByKey.get(publishableKey);
  if (existing) return existing;
  const next = loadStripe(publishableKey, {
    developerTools: { assistant: { enabled: false } },
  });
  stripePromiseByKey.set(publishableKey, next);
  return next;
};

type CheckoutProps = Omit<
  ComponentProps<typeof PaymentForm>,
  "feeBreakdown" | "paymentIntent"
> & {
  publishableKey?: string;
  paymentIntent?: string;
  feeBreakdown?: ComponentProps<typeof PaymentForm>["feeBreakdown"] | null;
  onClose: () => void;
};

export function StripePaymentCheckout({
  publishableKey,
  paymentIntent,
  feeBreakdown,
  onClose,
  ...formProps
}: CheckoutProps) {
  if (!publishableKey)
    return (
      <>
        <Alert color="red" mb="md">
          Payment system is not properly configured. Please contact support.
        </Alert>
        <Button fullWidth onClick={onClose}>
          Close
        </Button>
      </>
    );
  if (!isStripePaymentIntentClientSecret(paymentIntent) || !feeBreakdown) {
    return (
      <Alert color="red">
        Checkout could not be initialized. Please close this dialog and try
        again.
      </Alert>
    );
  }
  return (
    <ConfiguredCheckout
      key={`${publishableKey}:${paymentIntent}`}
      publishableKey={publishableKey}
      paymentIntent={paymentIntent}
      feeBreakdown={feeBreakdown}
      {...formProps}
    />
  );
}

function ConfiguredCheckout({
  publishableKey,
  ...formProps
}: ComponentProps<typeof PaymentForm> & { publishableKey: string }) {
  const stripePromise = useMemo(
    () => getStripePromise(publishableKey),
    [publishableKey],
  );
  // Keep the initial Elements amount for this intent while displayed fees update.
  const [initialAmount] = useState(() =>
    Math.max(1, Math.round(formProps.feeBreakdown.totalCharge)),
  );
  const options = useMemo(
    () =>
      initialAmount > 0
        ? {
            mode: "payment" as const,
            amount: initialAmount,
            currency: "usd",
            appearance: {
              theme: "stripe" as const,
              variables: { colorPrimary: MOBILE_APP_THEME_TOKENS.primary },
            },
          }
        : undefined,
    [initialAmount],
  );
  return (
    <Elements stripe={stripePromise} options={options}>
      <PaymentForm {...formProps} />
    </Elements>
  );
}
