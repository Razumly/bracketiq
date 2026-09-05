import { replayInvitationRequest, recordInvitationRequest, InvitationRequestError } from '@/server/teams/teamInvitationRequests';
import { withTeamInvitationViews } from '@/server/teams/teamInvitationViews';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { normalizeOptionalName } from '@/lib/nameCase';
import { requireSession } from '@/lib/permissions';
import { isInvitePlaceholderAuthUser } from '@/lib/authUserPlaceholders';
import {
  deriveStaffInviteTypes,
  getStaffMemberTypesForOrganizationRole,
  getTeamInviteRole,
  normalizeInviteStatus,
  normalizeInviteType,
  normalizeStaffMemberTypes,
} from '@/lib/staff';
import { sendInviteEmails } from '@/server/inviteEmails';
import { expireTeamInvitations } from '@/server/teams/teamInvitationState';
import { routineInvitationWhere } from '@/server/invitationRetention';
import { assertTeamInvitationAllowed, TeamInvitationRestrictionError } from '@/server/teams/teamInvitationRestrictions';
import { ensureAuthUserAndUserDataByEmail } from '@/server/inviteUsers';
import { getRequestOrigin } from '@/lib/requestOrigin';
import { buildManagedPlayerClaimUrl, buildTeamInviteShareUrl, TEAM_INVITE_LINK_TTL_MS } from '@/server/teamInviteLinks';
import {
  canManageEvent,
  canManageOrganization,
  hasDocumentEvidenceOwnerAccess,
  hasOrgPermission,
} from '@/server/accessControl';
import {
  ORG_PERMISSIONS,
  RESTRICTED_DOCUMENT_PERMISSION_ERROR,
  RESTRICTED_DOCUMENT_PERMISSIONS,
} from '@/lib/organizationPermissions';
import {
  orderOrganizationRoleIdsForLock,
  resolveDefaultOrganizationRoleIdForStaffTypes,
} from '@/server/organizationRoles';
import {
  acquireOrganizationStaffAssignmentLock,
  acquireOrganizationStaffMemberLock,
  acquireTeamRosterLock,
} from '@/server/repositories/locks';
import {
  loadCanonicalTeamById,
  normalizeId,
  normalizeIdList,
  replaceSingletonTeamStaffAssignment,
  syncCanonicalTeamRoster,
} from '@/server/teams/teamMembership';
import { listActiveChildIdsForParent } from '@/server/teams/teamGuardianInvites';
import {
  removeCanonicalPendingInvitee,
  rollbackTeamInviteEventSyncs,
} from '@/server/teams/teamInviteEventSync';
import { acquireEventLock } from '@/server/repositories/locks';
import { createManagedPlayerProfile, UNKNOWN_MANAGED_PLAYER_DATE_OF_BIRTH } from '@/server/managedPlayers';
import { isMinorAtUtcDate } from '@/server/userPrivacy';
import {
  InvalidInviteCursorError,
  listInviteRecordsPage,
  normalizeInvitePageLimit,
  pruneExpiredTerminalInvites,
} from '@/server/inviteListing';

export const dynamic = 'force-dynamic';

type InviteDeliveryRecord = {
  type?: string | null;
  delivery?: { failed: boolean; status: string };
  id: string;
  status?: string | null;
  sentAt?: Date | string | null;
};

const inviteSchema = z.object({
  type: z.string(),
  email: z.string().optional(),
  phone: z.string().optional(),
  role: z.string().optional(),
  status: z.string().optional(),
  staffTypes: z.array(z.string()).optional(),
  eventId: z.string().optional(),
  organizationId: z.string().optional(),
  teamId: z.string().optional(),
  userId: z.string().optional(),
  roleId: z.string().nullable().optional(),

  createdBy: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  replaceStaffTypes: z.boolean().optional(),
  shareOnly: z.boolean().optional(),
  isMinor: z.boolean().optional(),
  dateOfBirth: z.string().optional(),
  guardianEmail: z.string().optional(),
  existingInviteId: z.string().optional(),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
}).passthrough();

const createSchema = z.object({
  invites: z.array(inviteSchema).optional(),
}).passthrough();

const emailSchema = z.string().email();
const getTeamsDelegate = (client: any) => client?.teams;

class InviteRouteError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'InviteRouteError';
    this.status = status;
    this.details = details;
  }
}
const teamRoleToStaffType = (role: string): 'MANAGER' | 'HEAD_COACH' | 'ASSISTANT_COACH' | null => {
  switch (role) {
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

type TeamStaffInviteTransaction = {
  teamStaffAssignments?: {
    upsert?: (args: {
      where: { teamId_userId_role: { teamId: string; userId: string; role: 'MANAGER' | 'HEAD_COACH' | 'ASSISTANT_COACH' } };
      create: {
        id: string;
        teamId: string;
        userId: string;
        role: 'MANAGER' | 'HEAD_COACH' | 'ASSISTANT_COACH';
        status: 'INVITED';
        createdBy: string;
        createdAt: Date;
        updatedAt: Date;
      };
      update: { status: 'INVITED'; updatedAt: Date };
    }) => Promise<unknown>;
    updateMany?: (args: {
      where: Record<string, unknown>;
      data: { status: 'REMOVED'; updatedAt: Date };
    }) => Promise<unknown>;
  };
  teamRegistrations?: {
    updateMany?: (args: {
      where: Record<string, unknown>;
      data: { status: 'REMOVED'; isCaptain: false; updatedAt: Date };
    }) => Promise<unknown>;
  };
};

const updateTeamStaffInviteAssignment = async (
  tx: TeamStaffInviteTransaction,
  role: string,
  teamId: string,
  userId: string,
  actingUserId: string,
  now: Date,
) => {
  const staffRole = teamRoleToStaffType(role);
  if (!staffRole || !tx.teamStaffAssignments?.upsert) {
    return;
  }
  await tx.teamStaffAssignments.upsert({
    where: {
      teamId_userId_role: {
        teamId,
        userId,
        role: staffRole,
      },
    },
    create: {
      id: `${teamId}__${staffRole}__${userId}`,
      teamId,
      userId,
      role: staffRole,
      status: 'INVITED',
      createdBy: actingUserId,
      createdAt: now,
      updatedAt: now,
    },
    update: {
      status: 'INVITED',
      updatedAt: now,
    },
  });
};
const reconcileTeamInviteRoleTransition = async (
  tx: TeamStaffInviteTransaction,
  teamId: string,
  userId: string,
  previousRole: string | null,
  nextRole: string,
  now: Date,
) => {
  if (!previousRole || previousRole === nextRole) {
    return;
  }

  if (tx.teamRegistrations?.updateMany) {
    await tx.teamRegistrations.updateMany({
      where: {
        teamId,
        userId,
        status: { in: ['PENDING', 'INVITED'] },
      },
      data: {
        status: 'REMOVED',
        isCaptain: false,
        updatedAt: now,
      },
    });
  }

  if (tx.teamStaffAssignments?.updateMany) {
    const nextStaffRole = teamRoleToStaffType(nextRole);
    await tx.teamStaffAssignments.updateMany({
      where: {
        teamId,
        userId,
        status: { in: ['PENDING', 'INVITED'] },
        ...(nextStaffRole ? { role: { not: nextStaffRole } } : {}),
      },
      data: {
        status: 'REMOVED',
        updatedAt: now,
      },
    });
  }
};

const mapInviteRecord = (invite: Record<string, any>) => {
  const inviteType = normalizeInviteType(invite.type) ?? invite.type;
  return {
    ...invite,
    type: inviteType,
    role: inviteType === 'TEAM' ? getTeamInviteRole(invite.role, invite.type) : undefined,
    status: normalizeInviteStatus(invite.status) ?? 'PENDING',
    staffTypes: deriveStaffInviteTypes({ staffTypes: invite.staffTypes }, invite.type),
    firstName: normalizeOptionalName(invite.firstName),
    lastName: normalizeOptionalName(invite.lastName),
  };
};

const unionStrings = (left: string[] | null | undefined, right: string[] | null | undefined): string[] => Array.from(
  new Set([...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])].filter(Boolean)),
);

const formatFullName = (firstName?: string | null, lastName?: string | null): string => (
  `${normalizeOptionalName(firstName) ?? ''} ${normalizeOptionalName(lastName) ?? ''}`.trim()
);

const PLAYER_CAPACITY_STATUSES = new Set(['ACTIVE', 'INVITED', 'STARTED', 'PENDING']);

const getTeamPlayerCapacityUserIds = (team: Record<string, any>): Set<string> => {
  const ids = new Set<string>();
  const registrations = Array.isArray(team.playerRegistrations) ? team.playerRegistrations : [];
  registrations.forEach((registration: any) => {
    const userId = normalizeId(registration?.userId);
    const status = String(registration?.status ?? '').trim().toUpperCase();
    if (userId && PLAYER_CAPACITY_STATUSES.has(status)) {
      ids.add(userId);
    }
  });
  // Legacy team rows can omit registrations or contain only active rows.
  // Always include both serialized lists so pending assignments count too.
  normalizeIdList(team.playerIds).forEach((userId) => ids.add(userId));
  normalizeIdList(team.pending).forEach((userId) => ids.add(userId));
  return ids;
};

const assertTeamPlayerCapacity = (team: Record<string, any>, userId: string | null) => {
  const teamSize = Number.isFinite(Number(team.teamSize)) ? Math.max(0, Math.trunc(Number(team.teamSize))) : 0;
  if (teamSize <= 0 || !userId) {
    return;
  }
  const occupied = getTeamPlayerCapacityUserIds(team);
  if (!occupied.has(userId) && occupied.size >= teamSize) {
    throw new InviteRouteError(409, 'Team is full. Player invite was not sent.');
  }
};

const canManageTeamInvites = async (
  teamId: string,
  session: { userId: string; isAdmin: boolean },
  client: any,
): Promise<boolean> => {
  if (session.isAdmin) {
    return true;
  }

  const team = await loadCanonicalTeamById(teamId, client);
  if (!team) {
    return false;
  }

  const staffAssignments = Array.isArray((team as any).staffAssignments) ? (team as any).staffAssignments : [];
  const isCaptain = normalizeId((team as any).captainId) === session.userId;
  const isManager = normalizeId((team as any).managerId) === session.userId
    || staffAssignments.some((row: any) => (
      normalizeId(row?.userId) === session.userId
      && String(row?.status ?? '').toUpperCase() === 'ACTIVE'
      && String(row?.role ?? '').toUpperCase() === 'MANAGER'
    ));
  const isCoach = normalizeId((team as any).headCoachId) === session.userId
    || normalizeIdList((team as any).coachIds).includes(session.userId);

  if (isCaptain || isManager || isCoach) {
    return true;
  }

  const organizationId = normalizeId((team as any).organizationId);
  if (!organizationId) {
    return false;
  }

  const organization = await client.organizations?.findUnique?.({
    where: { id: organizationId },
    select: { id: true, ownerId: true },
  });
  return canManageOrganization(session, organization, client);
};

const resolveInviteUser = async (client: any, invite: z.infer<typeof inviteSchema>, now: Date) => {
  const inviteUserId = typeof invite.userId === 'string' ? invite.userId.trim() : '';
  let email = typeof invite.email === 'string' ? invite.email.trim().toLowerCase() : '';
  let userId = inviteUserId;
  let shouldSendEmail = false;
  let skipped = false;
  const inviteType = normalizeInviteType(invite.type);
  const teamRole = getTeamInviteRole(invite.role, invite.type) ?? 'player';
  const isManagedPlayerInvite = inviteType === 'TEAM'
    && teamRole === 'player'
    && !inviteUserId
    && Boolean(
      (typeof invite.phone === 'string' && invite.phone.trim())
      || invite.shareOnly
      || invite.isMinor
      || (typeof invite.dateOfBirth === 'string' && invite.dateOfBirth.trim())
      || (typeof invite.guardianEmail === 'string' && invite.guardianEmail.trim())
      || (typeof invite.existingInviteId === 'string' && invite.existingInviteId.trim()),
    );

  if (isManagedPlayerInvite) {
    const firstName = normalizeOptionalName(invite.firstName);
    const lastName = normalizeOptionalName(invite.lastName);
    if (!firstName || !lastName) throw new Error('First name and last name are required');
    const playerEmail = email || null;
    const guardianEmail = typeof invite.guardianEmail === 'string' ? invite.guardianEmail.trim().toLowerCase() : '';
    const parsedDateOfBirth = invite.dateOfBirth ? new Date(`${invite.dateOfBirth.trim().split('T')[0]}T00:00:00.000Z`) : null;
    const inferredMinor = Boolean(parsedDateOfBirth && !Number.isNaN(parsedDateOfBirth.getTime()) && isMinorAtUtcDate(parsedDateOfBirth, now));
    const isMinor = invite.isMinor === true || inferredMinor;
    if (isMinor && (!invite.dateOfBirth?.trim() || !emailSchema.safeParse(guardianEmail).success)) {
      throw new Error('Minor players require a date of birth and guardian email');
    }
    if (email && !emailSchema.safeParse(email).success) throw new Error('Invalid email');
    if (!email && !invite.phone?.trim() && !invite.shareOnly) throw new Error('Add an email, phone, or choose a share-only invite');
    return {
      userId: null,
      email: isMinor ? guardianEmail : (email || null),
      playerEmail,
      shouldSendEmail: Boolean(isMinor ? guardianEmail : email),
      skipped: false,
      isManagedPlayerInvite: true,
      managedPlayerInput: { firstName, lastName, dateOfBirth: invite.dateOfBirth ?? null, isMinor, guardianEmail: guardianEmail || null },
    };
  }

  if (userId) {
    const authUser = await client.authUser.findUnique({
      where: { id: userId },
      select: {
        email: true,
        passwordHash: true,
        lastLogin: true,
        emailVerifiedAt: true,
      },
    });
    if (!emailSchema.safeParse(email).success) {
      if (authUser?.email) {
        email = authUser.email.trim().toLowerCase();
      } else {
        const sensitive = await client.sensitiveUserData.findFirst({
          where: { userId },
          select: { email: true },
        });
        if (sensitive?.email) {
          email = sensitive.email.trim().toLowerCase();
        }
      }
    }
    if (!emailSchema.safeParse(email).success) {
      // Some profile-only users (for example dependent child profiles) may not have
      // a linked auth account or sensitive email yet. Skip invite creation silently.
      skipped = true;
    return { userId, email: '', playerEmail: null, shouldSendEmail: false, skipped, isManagedPlayerInvite: false };
    }
    shouldSendEmail = isInvitePlaceholderAuthUser(authUser);
    return { userId, email, playerEmail: email, shouldSendEmail, skipped, isManagedPlayerInvite: false };
  }

  if (!emailSchema.safeParse(email).success) {
    throw new Error('Invalid email');
  }

  const ensured = await ensureAuthUserAndUserDataByEmail(client, email, now, {
    firstName: normalizeOptionalName(invite.firstName),
    lastName: normalizeOptionalName(invite.lastName),
  });
  userId = ensured.userId;
  shouldSendEmail = !ensured.authUserExisted;
  return { userId, email, playerEmail: email, shouldSendEmail, skipped, isManagedPlayerInvite: false };
};

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  const params = req.nextUrl.searchParams;
  const userId = normalizeId(params.get('userId'));
  const type = normalizeInviteType(params.get('type'));
  const teamId = normalizeId(params.get('teamId'));
  const rawStatus = params.get('status');
  const status = rawStatus === null ? null : normalizeInviteStatus(rawStatus);
  const rawHistory = params.get('history');
  const history = rawHistory === 'true';
  const limit = normalizeInvitePageLimit(params.get('limit'));
  const cursor = params.get('cursor');

  if (
    (rawStatus !== null && !status)
    || (rawHistory !== null && rawHistory !== 'true' && rawHistory !== 'false')
    || (history && rawStatus !== null)
    || limit === null
  ) {
    return NextResponse.json({ error: 'Invalid invite list query' }, { status: 400 });
  }

  if (userId && !session.isAdmin && userId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const where: any = {};
  let canListTeamInvites = false;
  let includeChildTeamInvites = false;
  let childInviteIdsForViewer: string[] = [];
  if (teamId) {
    canListTeamInvites = session.isAdmin || await canManageTeamInvites(teamId, session, prisma);
  }
  if (!session.isAdmin) {
    if (userId || !canListTeamInvites) {
      where.userId = userId ?? session.userId;
    }
    includeChildTeamInvites = !teamId
      && (userId === session.userId || (!userId && !canListTeamInvites))
      && (!type || type === 'TEAM');
    if (includeChildTeamInvites) {
      childInviteIdsForViewer = await listActiveChildIdsForParent(prisma, session.userId);
      if (childInviteIdsForViewer.length) {
        delete where.userId;
        where.OR = [
          { userId: userId ?? session.userId },
          {
            type: 'TEAM',
            userId: { in: childInviteIdsForViewer },
          },
        ];
      }
    }
  } else if (userId) {
    where.userId = userId;
  }
  if (type) where.type = type;
  if (teamId) where.teamId = teamId;
  await expireTeamInvitations(prisma, where);
  const requestedStatus = status ?? 'PENDING';
  const statusWhere = history
    ? { status: { in: ['DECLINED', 'REJECTED', 'ACCEPTED', 'CANCELLED', 'EXPIRED'] } }
    : requestedStatus === 'PENDING'
      ? { OR: [{ status: null }, { status: { in: ['PENDING', 'SENT', 'FAILED'] } }] }
      : requestedStatus === 'DECLINED'
        ? { status: { in: ['DECLINED', 'REJECTED'] } }
        : { status: requestedStatus };
  const listingWhere = { AND: [where, statusWhere, routineInvitationWhere()] };

  let page: { invites: Array<Record<string, any>>; nextCursor: string | null };
  try {
    page = await listInviteRecordsPage(prisma, listingWhere, { limit, cursor });
  } catch (error) {
    if (error instanceof InvalidInviteCursorError) {
      return NextResponse.json({ error: 'Invalid invite cursor' }, { status: 400 });
    }
    throw error;
  }
  const invites = await withTeamInvitationViews(prisma, page.invites as Array<Record<string, any> & { id: string }>);

  const childProfiles = childInviteIdsForViewer.length
    ? await prisma.userData.findMany({
      where: { id: { in: childInviteIdsForViewer } },
      select: { id: true, firstName: true, lastName: true },
    })
    : [];
  const childById = new Map(childProfiles.map((child) => [child.id, child]));
  const managedPlayerIds = canListTeamInvites
    ? invites
      .filter((invite) => String(invite.type ?? '').toUpperCase() === 'TEAM'
        && String(invite.role ?? '').toLowerCase() === 'player'
        && invite.isAssigned === true
        && Boolean(invite.userId))
      .map((invite) => invite.userId as string)
    : [];
  const managedProfiles = managedPlayerIds.length
    ? await prisma.userData.findMany({
      where: { id: { in: Array.from(new Set(managedPlayerIds)) }, isManagedPlayer: true, mergedIntoProfileId: null },
      select: { id: true },
    })
    : [];
  const managedProfileIds = new Set(managedProfiles.map((profile) => profile.id));

  if (!cursor) {
    try {
      await pruneExpiredTerminalInvites({
        client: prisma,
        scope: {
          userId: session.isAdmin
            ? userId
            : (userId || !canListTeamInvites ? userId ?? session.userId : null),
          delegatedChildUserIds: childInviteIdsForViewer,
          teamId,
          type,
          allowGlobal: session.isAdmin && !userId && !teamId,
        },
      });
    } catch (error) {
      console.warn('Failed to prune expired terminal invites', error);
    }
  }
  return NextResponse.json({
    invites: invites.map((invite) => {
      const child = invite.userId ? childById.get(invite.userId) : null;
      const linkExpiresAt = invite.linkExpiresAt instanceof Date
        ? invite.linkExpiresAt.getTime()
        : new Date(String(invite.linkExpiresAt ?? '')).getTime();
      const canShareTeamLink = canListTeamInvites
        && String(invite.type ?? '').toUpperCase() === 'TEAM'
        && invite.status === 'PENDING'
        && Number.isFinite(linkExpiresAt)
        && linkExpiresAt > Date.now();
      const { shareUrl: _existingShareUrl, ...inviteWithoutShareUrl } = invite;
      return mapInviteRecord({
        ...inviteWithoutShareUrl,
        ...(canShareTeamLink
          ? {
            shareUrl: buildTeamInviteShareUrl({
              id: String(invite.id),
              linkVersion: invite.linkVersion,
              linkExpiresAt: invite.linkExpiresAt,
            }, getRequestOrigin(req)),
          }
          : {}),
        ...(canShareTeamLink && invite.userId && managedProfileIds.has(invite.userId)
          ? {
            claimUrl: buildManagedPlayerClaimUrl({
              id: String(invite.id),
              linkVersion: invite.linkVersion,
              linkExpiresAt: invite.linkExpiresAt,
            }, getRequestOrigin(req)),
          }
          : {}),
        ...(child
          ? {
            childUserId: invite.userId,
            childFirstName: normalizeOptionalName(child.firstName),
            childLastName: normalizeOptionalName(child.lastName),
            childFullName: formatFullName(child.firstName, child.lastName) || 'Child',
            viewerCanAcceptForChild: true,
          }
          : {}),
      });
    }),
    nextCursor: page.nextCursor,
  }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const invitesInput: unknown[] = parsed.data.invites
    ?? (Array.isArray((body as any)?.invites) ? (body as any).invites : [body]).filter(Boolean);

  if (!invitesInput.length) {
    return NextResponse.json({ error: 'No invites provided' }, { status: 400 });
  }
  const singletonBatchKeys = new Set<string>();
  for (const inviteInput of invitesInput) {
    const parsedInvite = inviteSchema.safeParse(inviteInput);
    if (!parsedInvite.success || normalizeInviteType(parsedInvite.data.type) !== 'TEAM') {
      continue;
    }
    const teamId = normalizeId(parsedInvite.data.teamId);
    const teamRole = getTeamInviteRole(parsedInvite.data.role, parsedInvite.data.type);
    if (!teamId || (teamRole !== 'team_manager' && teamRole !== 'team_head_coach')) {
      continue;
    }
    const key = `${teamId}:${teamRole}`;
    if (singletonBatchKeys.has(key)) {
      return NextResponse.json(
        { error: `Only one ${teamRole === 'team_manager' ? 'manager' : 'head coach'} invite is allowed per team in a batch.` },
        { status: 400 },
      );
    }
    singletonBatchKeys.add(key);
  }

  const organizationStaffAssignmentLockIds = Array.from(new Set<string>(invitesInput.flatMap((inviteInput): string[] => {
    const parsedInvite = inviteSchema.safeParse(inviteInput);
    if (!parsedInvite.success || normalizeInviteType(parsedInvite.data.type) !== 'STAFF') {
      return [];
    }
    const organizationId = normalizeId(parsedInvite.data.organizationId);
    return organizationId ? [organizationId] : [];
  }))).sort();

  const eventStaffLockIds = Array.from(new Set<string>(invitesInput.flatMap((inviteInput): string[] => {
    const parsedInvite = inviteSchema.safeParse(inviteInput);
    if (!parsedInvite.success || normalizeInviteType(parsedInvite.data.type) !== 'STAFF') {
      return [];
    }
    const eventId = normalizeId(parsedInvite.data.eventId);
    return eventId ? [eventId] : [];
  }))).sort();

  const teamRosterLockIds = Array.from(new Set<string>(invitesInput.flatMap((inviteInput): string[] => {
    const parsedInvite = inviteSchema.safeParse(inviteInput);
    if (!parsedInvite.success || normalizeInviteType(parsedInvite.data.type) !== 'TEAM') {
      return [];
    }
    const teamId = normalizeId(parsedInvite.data.teamId);
    return teamId ? [teamId] : [];
  }))).sort();

  const now = new Date();
  try {
    const { created, toEmail } = await prisma.$transaction(async (tx) => {
      for (const organizationId of organizationStaffAssignmentLockIds) {
        await acquireOrganizationStaffAssignmentLock(tx, organizationId);
      }
      for (const eventId of eventStaffLockIds) {
        await acquireEventLock(tx, eventId);
      }
      for (const teamId of teamRosterLockIds) {
        if (typeof tx?.$executeRaw === 'function') {
          await acquireTeamRosterLock(tx, teamId);
        }
        await expireTeamInvitations(tx, { teamId }, now);
      }

      const createdRecords: any[] = [];
      const toEmailRecords: any[] = [];

      for (const inviteInput of invitesInput) {
        const parsedInvite = inviteSchema.safeParse(inviteInput);
        if (!parsedInvite.success) {
          throw new InviteRouteError(400, 'Invalid invite', parsedInvite.error.flatten());
        }

        const invite = parsedInvite.data;
        const isUserIdInvite = Boolean(typeof invite.userId === 'string' && invite.userId.trim());
        const normalizedFirstName = normalizeOptionalName(invite.firstName);
        const normalizedLastName = normalizeOptionalName(invite.lastName);
        const inviteType = normalizeInviteType(invite.type);
        if (!inviteType) {
          throw new InviteRouteError(400, 'Invalid invite type');
        }

        const requestedStatus = normalizeInviteStatus(invite.status);
        if (requestedStatus && requestedStatus !== 'PENDING') {
          throw new InviteRouteError(400, 'New invites must start with PENDING status');
        }
        const normalizedStatus = 'PENDING';
        const eventId = typeof invite.eventId === 'string' && invite.eventId.trim() ? invite.eventId.trim() : null;
        const organizationId = typeof invite.organizationId === 'string' && invite.organizationId.trim()
          ? invite.organizationId.trim()
          : null;
        const teamId = typeof invite.teamId === 'string' && invite.teamId.trim() ? invite.teamId.trim() : null;

        const requestScope = { teamId: teamId ?? '', senderId: session.userId, requestKey: invite.idempotencyKey, payload: invite };
        if (inviteType === 'TEAM' && teamId && invite.idempotencyKey) {
          if (!(await canManageTeamInvites(teamId, session, tx))) throw new InviteRouteError(403, 'Forbidden');
          const replay = await replayInvitationRequest(tx, requestScope);
          if (replay) { createdRecords.push(replay); continue; }
        }

        if (inviteType === 'TEAM' && invite.existingInviteId) {
          const requested = await tx.invites.findUnique({ where: { id: invite.existingInviteId } });
          if (!requested || requested.teamId !== teamId || requested.type !== 'TEAM' || !['PENDING', 'SENT', 'FAILED'].includes(requested.status ?? 'PENDING')) {
            throw new InviteRouteError(409, 'The requested invitation is no longer pending.');
          }
        }
        const resolvedUser = await resolveInviteUser(tx, invite, now);
        if (resolvedUser.skipped) {
          if (inviteType !== 'STAFF') {
            throw new InviteRouteError(400, 'Missing invite email');
          }
          continue;
        }
        let inviteUserId = resolvedUser.userId;
        const managedPlayerInput = resolvedUser.managedPlayerInput;

        if (inviteType === 'TEAM' && resolvedUser.isManagedPlayerInvite) {
          if (!managedPlayerInput) throw new InviteRouteError(400, 'Managed Player details are required');
          const contactMatches = [
            ...(invite.existingInviteId ? [{ id: invite.existingInviteId }] : []),
            ...(!managedPlayerInput.isMinor && resolvedUser.email ? [{ email: resolvedUser.email }] : []),
            ...(!managedPlayerInput.isMinor && resolvedUser.playerEmail ? [{ playerEmail: resolvedUser.playerEmail }] : []),
            ...(!managedPlayerInput.isMinor && invite.phone ? [{ phone: invite.phone.trim() }] : []),
          ];
          const priorInvite = teamId && contactMatches.length > 0
            ? await tx.invites.findFirst({
              where: {
                type: 'TEAM',
                teamId,
                role: 'player',
                OR: contactMatches,
                status: { in: ['PENDING', 'SENT', 'FAILED'] },
              },
              select: { userId: true },
            })
            : null;
          const priorProfile = priorInvite?.userId && tx.userData?.findUnique
            ? await tx.userData.findUnique({ where: { id: priorInvite.userId }, select: { id: true, isManagedPlayer: true } })
            : null;
          if (priorProfile?.isManagedPlayer) {
            inviteUserId = priorProfile.id;
          } else {
            const managed = await createManagedPlayerProfile(tx, {
              firstName: managedPlayerInput.firstName,
              lastName: managedPlayerInput.lastName,
              dateOfBirth: managedPlayerInput.dateOfBirth,
              isMinor: managedPlayerInput.isMinor,
              guardianEmail: managedPlayerInput.guardianEmail,
            }, now);
            inviteUserId = managed.id;
          }
        }
        if (inviteType === 'STAFF' && !inviteUserId) {
          throw new InviteRouteError(400, 'Staff invites require a userId or email');
        }

        if (inviteType === 'STAFF') {
          const staffUserId = inviteUserId;
          if (!staffUserId) {
            throw new InviteRouteError(400, 'Staff invites require a userId or email');
          }
          const organization = organizationId
            ? await tx.organizations.findUnique({
              where: { id: organizationId },
              select: { id: true, ownerId: true },
            })
            : null;
          const event = eventId
            ? await tx.events.findUnique({
              where: { id: eventId },
              select: { id: true, hostId: true, assistantHostIds: true, organizationId: true, state: true },
            })
            : null;
          if (!organizationId && !eventId) {
            throw new InviteRouteError(400, 'Staff invites require organizationId or eventId');
          }
          if (organizationId) {
            if (!organization) {
              throw new InviteRouteError(404, 'Organization not found');
            }
            if (!(await hasOrgPermission(session, organization, ORG_PERMISSIONS.STAFF_MANAGE, tx))) {
              throw new InviteRouteError(403, 'Forbidden');
            }
            if (organization.ownerId && staffUserId === organization.ownerId) {
              throw new InviteRouteError(409, 'Organization owner already has staff access');
            }
            if (
              Object.prototype.hasOwnProperty.call(invite, 'roleId')
              && !(await hasOrgPermission(session, organization, ORG_PERMISSIONS.ROLES_MANAGE, tx))
            ) {
              throw new InviteRouteError(403, 'Forbidden');
            }
          } else {
            if (!event) {
              throw new InviteRouteError(404, 'Event not found');
            }
            if (!(await canManageEvent(session, event, tx))) {
              throw new InviteRouteError(403, 'Forbidden');
            }
          }

          const requestedRoleId = typeof invite.roleId === 'string' && invite.roleId.trim()
            ? invite.roleId.trim()
            : null;
          if (requestedRoleId && !organizationId) {
            throw new InviteRouteError(400, 'Role selection requires organizationId');
          }
          const selectedRole = requestedRoleId && organizationId
            ? await tx.organizationRoles.findFirst({
              where: {
                id: requestedRoleId,
                organizationId,
              },
              select: {
                id: true,
                name: true,
                kind: true,
                systemKey: true,
              },
            })
            : null;
          if (requestedRoleId && !selectedRole) {
            throw new InviteRouteError(404, 'Role not found');
          }

          const staffTypes = selectedRole
            ? getStaffMemberTypesForOrganizationRole(selectedRole)
            : normalizeStaffMemberTypes(
              deriveStaffInviteTypes(
                { staffTypes: invite.staffTypes },
                typeof invite.type === 'string' ? invite.type : null,
              ),
            );
          if (!staffTypes.length) {
            throw new InviteRouteError(400, 'Staff invite requires at least one staff type');
          }

          const replaceStaffTypes = invite.replaceStaffTypes === true;

          if (organizationId) {
            await acquireOrganizationStaffMemberLock(tx, organizationId, staffUserId);
            const existingStaffMember = await tx.staffMembers.findUnique({
              where: {
                organizationId_userId: {
                  organizationId,
                  userId: staffUserId,
                },
              },
              select: { roleId: true, types: true },
            });
            const lockedStaffMember = existingStaffMember
              ? await tx.staffMembers.update({
                where: {
                  organizationId_userId: {
                    organizationId,
                    userId: staffUserId,
                  },
                },
                data: { updatedAt: now },
                select: { roleId: true, types: true },
              })
              : null;
            const currentStaffMember = lockedStaffMember ?? existingStaffMember;
            const currentRoleId = currentStaffMember?.roleId ?? null;
            const defaultRoleId = selectedRole?.id
              ?? currentRoleId
              ?? await resolveDefaultOrganizationRoleIdForStaffTypes(tx, organizationId, staffTypes);
            if (defaultRoleId !== currentRoleId) {
              const roleIds = Array.from(new Set(
                [currentRoleId, defaultRoleId].filter(
                  (roleId): roleId is string => typeof roleId === 'string' && roleId.length > 0,
                ),
              ));
              const orderedRoleIds = await orderOrganizationRoleIdsForLock(tx, roleIds);
              for (const roleId of orderedRoleIds) {
                await tx.organizationRoles.update({
                  where: { id: roleId },
                  data: { updatedAt: now },
                });
              }
              if (orderedRoleIds.length > 0) {
                const restrictedPermissions = await tx.organizationRolePermissions.findMany({
                  where: {
                    organizationRoleId: { in: orderedRoleIds },
                    permission: { in: RESTRICTED_DOCUMENT_PERMISSIONS },
                  },
                  select: { permission: true },
                });
                if (
                  restrictedPermissions.length > 0
                  && !(await hasDocumentEvidenceOwnerAccess(session, organization, tx))
                ) {
                  throw new InviteRouteError(403, RESTRICTED_DOCUMENT_PERMISSION_ERROR);
                }
              }
            }

            await tx.staffMembers.upsert({
              where: {
                organizationId_userId: {
                  organizationId,
                  userId: staffUserId,
                },
              },
              create: {
                id: crypto.randomUUID(),
                organizationId,
                userId: staffUserId,
                types: staffTypes,
                roleId: defaultRoleId,
                createdAt: now,
                updatedAt: now,
              },
              update: {
                types: {
                  set: replaceStaffTypes ? staffTypes : unionStrings(staffTypes, currentStaffMember?.types ?? []),
                },
                roleId: defaultRoleId,
                updatedAt: now,
              },
            });
          }

          const existingInvite = await tx.invites.findFirst({
            where: {
              type: 'STAFF',
              organizationId,
              eventId,
              userId: staffUserId,
            },
          });
          const wasCreated = !existingInvite;
          const record = existingInvite
            ? await tx.invites.update({
              where: { id: existingInvite.id },
              data: {
                email: resolvedUser.email,
                status: normalizedStatus,
                staffTypes: replaceStaffTypes ? staffTypes : unionStrings(existingInvite.staffTypes, staffTypes),
                createdBy: invite.createdBy ?? session.userId,
                firstName: normalizedFirstName ?? existingInvite.firstName,
                lastName: normalizedLastName ?? existingInvite.lastName,
                updatedAt: now,
              },
            })
            : await tx.invites.create({
              data: {
                id: crypto.randomUUID(),
                type: 'STAFF',
                email: resolvedUser.email,
                status: normalizedStatus,
                staffTypes,
                eventId,
                organizationId,
                userId: staffUserId,
                createdBy: invite.createdBy ?? session.userId,
                firstName: normalizedFirstName ?? null,
                lastName: normalizedLastName ?? null,
                createdAt: now,
                updatedAt: now,
              },
            });
          createdRecords.push(record);
          if (wasCreated && (isUserIdInvite || resolvedUser.shouldSendEmail)) {
            toEmailRecords.push(record);
          }
          continue;
        }

        if (inviteType === 'TEAM') {
          if (!teamId) {
            throw new InviteRouteError(400, 'Team invites require teamId');
          }
          const teamsDelegate = getTeamsDelegate(tx);
          const legacyTeam = await teamsDelegate.findUnique({ where: { id: teamId } });
          const canonicalTeam = await loadCanonicalTeamById(teamId, tx);
          const team = canonicalTeam ?? legacyTeam;
          if (!team) {
            throw new InviteRouteError(404, 'Team not found');
          }
          if (!(await canManageTeamInvites(teamId, session, tx))) {
            throw new InviteRouteError(403, 'Forbidden');
          }
          const teamInviteUserId = inviteUserId;
          if (!teamInviteUserId) {
            throw new InviteRouteError(400, 'Team invites require a userId or email');
          }


          let existingInvite = await tx.invites.findFirst({
            where: {
              type: 'TEAM',
              teamId,
              userId: teamInviteUserId,
              OR: [
                { status: null },
                { status: { in: ['PENDING', 'SENT', 'FAILED'] } },
              ],
            },
          });
          if (resolvedUser.isManagedPlayerInvite && !existingInvite) {
            existingInvite = await tx.invites.findFirst({
              where: {
                type: 'TEAM',
                teamId,
                userId: null,
                role: 'player',
                OR: [
                  ...(invite.existingInviteId ? [{ id: invite.existingInviteId }] : []),
                  ...(resolvedUser.email ? [{ email: resolvedUser.email }] : []),
                  ...(resolvedUser.playerEmail ? [{ playerEmail: resolvedUser.playerEmail }] : []),
                ],
                status: { in: ['PENDING', 'SENT', 'FAILED'] },
              },
            });
          }
          const teamRole = getTeamInviteRole(invite.role, invite.type)
            ?? getTeamInviteRole(existingInvite?.role, existingInvite?.type)
            ?? 'player';
          await assertTeamInvitationAllowed(tx, {
            teamId, playerIds: [teamInviteUserId], senderId: session.userId,
            guardianEmail: managedPlayerInput?.guardianEmail,
          }, now);
          const previousRole = getTeamInviteRole(existingInvite?.role, existingInvite?.type);
          if (teamRole === 'player' && normalizeIdList(team.playerIds).includes(teamInviteUserId)) {
            throw new InviteRouteError(409, 'User is already on this team');
          }
          if (teamRole === 'player') {
            assertTeamPlayerCapacity(team as Record<string, any>, teamInviteUserId);
          }
          await reconcileTeamInviteRoleTransition(
            tx,
            teamId,
            teamInviteUserId,

            previousRole,
            teamRole,
            now,
          );
          const teamStaffType = teamRoleToStaffType(teamRole);
          if (teamStaffType === 'MANAGER' || teamStaffType === 'HEAD_COACH') {
            await replaceSingletonTeamStaffAssignment({
              tx,
              teamId,
              role: teamStaffType,
              replacementInviteId: existingInvite?.id ?? null,
              replacementUserId: teamInviteUserId,
              now,
            });
          }

          const wasCreated = !existingInvite;
          const record = existingInvite
            ? await tx.invites.update({
              where: { id: existingInvite.id },
              data: {
                email: resolvedUser.email,
                playerEmail: resolvedUser.playerEmail,
                role: teamRole,
                status: normalizedStatus,
                userId: teamInviteUserId,
                isAssigned: teamRole === 'player' && resolvedUser.isManagedPlayerInvite,
                ...(resolvedUser.isManagedPlayerInvite ? {
                  isMinor: managedPlayerInput?.isMinor === true,
                  dateOfBirth: managedPlayerInput?.dateOfBirth
                    ? new Date(`${managedPlayerInput.dateOfBirth.trim().split('T')[0]}T00:00:00.000Z`)
                    : UNKNOWN_MANAGED_PLAYER_DATE_OF_BIRTH,
                  guardianEmail: managedPlayerInput?.guardianEmail,
                } : {}),
                staffTypes: teamStaffType ? [teamStaffType] : normalizeIdList(existingInvite.staffTypes),
                firstName: normalizedFirstName ?? existingInvite.firstName,
                lastName: normalizedLastName ?? existingInvite.lastName,
                updatedAt: now,
              },
            })
            : await tx.invites.create({
              data: {
                id: crypto.randomUUID(),
                type: 'TEAM',
                email: resolvedUser.email,
                playerEmail: resolvedUser.playerEmail,
                status: normalizedStatus,
                role: teamRole,
                staffTypes: teamStaffType ? [teamStaffType] : [],
                teamId,
                userId: teamInviteUserId,
                isAssigned: teamRole === 'player' && resolvedUser.isManagedPlayerInvite,
                isMinor: resolvedUser.isManagedPlayerInvite && managedPlayerInput?.isMinor === true,
                dateOfBirth: resolvedUser.isManagedPlayerInvite && managedPlayerInput?.dateOfBirth
                  ? new Date(`${managedPlayerInput.dateOfBirth.trim().split('T')[0]}T00:00:00.000Z`)
                  : UNKNOWN_MANAGED_PLAYER_DATE_OF_BIRTH,
                guardianEmail: resolvedUser.isManagedPlayerInvite ? managedPlayerInput?.guardianEmail ?? null : null,
                createdBy: session.userId,
                idempotencyKey: invite.idempotencyKey,
                linkVersion: 1,
                linkExpiresAt: new Date(now.getTime() + TEAM_INVITE_LINK_TTL_MS),
                firstName: normalizedFirstName ?? null,
                lastName: normalizedLastName ?? null,
                createdAt: now,
                updatedAt: now,
              },
            });

          await recordInvitationRequest(tx, requestScope, record.id);

          if (teamRole === 'player') {
            await syncCanonicalTeamRoster({
              teamId,
              captainId: team.captainId,
              playerIds: normalizeIdList(team.playerIds),
              pendingPlayerIds: unionStrings(normalizeIdList(team.pending), [teamInviteUserId]),
              managerId: team.managerId,
              headCoachId: team.headCoachId,
              assistantCoachIds: normalizeIdList(team.coachIds),
              actingUserId: session.userId,
              now,
              preserveInvitedStaffAssignments: true,
            }, tx);
          } else {
            await updateTeamStaffInviteAssignment(
              tx,
              teamRole,
              teamId,
              teamInviteUserId,
              session.userId,
              now,
            );
          }

          createdRecords.push(record);
          if (wasCreated && (isUserIdInvite || resolvedUser.shouldSendEmail)) {
            toEmailRecords.push(record);
          }
          continue;
        }

        if (!eventId) {
          throw new InviteRouteError(400, 'Event invites require eventId');
        }
        const eventInviteUserId = inviteUserId;
        if (!eventInviteUserId) {
          throw new InviteRouteError(400, 'Event invites require a userId or email');
        }

        const existingInvite = await tx.invites.findFirst({
          where: {
            type: 'EVENT',
            eventId,
            userId: eventInviteUserId,
          },
        });
        const wasCreated = !existingInvite;
        const record = existingInvite
          ? await tx.invites.update({
            where: { id: existingInvite.id },
            data: {
              email: resolvedUser.email,
              status: normalizedStatus,
              createdBy: invite.createdBy ?? session.userId,
              firstName: normalizedFirstName ?? existingInvite.firstName,
              lastName: normalizedLastName ?? existingInvite.lastName,
              updatedAt: now,
            },
          })
          : await tx.invites.create({
            data: {
              id: crypto.randomUUID(),
              type: 'EVENT',
              email: resolvedUser.email,
              status: normalizedStatus,
              eventId,
              organizationId,
              teamId,
              userId: eventInviteUserId,
              createdBy: invite.createdBy ?? session.userId,
              firstName: normalizedFirstName ?? null,
              lastName: normalizedLastName ?? null,
              createdAt: now,
              updatedAt: now,
            },
          });
        createdRecords.push(record);
        if (wasCreated && (isUserIdInvite || resolvedUser.shouldSendEmail)) {
          toEmailRecords.push(record);
        }
      }

      return { created: createdRecords, toEmail: toEmailRecords };
    });

    const baseUrl = getRequestOrigin(req);
    let emailedInvites: InviteDeliveryRecord[] = [];
    let inviteDeliveryFailed = false;
    try {
      emailedInvites = await sendInviteEmails(toEmail, baseUrl, { requestedBy: session.userId, requestedByIsAdmin: session.isAdmin });
    } catch (error) {
      // The database transaction already committed. Keep that result and
      // report delivery failure so the client can retry delivery safely.
      inviteDeliveryFailed = true;
      console.warn('Invite save committed but delivery failed', error);
    }
    const emailedById = new Map(emailedInvites.map((invite) => [invite.id, invite]));
    const mergedInvites = created.map((invite) => {
      const emailed = emailedById.get(invite.id);
      return emailed
        ? { ...invite, status: emailed.status ?? invite.status, sentAt: emailed.sentAt ?? invite.sentAt, delivery: emailed.delivery }
        : invite;
    });

    return NextResponse.json({
      invites: mergedInvites.map((invite) => mapInviteRecord(invite)),
      delivery: {
        attempted: toEmail.length > 0,
        failed: inviteDeliveryFailed || emailedInvites.some(
          (invite) => invite.delivery?.failed === true || (invite.type !== 'TEAM' && String(invite.status ?? '').toUpperCase() === 'FAILED'),
        ),
        inviteIds: toEmail.map((invite) => invite.id),
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof InvitationRequestError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof TeamInvitationRestrictionError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof InviteRouteError) {
      const payload = error.details === undefined
        ? { error: error.message }
        : { error: error.message, details: error.details };
      return NextResponse.json(payload, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Failed to create invite';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const userId = typeof body?.userId === 'string' ? body.userId : undefined;
  const teamId = typeof body?.teamId === 'string' ? body.teamId : undefined;
  const type = normalizeInviteType(body?.type);

  const where: any = {};
  if (userId) where.userId = userId;
  if (teamId) where.teamId = teamId;
  if (type) where.type = type;

  if (!session.isAdmin) {
    const canActOnUser = userId && userId === session.userId;

    let isTeamCaptain = false;
    if (teamId) {
      const teamsDelegate = getTeamsDelegate(prisma);
      const team = await teamsDelegate?.findUnique({ where: { id: teamId } });
      isTeamCaptain = Boolean(team && (((team as any).captainId === session.userId) || ((team as any).managerId === session.userId)));
    }

    if (!canActOnUser && !isTeamCaptain) {
      where.createdBy = session.userId;
    }
  }

  const inviteCandidates = await prisma.invites.findMany({ where });
  if (!inviteCandidates.length) {
    return NextResponse.json({ deleted: true }, { status: 200 });
  }

  if (inviteCandidates.some((invite) => normalizeInviteType(invite.type) === 'TEAM')) {
    return NextResponse.json({ error: 'Cancel or decline a Team invitation by its invitation ID.' }, { status: 409 });
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const eventStaffLockIds = Array.from(new Set(inviteCandidates.flatMap((invite) => (
      normalizeInviteType(invite.type) === 'STAFF' && normalizeId(invite.eventId)
        ? [normalizeId(invite.eventId) as string]
        : []
    )))).sort();
    for (const eventId of eventStaffLockIds) {
      await acquireEventLock(tx, eventId);
    }

    // Re-run the scoped query after taking the event locks. This keeps the
    // authorization filter and the destructive write in the same transaction.
    // If a candidate's event scope changed while waiting, leave it untouched
    // rather than mutating it without the corresponding advisory lock.
    const lockedEventIds = new Set(eventStaffLockIds);
    const lockedCandidates = await tx.invites.findMany({
      where: {
        AND: [where, { id: { in: inviteCandidates.map((invite) => invite.id) } }],
      },
    });
    const invites = lockedCandidates.filter((invite) => {
      const currentEventId = normalizeId(invite.eventId);
      return normalizeInviteType(invite.type) !== 'TEAM' && (normalizeInviteType(invite.type) !== 'STAFF'
        || !currentEventId
        || lockedEventIds.has(currentEventId));
    });

    const profileIds = invites.map((invite) => invite.userId).filter((id): id is string => Boolean(id));
    const managedProfiles = profileIds.length && tx.userData?.findMany
      ? await tx.userData.findMany({
        where: { id: { in: profileIds }, OR: [{ isManagedPlayer: true }, { mergedIntoProfileId: { not: null } }] },
        select: { id: true },
      })
      : [];
    const durableIds = new Set((managedProfiles ?? []).map((profile: { id: string }) => profile.id));
    const claimedInviteIds = new Set(invites.filter((invite) => Boolean(invite.claimedBy)).map((invite) => invite.id));
    if (tx.userProfileClaims?.findMany) {
      const claims = await tx.userProfileClaims.findMany({
        where: { inviteId: { in: invites.map((invite) => invite.id) }, status: 'COMPLETED' },
        select: { inviteId: true },
      });
      claims.forEach((claim: { inviteId?: string | null }) => { if (claim.inviteId) claimedInviteIds.add(claim.inviteId); });
    }
    if (tx.userProfileMerges?.findMany) {
      const merges = await tx.userProfileMerges.findMany({
        where: { invitationIds: { hasSome: invites.map((invite) => invite.id) } },
        select: { invitationIds: true },
      });
      merges.forEach((merge: { invitationIds?: string[] }) => (merge.invitationIds ?? []).forEach((inviteId) => claimedInviteIds.add(inviteId)));
    }
    const durableInviteIds = invites.filter((invite) => durableIds.has(invite.userId ?? '') || claimedInviteIds.has(invite.id)).map((invite) => invite.id);
    const deletableInviteIds = invites
      .filter((invite) => !durableIds.has(invite.userId ?? '') && !claimedInviteIds.has(invite.id))
      .map((invite) => invite.id);
    if (durableInviteIds.length) {
      await tx.invites.updateMany({
        where: { id: { in: durableInviteIds } },
        data: { status: 'CANCELLED', finalizedAt: now, updatedAt: now },
      });
    }
    if (deletableInviteIds.length) {
      await tx.invites.deleteMany({
        where: { id: { in: deletableInviteIds } },
      });
    }
  });

  return NextResponse.json({ deleted: true }, { status: 200 });
}
