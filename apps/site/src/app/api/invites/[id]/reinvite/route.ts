import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isRoutineInvitationVisible } from '@/server/invitationRetention';
import { requireSession } from '@/lib/permissions';
import { canManageTeamInvites } from '@/app/api/teams/[id]/member-invites/inviteHelpers';
import { POST as createMemberInvite } from '@/app/api/teams/[id]/member-invites/route';
import { invitationReminderSchema } from '@/contracts/teamInvitations';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id } = await params;
  const input = invitationReminderSchema.safeParse(await req.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: 'A request key is required.' }, { status: 400 });
  const invite = await prisma.invites.findUnique({ where: { id } });
  if (!invite?.teamId || invite.type !== 'TEAM' || !isRoutineInvitationVisible(invite)) return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 });
  if (!(await canManageTeamInvites(invite.teamId, session, prisma))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const headers = new Headers(req.headers);
  headers.delete('content-length');
  const forwarded = new NextRequest(req.url, { method: 'POST', headers, body: JSON.stringify({
    role: invite.role || 'player', userId: invite.userId || undefined,
    firstName: invite.firstName || undefined, lastName: invite.lastName || undefined,
    email: invite.email || undefined, phone: invite.phone || undefined,
    isMinor: invite.isMinor, guardianEmail: invite.guardianEmail || undefined,
    dateOfBirth: invite.dateOfBirth?.toISOString().slice(0, 10),
    reinviteId: id, idempotencyKey: input.data.idempotencyKey,
  }) });
  return createMemberInvite(forwarded, { params: Promise.resolve({ id: invite.teamId }) });
}
