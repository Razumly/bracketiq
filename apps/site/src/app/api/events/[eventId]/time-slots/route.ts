import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageEvent } from '@/server/accessControl';
import {
  assertValidOneTimeTimeSlots,
  TimeSlotValidationError,
} from '@/lib/timeSlotAvailability';
import {
  assertRepeatingTimeSlotsResolvable,
} from '@/lib/repeatingTimeSlotAvailability';
import {
  eventRequiresConfiguredTimeSlot,
  hasWeeklyRepeatingTimeSlot,
  WEEKLY_REPEATING_TIME_SLOT_REQUIRED_MESSAGE,
} from '@/lib/eventScheduling';
import { repeatingTimeSlotValidationResponse } from '@/server/repeatingTimeSlotValidationResponse';
import { acquireEventLock, acquireFieldLocks } from '@/server/repositories/locks';

export const dynamic = 'force-dynamic';

const updateTimeSlotsSchema = z.object({
  addTimeSlotIds: z.array(z.string().trim().min(1)).default([]),
  removeTimeSlotIds: z.array(z.string().trim().min(1)).default([]),
}).strict().superRefine((value, context) => {
  const additions = new Set(value.addTimeSlotIds);
  const overlap = value.removeTimeSlotIds.find((id) => additions.has(id));
  if (overlap) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['removeTimeSlotIds'],
      message: `Time slot ${overlap} cannot be added and removed in the same request.`,
    });
  }
});

const loadEventAccess = async (client: any, eventId: string) => client.events.findUnique({
  where: { id: eventId },
  select: {
    id: true,
    hostId: true,
    assistantHostIds: true,
    organizationId: true,
    timeSlotIds: true,
    start: true,
    end: true,
    noFixedEndDateTime: true,
    eventType: true,
    parentEvent: true,
    automatedScheduling: true,
    timeZone: true,
    fieldIds: true,
  },
});

const buildNextTimeSlotIds = (
  existingIds: unknown,
  addIds: string[],
  removeIds: string[],
): string[] => {
  const removeSet = new Set(removeIds);
  const nextIds = (Array.isArray(existingIds) ? existingIds : [])
    .map((id: unknown) => String(id).trim())
    .filter((id: string) => id.length > 0 && !removeSet.has(id));
  const nextIdSet = new Set(nextIds);
  addIds.forEach((id) => {
    if (nextIdSet.has(id)) {
      return;
    }
    nextIdSet.add(id);
    nextIds.push(id);
  });
  return nextIds;
};

const loadRelationTimeSlots = async (
  tx: any,
  timeSlotIds: string[],
): Promise<any[]> => {
  const slots = timeSlotIds.length
    ? await tx.timeSlots.findMany({
      where: { id: { in: timeSlotIds }, archivedAt: null },
    })
    : [];
  if (slots.length !== timeSlotIds.length) {
    const loadedIds = new Set(slots.map((slot: any) => slot.id));
    const missingIds = timeSlotIds.filter((id) => !loadedIds.has(id));
    throw new TimeSlotValidationError(
      'INVALID_ONE_TIME_SLOT',
      `Event Time Slots reference unavailable ids: ${missingIds.join(', ')}.`,
      { slotIds: missingIds },
    );
  }
  return slots;
};

const buildDivisionReferenceLookup = (
  divisions: Array<{ id: string; key: string | null }>,
): Map<string, string> => {
  const lookup = new Map<string, string>();
  divisions.forEach((division) => {
    lookup.set(division.id.trim().toLowerCase(), division.id);
    if (division.key?.trim()) {
      lookup.set(division.key.trim().toLowerCase(), division.id);
    }
  });
  return lookup;
};

const canonicalizeRelationSlot = (
  slot: any,
  eligibleResourceIds: Set<string>,
  divisionIdByReference: Map<string, string>,
): any => {
  const resourceIds = Array.from(new Set([
    ...slot.scheduledFieldIds,
    ...(slot.scheduledFieldId ? [slot.scheduledFieldId] : []),
  ].map((resourceId: string) => resourceId.trim()).filter(Boolean)));
  const unknownResourceId = resourceIds.find((resourceId: string) =>
    !eligibleResourceIds.has(resourceId),
  );
  if (unknownResourceId) {
    throw new TimeSlotValidationError(
      'INVALID_ONE_TIME_SLOT',
      `One-Time Time Slot \"${slot.id}\" references unavailable Resource \"${unknownResourceId}\".`,
      { slotIds: [slot.id] },
    );
  }
  const divisionIds = slot.divisions.map((divisionReference: string) => {
    const normalizedReference = divisionReference.trim().toLowerCase();
    const divisionId = divisionIdByReference.get(normalizedReference);
    if (!divisionId) {
      throw new TimeSlotValidationError(
        'INVALID_ONE_TIME_SLOT',
        `One-Time Time Slot \"${slot.id}\" references unavailable Division \"${divisionReference}\".`,
        { slotIds: [slot.id] },
      );
    }
    return divisionId;
  });
  return {
    ...slot,
    scheduledFieldId: resourceIds[0] ?? null,
    scheduledFieldIds: resourceIds,
    divisions: divisionIds,
  };
};

const canonicalizeRelationSlots = (
  slots: any[],
  eligibleResourceIds: string[],
  divisions: Array<{ id: string; key: string | null }>,
): any[] => {
  const eligibleResources = new Set(eligibleResourceIds);
  const divisionIdByReference = buildDivisionReferenceLookup(divisions);
  return slots.map((slot) =>
    canonicalizeRelationSlot(slot, eligibleResources, divisionIdByReference),
  );
};

const assertRelationSlotPolicy = (
  event: any,
  canonicalSlots: any[],
): void => {
  if (
    eventRequiresConfiguredTimeSlot(
      event.eventType,
      event.automatedScheduling,
      event.parentEvent,
    ) &&
    canonicalSlots.length === 0
  ) {
    throw new TimeSlotValidationError(
      'INVALID_ONE_TIME_SLOT',
      `Event "${event.id}" requires at least one Time Slot.`,
    );
  }
  const isStandaloneWeekly =
    event.eventType === 'WEEKLY_EVENT' &&
    (!event.parentEvent || event.parentEvent.trim().length === 0);
  if (isStandaloneWeekly && !hasWeeklyRepeatingTimeSlot(canonicalSlots)) {
    throw new TimeSlotValidationError(
      'INVALID_ONE_TIME_SLOT',
      WEEKLY_REPEATING_TIME_SLOT_REQUIRED_MESSAGE,
    );
  }
};

const updateRelationDivisionChanges = async (
  tx: any,
  slots: any[],
  canonicalSlots: any[],
): Promise<void> => {
  for (const canonicalSlot of canonicalSlots) {
    const persistedSlot = slots.find((slot: any) => slot.id === canonicalSlot.id);
    if (
      persistedSlot &&
      (
        persistedSlot.divisions.length !== canonicalSlot.divisions.length ||
        persistedSlot.divisions.some(
          (divisionId: string, index: number) =>
            divisionId !== canonicalSlot.divisions[index],
        )
      )
    ) {
      await tx.timeSlots.update({
        where: { id: canonicalSlot.id },
        data: { divisions: canonicalSlot.divisions, updatedAt: new Date() },
      });
    }
  }
};

const updateEventTimeSlotRelations = async (
  tx: any,
  session: any,
  eventId: string,
  relation: { addTimeSlotIds: string[]; removeTimeSlotIds: string[] },
): Promise<any> => {
  await acquireEventLock(tx, eventId);
  const existing = await loadEventAccess(tx, eventId);
  if (!existing) {
    throw new Response('Not found', { status: 404 });
  }
  await acquireFieldLocks(tx, existing.fieldIds ?? []);
  if (!(await canManageEvent(session, existing, tx))) {
    throw new Response('Forbidden', { status: 403 });
  }
  const nextTimeSlotIds = buildNextTimeSlotIds(
    existing.timeSlotIds,
    relation.addTimeSlotIds,
    relation.removeTimeSlotIds,
  );
  const slots = await loadRelationTimeSlots(tx, nextTimeSlotIds);
  const divisions = await tx.divisions.findMany({
    where: { eventId, role: 'ENTRY', status: 'ACTIVE' },
    select: { id: true, key: true },
  });
  const canonicalSlots = canonicalizeRelationSlots(
    slots,
    existing.fieldIds,
    divisions,
  );
  assertRelationSlotPolicy(existing, canonicalSlots);
  assertRepeatingTimeSlotsResolvable({
    slots: canonicalSlots,
    eventStart: existing.start,
    eventEnd: existing.noFixedEndDateTime ? null : existing.end,
    eligibleResourceIds: existing.fieldIds,
  });
  assertValidOneTimeTimeSlots({
    slots: canonicalSlots,
    fallbackTimeZone: existing.timeZone,
    eventStart: existing.start,
    eventEnd: existing.noFixedEndDateTime ? null : existing.end,
    eligibleResourceIds: existing.fieldIds,
    eligibleDivisionIds: divisions.map((division: { id: string }) => division.id),
  });
  await updateRelationDivisionChanges(tx, slots, canonicalSlots);
  const event = await tx.events.update({
    where: { id: eventId },
    data: { timeSlotIds: nextTimeSlotIds, updatedAt: new Date() },
    select: { id: true, timeSlotIds: true, updatedAt: true },
  });
  return { event };
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const session = await requireSession(req);
    const { eventId } = await params;
    const body = await req.json().catch(() => null);
    const parsed = updateTimeSlotsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid event time-slot relation', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await prisma.$transaction((tx) =>
      updateEventTimeSlotRelations(tx, session, eventId, parsed.data),
    );
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    const repeatingTimeSlotResponse = repeatingTimeSlotValidationResponse(error);
    if (repeatingTimeSlotResponse) {
      return repeatingTimeSlotResponse;
    }
    if (error instanceof TimeSlotValidationError) {
      return NextResponse.json(
        { error: error.message, code: 'INVALID_TIME_SLOT', slotIds: error.slotIds },
        { status: 400 },
      );
    }
    console.error('Update event time-slot relation failed', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
