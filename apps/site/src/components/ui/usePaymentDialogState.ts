"use client";

import { useEffect, useRef, useState } from "react";
import type { BillingAddress, FeeBreakdown, PaymentIntent } from "@/types";
import { billingAddressService } from "@/lib/billingAddressService";
import { getPaymentModalCopy } from "./paymentModalCopy";

type PaymentDialogStateProps = {
  isOpen: boolean;
  paymentData: PaymentIntent | null;
  onPaymentSuccess: () => Promise<void> | void;
  onPaymentPending?: () => Promise<void> | void;
};

export function usePaymentDialogState({
  isOpen,
  paymentData,
  onPaymentSuccess,
  onPaymentPending,
}: PaymentDialogStateProps) {
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"payment" | "success" | "pending">(
    "payment",
  );
  const [reloading, setReloading] = useState(false);
  const [billingAddress, setBillingAddress] = useState<BillingAddress | null>(
    null,
  );
  const [billingEmail, setBillingEmail] = useState<string | null>(null);
  const [activePaymentData, setActivePaymentData] = useState(paymentData);
  const mounted = useRef(true);
  const copy = getPaymentModalCopy(
    activePaymentData?.feeBreakdown?.purchaseType,
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setActivePaymentData(paymentData);
      setView("payment");
    }
  }, [isOpen, paymentData]);

  useEffect(() => {
    if (!isOpen) {
      setBillingAddress(null);
      setBillingEmail(null);
      return;
    }
    let cancelled = false;
    billingAddressService
      .getBillingAddressProfile()
      .then((profile) => {
        if (!cancelled && mounted.current) {
          setBillingAddress(profile.billingAddress ?? null);
          setBillingEmail(profile.email ?? null);
        }
      })
      .catch((failure) => {
        console.error(
          "Failed to load billing address for payment modal",
          failure,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  async function showResult(
    nextView: "success" | "pending",
    refresh: () => Promise<void> | void,
  ) {
    setError(null);
    setView(nextView);
    setReloading(true);
    try {
      await refresh();
    } catch {
      if (mounted.current) setError(copy.refreshFailureMessage);
    } finally {
      if (mounted.current) setReloading(false);
    }
  }

  const reset = () => {
    setView("payment");
    setError(null);
    setReloading(false);
  };
  const updateFees = (feeBreakdown: FeeBreakdown) =>
    setActivePaymentData((current) =>
      current ? { ...current, feeBreakdown } : current,
    );
  return {
    error,
    setError,
    view,
    reloading,
    billingAddress,
    billingEmail,
    activePaymentData,
    copy,
    reset,
    updateFees,
    handleSuccess: () => showResult("success", onPaymentSuccess),
    handlePending: () =>
      showResult("pending", onPaymentPending ?? onPaymentSuccess),
  };
}
