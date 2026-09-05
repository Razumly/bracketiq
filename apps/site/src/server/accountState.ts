import type { Prisma } from '@/generated/prisma/client';
import { isInvitePlaceholderAuthUser } from '@/lib/authUserPlaceholders';

export const isActiveBlockAccount = (account: {
  passwordHash: string; disabledAt?: Date | null; lastLogin?: Date | null; emailVerifiedAt?: Date | null;
} | null | undefined): boolean => Boolean(account && !account.disabledAt && !isInvitePlaceholderAuthUser(account));

export const withAccountState = async <T extends { id: string }>(client: Pick<Prisma.TransactionClient, 'authUser'>, users: T[]) => {
  if (!users.length) return [];
  const accounts = await client.authUser.findMany({
    where: { id: { in: users.map((user) => user.id) } },
    select: { id: true, disabledAt: true, passwordHash: true, lastLogin: true, emailVerifiedAt: true },
  });
  const activeIds = new Set(accounts.filter(isActiveBlockAccount).map((account) => account.id));
  return users.map((user) => ({ ...user, hasActiveAccount: activeIds.has(user.id) }));
};
