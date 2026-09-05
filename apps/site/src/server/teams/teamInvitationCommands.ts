import { prisma } from '@/lib/prisma';
import { acquireTeamRosterLock } from '@/server/repositories/locks';
import { canManageTeamInvites } from '@/app/api/teams/[id]/member-invites/inviteHelpers';
import { removeCanonicalPendingInvitee, rollbackTeamInviteEventSyncs } from './teamInviteEventSync';
import { expireTeamInvitation, isInvitationExpired } from './teamInvitationState';

type InvitationActor = { userId: string; isAdmin: boolean };

export const cancelTeamInvitation = async (inviteId: string, actor: InvitationActor, now = new Date()) => {
  const original = await prisma.invites.findUnique({ where: { id: inviteId } });
  if (!original?.teamId || original.type !== 'TEAM') {
    return { status: 404, body: { error: 'Invitation not found.' } };
  }
  return prisma.$transaction(async (tx) => {
    if (typeof tx.$executeRaw === 'function') await acquireTeamRosterLock(tx, original.teamId!);
    const invite = await tx.invites.findUnique({ where: { id: inviteId } });
    if (!invite || invite.teamId !== original.teamId) {
      return { status: 409, body: { error: 'Invitation changed. Reload it before cancelling.' } };
    }
    if (!(await canManageTeamInvites(original.teamId!, actor, tx))) {
      return { status: 403, body: { error: 'Forbidden' } };
    }
    if (invite.status === 'CANCELLED') return { status: 200, body: { ok: true, cancelled: true, invite } };
    if (isInvitationExpired(invite, now)) {
      const expired = await expireTeamInvitation(tx, invite, now);
      return { status: 410, body: { error: 'Invitation expired.', invite: expired } };
    }
    if (!['PENDING', 'SENT', 'FAILED', ''].includes(String(invite.status ?? '').toUpperCase())) {
      return { status: 409, body: { error: 'This invitation already has a final outcome.', invite } };
    }
    await rollbackTeamInviteEventSyncs(tx, invite, 'CANCELLED', now);
    await removeCanonicalPendingInvitee(tx, invite, actor.userId, now);
    if (invite.userId) await tx.teamStaffAssignments.updateMany({
      where: { teamId: invite.teamId!, userId: invite.userId, status: 'INVITED' },
      data: { status: 'REMOVED', updatedAt: now },
    });
    const saved = await tx.invites.update({
      where: { id: invite.id }, data: { status: 'CANCELLED', finalizedAt: now, actedBy: actor.userId, updatedAt: now },
    });
    return { status: 200, body: { ok: true, cancelled: true, invite: saved } };
  });
};
