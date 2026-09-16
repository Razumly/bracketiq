import type { ReactNode } from "react";
import { CalendarDays, MapPin, ShieldCheck } from "lucide-react";
import {
  Alert,
  Button,
  Group,
  Stack,
  Text,
} from "@/components/organization/organization-operation-ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { RentalSelectionCheckoutPayload } from "@/app/organizations/[id]/FieldsTabContent";
import { formatDisplayDate, formatDisplayTime, parseLocalDateTime } from "@/lib/dateUtils";
import { formatPrice } from "@/types";

export function RentalSelectionSummary({
  selection,
  children,
}: {
  selection: RentalSelectionCheckoutPayload;
  children?: ReactNode;
}) {
  const location = selection.location || selection.facilityLocation;
  return (
    <section aria-label="Reservation summary" className="min-w-0 space-y-4 rounded-xl border border-border bg-card p-5 text-card-foreground">
      <h3 className="text-lg font-semibold">Reservation summary</h3>
      <div>
        <p className="font-semibold">{selection.facilityName || selection.organizationName}</p>
        {selection.primaryFieldName && <p className="mt-1 text-sm text-muted-foreground">
          {selection.primaryFieldName}
          {selection.fieldIds.length > 1 ? ` + ${selection.fieldIds.length - 1} more` : ""}
        </p>}
        {location && <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground"><MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{location}</p>}
      </div>
      <ol className="space-y-4 border-y border-border py-4">
        {selection.rentalSelections.map((slot) => {
          const start = parseLocalDateTime(slot.startDate);
          const end = parseLocalDateTime(slot.endDate);
          const minutes = start && end ? Math.round((end.getTime() - start.getTime()) / 60_000) : null;
          return <li key={slot.key} className="flex gap-3">
            <CalendarDays aria-hidden="true" className="mt-1 size-5 shrink-0 text-[var(--bq-brand-strong)]" />
            <div className="min-w-0 text-sm">
              <p className="font-semibold">{formatDisplayDate(slot.startDate)}{formatDisplayDate(slot.startDate) !== formatDisplayDate(slot.endDate) ? ` – ${formatDisplayDate(slot.endDate)}` : ""}</p>
              <p>{formatDisplayTime(slot.startDate)} – {formatDisplayTime(slot.endDate)}</p>
              {minutes !== null && <p className="mt-1 text-muted-foreground">{minutes} minutes · {slot.scheduledFieldIds.length} resource{slot.scheduledFieldIds.length === 1 ? "" : "s"}</p>}
            </div>
          </li>;
        })}
      </ol>
      <div className="flex items-center justify-between gap-4">
        <span className="font-semibold">Rental total</span>
        <strong className="text-2xl tabular-nums">{formatPrice(selection.totalRentalCents)}</strong>
      </div>
      {children}
    </section>
  );
}

type RentalReservationChoiceProps = {
  opened: boolean;
  selection: RentalSelectionCheckoutPayload | null;
  startingCheckout: boolean;
  error: string | null;
  paymentReceived: boolean;
  signedIn: boolean;
  onClose: () => void;
  onContinue: () => void;
};

export function RentalReservationChoice({
  opened,
  selection,
  startingCheckout,
  error,
  paymentReceived,
  signedIn,
  onClose,
  onContinue,
}: RentalReservationChoiceProps) {
  const paidRental = Boolean(selection && selection.totalRentalCents > 0);
  const actionLabel = !signedIn ? "Sign in to continue" : paymentReceived ? "Retry reservation confirmation" : paidRental ? "Continue to Stripe" : "Confirm reservation";
  return (
    <Dialog open={opened} onOpenChange={(open) => { if (!open && !startingCheckout) onClose(); }}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-5xl" showCloseButton={!startingCheckout}>
        <DialogHeader>
          <DialogTitle>Review your reservation</DialogTitle>
          <DialogDescription>Check your selected resources and time before you continue.</DialogDescription>
        </DialogHeader>
        {selection && <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
          <div className="space-y-5">
            <div className="rounded-xl border border-border p-5">
              <h3 className="text-xl font-semibold">{selection.facilityName || selection.organizationName}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{selection.location || selection.facilityLocation}</p>
            </div>
            <div className="rounded-xl border border-[var(--bq-brand-strong)] bg-[var(--bq-surface-muted)] p-5">
              <h3 className="flex items-center gap-2 font-semibold"><ShieldCheck aria-hidden="true" className="size-5" />{paymentReceived ? "Finish your reservation" : paidRental ? "Pay securely with Stripe" : "No payment required"}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{paymentReceived
                ? "Your payment was submitted. Retry confirmation for the same reservation. Do not submit another payment."
                : paidRental
                  ? "Confirm your billing address if requested, then enter payment details in Stripe. Your reservation is confirmed after payment."
                  : "Confirm these resources to reserve them. You can attach them to an event after checkout."}</p>
              {paidRental && !paymentReceived && <p className="mt-3 text-sm text-muted-foreground">Tax and payment fees, if applicable, appear in checkout before you pay.</p>}
            </div>
            {!signedIn && <Alert color="yellow" title="Sign in required">Sign in before continuing. No reservation or payment has been submitted.</Alert>}
            {error && <Alert color="red" title={paymentReceived ? "Reservation confirmation needs attention" : "Unable to continue"}>{error}<p className="mt-2">Your selected time is still shown. {paymentReceived ? "Retry confirmation below." : "Try again, or change your time."}</p></Alert>}
          </div>
          <RentalSelectionSummary selection={selection}>
            <div className="space-y-3">
              <Button fullWidth loading={startingCheckout} onClick={onContinue}>{actionLabel}</Button>
              <p role={startingCheckout ? "status" : undefined} className="text-center text-sm text-muted-foreground">{startingCheckout ? "Keep this window open while we prepare your reservation." : "Selecting a time does not confirm a reservation."}</p>
              {!paymentReceived && <Button fullWidth variant="default" disabled={startingCheckout} onClick={onClose}>Change selection</Button>}
            </div>
          </RentalSelectionSummary>
        </div>}
      </DialogContent>
    </Dialog>
  );
}

type RentalOrderNoticeProps = {
  message: string | null;
  selection: RentalSelectionCheckoutPayload | null;
  canCreateEvent: boolean;
  onCreateEvent: () => void;
  onDismiss: () => void;
};

export function RentalOrderNotice({
  message,
  selection,
  canCreateEvent,
  onCreateEvent,
  onDismiss,
}: RentalOrderNoticeProps) {
  if (!message) return null;
  return (
    <Stack gap="md">
      <Alert color="green" title="Resources reserved">
        <Stack gap="sm">
          <Text size="sm">{message}</Text>
          {canCreateEvent && <Group gap="sm">
            <Button onClick={onCreateEvent}>Create event now</Button>
            <Button variant="default" onClick={onDismiss}>Attach to event later</Button>
          </Group>}
        </Stack>
      </Alert>
      {selection && <RentalSelectionSummary selection={selection} />}
    </Stack>
  );
}
