import type { Prisma } from '@/generated/prisma/client';
import { isActiveBlockAccount } from '@/server/accountState';

type InviteViewRow = { id: string; type?: string | null; teamId?: string | null; userId?: string | null; createdBy?: string | null; actingGuardianId?: string | null; status?: string | null; supersededAt?: Date | null };

// The caller must authorize the invitation rows before it requests this view.
export const withTeamInvitationViews = async <T extends InviteViewRow>(client: Prisma.TransactionClient, invites: T[]) => {
  const teamInvites = invites.filter((invite) => invite.type === 'TEAM');
  if (!teamInvites.length) return invites;
  const senderIds = [...new Set(teamInvites.flatMap((invite) => invite.createdBy ? [invite.createdBy] : []))];
  const actorIds = [...new Set([...senderIds, ...teamInvites.flatMap((invite) => invite.actingGuardianId ? [invite.actingGuardianId] : [])])];
  const scopes = teamInvites.flatMap((invite) => invite.teamId && invite.userId ? [{ teamId: invite.teamId, userId: invite.userId }] : []);
  const [accounts, deliveries, latest, actors] = await Promise.all([
    client.authUser.findMany({ where: { id: { in: senderIds } }, select: { id: true, disabledAt: true, passwordHash: true, lastLogin: true, emailVerifiedAt: true } }),
    client.inviteDeliveries.findMany({ where: { inviteId: { in: teamInvites.map((invite) => invite.id) } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
    scopes.length ? client.invites.findMany({ where: { type: 'TEAM', OR: scopes }, distinct: ['teamId', 'userId'], orderBy: [{ createdAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }], select: { id: true } }) : [],
    client.userData.findMany({ where: { id: { in: actorIds } }, select: { id: true, firstName: true, lastName: true } }),
  ]);
  const names = new Map(actors.map((actor) => [actor.id, [actor.firstName, actor.lastName].filter(Boolean).join(' ') || null]));
  const activeSenderIds = new Set(accounts.filter(isActiveBlockAccount).map((account) => account.id));
  const currentIds = new Set(latest.map((invite) => invite.id));
  return invites.map((invite) => invite.type !== 'TEAM' ? invite : {
    ...invite,
    senderName: invite.createdBy ? names.get(invite.createdBy) ?? null : null,
    actingGuardianName: invite.actingGuardianId ? names.get(invite.actingGuardianId) ?? null : null,
    isCurrentAttempt: !invite.supersededAt && (invite.userId ? currentIds.has(invite.id) : true),
    canBlockSender: Boolean(invite.createdBy && activeSenderIds.has(invite.createdBy)),
    deliveries: deliveries.filter((delivery) => delivery.inviteId === invite.id),
    invitationLabel: invite.status === 'EXPIRED' ? 'Invitation expired' : invite.status === 'PENDING' ? 'Invitation pending' : `Invitation ${String(invite.status ?? 'pending').toLowerCase()}`,
  });
};
