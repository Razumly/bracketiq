import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { getRequestOrigin } from '@/lib/requestOrigin';
import { sendInviteEmails } from '@/server/inviteEmails';
import { loadCanonicalTeamById, normalizeId } from '@/server/teams/teamMembership';
import {
  assertEditableAccountlessTeamPlayer,
  canManageTeamInvites,
  MemberInviteRouteError,
} from '@/app/api/teams/[id]/member-invites/inviteHelpers';

export const dynamic = 'force-dynamic';

const errorResponse = (error: unknown) => {
  if (error instanceof MemberInviteRouteError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : 'Failed to resend member invite';
  return NextResponse.json({ error: message }, { status: 500 });
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; inviteId: string }> },
) {
  const session = await requireSession(req);
  const { id, inviteId } = await params;
  const teamId = normalizeId(id);
  const normalizedInviteId = normalizeId(inviteId);
  if (!teamId || !normalizedInviteId) {
    return NextResponse.json({ error: 'Invalid team or invite id' }, { status: 400 });
  }

  try {
    const invite = await prisma.$transaction(async (tx) => {
      const team = await loadCanonicalTeamById(teamId, tx);
      if (!team) throw new MemberInviteRouteError(404, 'Team not found');
      if (!(await canManageTeamInvites(teamId, session, tx))) {
        throw new MemberInviteRouteError(403, 'Forbidden');
      }
      const existing = await tx.invites.findFirst({
        where: { id: normalizedInviteId, teamId },
      });
      const editable = assertEditableAccountlessTeamPlayer(existing);
      const email = typeof editable.email === 'string' ? editable.email.trim() : '';
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new MemberInviteRouteError(409, 'Invite does not have a valid email address');
      }
      return editable;
    });

    const deliveryInvite = {
      id: normalizedInviteId,
      email: typeof invite.email === 'string' ? invite.email : null,
      userId: typeof invite.userId === 'string' ? invite.userId : null,
      type: typeof invite.type === 'string' ? invite.type : null,
      teamId: typeof invite.teamId === 'string' ? invite.teamId : null,
      firstName: typeof invite.firstName === 'string' ? invite.firstName : null,
      lastName: typeof invite.lastName === 'string' ? invite.lastName : null,
      status: typeof invite.status === 'string' ? invite.status : null,
      linkVersion: typeof invite.linkVersion === 'number' ? invite.linkVersion : null,
      linkExpiresAt: invite.linkExpiresAt instanceof Date || typeof invite.linkExpiresAt === 'string'
        ? invite.linkExpiresAt
        : null,
    };
    const delivered = await sendInviteEmails([deliveryInvite], getRequestOrigin(req));
    const result = delivered.find((row) => row.id === normalizedInviteId);
    if (String(result?.status ?? '').toUpperCase() === 'FAILED') {
      return NextResponse.json({ error: 'Invite email delivery failed' }, { status: 502 });
    }
    return NextResponse.json({ ok: true, inviteId: normalizedInviteId }, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
