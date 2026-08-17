import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageEvent } from '@/server/accessControl';
import {
  assertValidOneTimeTimeSlots,
  TimeSlotValidationError,
} from '@/lib/timeSlotAvailability';
import { acquireEventLock } from '@/server/repositories/locks';

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
    timeZone: true,
    fieldIds: true,
  },
});

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

    const result = await prisma.$transaction(async (tx) => {
      await acquireEventLock(tx, eventId);
      const existing = await loadEventAccess(tx, eventId);
      if (!existing) {
        throw new Response('Not found', { status: 404 });
      }
      if (!(await canManageEvent(session, existing, tx))) {
        throw new Response('Forbidden', { status: 403 });
      }

      const removeIds = new Set(parsed.data.removeTimeSlotIds);
      const nextTimeSlotIds: string[] = (Array.isArray(existing.timeSlotIds) ? existing.timeSlotIds : [])
        .map((id: unknown) => String(id).trim())
        .filter((id: string) => id.length > 0 && !removeIds.has(id));
      const nextIds = new Set(nextTimeSlotIds);
      parsed.data.addTimeSlotIds.forEach((id) => {
        if (!nextIds.has(id)) {
          nextIds.add(id);
          nextTimeSlotIds.push(id);
        }
      });

      const slots = nextTimeSlotIds.length
        ? await tx.timeSlots.findMany({
          where: { id: { in: nextTimeSlotIds }, archivedAt: null },
        })
        : [];
      if (slots.length !== nextTimeSlotIds.length) {
        const loadedIds = new Set(slots.map((slot) => slot.id));
        const missingIds = nextTimeSlotIds.filter((id: string) => !loadedIds.has(id));
        throw new TimeSlotValidationError(
          'INVALID_ONE_TIME_SLOT',
          `Event Time Slots reference unavailable ids: ${missingIds.join(', ')}.`,
          { slotIds: missingIds },
        );
      }
      const divisions = await tx.divisions.findMany({
        where: { eventId, role: 'ENTRY', status: 'ACTIVE' },
        select: { id: true, key: true },
      });
      const divisionIdByReference = new Map<string, string>();
      divisions.forEach((division) => {
        divisionIdByReference.set(division.id.trim().toLowerCase(), division.id);
        if (division.key?.trim()) {
          divisionIdByReference.set(division.key.trim().toLowerCase(), division.id);
        }
      });
      const eligibleResourceIds = new Set(existing.fieldIds);
      const canonicalSlots = slots.map((slot) => {
        const resourceIds = Array.from(new Set([
          ...slot.scheduledFieldIds,
          ...(slot.scheduledFieldId ? [slot.scheduledFieldId] : []),
        ].map((resourceId: string) => resourceId.trim()).filter(Boolean)));
        const unknownResourceId = resourceIds.find((resourceId: string) => !eligibleResourceIds.has(resourceId));
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
      });
      assertValidOneTimeTimeSlots({
        slots: canonicalSlots,
        fallbackTimeZone: existing.timeZone,
        eventStart: existing.start,
        eventEnd: existing.noFixedEndDateTime ? null : existing.end,
        eligibleResourceIds: existing.fieldIds,
        eligibleDivisionIds: divisions.map((division) => division.id),
      });
      for (const canonicalSlot of canonicalSlots) {
        const persistedSlot = slots.find((slot) => slot.id === canonicalSlot.id);
        if (
          persistedSlot
          && (
            persistedSlot.divisions.length !== canonicalSlot.divisions.length
            || persistedSlot.divisions.some((divisionId, index) => divisionId !== canonicalSlot.divisions[index])
          )
        ) {
          await tx.timeSlots.update({
            where: { id: canonicalSlot.id },
            data: { divisions: canonicalSlot.divisions, updatedAt: new Date() },
          });
        }
      }

      const event = await tx.events.update({
        where: { id: eventId },
        data: { timeSlotIds: nextTimeSlotIds, updatedAt: new Date() },
        select: { id: true, timeSlotIds: true, updatedAt: true },
      });
      return { event };
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
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
