"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, MapPin, ShieldCheck } from "lucide-react";
import { Alert, Button, DatePickerInput, NumberInput, Select } from "@/components/organization/organization-operation-ui";
import { buildRentalSelectionCheckout } from "@/app/organizations/[id]/fieldsTab/facilityRentalCheckout";
import { compareRanges } from "@/app/organizations/[id]/fieldsTab/facilityCalendarIntervals";
import {
  buildSelectionFromCalendarRange,
  resolveSelectionDateRange,
  updateSelectionWithCalendarRange,
  usePublicRentalSelections,
} from "@/app/organizations/[id]/fieldsTab/usePublicRentalSelections";
import type { RentalSelectionCheckoutPayload, RentalSelectionCheckoutSelection } from "@/app/organizations/[id]/fieldsTab/facilityCalendarTypes";
import { getNextRentalOccurrence } from "@/app/discover/utils/rentals";
import { fieldService } from "@/lib/fieldService";
import { organizationService } from "@/lib/organizationService";
import { createId } from "@/lib/id";
import { formatDisplayDate, formatDisplayTime, formatLocalDateTime } from "@/lib/dateUtils";
import { getFacilityScopedFieldDisplayName } from "@/lib/fieldUtils";
import { cn } from "@/lib/utils";
import { formatPrice, type Facility, type Field, type Organization, type TimeSlot, type UserData } from "@/types";
import { buildPublicRentalTimeOptions, type RentalTimeOption } from "./publicRentalTimeOptions";

const EMPTY_FIELDS: Field[] = [];
const NO_PRESELECTED_RENTALS: [] = [];

function useRentalBookingAccount(currentUser: UserData | null) {
  const [attempt, setAttempt] = useState(0);
  const userId = currentUser?.$id;
  const requestKey = useMemo(() => ({ userId, attempt }), [userId, attempt]);
  const [result, setResult] = useState<{ key: typeof requestKey; organizations: Organization[]; error: string | null } | null>(null);
  const [selection, setSelection] = useState<{ key: typeof requestKey; value: string } | null>(null);
  const organizations = result?.key === requestKey ? result.organizations : [];
  const error = result?.key === requestKey ? result.error : null;
  const loading = Boolean(userId) && result?.key !== requestKey;
  const value = selection?.key === requestKey ? selection.value : "self";
  const setValue = (value: string) => setSelection({ key: requestKey, value });
  useEffect(() => {
    let cancelled = false;
    if (!requestKey.userId) return;
    organizationService.getOrganizationsByOwner(requestKey.userId).then((organizations) => {
      if (!cancelled) setResult({ key: requestKey, organizations, error: null });
    }).catch(() => {
      if (!cancelled) setResult({ key: requestKey, organizations: [], error: "Unable to load your organizations. You can book with your personal account or try again." });
    });
    return () => { cancelled = true; };
  }, [requestKey]);
  return { value, setValue, loading, error, retry: () => setAttempt((previous) => previous + 1), options: [{ value: "self", label: "My personal account" }, ...organizations.map((organization) => ({ value: organization.$id, label: organization.name }))] };
}

function useRentalDayAvailability(fields: Field[], date: Date, durationMinutes: number) {
  const [result, setResult] = useState<{ key: string; fields: Field[]; error: string | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const dateKey = formatLocalDateTime(date).slice(0, 10);
  const requestKey = `${fields.map((field) => field.$id).join(",")}:${dateKey}:${durationMinutes}:${attempt}`;
  useEffect(() => {
    let cancelled = false;
    const start = new Date(`${dateKey}T00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    end.setMinutes(end.getMinutes() + durationMinutes);
    Promise.all(fields.map((field) => fieldService.getFieldEventsMatches(field, { start: start.toISOString(), end: end.toISOString() }, { rentalOverlapOnly: true, includeMatches: false }))).then((hydrated) => {
      if (!cancelled) setResult({ key: requestKey, fields: hydrated, error: null });
    }).catch(() => {
      if (!cancelled) setResult({ key: requestKey, fields: [], error: "Unable to check availability for this date. Your selected times have not changed." });
    });
    return () => { cancelled = true; };
  }, [dateKey, durationMinutes, fields, requestKey]);
  return { fields: result?.key === requestKey ? result.fields : EMPTY_FIELDS, error: result?.key === requestKey ? result.error : null, loading: result?.key !== requestKey, retry: () => setAttempt((previous) => previous + 1) };
}

type PublicRentalAvailabilityProps = {
  organization: Organization;
  currentUser: UserData | null;
  authLoading: boolean;
  onRentalSelectionReady: (payload: RentalSelectionCheckoutPayload) => void;
};

export default function PublicRentalAvailability({ organization, currentUser, authLoading, onRentalSelectionReady }: PublicRentalAvailabilityProps) {
  const fields = organization.fields ?? EMPTY_FIELDS;
  const rentalListings = useMemo(() => {
    const listings: { field: Field; slot: TimeSlot; nextOccurrence: Date }[] = [];
    fields.forEach((field) => field.rentalSlots?.forEach((slot) => {
      if (slot.rentalLocked) return;
      const nextOccurrence = getNextRentalOccurrence(slot);
      if (nextOccurrence) listings.push({ field, slot, nextOccurrence });
    }));
    return listings.sort((a, b) => a.nextOccurrence.getTime() - b.nextOccurrence.getTime());
  }, [fields]);
  const facilities = useMemo(() => {
    const values = new Map<string, Facility>((organization.facilities ?? []).map((facility) => [facility.$id, facility]));
    fields.forEach((field) => {
      if (field.facility && typeof field.facility !== "string") values.set(field.facility.$id, field.facility);
    });
    return [...values.values()];
  }, [fields, organization.facilities]);
  const [facilityId, setFacilityId] = useState("all");
  const facilityFields = useMemo(() => facilityId === "all" ? fields : fields.filter((field) => (field.facilityId ?? (typeof field.facility === "string" ? field.facility : field.facility?.$id)) === facilityId), [fields, facilityId]);
  const [date, setDate] = useState(() => rentalListings[0]?.nextOccurrence ?? new Date());
  const [dateChoicesStart, setDateChoicesStart] = useState(date);
  const activeDateKey = formatLocalDateTime(date).slice(0, 10);
  const [duration, setDuration] = useState<number | string>(60);
  const [addingTime, setAddingTime] = useState(false);
  const durationMinutes = Number(duration);
  const durationValid = Number.isInteger(durationMinutes) && durationMinutes >= 60;
  const account = useRentalBookingAccount(currentUser);
  const availability = useRentalDayAvailability(facilityFields, date, durationValid ? durationMinutes : 60);
  const choices = useMemo(() => buildPublicRentalTimeOptions(availability.fields, date, durationValid ? durationMinutes : 60), [availability.fields, date, durationMinutes, durationValid]);
  const selection = usePublicRentalSelections({ canManage: false, currentUser, fields, facilityFilteredFields: facilityFields, rentalListings: NO_PRESELECTED_RENTALS, selectionContextKey: organization.$id, compareRanges });
  const checkoutIdentity = useRef<{ signature: string; eventId: string } | null>(null);
  const days = useMemo(() => Array.from({ length: 4 }, (_, index) => {
    const day = new Date(dateChoicesStart);
    day.setDate(day.getDate() + index);
    return day;
  }), [dateChoicesStart]);

  const chooseTime = (option: RentalTimeOption) => {
    if (option.unavailable || !durationValid) return;
    const next = buildSelectionFromCalendarRange(option.start, option.end, option.fieldId);
    selection.setRentalSelections((previous) => {
      if (!addingTime) return [next];
      const alreadySelected = previous.some((item) => item.scheduledFieldIds.includes(option.fieldId) && item.startDate === next.startDate && item.endDate === next.endDate);
      return alreadySelected ? previous : [...previous, next];
    });
    setAddingTime(false);
  };
  const retrySelection = () => {
    selection.setRentalSelections((previous) => previous.map((item) => ({ ...item, key: createId() })));
    availability.retry();
  };
  const continueCheckout = () => {
    if (!selection.canReserveRentalResources || account.loading || authLoading) return;
    const rentalSelections: RentalSelectionCheckoutSelection[] = selection.rentalSelections.flatMap((item) => {
      const range = resolveSelectionDateRange(item);
      if (!range) return [];
      const normalized = updateSelectionWithCalendarRange(item, range.start, range.end);
      return [{ key: item.key, scheduledFieldIds: normalized.scheduledFieldIds, dayOfWeek: normalized.dayOfWeek!, daysOfWeek: normalized.daysOfWeek, startTimeMinutes: normalized.startTimeMinutes!, endTimeMinutes: normalized.endTimeMinutes!, startDate: normalized.startDate!, endDate: normalized.endDate!, repeating: false }];
    });
    const signature = JSON.stringify([account.value, rentalSelections.map(({ key: _key, ...item }) => item)]);
    if (checkoutIdentity.current?.signature !== signature) checkoutIdentity.current = { signature, eventId: createId() };
    onRentalSelectionReady(buildRentalSelectionCheckout({
      eventId: checkoutIdentity.current.eventId,
      rentalSelections,
      fields,
      facilities,
      organization,
      hostSelection: account.value,
      totalRentalCents: selection.totalRentalCents,
      requiredTemplateIds: selection.rentalRequiredTemplateIds,
      hostRequiredTemplateIds: selection.rentalHostRequiredTemplateIds,
    }));
  };
  const disabledReason = authLoading ? "Checking your sign-in status…" : !currentUser ? "Sign in to reserve your selected time." : account.loading ? "Loading your booking accounts…" : !selection.rentalSelections.length ? "Choose a time to continue." : selection.hasPendingConflictChecks ? "Checking your selected time for conflicts…" : !selection.canReserveRentalResources ? "Resolve the selection errors before continuing." : null;

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-7">
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-xl font-semibold">{organization.name}</h2>
          {organization.description && <p className="mt-1 text-sm text-muted-foreground">{organization.description}</p>}
          {organization.location && <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><MapPin aria-hidden="true" className="size-4" />{organization.location}</p>}
        </section>
        <section aria-labelledby="rental-date-title" className="space-y-4">
          <h2 id="rental-date-title" className="text-xl font-semibold">Choose a date</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <DatePickerInput label="Rental date" value={date} onChange={(value) => { if (value) { setDate(value); setDateChoicesStart(value); } }} minDate={new Date()} />
            <NumberInput label="Duration in minutes" value={duration} onChange={setDuration} min={60} step={30} allowDecimal={false} clampBehavior="none" error={durationValid ? undefined : "Choose at least 60 minutes."} />
          </div>
          <div role="group" aria-label="Rental dates" className="grid grid-cols-4 gap-2">
            {days.map((day) => {
              const dayKey = formatLocalDateTime(day).slice(0, 10);
              const selected = dayKey === activeDateKey;
              return <Button key={dayKey} variant="default" aria-pressed={selected} className={cn("h-auto min-h-16 whitespace-normal", selected && "border-[var(--bq-brand-strong)] bg-[var(--bq-surface-muted)] text-[var(--bq-brand-strong)]")} onClick={() => setDate(day)}>{day.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</Button>;
            })}
          </div>
          {facilities.length > 1 && <Select label="Venue" data={[{ value: "all", label: "All venues" }, ...facilities.map((facility) => ({ value: facility.$id, label: facility.name }))]} value={facilityId} onChange={(value) => setFacilityId(value ?? "all")} allowDeselect={false} />}
        </section>
        <section aria-labelledby="rental-times-title" className="space-y-4" aria-busy={availability.loading}>
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="rental-times-title" className="text-xl font-semibold">Available times</h2><p className="text-sm text-muted-foreground">{formatDisplayDate(date)}</p></div>
          {addingTime && <Alert color="teal">Choose another time to add to your reservation. Your current selections will stay.</Alert>}
          {availability.loading && <p role="status" className="text-sm text-muted-foreground">Loading available times…</p>}
          {(availability.error || choices.error) && <Alert color="red" title="Availability could not load">{availability.error || choices.error}<Button variant="default" className="mt-3" onClick={availability.retry}>Retry availability</Button></Alert>}
          {!availability.loading && !availability.error && !choices.error && choices.options.length === 0 && <Alert title="No times for this date">Choose another date or a shorter duration. Your current selections have not changed.</Alert>}
          <div className="grid gap-3 sm:grid-cols-2">
            {choices.options.map((option) => {
              const selected = selection.rentalSelections.some((item) => item.scheduledFieldIds.includes(option.fieldId) && item.startDate === formatLocalDateTime(option.start) && item.endDate === formatLocalDateTime(option.end));
              return <button key={option.key} type="button" aria-pressed={selected} disabled={option.unavailable || !durationValid} onClick={() => chooseTime(option)} className={cn("min-h-28 rounded-xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground", selected ? "border-[var(--bq-brand-strong)] bg-[var(--bq-surface-muted)]" : "border-border bg-card hover:border-[var(--bq-brand-strong)]")}>
                <span className="block font-semibold">{formatDisplayTime(option.start)} – {formatDisplayTime(option.end)}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{option.fieldName} · {durationMinutes} minutes</span>
                <span className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-[var(--bq-brand-strong)]"><span>{formatPrice(option.hourlyRate)} / hour</span><span>{option.unavailable ? "Unavailable" : selected ? "Selected" : "Choose time"}</span></span>
              </button>;
            })}
          </div>
        </section>
      </div>
      <aside aria-label="Selected rental times" className="space-y-5 rounded-xl border border-border bg-card p-5 lg:sticky lg:top-6">
        <h2 className="text-xl font-semibold">Reservation summary</h2>
        {selection.rentalSelectionValidations.map((validation) => {
          const range = resolveSelectionDateRange(validation.selection);
          return <section key={validation.selection.key} className="space-y-2 border-b border-border pb-4">
            <p className="font-semibold">{validation.selection.scheduledFieldIds.map((id) => getFacilityScopedFieldDisplayName(fields.find((field) => field.$id === id))).join(", ")}</p>
            {range && <><p className="flex items-center gap-2 text-sm"><CalendarDays aria-hidden="true" className="size-4 shrink-0" />{formatDisplayDate(range.start)}{formatDisplayDate(range.start) !== formatDisplayDate(range.end) ? ` – ${formatDisplayDate(range.end)}` : ""}</p><p className="text-sm">{formatDisplayTime(range.start)} – {formatDisplayTime(range.end)}</p><p className="text-sm text-muted-foreground">{Math.round(validation.totalHours * 60)} minutes</p></>}
            <p className="font-semibold tabular-nums">{formatPrice(validation.totalCents)}</p>
            {validation.conflictCheckPending && <p role="status" className="text-sm text-muted-foreground">Checking this time…</p>}
            {validation.errors.map((error) => <p key={error} role="alert" className="text-sm text-destructive">{error}</p>)}
            <Button variant="subtle" onClick={() => selection.handleRemoveRentalSelection(validation.selection.key)}>Remove time</Button>
          </section>;
        })}
        <div className="flex flex-wrap gap-2"><Button variant="default" disabled={addingTime} onClick={() => setAddingTime(true)}>Add another time</Button>{selection.rentalSelectionValidations.some((validation) => validation.errors.length > 0) && <Button variant="default" onClick={retrySelection}>Recheck selected times</Button>}</div>
        {currentUser && <Select label="Book rental as" data={account.options} value={account.value} onChange={(value) => account.setValue(value ?? "self")} allowDeselect={false} disabled={account.loading} />}
        {account.error && <Alert color="yellow">{account.error}<Button variant="default" className="mt-2" onClick={account.retry}>Retry accounts</Button></Alert>}
        <div className="flex items-center justify-between gap-3 border-t border-border pt-4"><span className="font-semibold">Rental total</span><strong className="text-2xl tabular-nums">{formatPrice(selection.totalRentalCents)}</strong></div>
        <p className="flex gap-2 text-sm text-muted-foreground"><ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />Payment details stay with Stripe. Review any tax and payment fees before you pay.</p>
        <Button fullWidth disabled={Boolean(disabledReason)} aria-describedby={disabledReason ? "rental-continue-reason" : undefined} onClick={continueCheckout}>Continue to reservation</Button>
        {disabledReason && <p id="rental-continue-reason" role={selection.hasPendingConflictChecks || authLoading ? "status" : undefined} className="text-sm text-muted-foreground">{disabledReason}</p>}
      </aside>
    </div>
  );
}
