import type { Prisma } from '@/generated/prisma/client';
import { acquireTeamRosterLock } from './repositories/locks';
import { removeCanonicalPendingInvitee, rollbackTeamInviteEventSyncs } from './teams/teamInviteEventSync';
import { expireTeamInvitation, isPendingInvitation, isInvitationExpired } from './teams/teamInvitationState';

export const closeAccountInvitations = async (
  tx: Prisma.TransactionClient, userId: string, email: string | null, now: Date,
) => {
  const recipientScope: Prisma.InvitesWhereInput = { OR: [{ userId }, ...(email ? [{ email }] : [])] };
  const candidates = await tx.invites.findMany({ where: {
    type: 'TEAM', OR: [{ createdBy: userId }, recipientScope],
  }, orderBy: [{ teamId: 'asc' }, { id: 'asc' }] });
  for (const teamId of [...new Set(candidates.flatMap((row) => row.teamId ? [row.teamId] : []))]) {
    await acquireTeamRosterLock(tx, teamId);
  }
  for (const candidate of candidates) {
    await tx.$queryRaw`SELECT "id" FROM "Invites" WHERE "id" = ${candidate.id} FOR UPDATE`;
    const invite = await tx.invites.findUnique({ where: { id: candidate.id } });
    if (!invite || !isPendingInvitation(invite.status)) continue;
    if (isInvitationExpired(invite, now)) {
      await expireTeamInvitation(tx, invite, now);
      continue;
    }
    const status = invite.createdBy === userId ? 'CANCELLED' : 'DECLINED';
    await rollbackTeamInviteEventSyncs(tx, invite, status, now);
    await removeCanonicalPendingInvitee(tx, invite, userId, now);
    if (invite.teamId && invite.userId) await tx.teamStaffAssignments.updateMany({
      where: { teamId: invite.teamId, userId: invite.userId, status: 'INVITED' },
      data: { status: 'REMOVED', updatedAt: now },
    });
    await tx.invites.update({ where: { id: invite.id }, data: { status, finalizedAt: now, actedBy: userId, updatedAt: now } });
  }
  // Preserve unrelated invitation policies. Team history follows its outcome clock.
  await tx.invites.updateMany({ where: { AND: [{ type: { not: 'TEAM' } }, recipientScope] }, data: { status: 'DECLINED', updatedAt: now } });
  await tx.invites.deleteMany({ where: { type: { not: 'TEAM' }, createdBy: userId } });
};
