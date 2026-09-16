"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { notifications } from "@/lib/organizationNotifications";
import {
  RentalOrderNotice,
  RentalReservationChoice,
  RentalSelectionSummary,
} from "./RentalReservationDialogs";
import BillingAddressModal from "@/components/ui/BillingAddressModal";
import { Alert, Button } from "@/components/organization/organization-operation-ui";
import PaymentModal from "@/components/ui/PaymentModal";
import { apiRequest, isApiRequestError } from "@/lib/apiClient";
import { paymentService } from "@/lib/paymentService";
import {
  trackRentalCheckoutStarted,
  trackRentalClicked,
} from "@/lib/analytics/eventAnalytics";
import type { RentalSelectionCheckoutPayload } from "@/app/organizations/[id]/FieldsTabContent";
import type {
  BillingAddress,
  Event,
  Organization,
  PaymentIntent,
  TimeSlot,
  UserData,
} from "@/types";

type RentalPaymentDraft = {
  event: Event;
  timeSlot: TimeSlot;
};

type RentalOrderItemResult = {
  id: string;
  fieldId: string;
  start: string;
  end: string;
};

type RentalOrderResult = {
  bookingId: string;
  billId?: string | null;
  eventId?: string | null;
  totalCents: number;
  items?: RentalOrderItemResult[];
  createEventUrl?: string;
};

type CompletedRentalOrder = RentalOrderResult & {
  createEventUrl: string;
  selection: RentalSelectionCheckoutPayload;
};

type RentalReservationCheckoutRenderProps = {
  onRentalSelectionReady: (payload: RentalSelectionCheckoutPayload) => void;
};

type RentalReservationCheckoutProps = {
  organization: Organization;
  rentalOrderSlug?: string | null;
  currentUser: UserData | null;
  children: (props: RentalReservationCheckoutRenderProps) => ReactNode;
};

const RENTAL_EVENT_QUERY_KEYS = [
  "rentalStart",
  "rentalEnd",
  "rentalFieldId",
  "rentalFieldName",
  "rentalFacilityId",
  "rentalFacilityName",
  "rentalFacilityLocation",
  "rentalFacilityAddress",
  "rentalLocation",
  "rentalLat",
  "rentalLng",
  "rentalPriceCents",
  "rentalRequiredTemplateIds",
  "rentalHostRequiredTemplateIds",
  "rentalSelections",
  "rentalBookingId",
  "rentalBookingItems",
  "rentalOrgId",
];

const rentalSelectionAnalyticsProperties = (
  payload: RentalSelectionCheckoutPayload,
) => ({
  event_id: payload.eventId,
  field_id: payload.primaryFieldId,
  field_count: payload.fieldIds.length,
  facility_id: payload.facilityId,
  amount_cents: payload.totalRentalCents,
});

const stripRentalQueryParams = (manageEventUrl: string): string => {
  const url = new URL(manageEventUrl, "http://localhost");
  RENTAL_EVENT_QUERY_KEYS.forEach((key) => url.searchParams.delete(key));
  return `${url.pathname}${url.search}`;
};

const getPaymentIntentId = (
  clientSecret: string | undefined,
): string | null => {
  if (!clientSecret) {
    return null;
  }
  const secretIndex = clientSecret.indexOf("_secret_");
  return secretIndex > 0 ? clientSecret.slice(0, secretIndex) : clientSecret;
};

const requiresBillingAddress = (error: unknown): boolean =>
  isApiRequestError(error) &&
  error.data !== null &&
  typeof error.data === "object" &&
  "billingAddressRequired" in error.data &&
  Boolean(
    (error.data as { billingAddressRequired?: boolean }).billingAddressRequired,
  );

const buildRentalPaymentDraft = (
  organization: Organization,
  payload: RentalSelectionCheckoutPayload,
  userId: string,
): RentalPaymentDraft => {
  const timeSlotId = `${payload.eventId}-rental-payment`;
  const fallbackCoordinates = payload.coordinates ??
    organization.coordinates ?? [0, 0];
  const event = {
    $id: payload.eventId,
    name: organization.name,
    description: `Private rental order for ${organization.name}.`,
    start: payload.rentalStart,
    end: payload.rentalEnd,
    location: payload.location || organization.location || "Rental",
    address: payload.facilityAddress ?? organization.address,
    coordinates: fallbackCoordinates,
    price: 0,
    imageId: "",
    hostId: userId,
    state: "PRIVATE",
    maxParticipants: 10,
    teamSizeLimit: 10,
    teamSignup: false,
    singleDivision: true,
    waitListIds: [],
    freeAgentIds: [],
    teamIds: [],
    userIds: [],
    fieldIds: payload.fieldIds,
    timeSlotIds: [timeSlotId],
    officialIds: [],
    assistantHostIds: [],
    cancellationRefundHours: 24,
    registrationCutoffHours: 0,
    seedColor: 0,
    eventType: "EVENT",
    organizationId: organization.$id,
    sportId: null,
    divisions: [],
    requiredTemplateIds: [],
    noFixedEndDateTime: false,
  } as unknown as Event;

  const timeSlot: TimeSlot = {
    $id: timeSlotId,
    startDate: payload.rentalStart,
    endDate: payload.rentalEnd,
    repeating: false,
    price: Math.max(0, Math.round(payload.totalRentalCents)),
    scheduledFieldId: payload.primaryFieldId ?? payload.fieldIds[0],
    scheduledFieldIds: payload.fieldIds,
    requiredTemplateIds: payload.requiredTemplateIds,
    hostRequiredTemplateIds: payload.hostRequiredTemplateIds,
    divisions: [],
    daysOfWeek: [],
  };

  return { event, timeSlot };
};

export default function RentalReservationCheckout({
  organization,
  rentalOrderSlug,
  currentUser,
  children,
}: RentalReservationCheckoutProps) {
  const router = useRouter();
  const [pendingSelection, setPendingSelection] =
    useState<RentalSelectionCheckoutPayload | null>(null);
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [showBillingAddressModal, setShowBillingAddressModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentData, setPaymentData] = useState<PaymentIntent | null>(null);
  const [paymentDraft, setPaymentDraft] = useState<RentalPaymentDraft | null>(
    null,
  );
  const [orderCompleteMessage, setOrderCompleteMessage] = useState<
    string | null
  >(null);
  const [completedRentalOrder, setCompletedRentalOrder] =
    useState<CompletedRentalOrder | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [paymentSubmitted, setPaymentSubmitted] = useState(false);
  const checkoutInFlight = useRef(false);
  const submittedPaymentIntentId = useRef<string | null>(null);
  const completedBookingId = useRef<string | null>(null);

  const normalizedRentalOrderSlug =
    typeof rentalOrderSlug === "string" ? rentalOrderSlug.trim() : "";
  const paymentEvent = useMemo(
    () => ({
      name: `${organization.name} rental`,
      location:
        pendingSelection?.location ||
        pendingSelection?.facilityLocation ||
        organization.location ||
        "",
      eventType: "EVENT" as const,
      price: pendingSelection?.totalRentalCents ?? 0,
    }),
    [
      organization.location,
      organization.name,
      pendingSelection?.facilityLocation,
      pendingSelection?.location,
      pendingSelection?.totalRentalCents,
    ],
  );

  const createRentalOrder = useCallback(
    async (
      payload: RentalSelectionCheckoutPayload,
      paymentIntentId: string | null,
    ) => {
      if (!normalizedRentalOrderSlug) {
        throw new Error(
          "This organization needs a public rental checkout before resources can be reserved.",
        );
      }
      const result = await apiRequest<RentalOrderResult>(
        `/api/public/organizations/${encodeURIComponent(normalizedRentalOrderSlug)}/rental-orders`,
        {
          method: "POST",
          body: {
            eventId: payload.eventId,
            selections: payload.rentalSelections,
            paymentIntentId,
            renterOrganizationId: payload.renterOrganizationId,
          },
          timeoutMs: 30_000,
        },
      );
      const createEventUrl =
        typeof result.createEventUrl === "string" &&
        result.createEventUrl.trim().length > 0
          ? result.createEventUrl
          : stripRentalQueryParams(payload.manageEventUrl);
      const message = `Resources reserved for ${organization.name}.`;
      setOrderCompleteMessage(message);
      setCompletedRentalOrder({
        ...result,
        createEventUrl,
        selection: payload,
      });
      completedBookingId.current = payload.eventId;
      notifications.show({ color: "green", message });
      return { ...result, createEventUrl };
    },
    [normalizedRentalOrderSlug, organization.name],
  );

  const completeRentalOrder = useCallback(
    async (
      payload: RentalSelectionCheckoutPayload,
      paymentIntentId: string | null,
    ) => {
      const result = await createRentalOrder(payload, paymentIntentId);
      setChoiceOpen(false);
      return result;
    },
    [createRentalOrder],
  );

  const clearCheckoutState = useCallback(() => {
    setCheckoutError(null);
    setChoiceOpen(false);
    setShowPaymentModal(false);
    setShowBillingAddressModal(false);
    setPaymentData(null);
    setPaymentDraft(null);
    setPendingSelection(null);
  }, []);

  const releasePaymentDraftLock = useCallback(async () => {
    if (!paymentDraft) {
      return;
    }
    try {
      await paymentService.releaseRentalCheckoutLock(
        paymentDraft.event,
        paymentDraft.timeSlot,
      );
    } catch (error) {
      console.warn("Failed to release rental checkout lock", error);
    }
  }, [paymentDraft]);

  const finishReservation = useCallback(async () => {
    if (!pendingSelection || checkoutInFlight.current || completedBookingId.current === pendingSelection.eventId) {
      return;
    }
    checkoutInFlight.current = true;
    setStartingCheckout(true);
    setCheckoutError(null);
    try {
      await completeRentalOrder(pendingSelection, submittedPaymentIntentId.current);
      await releasePaymentDraftLock();
      clearCheckoutState();
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Unable to confirm your reservation.");
      setChoiceOpen(true);
    } finally {
      checkoutInFlight.current = false;
      setStartingCheckout(false);
    }
  }, [clearCheckoutState, completeRentalOrder, pendingSelection, releasePaymentDraftLock]);

  const startRentalOnlyCheckout = useCallback(
    async (billingAddress?: BillingAddress) => {
      if (!pendingSelection || checkoutInFlight.current) return;
      if (paymentSubmitted) {
        if (!submittedPaymentIntentId.current) {
          setCheckoutError("Payment confirmation is missing. Contact the organization before paying again.");
          return;
        }
        await finishReservation();
        return;
      }
      if (!currentUser) {
        trackRentalCheckoutStarted(organization, "public_rental_page", {
          ...rentalSelectionAnalyticsProperties(pendingSelection),
          auth_required: true,
        });
        router.push("/login");
        return;
      }

      trackRentalCheckoutStarted(organization, "public_rental_page", {
        ...rentalSelectionAnalyticsProperties(pendingSelection),
        auth_required: false,
      });
      if (pendingSelection.totalRentalCents <= 0) {
        await finishReservation();
        return;
      }

      const draft = buildRentalPaymentDraft(organization, pendingSelection, currentUser.$id);
      setPaymentDraft(draft);
      checkoutInFlight.current = true;
      setStartingCheckout(true);
      setCheckoutError(null);
      try {
        const intent = await paymentService.createPaymentIntent(
          currentUser,
          draft.event,
          undefined,
          draft.timeSlot,
          { $id: organization.$id, name: organization.name },
          undefined,
          billingAddress,
        );
        setPaymentData(intent);
        setShowBillingAddressModal(false);
        setShowPaymentModal(true);
      } catch (error) {
        if (requiresBillingAddress(error)) {
          setShowBillingAddressModal(true);
          return;
        }
        const message = error instanceof Error ? error.message : "Unable to start rental checkout.";
        setCheckoutError(message);
        if (billingAddress) throw error;
      } finally {
        checkoutInFlight.current = false;
        setStartingCheckout(false);
      }
    },
    [currentUser, finishReservation, organization, paymentSubmitted, pendingSelection, router],
  );

  const handlePaymentSuccess = useCallback(async () => {
    if (!pendingSelection || !paymentData) return;
    const paymentIntentId = getPaymentIntentId(paymentData.paymentIntent);
    setPaymentSubmitted(true);
    setShowPaymentModal(false);
    setChoiceOpen(true);
    if (!paymentIntentId) {
      setCheckoutError("Payment confirmation is missing. Keep this checkout open and contact the organization before paying again.");
      return;
    }
    submittedPaymentIntentId.current = paymentIntentId;
    await finishReservation();
  }, [finishReservation, paymentData, pendingSelection]);

  const handlePaymentPending = useCallback(() => {
    submittedPaymentIntentId.current = getPaymentIntentId(paymentData?.paymentIntent);
    setPaymentSubmitted(true);
    setShowPaymentModal(false);
    setChoiceOpen(true);
    setCheckoutError("Your payment is processing. Your reservation is not confirmed yet. Check confirmation again before submitting another payment.");
  }, [paymentData]);

  const closePaymentModal = useCallback(async () => {
    if (checkoutInFlight.current) return;
    setShowPaymentModal(false);
    setChoiceOpen(true);
    if (submittedPaymentIntentId.current) return;
    checkoutInFlight.current = true;
    setStartingCheckout(true);
    try {
      await releasePaymentDraftLock();
      setPaymentData(null);
      setPaymentDraft(null);
    } finally {
      checkoutInFlight.current = false;
      setStartingCheckout(false);
    }
  }, [releasePaymentDraftLock]);

  const changeSelection = useCallback(async () => {
    if (checkoutInFlight.current || submittedPaymentIntentId.current) return;
    checkoutInFlight.current = true;
    setStartingCheckout(true);
    try {
      await releasePaymentDraftLock();
      setPaymentData(null);
      setPaymentDraft(null);
      setChoiceOpen(false);
    } finally {
      checkoutInFlight.current = false;
      setStartingCheckout(false);
    }
  }, [releasePaymentDraftLock]);

  const handleSelectionReady = useCallback(
    (payload: RentalSelectionCheckoutPayload) => {
      if (checkoutInFlight.current) return;
      if (completedBookingId.current === payload.eventId && completedRentalOrder) {
        setOrderCompleteMessage(`Resources reserved for ${organization.name}.`);
        return;
      }
      if (paymentSubmitted && pendingSelection) {
        setChoiceOpen(true);
        return;
      }
      if (!normalizedRentalOrderSlug) {
        notifications.show({
          color: "red",
          message:
            "This organization needs a public rental checkout before resources can be reserved.",
        });
        return;
      }
      setOrderCompleteMessage(null);
      setCompletedRentalOrder(null);
      setCheckoutError(null);
      submittedPaymentIntentId.current = null;
      setPaymentSubmitted(false);
      completedBookingId.current = null;
      trackRentalClicked(
        organization,
        "public_rental_page",
        rentalSelectionAnalyticsProperties(payload),
      );
      setPendingSelection(payload);
      setChoiceOpen(true);
    },
    [completedRentalOrder, normalizedRentalOrderSlug, organization, paymentSubmitted, pendingSelection],
  );

  return (
    <>
      <RentalOrderNotice
        message={orderCompleteMessage}
        selection={completedRentalOrder?.selection ?? null}
        canCreateEvent={Boolean(completedRentalOrder)}
        onCreateEvent={() => {
          if (completedRentalOrder)
            router.push(completedRentalOrder.createEventUrl);
        }}
        onDismiss={() => setOrderCompleteMessage(null)}
      />
      <div hidden={paymentSubmitted && Boolean(pendingSelection)}>
        {children({ onRentalSelectionReady: handleSelectionReady })}
      </div>
      {paymentSubmitted && pendingSelection && !choiceOpen && (
        <RentalSelectionSummary selection={pendingSelection}>
          <Alert color="yellow" title="Reservation confirmation is not complete">
            Your payment was submitted. Resume confirmation for this reservation before starting another payment.
          </Alert>
          <Button fullWidth onClick={() => setChoiceOpen(true)}>Resume reservation confirmation</Button>
        </RentalSelectionSummary>
      )}
      <RentalReservationChoice
        opened={choiceOpen && !showBillingAddressModal && !showPaymentModal}
        selection={pendingSelection}
        startingCheckout={startingCheckout}
        error={checkoutError}
        paymentReceived={paymentSubmitted}
        signedIn={Boolean(currentUser)}
        onClose={() => {
          if (checkoutInFlight.current) return;
          if (paymentSubmitted) setChoiceOpen(false);
          else void changeSelection();
        }}
        onContinue={() => void startRentalOnlyCheckout()}
      />

      <BillingAddressModal
        opened={showBillingAddressModal}
        onClose={() => {
          if (!checkoutInFlight.current) setShowBillingAddressModal(false);
        }}
        onSaved={async (billingAddress) => {
          await startRentalOnlyCheckout(billingAddress);
        }}
        title="Billing address required"
        description="Enter your billing address so tax can be calculated before checkout."
        summary={pendingSelection && <RentalSelectionSummary selection={pendingSelection} />}
      />

      <PaymentModal
        isOpen={showPaymentModal && Boolean(paymentData)}
        onClose={() => void closePaymentModal()}
        event={paymentEvent}
        paymentData={paymentData}
        onPaymentSuccess={handlePaymentSuccess}
        onPaymentPending={handlePaymentPending}
        summary={pendingSelection && <RentalSelectionSummary selection={pendingSelection} />}
      />
    </>
  );
}
