import type { Invites, Prisma, PrismaClient, UserData } from '@/generated/prisma/client';
import { isInvitePlaceholderAuthUser } from '@/lib/authUserPlaceholders';
import { createManagedPlayerProfile } from '@/server/managedPlayers';
import { acquireTeamRosterLock } from '@/server/repositories/locks';
import { prepareLegacyInvitationEventRoster } from './legacyInvitationEventRoster';

type PreparedInvitation = { inviteId: string; profileId: string };

async function knownProfile(tx: Prisma.TransactionClient, invite: Invites): Promise<UserData | null> {
  if (invite.userId) {
    const profile = await tx.userData.findUnique({ where: { id: invite.userId } });
    if (!profile || profile.mergedIntoProfileId) throw new Error(`Resolve the stored profile for invitation ${invite.id}.`);
    return profile;
  }
  if (!invite.email || invite.isMinor) return null;
  const accounts = await tx.authUser.findMany({
    where: { email: { equals: invite.email.trim(), mode: 'insensitive' } }, select: { id: true }, take: 2,
  });
  if (accounts.length > 1) throw new Error(`Resolve the ambiguous contact for invitation ${invite.id}.`);
  if (!accounts.length) return null;
  const profile = await tx.userData.findUnique({ where: { id: accounts[0].id } });
  if (!profile) throw new Error(`Resolve the Account profile for invitation ${invite.id}.`);
  return profile;
}

async function prepareProfile(tx: Prisma.TransactionClient, invite: Invites) {
  const existing = await knownProfile(tx, invite);
  if (!existing) {
    return createManagedPlayerProfile(tx, {
      firstName: invite.firstName ?? '', lastName: invite.lastName ?? '',
      dateOfBirth: invite.dateOfBirth, isMinor: invite.isMinor, guardianEmail: invite.guardianEmail,
    });
  }
  const account = await tx.authUser.findUnique({ where: { id: existing.id } });
  // A disabled real Account still owns its identity. Only placeholders are unclaimed.
  if (account && !isInvitePlaceholderAuthUser(account)) return existing;
  return tx.userData.update({ where: { id: existing.id }, data: { isManagedPlayer: true } });
}

async function prepareRoster(tx: Prisma.TransactionClient, invite: Invites, profileId: string) {
  const teamId = invite.teamId!;
  if (!await tx.canonicalTeams.findUnique({ where: { id: teamId }, select: { id: true } })) {
    throw new Error(`Resolve the Team for invitation ${invite.id}.`);
  }
  const previous = await tx.teamRegistrations.findUnique({ where: { teamId_userId: { teamId, userId: profileId } } });
  if (previous) return;
  await tx.teamRegistrations.create({ data: {
    id: `legacy-invite:${invite.id}`, teamId, userId: profileId, status: 'INVITED',
    createdBy: invite.createdBy, createdAt: invite.createdAt, updatedAt: new Date(),
  } });
}

async function prepareOne(tx: Prisma.TransactionClient, invite: Invites): Promise<PreparedInvitation> {
  await rejectUnboundContactConflicts(tx, invite);
  const profile = await prepareProfile(tx, invite);
  const latest = await tx.invites.findFirst({ where: {
    teamId: invite.teamId, userId: profile.id, type: 'TEAM',
  }, orderBy: [{ createdAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }] });
  if (latest && isNewerAttempt(latest, invite)) {
    throw new Error(`Prepare the latest invitation ${latest.id} instead of ${invite.id}.`);
  }
  const competing = await tx.invites.findFirst({ where: {
    id: { not: invite.id }, teamId: invite.teamId, userId: profile.id, type: 'TEAM', supersededAt: null,
    OR: [{ status: null }, { status: { in: ['PENDING', 'SENT', 'FAILED'] } }],
  }, select: { id: true } });
  if (competing) throw new Error(`Resolve competing invitation ${competing.id} before preparing ${invite.id}.`);
  await prepareRoster(tx, invite, profile.id);
  await prepareLegacyInvitationEventRoster(tx, invite, profile.id);
  await tx.invites.update({ where: { id: invite.id }, data: {
    userId: profile.id, isAssigned: true,
    playerEmail: invite.playerEmail ?? (invite.isMinor ? null : invite.email),
  } });
  return { inviteId: invite.id, profileId: profile.id };
}

async function rejectUnboundContactConflicts(tx: Prisma.TransactionClient, invite: Invites) {
  const email = invite.email?.trim();
  if (!email || invite.isMinor) return;
  const attempts = await tx.invites.findMany({ where: {
    id: { not: invite.id }, teamId: invite.teamId, type: 'TEAM', role: 'player', userId: null, isMinor: false,
    email: { equals: email, mode: 'insensitive' },
  } });
  const conflict = attempts.find(candidate => isNewerAttempt(candidate, invite)
    || (!candidate.supersededAt && ['PENDING', 'SENT', 'FAILED'].includes(candidate.status ?? 'PENDING')));
  if (conflict) throw new Error(`Resolve unbound invitation ${conflict.id} before preparing ${invite.id}.`);
}

function isNewerAttempt(candidate: Invites, selected: Invites) {
  const candidateTime = candidate.createdAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  const selectedTime = selected.createdAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  return candidateTime > selectedTime || (candidateTime === selectedTime && candidate.id > selected.id);
}

/** Prepare a reviewed, bounded set without delivery, Account creation, or outcome changes. */
export async function prepareLegacyPlayerInvitations(client: PrismaClient, inviteIds: string[]): Promise<PreparedInvitation[]> {
  const ids = [...new Set(inviteIds)].sort();
  if (!ids.length || ids.length > 100) throw new Error('Select between 1 and 100 invitation IDs.');
  return client.$transaction(async tx => {
    const selected = await tx.invites.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } });
    if (selected.length !== ids.length) throw new Error('One or more selected invitations do not exist.');
    const teamIds = [...new Set(selected.flatMap(invite => invite.teamId ? [invite.teamId] : []))].sort();
    for (const teamId of teamIds) await acquireTeamRosterLock(tx, teamId);
    const current = await tx.invites.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } });
    const results: PreparedInvitation[] = [];
    for (const invite of current) {
      if (invite.type !== 'TEAM' || invite.role !== 'player' || !invite.teamId || invite.supersededAt
        || !['PENDING', 'SENT', 'FAILED', 'EXPIRED'].includes(invite.status ?? 'PENDING')) {
        throw new Error(`Invitation ${invite.id} is not a current Player invitation.`);
      }
      results.push(await prepareOne(tx, invite));
    }
    return results;
  }, { timeout: 30_000, isolationLevel: 'Serializable' });
}
