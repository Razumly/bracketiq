import type { Prisma } from '@/generated/prisma/client';
import { normalizeTeamInviteRole } from '@/lib/staff';

type Invitation = { role?: string | null; staffTypes?: string[]; userId?: string | null; claimedBy?: string | null; isMinor?: boolean };

const isPlayerInvite = (invite: Invitation) => {
  const role = normalizeTeamInviteRole(invite.role);
  if (role) return role === 'player';
  return !(invite.staffTypes ?? []).some(value => ['MANAGER', 'HEAD_COACH', 'ASSISTANT_COACH'].includes(value.toUpperCase()));
};

export async function requiresPlayerProfileClaim(client: Pick<Prisma.TransactionClient, 'userData'>, invite: Invitation) {
  if (!isPlayerInvite(invite)) return false;
  if (!invite.userId) return true;
  if (invite.claimedBy) return false;
  const profile = await client.userData.findUnique({ where: { id: invite.userId }, select: { isManagedPlayer: true } });
  return Boolean(profile?.isManagedPlayer || invite.isMinor);
}
