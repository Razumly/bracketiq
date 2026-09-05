import { prisma } from '@/lib/prisma';
import { acquireTeamRosterLock } from '@/server/repositories/locks';
import { canManageTeamInvites } from '@/app/api/teams/[id]/member-invites/inviteHelpers';
import { assertTeamInvitationAllowed } from './teamInvitationRestrictions';
import { expireTeamInvitation, isInvitationExpired, isPendingInvitation } from './teamInvitationState';

export type TeamInvitationDeliveryRequest = { idempotencyKey?: string; requestedBy?: string; requestedByIsAdmin?: boolean; kind?: 'INITIAL' | 'REMINDER' };

export const reserveTeamInvitationDelivery = async (inviteId: string, request: TeamInvitationDeliveryRequest) => (
  prisma.$transaction(async (tx) => {
    const original = await tx.invites.findUnique({ where: { id: inviteId } });
    if (!original?.teamId || original.type !== 'TEAM') throw new Response('Invitation not found.', { status: 404 });
    await acquireTeamRosterLock(tx, original.teamId);
    let invite = await tx.invites.findUnique({ where: { id: inviteId } });
    if (!invite || invite.teamId !== original.teamId) throw new Response('Invitation changed. Reload it before sending.', { status: 409 });
    const senderId = request.requestedBy ?? invite.createdBy;
    if (!senderId || !(await canManageTeamInvites(original.teamId, { userId: senderId, isAdmin: request.requestedByIsAdmin === true }, tx))) {
      throw new Response('Only a current Team manager can send this invitation.', { status: 403 });
    }
    if (isInvitationExpired(invite)) invite = await expireTeamInvitation(tx, invite);
    if (!invite || !isPendingInvitation(invite.status)) {
      return { invite, delivery: null, dispatch: false, error: 'This invitation is no longer pending.' };
    }
    const playerId = invite.userId ?? (invite.email
      ? (await tx.authUser.findUnique({ where: { email: invite.email.toLowerCase() }, select: { id: true } }))?.id
      : null);
    if (playerId) await assertTeamInvitationAllowed(tx, {
      teamId: original.teamId, playerIds: [playerId], senderId,
      additionalSenderIds: invite.createdBy ? [invite.createdBy] : [], guardianEmail: invite.guardianEmail,
    });
    const idempotencyKey = request.idempotencyKey ?? 'initial';
    const existing = await tx.inviteDeliveries.findUnique({ where: { inviteId_idempotencyKey: { inviteId, idempotencyKey } } });
    if (existing) return { invite, delivery: existing, dispatch: false };
    const delivery = await tx.inviteDeliveries.create({
      data: { id: crypto.randomUUID(), inviteId, idempotencyKey, kind: request.kind ?? 'INITIAL', requestedBy: senderId, status: 'DISPATCHING' },
    });
    return { invite, delivery, dispatch: true };
  })
);

export const completeTeamInvitationDelivery = async (
  deliveryId: string,
  inviteId: string,
  result: { status: string; sentAt?: Date | string | null },
) => prisma.$transaction(async (tx) => {
  const now = new Date();
  await tx.inviteDeliveries.updateMany({
    where: { id: deliveryId, status: 'DISPATCHING' },
    data: { status: result.status, completedAt: now, sentAt: result.sentAt ? new Date(result.sentAt) : null,
      failureCode: result.status === 'FAILED' ? 'DELIVERY_FAILED' : null },
  });
  if (result.sentAt) {
    const sentAt = new Date(result.sentAt);
    await tx.invites.updateMany({
      where: { id: inviteId, OR: [{ sentAt: null }, { sentAt: { lt: sentAt } }] },
      data: { sentAt, updatedAt: now },
    });
  }
  return tx.invites.findUnique({ where: { id: inviteId } });
});
