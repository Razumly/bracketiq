import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { getRequestOrigin } from '@/lib/requestOrigin';
import { invitationReminderSchema } from '@/contracts/teamInvitations';
import { sendInviteEmails } from '@/server/inviteEmails';
import { canManageTeamInvites } from '@/app/api/teams/[id]/member-invites/inviteHelpers';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;
  const parsed = invitationReminderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'A reminder request key is required.' }, { status: 400 });
  const invite = await prisma.invites.findUnique({ where: { id } });
  if (!invite?.teamId || invite.type !== 'TEAM') return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 });
  if (!(await canManageTeamInvites(invite.teamId, session, prisma))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const [saved] = await sendInviteEmails([invite], getRequestOrigin(req), {
      idempotencyKey: parsed.data.idempotencyKey, requestedBy: session.userId, requestedByIsAdmin: session.isAdmin, kind: 'REMINDER',
    });
    if (saved.delivery?.httpStatus) return NextResponse.json({ error: saved.delivery.error, invite: saved }, { status: saved.delivery.httpStatus });
    return NextResponse.json({ ok: true, invite: saved, delivery: saved.delivery });
  } catch (error) {
    console.error('Invitation reminder failed', error);
    return NextResponse.json({ error: 'The reminder could not be recorded. The invitation is still saved.' }, { status: 500 });
  }
}
