import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageEvent } from '@/server/accessControl';
import { acquireEventLock } from '@/server/repositories/locks';

export const dynamic = 'force-dynamic';

const eventHostUpdateSchema = z.object({
  hostId: z.string().trim().min(1),
}).strict();

class EventHostNotFoundError extends Error {}
class EventHostForbiddenError extends Error {}

const errorResponse = (error: unknown): NextResponse => {
  if (error instanceof EventHostNotFoundError) {
    return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
  }
  if (error instanceof EventHostForbiddenError) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  console.error('Event host update failed', error);
  return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const session = await requireSession(req);
    const parsed = eventHostUpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({
        error: 'Invalid event host update.',
        details: parsed.error.flatten(),
      }, { status: 400 });
    }

    const { eventId } = await params;
    const updatedEvent = await prisma.$transaction(async (tx) => {
      await acquireEventLock(tx, eventId);
      const event = await tx.events.findUnique({
        where: { id: eventId },
        select: {
          id: true,
          hostId: true,
          assistantHostIds: true,
          organizationId: true,
        },
      });
      if (!event) {
        throw new EventHostNotFoundError();
      }
      if (!(await canManageEvent(session, event, tx))) {
        throw new EventHostForbiddenError();
      }
      return tx.events.update({
        where: { id: eventId },
        data: { hostId: parsed.data.hostId },
        select: { id: true, hostId: true },
      });
    });

    return NextResponse.json({ event: updatedEvent }, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
