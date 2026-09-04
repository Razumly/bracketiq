import { prisma } from '@/lib/prisma';
import { getTeamChatBaseMemberIds, syncTeamChatInTx } from '@/server/teamChatSync';
import { isMinorAtUtcDate } from '@/server/userPrivacy';
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
  const links = await client.parentChildLinks.findMany({
    where: {
      parentId,
      status: 'ACTIVE',
    },
    select: { childId: true },
  });
  return normalizeIdList(links.map((link: { childId?: string | null }) => link.childId));
};

const findActiveParentLink = async (
  client: PrismaLike,
  parentId: string,
  childId: string,
): Promise<{ id: string } | null> => client.parentChildLinks.findFirst({
  where: {
    parentId,
    childId,
    status: 'ACTIVE',
  },
  select: { id: true },
});

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

  if (targetIsMinor && await findActiveParentLink(client, session.userId, targetUserId)) {
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
  invite,
  session,
  now = new Date(),
}: {
  invite: TeamInviteRecord;
  session: SessionLike;
  now?: Date;
}): Promise<InviteActionResult> => {
  const auth = await authorizeTeamInviteAction({
    invite,
    session,
    action: 'accept',
    now,
  });
  if (!auth.ok) {
    return { status: auth.status, body: { error: auth.error } };
  }

  const initialInviteStatus = String(invite.status ?? '').toUpperCase();
  if (initialInviteStatus === 'ACCEPTED') {
    return { status: 200, body: { ok: true, alreadyAccepted: true } };
  }
  if (!isCurrentTeamInviteStatus(initialInviteStatus)) {
    return { status: 404, body: { error: 'Invite is no longer available.' } };
  }

  const team = await loadCanonicalTeamById(auth.teamId);
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
    const registration = await reserveChildTeamRegistrationForGuardian({
      teamId: auth.teamId,
      childId: auth.targetUserId,
      parentId: auth.actingParentId,
      actorUserId: session.userId,
      teamRow: team as Record<string, any>,
      now,
    });
    if (!registration.ok) {
      return { status: registration.status, body: { error: registration.error } };
    }
    await prisma.invites.delete({ where: { id: invite.id } });
    return {
      status: 200,
      body: {
        ok: true,
        requestType: 'TEAM',
        ...registration.payload,
      },
    };
  }

  const result = await prisma.$transaction(async (tx) => {
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
        return { ok: true, alreadyAccepted: true };
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

    const previousMemberIds = getTeamChatBaseMemberIds(txTeam);
    const txPending = normalizeIdList((txTeam as any).pending);
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

    await tx.invites.update({
      where: { id: transactionInvite.id },
      data: {
        status: 'ACCEPTED',
        finalizedAt: now,
        updatedAt: now,
      },
    });
    return { ok: true, alreadyAccepted: false };
  });

  if (!result.ok) {
    return { status: 404, body: { error: 'Team not found' } };
  }

  return {
    status: 200,
    body: {
      ok: true,
      ...(result.alreadyAccepted ? { alreadyAccepted: true } : {}),
    },
  };
};

export const declineTeamInviteWithGuardianRules = async ({
  invite,
  session,
  now = new Date(),
}: {
  invite: TeamInviteRecord;
  session: SessionLike;
  now?: Date;
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

  const initialInviteStatus = String(invite.status ?? '').toUpperCase();
  if (initialInviteStatus === 'ACCEPTED') {
    return { status: 409, body: { error: 'Invite has already been accepted.' } };
  }
  if (initialInviteStatus === 'DECLINED') {
    return { status: 200, body: { ok: true, alreadyDeclined: true } };
  }
  if (!isCurrentTeamInviteStatus(initialInviteStatus)) {
    return { status: 404, body: { error: 'Invite is no longer available.' } };
  }

  const result = await prisma.$transaction(async (tx) => {
    if (typeof tx?.$executeRaw === 'function') {
      await acquireTeamRosterLock(tx, auth.teamId);
    }
    let transactionInvite: TeamInviteRecord = invite;
    if (tx.invites?.findUnique) {
      const currentInvite = await tx.invites.findUnique({ where: { id: invite.id } });
      const currentStatus = String(currentInvite?.status ?? '').toUpperCase();
      if (!currentInvite) {
        return { ok: false, status: 404 as const, error: 'Invite not found.' };
      }
      if (currentStatus === 'ACCEPTED') {
        return { ok: false, status: 409 as const, error: 'Invite has already been accepted.' };
      }
      if (currentStatus === 'DECLINED') {
        return { ok: true, alreadyDeclined: true };
      }
      if (!isCurrentTeamInviteStatus(currentStatus)) {
        return { ok: false, status: 404 as const, error: 'Invite is no longer available.' };
      }
      transactionInvite = {
        ...invite,
        ...currentInvite,
        role: currentInvite.role ?? invite.role,
        type: currentInvite.type ?? invite.type,
      };
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

    await tx.invites.update({
      where: { id: transactionInvite.id },
      data: {
        status: 'DECLINED',
        finalizedAt: now,
        updatedAt: now,
      },
    });
    return { ok: true, alreadyDeclined: false };
  });

  if (!result.ok) {
    return {
      status: result.status ?? 404,
      body: { error: result.error ?? 'Invite is no longer available.' },
    };
  }
  return {
    status: 200,
    body: {
      ok: true,
      ...(result.alreadyDeclined ? { alreadyDeclined: true } : {}),
    },
  };
};
