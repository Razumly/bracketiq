import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { projectEventAuthorityCapabilities } from '@/server/accessControl';
import {
  assertEventHostTransition,
  EventHostDelegationError,
} from '@/server/events/eventHostDelegation';
import { acquireEventLock } from '@/server/repositories/locks';

export const dynamic = 'force-dynamic';

const updateHostSchema = z.object({
  hostId: z.string().trim().min(1).nullable(),
}).strict();

const loadEventAccess = async (client: Prisma.TransactionClient, eventId: string) => client.events.findUnique({
  where: { id: eventId },
  select: {
    id: true,
    hostId: true,
    assistantHostIds: true,
    organizationId: true,
    updatedAt: true,
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

    const result = await prisma.$transaction(async (tx) => {
      await acquireEventLock(tx, eventId);
      const existing = await loadEventAccess(tx, eventId);
      if (!existing) {
        throw new Response('Not found', { status: 404 });
      }
      const nextHostId = await assertEventHostTransition({
        client: tx,
        actor: session,
        event: existing,
        nextHostId: parsed.data.hostId,
      });
      const event = existing.hostId === nextHostId
        ? existing
        : await tx.events.update({
            where: { id: eventId },
            data: { hostId: nextHostId, updatedAt: new Date() },
            select: {
              id: true,
              hostId: true,
              assistantHostIds: true,
              organizationId: true,
              updatedAt: true,
            },
          });
      const capabilities = await projectEventAuthorityCapabilities(session, event, tx);
      return { event, capabilities };
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    if (error instanceof EventHostDelegationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    console.error('Update event host failed', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
