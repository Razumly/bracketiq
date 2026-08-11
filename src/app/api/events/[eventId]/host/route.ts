import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { canManageEvent } from '@/server/accessControl';
import { acquireEventLock } from '@/server/repositories/locks';

export const dynamic = 'force-dynamic';

const updateHostSchema = z.object({
  hostId: z.string().trim().min(1),
}).strict();

const loadEventAccess = async (client: any, eventId: string) => client.events.findUnique({
  where: { id: eventId },
  select: {
    id: true,
    hostId: true,
    assistantHostIds: true,
    organizationId: true,
  },
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const session = await requireSession(req);
    const { eventId } = await params;
    const body = await req.json().catch(() => null);
    const parsed = updateHostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid event host', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const event = await prisma.$transaction(async (tx) => {
      await acquireEventLock(tx, eventId);
      const existing = await loadEventAccess(tx, eventId);
      if (!existing) {
        throw new Response('Not found', { status: 404 });
      }
      if (!(await canManageEvent(session, existing, tx))) {
        throw new Response('Forbidden', { status: 403 });
      }
      const host = await tx.authUser.findUnique({
        where: { id: parsed.data.hostId },
        select: { id: true },
      });
      if (!host) {
        throw new Response('Host user not found', { status: 404 });
      }
      return tx.events.update({
        where: { id: eventId },
        data: { hostId: parsed.data.hostId, updatedAt: new Date() },
        select: {
          id: true,
          hostId: true,
          organizationId: true,
          updatedAt: true,
        },
      });
    });
    return NextResponse.json({ event }, { status: 200 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Update event host failed', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
