import type { EventEditorDraft } from "@/contracts/eventEditor";
import type { Prisma } from "@/generated/prisma/client";
import { resolveOneTimeTimeSlot } from "@/lib/timeSlotAvailability";

export class EditorImmutableFieldError extends Error {
  constructor(readonly fieldName: string, message?: string) {
    super(message ?? `Immutable field ${fieldName} cannot be updated.`);
    this.name = "EditorImmutableFieldError";
  }
}

type EditorSlot = EventEditorDraft["resources"]["timeSlots"][number];
const idFor = (row: { id?: string; $id?: string }) => row.id ?? row.$id ?? "";
const uniqueRowForId = <Row extends { id?: string; $id?: string }>(rows: Row[], id: string): Row | undefined => {
  const matches = rows.filter((row) => idFor(row) === id);
  return matches.length === 1 ? matches[0] : undefined;
};
const sortedIds = (ids: string[] | null | undefined) => [...new Set(ids ?? [])].sort();
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

export const isBookedEditorSlot = (slot: EditorSlot) => Boolean(
  slot.rentalLocked || slot.rentalBookingId || slot.rentalBookingItemId || slot.sourceType === "RENTAL_BOOKING",
);

const bookedSlotValue = (slot: EditorSlot) => {
  const interval = resolveOneTimeTimeSlot({ ...slot, repeating: slot.repeating ?? false });
  return {
    id: idFor(slot),
    start: interval.start.toISOString(),
    end: interval.end.toISOString(),
    timeZone: interval.timeZone,
    fieldIds: sortedIds(interval.resourceIds),
    rentalBookingId: slot.rentalBookingId ?? null,
    rentalBookingItemId: slot.rentalBookingItemId ?? null,
    rentalLocked: Boolean(slot.rentalLocked),
    sourceType: slot.sourceType ?? null,
    requiredTemplateIds: sortedIds(slot.requiredTemplateIds),
    hostRequiredTemplateIds: sortedIds(slot.hostRequiredTemplateIds),
  };
};

export const assertBookedEditorResources = (current: EventEditorDraft, next: EventEditorDraft): void => {
  const fail = (field: string): never => {
    throw new EditorImmutableFieldError(field,
      `The Rental Booking fixes ${field}. Keep the booked values. Use the rental workflow to change the booking.`);
  };
  for (const key of ["rentalBookingId", "rentalBookingItemId"] as const) {
    if (current.resources[key] && current.resources[key] !== next.resources[key]) fail(key);
  }
  if ((current.basics.organizationId ?? null) !== (next.basics.organizationId ?? null)) fail("organizationId");
  const bookedFieldIds = new Set(current.resources.immutableFieldIds ?? []);
  for (const slot of current.resources.timeSlots.filter(isBookedEditorSlot)) {
    const booked = bookedSlotValue(slot);
    booked.fieldIds.forEach((id) => bookedFieldIds.add(id));
    const candidate = uniqueRowForId(next.resources.timeSlots, booked.id);
    if (!candidate || !next.resources.timeSlotIds.includes(booked.id)) fail("timeSlots");
    if (!equal(booked, bookedSlotValue(candidate!))) fail("timeSlots");
  }
  for (const id of bookedFieldIds) {
    if (!next.resources.fieldIds.includes(id)) fail("fieldIds");
    const before = current.resources.fields.find((field) => idFor(field) === id);
    const after = uniqueRowForId(next.resources.fields, id);
    if (!before || !after) fail("fields");
    for (const key of ["name", "location", "address", "organizationId", "facilityId", "lat", "long", "latitude", "longitude", "heading", "inUse", "createdBy", "archivedAt", "archivedByUserId", "archiveReason"] as const) {
      if ((before![key] ?? null) !== (after![key] ?? null)) fail("fields");
    }
    for (const key of ["rentalSlotIds", "sportIds"] as const) {
      if (!equal(sortedIds(before![key]), sortedIds(after![key]))) fail("fields");
    }
  }
};

export const assertRentalBookingAuthority = async (
  client: Prisma.TransactionClient,
  draft: EventEditorDraft,
  actor: { userId: string; isAdmin?: boolean },
): Promise<void> => {
  const slots = draft.resources.timeSlots.filter(isBookedEditorSlot);
  if (!slots.length && !draft.resources.rentalBookingId) return;
  const itemIds = slots.map((slot) => slot.rentalBookingItemId).filter((id): id is string => Boolean(id));
  const items = await client.rentalBookingItems.findMany({ where: { id: { in: itemIds } } });
  const bookingIds = sortedIds([
    ...items.map((item) => item.bookingId),
    ...(draft.resources.rentalBookingId ? [draft.resources.rentalBookingId] : []),
  ]);
  const bookings = await client.rentalBookings.findMany({ where: { id: { in: bookingIds } } });
  if (bookings.length !== bookingIds.length || !slots.length || items.length !== slots.length) {
    throw new EditorImmutableFieldError("rentalBookingId", "The selected booking items are missing or duplicated. Reload the Rental Booking.");
  }
  for (const booking of bookings) {
    if ((booking.renterOrganizationId ?? null) !== (draft.basics.organizationId ?? null)) {
      throw new EditorImmutableFieldError("organizationId", "The selected Organization conflicts with the Rental Booking owner. Use the booking's destination Organization.");
    }
    if (!booking.renterOrganizationId && !actor.isAdmin &&
      booking.renterUserId !== actor.userId && booking.createdByUserId !== actor.userId) {
      throw new EditorImmutableFieldError("rentalBookingId", "This Rental Booking belongs to another user. Select your own booking.");
    }
  }
  for (const slot of slots) {
    const item = items.find((row) => row.id === slot.rentalBookingItemId);
    const value = bookedSlotValue(slot);
    if (!item || item.bookingId !== slot.rentalBookingId ||
      !equal(value.fieldIds, [item.fieldId]) ||
      value.start !== item.start.toISOString() || value.end !== item.end.toISOString() ||
      value.timeZone !== item.timeZone ||
      !equal(value.requiredTemplateIds, sortedIds(item.requiredTemplateIds)) ||
      !equal(value.hostRequiredTemplateIds, sortedIds(item.hostRequiredTemplateIds))) {
      throw new EditorImmutableFieldError("timeSlots", "The Time Slot conflicts with its Rental Booking. Keep the booked Resource, dates, times, and requirements.");
    }
  }
};
