import { assertTeamInvitationAllowed } from '@/server/teams/teamInvitationRestrictions';
import { prisma } from '@/lib/prisma';
import { getTeamChatBaseMemberIds, syncTeamChatInTx } from '@/server/teamChatSync';
import { isMinorAtUtcDate } from '@/server/userPrivacy';
import { findGuardianAuthority, listGuardianChildIds } from '@/server/guardianAuthority';
import { getTeamInviteRole } from '@/lib/staff';
import {
  loadCanonicalTeamById,
  normalizeId,
  normalizeIdList,
  replaceSingletonTeamStaffAssignment,
  syncCanonicalTeamRoster,
} from '@/server/teams/teamMembership';
import { acquireTeamRosterLock } from '@/server/repositories/locks';
import {
  acceptTeamInviteEventSyncs,
  removeCanonicalPendingInvitee,
  rollbackTeamInviteEventSyncs,
} from '@/server/teams/teamInviteEventSync';
import { reserveChildTeamRegistrationForGuardian } from '@/server/teams/teamChildRegistration';
import { expireTeamInvitation, isInvitationExpired } from './teamInvitationState';
import type { DeclineTeamInvitationInput } from '@/contracts/teamInvitations';
import { blockUserInTransaction } from '@/server/userBlocking';
import { sendModerationAlert } from '@/server/moderation';

type PrismaLike = any;

type SessionLike = {
  userId: string;
  isAdmin?: boolean;
};

type TeamInviteRecord = {
  id: string;
  type?: string | null;
  status?: string | null;
  teamId?: string | null;
  role?: string | null;
  userId?: string | null;
  createdBy?: string | null;
  linkExpiresAt?: Date | string | null;
};

type InviteActionResult = {
  status: number;
  body: Record<string, unknown>;
};

type AuthorizedTeamInviteAction = {
  ok: true;
  teamId: string;
  targetUserId: string;
  targetIsMinor: boolean;
  actingParentId: string | null;
} | {
  ok: false;
  status: number;
  error: string;
};

export const TEAM_INVITE_NO_PARENT_LINK_MESSAGE = 'No parent/guardian link is detected. Please have your parent or guardian create an account and accept this invitation on your behalf.';
export const TEAM_INVITE_PARENT_REQUIRED_MESSAGE = 'A parent or guardian must accept team invitations for child accounts.';

const uniqueStrings = (values: unknown[]): string[] => Array.from(
  new Set(values.map((value) => normalizeId(value)).filter((value): value is string => Boolean(value))),
);
const isCurrentTeamInviteStatus = (value: unknown): boolean => {
  const status = String(value ?? '').trim().toUpperCase();
  return status === '' || status === 'PENDING' || status === 'SENT' || status === 'FAILED';
};
const teamInviteStaffRole = (role: unknown): 'MANAGER' | 'HEAD_COACH' | 'ASSISTANT_COACH' | null => {
  switch (getTeamInviteRole(role)) {
    case 'team_manager':
      return 'MANAGER';
    case 'team_head_coach':
      return 'HEAD_COACH';
    case 'team_assistant_coach':
      return 'ASSISTANT_COACH';
    default:
      return null;
  }
};

export const listActiveChildIdsForParent = async (
  client: PrismaLike,
  parentId: string,
): Promise<string[]> => {
  return listGuardianChildIds(client, parentId);
};

const hasAnyActiveParentLink = async (
  client: PrismaLike,
  childId: string,
): Promise<boolean> => {
  const link = await client.parentChildLinks.findFirst({
    where: {
      childId,
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  return Boolean(link);
};

const isUserMinor = async (
  client: PrismaLike,
  userId: string,
  now: Date,
): Promise<boolean> => {
  const user = await client.userData.findUnique({
    where: { id: userId },
    select: { dateOfBirth: true },
  });
  return isMinorAtUtcDate(user?.dateOfBirth, now);
};

export const authorizeTeamInviteAction = async ({
  client = prisma,
  invite,
  session,
  action,
  now = new Date(),
}: {
  client?: PrismaLike;
  invite: TeamInviteRecord;
  session: SessionLike;
  action: 'accept' | 'decline';
  now?: Date;
}): Promise<AuthorizedTeamInviteAction> => {
  const teamId = normalizeId(invite.teamId);
  const targetUserId = normalizeId(invite.userId);
  if (!teamId || !targetUserId) {
    return { ok: false, status: 400, error: 'Invalid invite' };
  }

  const targetIsMinor = await isUserMinor(client, targetUserId, now);
  if (session.isAdmin) {
    return {
      ok: true,
      teamId,
      targetUserId,
      targetIsMinor,
      actingParentId: null,
    };
  }

  if (targetUserId === session.userId) {
    if (action === 'accept' && targetIsMinor) {
      const hasParentLink = await hasAnyActiveParentLink(client, targetUserId);
      return {
        ok: false,
        status: 403,
        error: hasParentLink ? TEAM_INVITE_PARENT_REQUIRED_MESSAGE : TEAM_INVITE_NO_PARENT_LINK_MESSAGE,
      };
    }
    return {
      ok: true,
      teamId,
      targetUserId,
      targetIsMinor,
      actingParentId: null,
    };
  }

  if (targetIsMinor && await findGuardianAuthority(client, session.userId, targetUserId, now)) {
    return {
      ok: true,
      teamId,
      targetUserId,
      targetIsMinor,
      actingParentId: session.userId,
    };
  }

  return { ok: false, status: 403, error: 'Forbidden' };
};

export const acceptTeamInviteWithGuardianRules = async ({
  client = prisma,
  inTransaction = false,
  invite,
  session,
  now = new Date(),
}: {
  client?: PrismaLike;
  inTransaction?: boolean;
  invite: TeamInviteRecord;
  session: SessionLike;
  now?: Date;
}): Promise<InviteActionResult> => {
  const auth = await authorizeTeamInviteAction({
    client,
    invite,
    session,
    action: 'accept',
    now,
  });
  if (!auth.ok) {
    return { status: auth.status, body: { error: auth.error } };
  }

  const initialInviteStatus = String(invite.status ?? '').toUpperCase();
  if (initialInviteStatus === 'EXPIRED' || isInvitationExpired(invite, now)) {
    const refresh = async (tx: PrismaLike) => expireTeamInvitation(tx, invite, now);
    const current = inTransaction ? await refresh(client) : await client.$transaction(refresh);
    if (current?.status === 'ACCEPTED') return { status: 200, body: { ok: true, alreadyAccepted: true, invite: current } };
    return { status: 410, body: { error: 'Invitation expired. Ask a Team manager for a new invitation.', invite: current } };
  }
  if (initialInviteStatus === 'ACCEPTED') {
    return { status: 200, body: { ok: true, alreadyAccepted: true, invite } };
  }
  if (!isCurrentTeamInviteStatus(initialInviteStatus)) {
    return { status: 404, body: { error: 'Invite is no longer available.' } };
  }

  const team = await loadCanonicalTeamById(auth.teamId, client);
  if (!team) {
    return { status: 404, body: { error: 'Team not found' } };
  }

  const pending = normalizeIdList((team as any).pending);
  const isPlayerInvite = pending.includes(auth.targetUserId);
  const isChildOpenJoinRequest = Boolean(
    auth.targetIsMinor
    && auth.actingParentId
    && !isPlayerInvite
    && normalizeId(invite.createdBy) === auth.targetUserId,
  );

  if (isChildOpenJoinRequest && auth.actingParentId) {
    if (inTransaction) throw new Error('Open join requests cannot use profile claim acceptance');
    const registration = await reserveChildTeamRegistrationForGuardian({
      teamId: auth.teamId,
      childId: auth.targetUserId,
      parentId: auth.actingParentId,
      actorUserId: session.userId,
      teamRow: team as Record<string, any>,
      acceptedInvitation: { id: invite.id, guardianId: auth.actingParentId },
      now,
    });
    if (!registration.ok) {
      return { status: registration.status, body: { error: registration.error } };
    }
    return {
      status: 200,
      body: {
        ok: true,
        requestType: 'TEAM',
        ...registration.payload,
        invite: await client.invites.findUnique({ where: { id: invite.id } }),
      },
    };
  }

  const save = async (tx: PrismaLike) => {
    if (typeof tx?.$executeRaw === 'function') {
      await acquireTeamRosterLock(tx, auth.teamId);
    }
    const txTeam = await loadCanonicalTeamById(auth.teamId, tx);
    if (!txTeam) {
      return { ok: false };
    }

    let transactionInvite: TeamInviteRecord = invite;
    let transactionInviteRole = getTeamInviteRole(invite.role, invite.type);
    if (tx.invites?.findUnique) {
      const currentInvite = await tx.invites.findUnique({ where: { id: invite.id } });
      const currentStatus = String(currentInvite?.status ?? '').toUpperCase();
      if (!currentInvite) {
        return { ok: false };
      }
      if (currentStatus === 'ACCEPTED') {
        return { ok: true, alreadyAccepted: true, invite: currentInvite };
      }
      if (!isCurrentTeamInviteStatus(currentStatus)) {
        return { ok: false };
      }
      transactionInvite = {
        ...invite,
        ...currentInvite,
        role: currentInvite.role ?? invite.role,
        type: currentInvite.type ?? invite.type,
      };
      transactionInviteRole = getTeamInviteRole(currentInvite.role, currentInvite.type)
        ?? transactionInviteRole;
    } else if (!isCurrentTeamInviteStatus(initialInviteStatus)) {
      return { ok: false };
    }

    if (isInvitationExpired(transactionInvite, now)) {
      await expireTeamInvitation(tx, transactionInvite, now);
      return { ok: false, status: 410, error: 'Invitation expired.' };
    }
    const currentAuth = await authorizeTeamInviteAction({ client: tx, invite: transactionInvite, session, action: 'accept', now });
    if (!currentAuth.ok) return { ok: false, status: currentAuth.status, error: currentAuth.error };
    if (currentAuth.teamId !== auth.teamId || currentAuth.targetUserId !== auth.targetUserId) {
      return { ok: false, status: 409, error: 'Invitation changed. Reload it before acceptance.' };
    }

    const previousMemberIds = getTeamChatBaseMemberIds(txTeam);
    const txPending = normalizeIdList((txTeam as any).pending);
    if (transactionInvite.createdBy) await assertTeamInvitationAllowed(tx, {
      teamId: auth.teamId, playerIds: [auth.targetUserId], senderId: transactionInvite.createdBy,
    }, now);

    const txIsPlayerInvite = transactionInviteRole === 'player'
      || (!transactionInviteRole && txPending.includes(auth.targetUserId));
    const invitedStaffAssignments = (Array.isArray((txTeam as any).staffAssignments) ? (txTeam as any).staffAssignments : [])
      .filter((assignment: any) => (
        normalizeId(assignment.userId) === auth.targetUserId
        && String(assignment.status ?? '').toUpperCase() === 'INVITED'
      ));
    const explicitStaffRole = teamInviteStaffRole(transactionInviteRole);
    const invitedStaffAssignmentsForCurrentRole = transactionInviteRole === 'player'
      ? []
      : explicitStaffRole
        ? invitedStaffAssignments.filter(
          (assignment: { role?: unknown }) => String(assignment.role ?? '').toUpperCase() === explicitStaffRole,
        )
        : invitedStaffAssignments;
    const invitedSingletonRole = invitedStaffAssignmentsForCurrentRole
      .map((assignment: { role?: unknown }) => String(assignment.role ?? '').toUpperCase())
      .find((role: string): role is 'MANAGER' | 'HEAD_COACH' => role === 'MANAGER' || role === 'HEAD_COACH')
      ?? null;
    const singletonReplacementRole = explicitStaffRole === 'MANAGER' || explicitStaffRole === 'HEAD_COACH'
      ? explicitStaffRole
      : invitedSingletonRole;
    if (!txIsPlayerInvite && singletonReplacementRole) {
      await replaceSingletonTeamStaffAssignment({
        tx,
        teamId: auth.teamId,
        role: singletonReplacementRole,
        replacementInviteId: transactionInvite.id,
        replacementUserId: auth.targetUserId,
        now,
      });
    }

    if (txIsPlayerInvite) {
      await syncCanonicalTeamRoster({
        teamId: auth.teamId,
        captainId: (txTeam as any).captainId,
        playerIds: uniqueStrings([...(Array.isArray((txTeam as any).playerIds) ? (txTeam as any).playerIds : []), auth.targetUserId]),
        pendingPlayerIds: txPending.filter((userId: string) => userId !== auth.targetUserId),
        managerId: (txTeam as any).managerId,
        headCoachId: (txTeam as any).headCoachId,
        assistantCoachIds: Array.isArray((txTeam as any).coachIds) ? (txTeam as any).coachIds : [],
        actingUserId: session.userId,
        now,
        cleanupRemovedPendingInvites: false,
        preserveInvitedStaffAssignments: true,
      }, tx);

      if (auth.actingParentId) {
        await tx.teamRegistrations?.updateMany?.({
          where: {
            teamId: auth.teamId,
            userId: auth.targetUserId,
          },
          data: {
            parentId: auth.actingParentId,
            registrantType: 'CHILD',
            updatedAt: now,
          },
        });
      }
    }

    for (const assignment of invitedStaffAssignmentsForCurrentRole) {
      const role = String(assignment.role ?? '').toUpperCase();
      if ((role === 'MANAGER' || role === 'HEAD_COACH') && tx.teamStaffAssignments?.updateMany) {
        await tx.teamStaffAssignments.updateMany({
          where: {
            teamId: auth.teamId,
            role: role as any,
            status: 'ACTIVE',
            userId: { not: auth.targetUserId },
          },
          data: { status: 'REMOVED', updatedAt: now },
        });
      }
      await tx.teamStaffAssignments?.updateMany?.({
        where: {
          teamId: auth.teamId,
          userId: auth.targetUserId,
          role: role as any,
          status: 'INVITED',
        },
        data: { status: 'ACTIVE', updatedAt: now },
      });
    }
    const hasExplicitStaffAssignment = invitedStaffAssignmentsForCurrentRole.some(
      (assignment: { role?: unknown }) => String(assignment.role ?? '').toUpperCase() === explicitStaffRole,
    );
    if (!txIsPlayerInvite && explicitStaffRole && !hasExplicitStaffAssignment) {
      if ((explicitStaffRole === 'MANAGER' || explicitStaffRole === 'HEAD_COACH') && tx.teamStaffAssignments?.updateMany) {
        await tx.teamStaffAssignments.updateMany({
          where: {
            teamId: auth.teamId,
            role: explicitStaffRole,
            status: 'ACTIVE',
            userId: { not: auth.targetUserId },
          },
          data: { status: 'REMOVED', updatedAt: now },
        });
      }
      await tx.teamStaffAssignments?.upsert?.({
        where: {
          teamId_userId_role: {
            teamId: auth.teamId,
            userId: auth.targetUserId,
            role: explicitStaffRole,
          },
        },
        create: {
          id: `${auth.teamId}__${explicitStaffRole}__${auth.targetUserId}`,
          teamId: auth.teamId,
          userId: auth.targetUserId,
          role: explicitStaffRole,
          status: 'ACTIVE',
          createdBy: session.userId,
          createdAt: now,
          updatedAt: now,
        },
        update: {
          status: 'ACTIVE',
          updatedAt: now,
        },
      });
    }

    await syncTeamChatInTx(tx, auth.teamId, {
      previousMemberIds,
    });
    await acceptTeamInviteEventSyncs(tx, transactionInvite, now, {
      propagateToLinkedEventTeams: false,
    });

    const savedInvite = await tx.invites.update({
      where: { id: transactionInvite.id },
      data: {
        status: 'ACCEPTED',
        finalizedAt: now,
        actedBy: session.userId,
        actingGuardianId: currentAuth.actingParentId,
        updatedAt: now,
      },
    });
    return { ok: true, alreadyAccepted: false, invite: savedInvite };
  };
  const result = inTransaction ? await save(client) : await client.$transaction(save);

  if (!result.ok) {
    return { status: result.status ?? 404, body: { error: result.error ?? 'Team not found' } };
  }

  return {
    status: 200,
    body: {
      ok: true,
      invite: result.invite,
      ...(result.alreadyAccepted ? { alreadyAccepted: true } : {}),
    },
  };
};

export const declineTeamInviteWithGuardianRules = async ({
  invite,
  session,
  now = new Date(),
  input = {},
}: {
  invite: TeamInviteRecord;
  session: SessionLike;
  now?: Date;
  input?: DeclineTeamInvitationInput;
}): Promise<InviteActionResult> => {
  const auth = await authorizeTeamInviteAction({
    invite,
    session,
    action: 'decline',
    now,
  });
  if (!auth.ok) {
    return { status: auth.status, body: { error: auth.error } };
  }

  const result = await prisma.$transaction(async (tx) => {
    if (typeof tx?.$executeRaw === 'function') {
      await acquireTeamRosterLock(tx, auth.teamId);
    }
    const transactionInvite = await tx.invites.findUnique({ where: { id: invite.id } });
    if (!transactionInvite) return { status: 404, body: { error: 'Invite not found.' } };
    const currentAuth = await authorizeTeamInviteAction({ client: tx, invite: transactionInvite, session, action: 'decline', now });
    if (!currentAuth.ok) return { status: currentAuth.status, body: { error: currentAuth.error } };
    if (currentAuth.teamId !== auth.teamId || currentAuth.targetUserId !== auth.targetUserId) {
      return { status: 409, body: { error: 'Invitation changed. Reload it before declining.' } };
    }
    if (transactionInvite.status === 'DECLINED') {
      if (input.blockScope && (transactionInvite.declineBlockScope !== input.blockScope || transactionInvite.actedBy !== session.userId)) {
        return { status: 409, body: { error: 'This invitation already has a final outcome.', invite: transactionInvite } };
      }
      const teamBlock = transactionInvite.declineBlockScope === 'team'
        ? await tx.teamBlocks.findUnique({ where: { playerId_teamId: { playerId: auth.targetUserId, teamId: auth.teamId } } }) : null;
      const actor = transactionInvite.declineBlockScope === 'sender'
        ? await tx.userData.findUnique({ where: { id: session.userId }, select: { blockedUserIds: true } }) : null;
      const block = transactionInvite.declineBlockScope === 'team'
        ? { scope: 'team', active: Boolean(teamBlock), playerId: auth.targetUserId, teamId: auth.teamId }
        : transactionInvite.declineBlockScope === 'sender'
          ? { scope: 'sender', active: Boolean(transactionInvite.createdBy && actor?.blockedUserIds.includes(transactionInvite.createdBy)), targetUserId: transactionInvite.createdBy }
          : undefined;
      return { status: 200, body: { ok: true, alreadyDeclined: true, invite: transactionInvite, block, teamBlock } };
    }
    if (isInvitationExpired(transactionInvite, now)) {
      const expired = await expireTeamInvitation(tx, transactionInvite, now);
      return { status: 410, body: { error: 'Invitation expired.', invite: expired } };
    }
    if (!isCurrentTeamInviteStatus(transactionInvite.status)) {
      return { status: 409, body: { error: 'This invitation already has a final outcome.', invite: transactionInvite } };
    }
    let block: Record<string, unknown> | undefined;
    let teamBlock: Awaited<ReturnType<typeof tx.teamBlocks.upsert>> | undefined;
    let senderBlock: Awaited<ReturnType<typeof blockUserInTransaction>> | undefined;
    if (input.blockScope === 'team') {
      teamBlock = await tx.teamBlocks.upsert({
        where: { playerId_teamId: { playerId: auth.targetUserId, teamId: auth.teamId } },
        create: { id: crypto.randomUUID(), playerId: auth.targetUserId, teamId: auth.teamId, createdBy: session.userId, createdAt: now },
        update: {},
      });
      block = { scope: 'team', active: true, playerId: auth.targetUserId, teamId: auth.teamId };
    } else if (input.blockScope === 'sender') {
      if (!transactionInvite.createdBy) throw new Response('This invitation has no sender Account to block.', { status: 409 });
      senderBlock = await blockUserInTransaction(tx, session.userId, transactionInvite.createdBy, input.leaveSharedChats === true, now);
      block = { scope: 'sender', active: true, targetUserId: transactionInvite.createdBy };
    }
    await rollbackTeamInviteEventSyncs(tx, transactionInvite, 'DECLINED', now);
    await removeCanonicalPendingInvitee(tx, transactionInvite, session.userId, now);
    await tx.teamStaffAssignments?.updateMany?.({
      where: {
        teamId: auth.teamId,
        userId: auth.targetUserId,
        status: 'INVITED',
      },
      data: { status: 'REMOVED', updatedAt: now },
    });

    const saved = await tx.invites.update({
      where: { id: transactionInvite.id },
      data: {
        status: 'DECLINED',
        finalizedAt: now,
        actedBy: session.userId,
        actingGuardianId: currentAuth.actingParentId,
        declineBlockScope: input.blockScope ?? null,
        updatedAt: now,
      },
    });
    return { status: 200, body: { ok: true, invite: saved, block, teamBlock, removedChatIds: senderBlock?.removedChatIds ?? [], user: senderBlock?.user }, report: senderBlock?.report };
  });
  if (result.report) await sendModerationAlert(result.report).catch((error) => console.warn('Failed to send block moderation alert', error));
  return { status: result.status, body: result.body };
};
