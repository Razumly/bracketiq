import type { Prisma } from '@/generated/prisma/client';
import { ModerationReportTargetTypeEnum } from '@/generated/prisma/client';
import { isActiveBlockAccount } from './accountState';
export { isActiveBlockAccount } from './accountState';
import { buildBlockReportMetadata, createModerationReport, removeUserFromChatGroup } from './moderation';
import { acquireUserSocialLocks } from './repositories/locks';
import { withDerivedCanonicalTeamIds } from './teams/teamMembership';

export const blockUserInTransaction = async (
  tx: Prisma.TransactionClient,
  actorId: string,
  targetId: string,
  leaveSharedChats: boolean,
  now = new Date(),
) => {
  if (actorId === targetId) throw new Response('You cannot block yourself.', { status: 400 });
  await acquireUserSocialLocks(tx, [actorId, targetId]);
  const [actor, target, account] = await Promise.all([
    tx.userData.findUnique({ where: { id: actorId } }),
    tx.userData.findUnique({ where: { id: targetId } }),
    tx.authUser.findUnique({ where: { id: targetId } }),
  ]);
  if (!actor || !target) throw new Response('User not found.', { status: 404 });
  if (!isActiveBlockAccount(account)) throw new Response('Only active Accounts can be blocked.', { status: 409 });
  const without = (ids: string[], id: string) => ids.filter((entry) => entry !== id);
  const updatedActor = await tx.userData.update({
    where: { id: actorId },
    data: {
      blockedUserIds: [...new Set([...actor.blockedUserIds, targetId])],
      friendIds: without(actor.friendIds, targetId),
      followingIds: without(actor.followingIds, targetId),
      friendRequestIds: without(actor.friendRequestIds, targetId),
      friendRequestSentIds: without(actor.friendRequestSentIds, targetId),
      updatedAt: now,
    },
  });
  await tx.userData.update({
    where: { id: targetId },
    data: {
      friendIds: without(target.friendIds, actorId), followingIds: without(target.followingIds, actorId),
      friendRequestIds: without(target.friendRequestIds, actorId),
      friendRequestSentIds: without(target.friendRequestSentIds, actorId), updatedAt: now,
    },
  });
  const removedChatIds: string[] = [];
  if (leaveSharedChats) {
    const chats = await tx.chatGroup.findMany({
      where: { archivedAt: null, AND: [{ userIds: { has: actorId } }, { userIds: { has: targetId } }] },
    });
    for (const chat of chats) {
      await removeUserFromChatGroup(tx, chat, actorId, { actorUserId: actorId, reason: 'BLOCK_USER_SHARED_CHAT_EXIT' });
      removedChatIds.push(chat.id);
    }
  }
  const report = await createModerationReport({
    reporterUserId: actorId, targetType: ModerationReportTargetTypeEnum.BLOCK_USER, targetId,
    category: 'block_user', notes: 'User blocked another Account.',
    metadata: buildBlockReportMetadata({ blockedUserId: targetId, leaveSharedChats, removedChatIds }), client: tx,
  });
  const [user] = await withDerivedCanonicalTeamIds([updatedActor], tx);
  return { user, removedChatIds, report };
};
