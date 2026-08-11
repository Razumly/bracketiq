import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageEvent } from '@/server/accessControl';
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
      const nextTimeSlotIds = (Array.isArray(existing.timeSlotIds) ? existing.timeSlotIds : [])
        .map((id: unknown) => String(id).trim())
        .filter((id: string) => id.length > 0 && !removeIds.has(id));
      const nextIds = new Set(nextTimeSlotIds);
      parsed.data.addTimeSlotIds.forEach((id) => {
        if (!nextIds.has(id)) {
          nextIds.add(id);
          nextTimeSlotIds.push(id);
        }
      });

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
    console.error('Update event time-slot relation failed', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
