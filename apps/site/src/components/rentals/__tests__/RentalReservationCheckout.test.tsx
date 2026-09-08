import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import RentalReservationCheckout from "../RentalReservationCheckout";
import type { RentalSelectionCheckoutPayload } from "@/app/organizations/[id]/FieldsTabContent";
import { buildUser } from "../../../../test/factories";

const pushMock = jest.fn();
const apiRequestMock = jest.fn();
const showNotificationMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

jest.mock("@/lib/organizationNotifications", () => ({
  notifications: {
    show: (...args: any[]) => showNotificationMock(...args),
  },
}));

jest.mock("@/lib/apiClient", () => ({
  apiRequest: (...args: any[]) => apiRequestMock(...args),
  isApiRequestError: () => false,
}));

jest.mock("@/lib/paymentService", () => ({
  paymentService: {
    createPaymentIntent: jest.fn(),
    releaseRentalCheckoutLock: jest.fn(),
  },
}));

jest.mock("@/components/ui/BillingAddressModal", () => () => null);
jest.mock("@/components/ui/PaymentModal", () => () => null);

const organization = {
  $id: "org_1",
  name: "Razumly",
  location: "Washougal, WA",
  coordinates: [-122.353, 45.582],
} as any;

const payload: RentalSelectionCheckoutPayload = {
  eventId: "rental_booking_1",
  manageEventUrl: "/events/rental_booking_1/schedule?create=1",
  organizationId: "org_1",
  organizationName: "Razumly",
  renterOrganizationId: "renter_org_1",
  facilityId: "facility_1",
  facilityName: "Razumly",
  facilityLocation: "2130 N Q St",
  facilityAddress: "2130 N Q St, Washougal, WA 98671, USA",
  totalRentalCents: 0,
  rentalStart: "2026-06-22T05:30",
  rentalEnd: "2026-06-22T11:00",
  rentalSelections: [
    {
      key: "selection_1",
      scheduledFieldIds: ["field_1"],
      dayOfWeek: 1,
      daysOfWeek: [1],
      startTimeMinutes: 330,
      endTimeMinutes: 660,
      startDate: "2026-06-22T05:30",
      endDate: "2026-06-22T11:00",
      repeating: false,
    },
  ],
  fieldIds: ["field_1"],
  primaryFieldId: "field_1",
  primaryFieldName: "Razumly - Main",
  location: "2130 N Q St, Washougal, WA 98671, USA",
  coordinates: [-122.353, 45.582],
  requiredTemplateIds: ["template_player"],
  hostRequiredTemplateIds: ["template_host"],
};

function renderCheckout(signedIn = true) {
  return render(
    <RentalReservationCheckout
      organization={organization}
      rentalOrderSlug="razumly"
      currentUser={signedIn ? buildUser() : null}
    >
      {({ onRentalSelectionReady }) => (
        <button onClick={() => onRentalSelectionReady(payload)}>
          Reserve resources
        </button>
      )}
    </RentalReservationCheckout>,
  );
}

describe("RentalReservationCheckout", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    apiRequestMock.mockResolvedValue({
      bookingId: "rental_booking_1",
      totalCents: 0,
      items: [
        {
          id: "item_1",
          fieldId: "field_1",
          start: "2026-06-22T05:30",
          end: "2026-06-22T11:00",
        },
      ],
    });
  });

  it("keeps selection details during a pending reservation and can attach it later", async () => {
    const user = userEvent.setup();
    let finish!: (value: { bookingId: string; totalCents: number }) => void;
    apiRequestMock.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    renderCheckout();
    await user.click(screen.getByRole("button", { name: "Reserve resources" }));
    await user.click(
      screen.getByRole("button", { name: "Continue to checkout" }),
    );
    expect(
      screen.getByRole("button", { name: "Continue to checkout" }),
    ).toBeDisabled();
    expect(
      screen.getByText("Razumly - Main", { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Resources reserved for Razumly."),
    ).not.toBeInTheDocument();
    await act(async () => {
      finish({ bookingId: "rental_booking_1", totalCents: 0 });
    });
    await user.click(
      await screen.findByRole("button", { name: "Attach to event later" }),
    );
    expect(
      screen.queryByText("Resources reserved for Razumly."),
    ).not.toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
  });

  it("retains the selection after a reservation failure and retries the same order", async () => {
    const user = userEvent.setup();
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      apiRequestMock.mockRejectedValueOnce(
        new Error("Reservation unavailable"),
      );
      renderCheckout();
      await user.click(
        screen.getByRole("button", { name: "Reserve resources" }),
      );
      await user.click(
        screen.getByRole("button", { name: "Continue to checkout" }),
      );
      await waitFor(() =>
        expect(showNotificationMock).toHaveBeenCalledWith({
          color: "red",
          message: "Reservation unavailable",
        }),
      );
      expect(
        screen.getByRole("dialog", { name: "Reserve resources" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Razumly - Main", { exact: false }),
      ).toBeInTheDocument();
      await user.click(
        screen.getByRole("button", { name: "Continue to checkout" }),
      );
      await screen.findByText("Resources reserved for Razumly.");
      expect(apiRequestMock).toHaveBeenCalledTimes(2);
      expect(apiRequestMock.mock.calls[1]).toEqual(
        apiRequestMock.mock.calls[0],
      );
      await user.click(
        screen.getByRole("button", { name: "Create event now" }),
      );
      expect(pushMock).toHaveBeenCalledWith(
        "/events/rental_booking_1/schedule?create=1",
      );
    } finally {
      log.mockRestore();
    }
  });

  it("requires sign-in before making a reservation request", async () => {
    const user = userEvent.setup();
    renderCheckout(false);
    await user.click(screen.getByRole("button", { name: "Reserve resources" }));
    await user.click(
      screen.getByRole("button", { name: "Continue to checkout" }),
    );
    expect(pushMock).toHaveBeenCalledWith("/login");
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it("opens reservation checkout in place and creates rental orders without navigation", async () => {
    const user = userEvent.setup();

    render(
      <MantineProvider>
        <RentalReservationCheckout
          organization={organization}
          rentalOrderSlug="razumly"
          currentUser={{ $id: "user_1" } as any}
        >
          {({ onRentalSelectionReady }) => (
            <button
              type="button"
              onClick={() => onRentalSelectionReady(payload)}
            >
              Reserve resources
            </button>
          )}
        </RentalReservationCheckout>
      </MantineProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Reserve resources" }));

    expect(
      await screen.findByRole("dialog", { name: "Reserve resources" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Continue to complete any required documents and payment. After checkout, these resources are reserved and can be attached to an event.",
      ),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Continue to checkout" }),
    );

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        "/api/public/organizations/razumly/rental-orders",
        expect.objectContaining({
          method: "POST",
          body: expect.objectContaining({
            eventId: "rental_booking_1",
            selections: payload.rentalSelections,
            paymentIntentId: null,
            renterOrganizationId: "renter_org_1",
          }),
        }),
      );
    });
    expect(pushMock).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Resources reserved for Razumly."),
    ).toBeInTheDocument();
  });
});
