import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, ReactNode } from "react";
import RentalReservationCheckout from "../RentalReservationCheckout";
import type BillingAddressModal from "@/components/ui/BillingAddressModal";
import type PaymentModal from "@/components/ui/PaymentModal";
import type { RentalSelectionCheckoutPayload } from "@/app/organizations/[id]/FieldsTabContent";
import type { Organization } from "@/types";
import { ApiRequestError } from "@/lib/apiClient";
import { buildUser } from "../../../../test/factories";

const pushMock = jest.fn();
const apiRequestMock = jest.fn();
const createPaymentIntentMock = jest.fn();
const releaseRentalCheckoutLockMock = jest.fn();
let mockBillingProps: ComponentProps<typeof BillingAddressModal> & { summary?: ReactNode };
let mockPaymentProps: ComponentProps<typeof PaymentModal> & { summary?: ReactNode };

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));
jest.mock("@/lib/organizationNotifications", () => ({ notifications: { show: jest.fn() } }));
jest.mock("@/lib/apiClient", () => ({
  ...jest.requireActual("@/lib/apiClient"),
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));
jest.mock("@/lib/paymentService", () => ({ paymentService: {
  createPaymentIntent: (...args: unknown[]) => createPaymentIntentMock(...args),
  releaseRentalCheckoutLock: (...args: unknown[]) => releaseRentalCheckoutLockMock(...args),
} }));
// These are application composition boundaries. No Stripe widget or provider response is simulated.
jest.mock("@/components/ui/BillingAddressModal", () => (props: typeof mockBillingProps) => {
  mockBillingProps = props;
  return props.opened ? <section aria-label="Billing context">{props.summary}</section> : null;
});
jest.mock("@/components/ui/PaymentModal", () => (props: typeof mockPaymentProps) => {
  mockPaymentProps = props;
  return props.isOpen ? <section aria-label="Payment context">{props.summary}</section> : null;
});

const organization: Organization = { $id: "org_1", name: "River City Sports", location: "Washougal, WA", coordinates: [-122.353, 45.582] };
const payload: RentalSelectionCheckoutPayload = {
  eventId: "rental_booking_1",
  manageEventUrl: "/events/rental_booking_1/schedule?create=1",
  organizationId: "org_1",
  organizationName: "River City Sports",
  renterOrganizationId: "renter_org_1",
  facilityId: "facility_1",
  facilityName: "River City Sports",
  facilityLocation: "2130 N Q St",
  facilityAddress: "2130 N Q St, Washougal, WA 98671, USA",
  totalRentalCents: 0,
  rentalStart: "2030-06-22T09:00",
  rentalEnd: "2030-06-22T10:30",
  rentalSelections: [{ key: "selection_1", scheduledFieldIds: ["field_1"], dayOfWeek: 5, daysOfWeek: [5], startTimeMinutes: 540, endTimeMinutes: 630, startDate: "2030-06-22T09:00", endDate: "2030-06-22T10:30", repeating: false }],
  fieldIds: ["field_1"],
  primaryFieldId: "field_1",
  primaryFieldName: "Main court",
  location: "2130 N Q St, Washougal, WA 98671, USA",
  coordinates: [-122.353, 45.582],
  requiredTemplateIds: ["template_player"],
  hostRequiredTemplateIds: ["template_host"],
};

function renderCheckout({ signedIn = true, total = 0 } = {}) {
  return render(<RentalReservationCheckout organization={organization} rentalOrderSlug="river-city" currentUser={signedIn ? buildUser() : null}>
    {({ onRentalSelectionReady }) => <button onClick={() => onRentalSelectionReady({ ...payload, totalRentalCents: total })}>Reserve resources</button>}
  </RentalReservationCheckout>);
}

function expectSelectedTime(region: HTMLElement, price: string) {
  expect(within(region).getByText("Main court")).toBeInTheDocument();
  expect(within(region).getByText("06/22/2030")).toBeInTheDocument();
  expect(within(region).getByText("09:00 AM – 10:30 AM")).toBeInTheDocument();
  expect(within(region).getByText("90 minutes · 1 resource")).toBeInTheDocument();
  expect(within(region).getByText(price)).toBeInTheDocument();
}

describe("RentalReservationCheckout", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    apiRequestMock.mockResolvedValue({ bookingId: "rental_booking_1", totalCents: 0 });
    releaseRentalCheckoutLockMock.mockResolvedValue(undefined);
  });

  it("keeps the selected time while submitting once and attaches the completed reservation later", async () => {
    const user = userEvent.setup();
    const { promise, resolve: finish } = Promise.withResolvers<{ bookingId: string; totalCents: number }>();
    apiRequestMock.mockReturnValueOnce(promise);
    renderCheckout();
    await user.click(screen.getByRole("button", { name: "Reserve resources" }));
    await user.dblClick(screen.getByRole("button", { name: "Confirm reservation" }));
    expectSelectedTime(screen.getByRole("region", { name: "Reservation summary" }), "$0.00");
    expect(screen.getByRole("button", { name: "Confirm reservation" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Change selection" })).toBeDisabled();
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Create event now" })).not.toBeInTheDocument();
    await act(async () => { finish({ bookingId: "rental_booking_1", totalCents: 0 }); });
    await user.click(await screen.findByRole("button", { name: "Attach to event later" }));
    expect(screen.queryByRole("button", { name: "Create event now" })).not.toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("recovers from a reservation error with the same slot and booking identity", async () => {
    const user = userEvent.setup();
    apiRequestMock.mockRejectedValueOnce(new Error("Reservation is temporarily unavailable"));
    renderCheckout();
    await user.click(screen.getByRole("button", { name: "Reserve resources" }));
    await user.click(screen.getByRole("button", { name: "Confirm reservation" }));
    await screen.findByText("Reservation is temporarily unavailable");
    expectSelectedTime(screen.getByRole("region", { name: "Reservation summary" }), "$0.00");
    await user.click(screen.getByRole("button", { name: "Confirm reservation" }));
    await user.click(await screen.findByRole("button", { name: "Create event now" }));
    expect(apiRequestMock).toHaveBeenCalledTimes(2);
    expect(apiRequestMock.mock.calls[1]).toEqual(apiRequestMock.mock.calls[0]);
    expect(apiRequestMock).toHaveBeenCalledWith("/api/public/organizations/river-city/rental-orders", expect.objectContaining({ method: "POST", body: expect.objectContaining({ eventId: payload.eventId, selections: payload.rentalSelections, renterOrganizationId: payload.renterOrganizationId, paymentIntentId: null }) }));
    expect(pushMock).toHaveBeenCalledWith(payload.manageEventUrl);
  });

  it("requires sign-in without making a reservation or payment request", async () => {
    const user = userEvent.setup();
    renderCheckout({ signedIn: false, total: 7200 });
    await user.click(screen.getByRole("button", { name: "Reserve resources" }));
    await user.click(screen.getByRole("button", { name: "Sign in to continue" }));
    expect(pushMock).toHaveBeenCalledWith("/login");
    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(createPaymentIntentMock).not.toHaveBeenCalled();
  });

  it("keeps a locked selection and total visible while checkout can be retried", async () => {
    const user = userEvent.setup();
    createPaymentIntentMock.mockRejectedValue(new ApiRequestError("This time is held by another checkout. Try again when the hold expires.", 409, {}));
    renderCheckout({ total: 7200 });
    await user.click(screen.getByRole("button", { name: "Reserve resources" }));
    await user.click(screen.getByRole("button", { name: "Continue to Stripe" }));
    await screen.findByText(/This time is held by another checkout/);
    expectSelectedTime(screen.getByRole("region", { name: "Reservation summary" }), "$72.00");
    await user.click(screen.getByRole("button", { name: "Continue to Stripe" }));
    expect(createPaymentIntentMock).toHaveBeenCalledTimes(2);
    expect(createPaymentIntentMock.mock.calls[1]).toEqual(createPaymentIntentMock.mock.calls[0]);
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("carries the slot through required billing and keeps errors recoverable without creating an order", async () => {
    const user = userEvent.setup();
    createPaymentIntentMock.mockRejectedValueOnce(new ApiRequestError("Billing address required", 400, { billingAddressRequired: true })).mockRejectedValueOnce(new Error("Checkout could not start"));
    renderCheckout({ total: 7200 });
    await user.click(screen.getByRole("button", { name: "Reserve resources" }));
    await user.click(screen.getByRole("button", { name: "Continue to Stripe" }));
    expectSelectedTime(await screen.findByRole("region", { name: "Billing context" }), "$72.00");
    await act(async () => {
      await expect(mockBillingProps.onSaved({ line1: "2130 N Q St", city: "Washougal", state: "WA", postalCode: "98671", countryCode: "US" })).rejects.toThrow("Checkout could not start");
    });
    expectSelectedTime(screen.getByRole("region", { name: "Billing context" }), "$72.00");
    await act(async () => { mockBillingProps.onClose(); });
    expect(screen.getByText("Checkout could not start")).toBeInTheDocument();
    expectSelectedTime(screen.getByRole("region", { name: "Reservation summary" }), "$72.00");
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("retries reservation finalization after application payment completion without starting another payment", async () => {
    const user = userEvent.setup();
    // Only our payment-service result identifier is needed at this application boundary.
    createPaymentIntentMock.mockResolvedValue({ paymentIntent: "rental_payment_1" });
    apiRequestMock.mockRejectedValueOnce(new Error("Reservation confirmation timed out"));
    renderCheckout({ total: 7200 });
    await user.click(screen.getByRole("button", { name: "Reserve resources" }));
    await user.click(screen.getByRole("button", { name: "Continue to Stripe" }));
    expectSelectedTime(await screen.findByRole("region", { name: "Payment context" }), "$72.00");
    await act(async () => { await mockPaymentProps.onPaymentSuccess(); });
    await screen.findByText("Reservation confirmation timed out");
    expectSelectedTime(screen.getByRole("region", { name: "Reservation summary" }), "$72.00");
    expect(screen.queryByRole("button", { name: "Continue to Stripe" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    expectSelectedTime(screen.getByRole("region", { name: "Reservation summary" }), "$72.00");
    await user.click(screen.getByRole("button", { name: "Resume reservation confirmation" }));
    await user.click(screen.getByRole("button", { name: "Retry reservation confirmation" }));
    await screen.findByRole("button", { name: "Attach to event later" });
    expect(apiRequestMock).toHaveBeenCalledTimes(2);
    expect(apiRequestMock.mock.calls[1]).toEqual(apiRequestMock.mock.calls[0]);
    expect(apiRequestMock.mock.calls[1][1].body.paymentIntentId).toBe("rental_payment_1");
    expect(createPaymentIntentMock).toHaveBeenCalledTimes(1);
    expect(releaseRentalCheckoutLockMock).toHaveBeenCalledTimes(1);
  });

  it("keeps processing payments separate from confirmed reservations", async () => {
    const user = userEvent.setup();
    createPaymentIntentMock.mockResolvedValue({ paymentIntent: "rental_payment_1" });
    renderCheckout({ total: 7200 });
    await user.click(screen.getByRole("button", { name: "Reserve resources" }));
    await user.click(screen.getByRole("button", { name: "Continue to Stripe" }));
    await screen.findByRole("region", { name: "Payment context" });
    await act(async () => { await mockPaymentProps.onPaymentPending?.(); });
    expectSelectedTime(screen.getByRole("region", { name: "Reservation summary" }), "$72.00");
    expect(screen.queryByRole("button", { name: "Create event now" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue to Stripe" })).not.toBeInTheDocument();
    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(releaseRentalCheckoutLockMock).not.toHaveBeenCalled();
  });

  it("releases the unpaid checkout hold on return and retains the slot for review", async () => {
    const user = userEvent.setup();
    createPaymentIntentMock.mockResolvedValue({ paymentIntent: "rental_payment_1" });
    renderCheckout({ total: 7200 });
    await user.click(screen.getByRole("button", { name: "Reserve resources" }));
    await user.click(screen.getByRole("button", { name: "Continue to Stripe" }));
    await screen.findByRole("region", { name: "Payment context" });
    await act(async () => { mockPaymentProps.onClose(); });
    await waitFor(() => expect(releaseRentalCheckoutLockMock).toHaveBeenCalledTimes(1));
    expectSelectedTime(screen.getByRole("region", { name: "Reservation summary" }), "$72.00");
    expect(screen.getByRole("button", { name: "Continue to Stripe" })).toBeEnabled();
    expect(apiRequestMock).not.toHaveBeenCalled();
  });
});
