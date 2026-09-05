import type { Prisma } from '@/generated/prisma/client';
import { hasGuardianAge } from '@/server/guardianAuthority';
import { isInvitePlaceholderAuthUser } from '@/lib/authUserPlaceholders';
import { acquireUserSocialLocks } from '@/server/repositories/locks';

export class TeamInvitationRestrictionError extends Error {
  readonly status = 403;
}

export const assertTeamInvitationAllowed = async (
  tx: Prisma.TransactionClient,
  input: { teamId: string; playerIds: string[]; senderId: string; additionalSenderIds?: string[]; guardianEmail?: string | null },
  now = new Date(),
): Promise<void> => {
  const playerIds = [...new Set(input.playerIds)];
  if (!playerIds.length) return;
  const [teamBlocks, profiles] = await Promise.all([
    tx.teamBlocks.findMany({ where: { teamId: input.teamId, playerId: { in: playerIds } }, select: { id: true } }),
    tx.userData.findMany({ where: { id: { in: playerIds } }, select: { id: true, dateOfBirth: true } }),
  ]);
  if (teamBlocks.length) throw new TeamInvitationRestrictionError('This Player has blocked invitations and roster additions from this Team.');
  const minorIds = profiles.filter((profile) => hasGuardianAge(profile.dateOfBirth, now)).map((profile) => profile.id);
  const [links, contacts] = minorIds.length ? await Promise.all([
    tx.parentChildLinks.findMany({ where: { childId: { in: minorIds }, status: 'ACTIVE' }, select: { parentId: true } }),
    tx.invites.findMany({ where: { type: 'TEAM', userId: { in: minorIds } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], distinct: ['userId'], select: { guardianEmail: true } }),
  ]) : [[], []];
  const emails = [...new Set([input.guardianEmail, ...contacts.map((contact) => contact.guardianEmail)]
    .filter((email): email is string => Boolean(email)).map((email) => email.trim().toLowerCase()))];
  const guardians = emails.length ? await tx.authUser.findMany({ where: { email: { in: emails }, disabledAt: null } }) : [];
  const recipients = [...new Set([...playerIds, ...links.map((link) => link.parentId),
    ...guardians.filter((guardian) => !isInvitePlaceholderAuthUser(guardian)).map((guardian) => guardian.id)])];
  const senderIds = [...new Set([input.senderId, ...(input.additionalSenderIds ?? [])])];
  await acquireUserSocialLocks(tx, [...senderIds, ...recipients]);
  const users = await tx.userData.findMany({
    where: { id: { in: [...recipients, ...senderIds] } }, select: { id: true, blockedUserIds: true },
  });
  if (senderIds.some((senderId) => {
    const sender = users.find((user) => user.id === senderId);
    return users.some((user) => recipients.includes(user.id) && user.blockedUserIds.includes(senderId))
      || sender?.blockedUserIds.some((id) => recipients.includes(id));
  })) {
    throw new TeamInvitationRestrictionError('This invitation is unavailable because a Player or guardian Account has a User Block.');
  }
};
