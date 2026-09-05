import type { Prisma } from '@/generated/prisma/client';
import { isPrivateToOrganizationsVisibility, normalizeAccountVisibility } from '@/lib/accountVisibility';
import { formatNameParts, normalizeOptionalName } from '@/lib/nameCase';
import { hasGuardianAge } from '@/server/guardianAuthority';

export const publicUserSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  firstName: true,
  lastName: true,
  dateOfBirth: true,
  dobVerified: true,
  dobVerifiedAt: true,
  ageVerificationProvider: true,
  friendIds: true,
  userName: true,
  hasStripeAccount: true,
  followingIds: true,
  friendRequestIds: true,
  friendRequestSentIds: true,
  uploadedImages: true,
  profileImageId: true,
  homePageOrganizationId: true,
  accountVisibility: true,
  isManagedPlayer: true,
  mergedIntoProfileId: true,
} as const;

export type SelectedPublicUser = Prisma.UserDataGetPayload<{ select: typeof publicUserSelect }>;
export type PublicUser = SelectedPublicUser & { teamIds: string[] };

export const currentUserSelect = {
  ...publicUserSelect,
  blockedUserIds: true,
  hiddenEventIds: true,
  chatTermsAcceptedAt: true,
  chatTermsVersion: true,
  onboardingIntent: true,
  notificationSettings: true,
} as const;

export type SelectedCurrentUser = Prisma.UserDataGetPayload<{ select: typeof currentUserSelect }>;
export type CurrentUser = SelectedCurrentUser & { teamIds: string[] };

export type VisibilityUser = Omit<PublicUser, 'dateOfBirth'> & {
  dateOfBirth: Date | null;
  isMinor: boolean;
  isIdentityHidden: boolean;
  displayName: string;
};

type VisibilityContextOptions = {
  viewerId?: string | null;
  isAdmin?: boolean;
  teamId?: string | null;
  eventId?: string | null;
  allowManagerFreeAgentUnmask?: boolean;
  freeAgentUserIds?: string[];
  now?: Date;
};

export type VisibilityContext = {
  viewerId: string | null;
  isAdmin: boolean;
  now: Date;
  activeChildIds: Set<string>;
  parentTeamIds: Set<string>;
  viewerBelongsToContextTeam: boolean;
  contextTeamAllowsParent: boolean;
  contextEventAllowsParent: boolean;
  contextEventAllowsHost: boolean;
  contextEventAllowsOfficial: boolean;
  contextOrganizationAllowsStaff: boolean;
  contextTeamVisibleUserIds: Set<string>;
  contextTeamPendingUserIds: Set<string>;
  contextEventVisibleUserIds: Set<string>;
  contextEventPendingUserIds: Set<string>;
  contextEventViewerTeamVisibleUserIds: Set<string>;
  contextEventParentVisibleUserIds: Set<string>;
  contextOrganizationVisibleUserIds: Set<string>;
  contextEventFreeAgentIds: Set<string>;
  sharedOrganizationUserIds: Set<string>;
  viewerManagesContextTeam: boolean;
  allowManagerFreeAgentUnmask: boolean;
};

const normalizeId = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
};

const normalizeIdList = (value: string[] | null | undefined): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((entry) => String(entry).trim()).filter(Boolean)));
};

const UNKNOWN_DOB_MAX_TIMESTAMP = 24 * 60 * 60 * 1000;

export const isUnknownDateOfBirth = (value: Date | string | null | undefined): boolean => {
  if (value == null) return true;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return true;
  return parsed.getTime() <= UNKNOWN_DOB_MAX_TIMESTAMP;
};

export const isMinorAtUtcDate = (value: Date | string | null | undefined, now: Date = new Date()): boolean => {
  if (isUnknownDateOfBirth(value)) {
    return true;
  }

  const dob = value instanceof Date ? value : new Date(value as string);
  const birthYear = dob.getUTCFullYear();
  const birthMonth = dob.getUTCMonth();
  const birthDay = dob.getUTCDate();

  const nowYear = now.getUTCFullYear();
  const nowMonth = now.getUTCMonth();
  const nowDay = now.getUTCDate();

  let age = nowYear - birthYear;
  if (nowMonth < birthMonth || (nowMonth === birthMonth && nowDay < birthDay)) {
    age -= 1;
  }

  return age < 18;
};

const resolveDisplayName = (user: Pick<PublicUser, 'firstName' | 'lastName' | 'userName'>): string => {
  const fullName = formatNameParts(user.firstName, user.lastName);
  if (fullName) return fullName;
  const handle = user.userName?.trim();
  if (handle) return handle;
  return 'User';
};

export const createVisibilityContext = async (
  client: {
    userData?: { findMany: (args: any) => Promise<Array<{ id: string; dateOfBirth?: Date | null }>> };
    parentChildLinks: { findMany: (args: any) => Promise<Array<{ childId: string }>> };
    staffMembers: { findMany: (args: any) => Promise<Array<{ organizationId?: string; userId?: string | null }>> };
    teams: {
      findMany: (args: any) => Promise<Array<{
        id?: string;
        captainId?: string | null;
        managerId?: string | null;
        headCoachId?: string | null;
        coachIds?: string[];
        playerIds?: string[];
        pending?: string[];
      }>>;
      findUnique: (args: any) => Promise<{
        id: string;
        captainId: string;
        managerId: string;
        headCoachId: string | null;
        coachIds: string[];
        playerIds: string[];
        pending: string[];
      } | null>;
    };
    events: {
      findUnique: (args: any) => Promise<{
        hostId: string | null;
        assistantHostIds?: string[];
        organizationId: string | null;
      } | null>;
    };
    eventRegistrations: {
      findMany: (args: any) => Promise<Array<{
        registrantId: string;
        registrantType: string;
        rosterRole: string | null;
      }>>;
    };
    eventOfficials?: {
      findFirst: (args: any) => Promise<unknown>;
    };
    organizations: {
      findMany: (args: any) => Promise<Array<{ id?: string; ownerId?: string | null }>>;
      findUnique: (args: any) => Promise<{ id?: string } | null>;
    };
    canonicalTeams?: {
      findUnique: (args: any) => Promise<{ id?: string; organizationId?: string | null } | null>;
      findMany: (args: any) => Promise<Array<{ id: string }>>;
    };
    teamRegistrations?: {
      findMany: (args: any) => Promise<Array<{
        teamId: string;
        userId: string;
        status?: string | null;
        isCaptain?: boolean | null;
      }>>;
    };
    teamStaffAssignments?: {
      findMany: (args: any) => Promise<Array<{
        teamId: string;
        userId: string;
        role?: string | null;
        status?: string | null;
      }>>;
    };
  },
  options: VisibilityContextOptions,
): Promise<VisibilityContext> => {
  const viewerId = normalizeId(options.viewerId ?? null);
  const isAdmin = Boolean(options.isAdmin);
  const now = options.now ?? new Date();

  const contextTeamId = normalizeId(options.teamId ?? null);
  const contextEventId = normalizeId(options.eventId ?? null);

  if (!viewerId || isAdmin) {
    let contextTeamPendingUserIds = new Set<string>();
    let contextEventPendingUserIds = new Set<string>();
    if (!isAdmin && contextTeamId) {
      const contextTeam = await client.teams.findUnique({
        where: { id: contextTeamId },
        select: { pending: true },
      });
      if (contextTeam) {
        contextTeamPendingUserIds = new Set(normalizeIdList(contextTeam.pending));
      } else if (client.canonicalTeams?.findUnique && client.teamRegistrations?.findMany) {
        const canonicalTeam = await client.canonicalTeams.findUnique({
          where: { id: contextTeamId },
          select: { id: true },
        });
        if (canonicalTeam) {
          const invitedRegistrations = await client.teamRegistrations.findMany({
            where: { teamId: contextTeamId, status: 'INVITED' },
            select: { userId: true },
          });
          contextTeamPendingUserIds = new Set(normalizeIdList(
            invitedRegistrations.map((registration) => registration.userId),
          ));
        }
      }
    }
    if (!isAdmin && contextEventId) {
      const contextRegistrations = await client.eventRegistrations.findMany({
        where: {
          eventId: contextEventId,
          status: { in: ['STARTED', 'PENDING', 'ACTIVE', 'BLOCKED'] },
          slotId: null,
          occurrenceDate: null,
        },
        select: { registrantId: true, registrantType: true, rosterRole: true },
      });
      const eventTeamIds = normalizeIdList(contextRegistrations
        .filter((row) => row.registrantType === 'TEAM' && (row.rosterRole ?? 'PARTICIPANT') === 'PARTICIPANT')
        .map((row) => row.registrantId));
      if (eventTeamIds.length) {
        const eventTeams = await client.teams.findMany({
          where: { id: { in: eventTeamIds } },
          select: { pending: true },
        });
        contextEventPendingUserIds = new Set(normalizeIdList(
          eventTeams.flatMap((team) => team.pending ?? []),
        ));
      }
    }
    return {
      viewerId,
      isAdmin,
      now,
      activeChildIds: new Set(),
      parentTeamIds: new Set(),
      viewerBelongsToContextTeam: false,
      contextTeamAllowsParent: false,
      contextEventAllowsParent: false,
      contextEventAllowsHost: false,
      contextEventAllowsOfficial: false,
      contextOrganizationAllowsStaff: false,
      contextTeamVisibleUserIds: new Set(),
      contextTeamPendingUserIds,
      contextEventVisibleUserIds: new Set(),
      contextEventPendingUserIds,
      contextEventViewerTeamVisibleUserIds: new Set(),
      contextEventParentVisibleUserIds: new Set(),
      contextOrganizationVisibleUserIds: new Set(),
      contextEventFreeAgentIds: new Set(normalizeIdList(options.freeAgentUserIds)),
      sharedOrganizationUserIds: new Set(),
      viewerManagesContextTeam: isAdmin,
      allowManagerFreeAgentUnmask: Boolean(options.allowManagerFreeAgentUnmask),
    };
  }

  const childLinks = await client.parentChildLinks.findMany({
    where: {
      parentId: viewerId,
      status: 'ACTIVE',
    },
    select: { childId: true },
  });
  const childProfiles = childLinks.length && client.userData
    ? await client.userData.findMany({ where: { id: { in: childLinks.map((row) => row.childId) } }, select: { id: true, dateOfBirth: true } })
    : [];
  const activeChildIds = new Set(childProfiles.filter((child) => hasGuardianAge(child.dateOfBirth, now)).map((child) => child.id));

  const [ownedOrganizations, staffMemberships] = await Promise.all([
    client.organizations.findMany({
      where: { ownerId: viewerId },
      select: { id: true },
    }),
    client.staffMembers.findMany({
      where: { userId: viewerId },
      select: { organizationId: true },
    }),
  ]);
  const viewerOrganizationIds = new Set(normalizeIdList([
    ...ownedOrganizations.map((organization) => organization.id ?? ''),
    ...staffMemberships.map((membership) => membership.organizationId ?? ''),
  ]));
  let sharedOrganizationUserIds = new Set<string>();
  const viewerOrganizationIdValues = Array.from(viewerOrganizationIds);
  if (viewerOrganizationIdValues.length > 0) {
    const [sharedStaffMemberships, sharedOwnedOrganizations] = await Promise.all([
      client.staffMembers.findMany({
        where: { organizationId: { in: viewerOrganizationIdValues } },
        select: { userId: true },
      }),
      client.organizations.findMany({
        where: { id: { in: viewerOrganizationIdValues } },
        select: { ownerId: true },
      }),
    ]);
    sharedOrganizationUserIds = new Set(normalizeIdList([
      viewerId,
      ...sharedStaffMemberships.map((membership) => membership.userId ?? ''),
      ...sharedOwnedOrganizations.map((organization) => organization.ownerId ?? ''),
    ]));
  }

  let parentTeamIds = new Set<string>();
  if (activeChildIds.size > 0) {
    const childTeams = await client.teams.findMany({
      where: {
        playerIds: { hasSome: Array.from(activeChildIds) },
      },
      select: { id: true },
    });
    parentTeamIds = new Set(normalizeIdList(childTeams.map((row) => row.id ?? '')));
  }

  let viewerManagesContextTeam = false;
  let viewerBelongsToContextTeam = false;
  let contextTeamVisibleUserIds = new Set<string>();
  let contextTeamPendingUserIds = new Set<string>();
  let contextOrganizationId: string | null = null;
  if (contextTeamId) {
    const contextTeam = await client.teams.findUnique({
      where: { id: contextTeamId },
      select: {
        id: true,
        captainId: true,
        managerId: true,
        headCoachId: true,
        coachIds: true,
        playerIds: true,
        pending: true,
      },
    });
    if (contextTeam) {
      viewerManagesContextTeam = (
        contextTeam.captainId === viewerId
        || contextTeam.managerId === viewerId
        || contextTeam.headCoachId === viewerId
        || normalizeIdList(contextTeam.coachIds).includes(viewerId)
      );
      contextTeamVisibleUserIds = new Set(normalizeIdList([
        contextTeam.captainId,
        contextTeam.managerId,
        contextTeam.headCoachId ?? '',
        ...contextTeam.coachIds,
        ...contextTeam.playerIds,
        ...contextTeam.pending,
      ]));
      contextTeamPendingUserIds = new Set(normalizeIdList(contextTeam.pending));
      viewerBelongsToContextTeam = contextTeamVisibleUserIds.has(viewerId);
      const contextTeamOrganization = await client.canonicalTeams?.findUnique?.({
        where: { id: contextTeam.id },
        select: { organizationId: true },
      });
      contextOrganizationId = normalizeId(contextTeamOrganization?.organizationId ?? null);
    } else if (client.canonicalTeams?.findUnique) {
      const canonicalTeam = await client.canonicalTeams.findUnique({
        where: { id: contextTeamId },
        select: { id: true, organizationId: true },
      });
      if (canonicalTeam) {
        const [playerRegistrations, staffAssignments] = await Promise.all([
          client.teamRegistrations?.findMany?.({
            where: {
              teamId: contextTeamId,
              status: { in: ['ACTIVE', 'INVITED'] },
            },
            select: { teamId: true, userId: true, status: true, isCaptain: true },
          }) ?? Promise.resolve([]),
          client.teamStaffAssignments?.findMany?.({
            where: { teamId: contextTeamId, status: 'ACTIVE' },
            select: { teamId: true, userId: true, role: true, status: true },
          }) ?? Promise.resolve([]),
        ]);
        const activePlayerIds = playerRegistrations
          .filter((registration) => String(registration.status ?? '').toUpperCase() === 'ACTIVE')
          .map((registration) => registration.userId);
        const pendingPlayerIds = playerRegistrations
          .filter((registration) => String(registration.status ?? '').toUpperCase() === 'INVITED')
          .map((registration) => registration.userId);
        const activeStaffAssignments = staffAssignments.filter(
          (assignment) => String(assignment.status ?? '').toUpperCase() === 'ACTIVE',
        );
        const isCanonicalManager = activeStaffAssignments.some((assignment) => (
          assignment.userId === viewerId
          && String(assignment.role ?? '').toUpperCase() === 'MANAGER'
        ));
        const isCanonicalCoach = activeStaffAssignments.some((assignment) => (
          assignment.userId === viewerId
          && ['HEAD_COACH', 'ASSISTANT_COACH'].includes(String(assignment.role ?? '').toUpperCase())
        ));
        const isCanonicalCaptain = playerRegistrations.some((registration) => (
          registration.userId === viewerId
          && String(registration.status ?? '').toUpperCase() === 'ACTIVE'
          && Boolean(registration.isCaptain)
        ));
        viewerManagesContextTeam = isCanonicalManager || isCanonicalCoach || isCanonicalCaptain;
        contextTeamVisibleUserIds = new Set(normalizeIdList([
          ...activePlayerIds,
          ...pendingPlayerIds,
          ...activeStaffAssignments.map((assignment) => assignment.userId),
        ]));
        contextTeamPendingUserIds = new Set(normalizeIdList(pendingPlayerIds));
        viewerBelongsToContextTeam = contextTeamVisibleUserIds.has(viewerId);
        contextOrganizationId = normalizeId(canonicalTeam.organizationId ?? null);
      }
    }
  }

  let contextEventAllowsParent = false;
  let contextEventAllowsHost = false;
  let contextEventAllowsOfficial = false;
  let contextEventVisibleUserIds = new Set<string>();
  let contextEventPendingUserIds = new Set<string>();
  let contextEventViewerTeamVisibleUserIds = new Set<string>();
  let contextEventParentVisibleUserIds = new Set<string>();
  let contextEventFreeAgentIds = new Set<string>(normalizeIdList(options.freeAgentUserIds));
  if (contextEventId) {
    const contextEvent = await client.events.findUnique({
      where: { id: contextEventId },
      select: {
        hostId: true,
        assistantHostIds: true,
        organizationId: true,
      },
    });

    if (viewerId && client.eventOfficials?.findFirst) {
      const eventOfficial = await client.eventOfficials.findFirst({
        where: {
          eventId: contextEventId,
          userId: viewerId,
          isActive: { not: false },
        },
        select: { id: true },
      });
      contextEventAllowsOfficial = Boolean(eventOfficial);
    }

    const contextRegistrations = contextEvent
      ? await client.eventRegistrations.findMany({
        where: {
          eventId: contextEventId,
          status: { in: ['STARTED', 'PENDING', 'ACTIVE', 'BLOCKED'] },
          slotId: null,
          occurrenceDate: null,
        },
        select: {
          registrantId: true,
          registrantType: true,
          rosterRole: true,
        },
      })
      : [];
    const contextEventTeamIds = new Set(
      normalizeIdList(contextRegistrations
        .filter((row) => row.registrantType === 'TEAM' && (row.rosterRole ?? 'PARTICIPANT') === 'PARTICIPANT')
        .map((row) => row.registrantId)),
    );
    const contextEventTeamIdValues = Array.from(contextEventTeamIds);
    contextEventAllowsParent = contextEventTeamIdValues.some((teamId) => parentTeamIds.has(teamId));
    contextEventAllowsHost = Boolean(
      normalizeId(contextEvent?.hostId ?? null) === viewerId
      || normalizeIdList(contextEvent?.assistantHostIds).includes(viewerId),
    );
    contextOrganizationId = normalizeId(contextEvent?.organizationId ?? null) ?? contextOrganizationId;

    contextEventFreeAgentIds = new Set([
      ...Array.from(contextEventFreeAgentIds),
      ...normalizeIdList(contextRegistrations
        .filter((row) => (row.rosterRole ?? 'PARTICIPANT') === 'FREE_AGENT')
        .map((row) => row.registrantId)),
    ]);

    let eventTeamVisibleUserIds: string[] = [];
    if (contextEventTeamIdValues.length) {
      const contextEventTeams = await client.teams.findMany({
        where: { id: { in: contextEventTeamIdValues } },
        select: {
          id: true,
          captainId: true,
          managerId: true,
          headCoachId: true,
          coachIds: true,
          playerIds: true,
          pending: true,
        },
      });
      const eventTeamVisibilityRows = contextEventTeams.map((team) => {
        const teamId = normalizeId(team.id ?? '') ?? '';
        const visibleUserIds = normalizeIdList([
          team.captainId ?? '',
          team.managerId ?? '',
          team.headCoachId ?? '',
          ...(team.coachIds ?? []),
          ...(team.playerIds ?? []),
          ...(team.pending ?? []),
        ]);
        return { teamId, visibleUserIds, pendingUserIds: normalizeIdList(team.pending) };
      });

      eventTeamVisibleUserIds = eventTeamVisibilityRows.flatMap((row) => row.visibleUserIds);
      contextEventPendingUserIds = new Set(normalizeIdList(
        eventTeamVisibilityRows.flatMap((row) => row.pendingUserIds),
      ));

      const viewerScopedRows = eventTeamVisibilityRows.filter((row) => row.visibleUserIds.includes(viewerId));
      contextEventViewerTeamVisibleUserIds = new Set(
        normalizeIdList(viewerScopedRows.flatMap((row) => row.visibleUserIds)),
      );

      const parentScopedRows = eventTeamVisibilityRows.filter((row) => row.teamId && parentTeamIds.has(row.teamId));
      contextEventParentVisibleUserIds = new Set(
        normalizeIdList(parentScopedRows.flatMap((row) => row.visibleUserIds)),
      );
      contextEventAllowsParent = parentScopedRows.length > 0;
    }

    contextEventVisibleUserIds = new Set(normalizeIdList([
      ...contextRegistrations
        .filter((row) => row.registrantType !== 'TEAM')
        .map((row) => row.registrantId),
      ...eventTeamVisibleUserIds,
    ]));
  }

  let contextOrganizationAllowsStaff = false;
  let contextOrganizationVisibleUserIds = new Set<string>();
  if (contextOrganizationId && viewerOrganizationIds.has(contextOrganizationId)) {
    contextOrganizationAllowsStaff = true;
    const organizationTeams = await client.canonicalTeams?.findMany?.({
      where: { organizationId: contextOrganizationId },
      select: { id: true },
    });
    const organizationTeamIds = normalizeIdList(organizationTeams?.map((team) => team.id));
    if (organizationTeamIds.length) {
      const [organizationTeamRegistrations, organizationTeamStaffAssignments] = await Promise.all([
        client.teamRegistrations?.findMany?.({
          where: {
            teamId: { in: organizationTeamIds },
            status: { in: ['ACTIVE', 'INVITED'] },
          },
          select: {
            teamId: true,
            userId: true,
            status: true,
          },
        }) ?? Promise.resolve([]),
        client.teamStaffAssignments?.findMany?.({
          where: {
            teamId: { in: organizationTeamIds },
            status: 'ACTIVE',
          },
          select: {
            teamId: true,
            userId: true,
            status: true,
          },
        }) ?? Promise.resolve([]),
      ]);
      contextOrganizationVisibleUserIds = new Set(normalizeIdList([
        ...organizationTeamRegistrations.map((registration) => registration.userId),
        ...organizationTeamStaffAssignments.map((assignment) => assignment.userId),
      ]));
    }
  }

  return {
    viewerId,
    isAdmin,
    now,
    activeChildIds,
    parentTeamIds,
    viewerBelongsToContextTeam,
    contextTeamAllowsParent: contextTeamId ? parentTeamIds.has(contextTeamId) : false,
    contextEventAllowsParent,
    contextEventAllowsHost,
    contextEventAllowsOfficial,
    contextOrganizationAllowsStaff,
    contextTeamVisibleUserIds,
    contextTeamPendingUserIds,
    contextEventVisibleUserIds,
    contextEventPendingUserIds,
    contextEventViewerTeamVisibleUserIds,
    contextEventParentVisibleUserIds,
    contextOrganizationVisibleUserIds,
    contextEventFreeAgentIds,
    sharedOrganizationUserIds,
    viewerManagesContextTeam,
    allowManagerFreeAgentUnmask: Boolean(options.allowManagerFreeAgentUnmask),
  };
};

export const canViewPendingRosterIdentity = (
  context: VisibilityContext,
  userId: string,
): boolean => {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) {
    return false;
  }
  if (context.isAdmin || context.viewerId === normalizedUserId) {
    return true;
  }
  const canViewScopedPending = Boolean(
    context.viewerManagesContextTeam
    || context.contextEventAllowsHost
    || context.contextEventAllowsOfficial
    || context.contextOrganizationAllowsStaff
  );
  if (context.contextTeamPendingUserIds?.has(normalizedUserId)) {
    return canViewScopedPending;
  }
  if (context.contextEventPendingUserIds?.has(normalizedUserId)) {
    // Event-scoped pending identities are only exposed to a team manager
    // when that team is the active visibility context.
    return canViewScopedPending;
  }
  return true;
};

export const applyUserPrivacy = (user: PublicUser, context: VisibilityContext): VisibilityUser => {
  const isMinor = isMinorAtUtcDate(user.dateOfBirth, context.now);
  const canViewPrivateProfile = Boolean(
    context.isAdmin
    || context.viewerId === user.id
    || context.activeChildIds.has(user.id)
  );
  const canViewScopedMinorIdentity = Boolean(
    canViewPrivateProfile
    || (
      context.contextTeamVisibleUserIds.has(user.id)
      && (
        context.viewerManagesContextTeam
        || context.viewerBelongsToContextTeam
        || context.contextTeamAllowsParent
        || context.contextOrganizationAllowsStaff
      )
    )
    || (context.contextEventAllowsHost && context.contextEventVisibleUserIds.has(user.id))
    || context.contextEventViewerTeamVisibleUserIds.has(user.id)
    || (context.contextEventAllowsParent && context.contextEventParentVisibleUserIds.has(user.id))
    || (context.contextOrganizationAllowsStaff && context.contextOrganizationVisibleUserIds.has(user.id))
    || (
      context.viewerManagesContextTeam
      && context.allowManagerFreeAgentUnmask
      && context.contextEventFreeAgentIds.has(user.id)
    )
  );
  const isIdentityHidden = isMinor && !canViewScopedMinorIdentity;
  const canViewManagedProfileState = Boolean(
    context.isAdmin
    || context.viewerId === user.id
    || context.viewerManagesContextTeam,
  );

  const normalizedUser: PublicUser = {
    ...user,
    firstName: normalizeOptionalName(user.firstName),
    lastName: normalizeOptionalName(user.lastName),
    accountVisibility: normalizeAccountVisibility(user.accountVisibility),
  };

  const privacyMinimizedUser = {
    ...normalizedUser,
    // Managed-profile state is a roster-management signal. Do not expose it
    // to generic public profile viewers.
    isManagedPlayer: canViewManagedProfileState ? normalizedUser.isManagedPlayer : false,
    mergedIntoProfileId: canViewManagedProfileState ? normalizedUser.mergedIntoProfileId : null,
    dateOfBirth: canViewPrivateProfile ? normalizedUser.dateOfBirth : null,
    dobVerified: canViewPrivateProfile ? normalizedUser.dobVerified : false,
    dobVerifiedAt: canViewPrivateProfile ? normalizedUser.dobVerifiedAt : null,
    ageVerificationProvider: canViewPrivateProfile ? normalizedUser.ageVerificationProvider : null,
    friendIds: canViewPrivateProfile ? normalizedUser.friendIds : [],
    followingIds: canViewPrivateProfile ? normalizedUser.followingIds : [],
    friendRequestIds: canViewPrivateProfile ? normalizedUser.friendRequestIds : [],
    friendRequestSentIds: canViewPrivateProfile ? normalizedUser.friendRequestSentIds : [],
    uploadedImages: canViewPrivateProfile ? normalizedUser.uploadedImages : [],
    hasStripeAccount: canViewPrivateProfile ? normalizedUser.hasStripeAccount : false,
    homePageOrganizationId: canViewPrivateProfile ? normalizedUser.homePageOrganizationId : null,
    ...(isIdentityHidden ? {
      firstName: null,
      lastName: null,
      userName: 'Minor participant',
      teamIds: [],
      profileImageId: null,
    } : {}),
  };

  return {
    ...privacyMinimizedUser,
    isMinor,
    isIdentityHidden,
    displayName: isIdentityHidden ? 'Minor participant' : resolveDisplayName(normalizedUser),
  };
};

export const applyUserPrivacyList = (users: PublicUser[], context: VisibilityContext): VisibilityUser[] => {
  return users.map((user) => applyUserPrivacy(user, context));
};

export const isVisibleInGenericSearch = (
  user: Pick<PublicUser, 'id' | 'dateOfBirth' | 'accountVisibility'>,
  context: VisibilityContext,
): boolean => {
  if (isMinorAtUtcDate(user.dateOfBirth, context.now)) {
    return false;
  }
  if (!isPrivateToOrganizationsVisibility(user.accountVisibility)) {
    return true;
  }
  if (context.isAdmin) {
    return true;
  }
  if (!context.viewerId) {
    return false;
  }
  if (context.viewerId === user.id) {
    return true;
  }
  return context.sharedOrganizationUserIds.has(user.id);
};
