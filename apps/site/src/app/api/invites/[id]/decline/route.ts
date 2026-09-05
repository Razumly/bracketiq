import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { normalizeInviteType } from '@/lib/staff';
import { declineTeamInviteWithGuardianRules } from '@/server/teams/teamGuardianInvites';
import { acquireEventLock } from '@/server/repositories/locks';
import { declineTeamInvitationSchema } from '@/contracts/teamInvitations';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;

  const invite = await prisma.invites.findUnique({ where: { id } });
  if (!invite) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const now = new Date();
  const inviteType = normalizeInviteType(invite.type);
  if (inviteType === 'TEAM' && invite.teamId && invite.userId) {
    const body = await req.text();
    let input: unknown = {};
    try { input = body ? JSON.parse(body) : {}; } catch { return NextResponse.json({ error: 'Invalid input' }, { status: 400 }); }
    const parsed = declineTeamInvitationSchema.safeParse(input);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    try {
      const result = await declineTeamInviteWithGuardianRules({ invite, session, now, input: parsed.data });
      return NextResponse.json(result.body, { status: result.status });
    } catch (error) {
      if (error instanceof Response) return NextResponse.json({ error: await error.text(), saved: false }, { status: error.status });
      console.error('Invitation decline failed', error);
      return NextResponse.json({ error: 'The invitation and block were not saved. Try again.', saved: false }, { status: 500 });
    }
  }

  const eventStaffId = inviteType === 'STAFF'
    && typeof invite.eventId === 'string'
    && invite.eventId.trim()
    ? invite.eventId.trim()
    : null;
  if (eventStaffId) {
    const result = await prisma.$transaction(async (tx) => {
      await acquireEventLock(tx, eventStaffId);
      const lockedInvite = await tx.invites.findUnique({ where: { id } });
      if (
        !lockedInvite
        || normalizeInviteType(lockedInvite.type) !== 'STAFF'
        || lockedInvite.eventId !== eventStaffId
      ) {
        return { status: 404, body: { error: 'Not found' } };
      }
      if (!session.isAdmin && lockedInvite.userId !== session.userId) {
        return { status: 403, body: { error: 'Forbidden' } };
      }

      await tx.invites.update({
        where: { id },
        data: {
          status: 'DECLINED',
          finalizedAt: now,
          updatedAt: now,
        },
      });
      return { status: 200, body: { ok: true } };
    });

    return NextResponse.json(result.body, { status: result.status });
  }

  if (!session.isAdmin && invite.userId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.invites.update({
      where: { id },
      data: {
        status: 'DECLINED',
        finalizedAt: now,
        updatedAt: now,
      },
    });
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
