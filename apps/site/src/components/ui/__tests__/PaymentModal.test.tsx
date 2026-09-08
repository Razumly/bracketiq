import { act, renderHook, waitFor } from "@testing-library/react";
import { usePaymentDialogState } from "../usePaymentDialogState";
import { billingAddressService } from "@/lib/billingAddressService";
import type { PaymentIntent } from "@/types";

jest.mock("@/lib/billingAddressService", () => ({
  billingAddressService: { getBillingAddressProfile: jest.fn() },
}));

const paymentData: PaymentIntent = {
  paymentIntent: "checkout-reference",
  feeBreakdown: {
    eventPrice: 1500,
    processingFee: 100,
    stripeFee: 0,
    taxAmount: 0,
    totalCharge: 1600,
    hostReceives: 1500,
    feePercentage: 0,
    purchaseType: "product",
  },
};

describe("Payment dialog state", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest
      .mocked(billingAddressService.getBillingAddressProfile)
      .mockResolvedValue({ billingAddress: null, email: "payer@example.com" });
  });

  it("keeps the successful result visible while product details refresh", async () => {
    let finish!: () => void;
    const onPaymentSuccess = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = renderHook(() =>
      usePaymentDialogState({ isOpen: true, paymentData, onPaymentSuccess }),
    );
    let completion!: Promise<void>;
    act(() => {
      completion = result.current.handleSuccess();
    });
    expect(result.current.view).toBe("success");
    expect(result.current.reloading).toBe(true);
    expect(onPaymentSuccess).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish();
      await completion;
    });
    expect(result.current.view).toBe("success");
    expect(result.current.reloading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("keeps a successful payment distinct from a failed product refresh", async () => {
    const onPaymentSuccess = jest
      .fn()
      .mockRejectedValue(new Error("Refresh unavailable"));
    const { result } = renderHook(() =>
      usePaymentDialogState({ isOpen: true, paymentData, onPaymentSuccess }),
    );
    await act(async () => {
      await result.current.handleSuccess();
    });
    expect(result.current.view).toBe("success");
    expect(result.current.reloading).toBe(false);
    expect(result.current.error).toBe(
      "Payment succeeded but failed to refresh the product details. Please contact support.",
    );
    act(() => result.current.reset());
    expect(result.current.view).toBe("payment");
    expect(result.current.error).toBeNull();
  });

  it("uses the pending callback without calling the success callback", async () => {
    const onPaymentSuccess = jest.fn();
    const onPaymentPending = jest.fn();
    const { result } = renderHook(() =>
      usePaymentDialogState({
        isOpen: true,
        paymentData,
        onPaymentSuccess,
        onPaymentPending,
      }),
    );
    await act(async () => {
      await result.current.handlePending();
    });
    expect(result.current.view).toBe("pending");
    expect(onPaymentPending).toHaveBeenCalledTimes(1);
    expect(onPaymentSuccess).not.toHaveBeenCalled();
  });

  it("preserves the success-callback fallback for pending payments", async () => {
    const onPaymentSuccess = jest.fn();
    const { result } = renderHook(() =>
      usePaymentDialogState({ isOpen: true, paymentData, onPaymentSuccess }),
    );
    await act(async () => {
      await result.current.handlePending();
    });
    expect(result.current.view).toBe("pending");
    expect(onPaymentSuccess).toHaveBeenCalledTimes(1);
  });

  it("ignores billing-profile results after the dialog closes", async () => {
    let finish!: (value: { billingAddress: null; email: string }) => void;
    jest.mocked(billingAddressService.getBillingAddressProfile).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const onPaymentSuccess = jest.fn();
    const { result, rerender } = renderHook(
      ({ isOpen }) =>
        usePaymentDialogState({ isOpen, paymentData, onPaymentSuccess }),
      { initialProps: { isOpen: false } },
    );
    expect(
      billingAddressService.getBillingAddressProfile,
    ).not.toHaveBeenCalled();
    rerender({ isOpen: true });
    await waitFor(() =>
      expect(
        billingAddressService.getBillingAddressProfile,
      ).toHaveBeenCalledTimes(1),
    );
    rerender({ isOpen: false });
    await act(async () => {
      finish({ billingAddress: null, email: "old@example.com" });
    });
    expect(result.current.billingEmail).toBeNull();
    expect(result.current.billingAddress).toBeNull();
  });
});
