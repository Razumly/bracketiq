import type { Prisma } from '@/generated/prisma/client';

export const PENDING_INVITATION_STATUSES = ['PENDING', 'SENT', 'FAILED'];
export const FINAL_INVITATION_STATUSES = ['ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED'];

type InvitationState = { id: string; status?: string | null; linkExpiresAt?: Date | string | null };
type InvitationClient = Pick<Prisma.TransactionClient, 'invites'>;

export const isPendingInvitation = (status: unknown): boolean => (
  status == null || PENDING_INVITATION_STATUSES.includes(String(status).toUpperCase())
);

export const isInvitationExpired = (invite: InvitationState, now = new Date()): boolean => (
  isPendingInvitation(invite.status)
  && Boolean(invite.linkExpiresAt)
  && new Date(invite.linkExpiresAt!).getTime() <= now.getTime()
);

export const expireTeamInvitation = async (client: InvitationClient, invite: InvitationState, now = new Date()) => {
  if (isInvitationExpired(invite, now)) {
    await client.invites.updateMany({
      where: { id: invite.id, linkExpiresAt: new Date(invite.linkExpiresAt!), OR: [{ status: null }, { status: { in: PENDING_INVITATION_STATUSES } }] },
      data: { status: 'EXPIRED', finalizedAt: new Date(invite.linkExpiresAt!), updatedAt: now },
    });
  }
  return client.invites.findUnique({ where: { id: invite.id } });
};

export const expireTeamInvitations = async (
  client: InvitationClient,
  scope: Prisma.InvitesWhereInput,
  now = new Date(),
) => {
  const expired = await client.invites.findMany({
    where: {
      AND: [scope, { type: 'TEAM', linkExpiresAt: { lte: now },
        OR: [{ status: null }, { status: { in: PENDING_INVITATION_STATUSES } }] }],
    },
    select: { id: true, status: true, linkExpiresAt: true },
  });
  for (const invite of expired) await expireTeamInvitation(client, invite, now);
};
