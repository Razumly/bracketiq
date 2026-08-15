import { prisma } from '@/lib/prisma';
import { ORG_PERMISSIONS, type OrganizationPermission } from '@/lib/organizationPermissions';
import { STAFF_ACCESS_TYPES, getBlockingStaffInvite, hasStaffMemberType, normalizeStaffMemberTypes } from '@/lib/staff';
import type { StaffMemberType } from '@/types';
import { evaluateRazumlyAdminAccess } from '@/server/razumlyAdmin';

const normalizeIdList = (values: unknown): string[] => {
  if (!Array.isArray(values)) {
    return [];
  }
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
};

type SessionLike = {
  userId: string;
  isAdmin: boolean;
};

type OrganizationAccessRecord = {
  id?: string | null | undefined;
  ownerId: string | null | undefined;
  ownershipStatus?: string | null | undefined;
};

type EventAccessRecord = {
  hostId: string | null | undefined;
  assistantHostIds?: unknown;
  organizationId?: string | null;
};

type OrganizationLookupClient = {
  authUser?: {
    findUnique: (args: {
      where: { id: string };
      select: { email: true; emailVerifiedAt: true; sessionVersion: true };
    }) => Promise<{
      email: string;
      emailVerifiedAt: Date | null;
      sessionVersion: number | null;
    } | null>;
  } | undefined;
  organizations: {
    findUnique: (args: any) => Promise<{
      id?: string | null;
      ownerId: string | null;
      ownershipStatus?: string | null;
    } | null>;
  };
  staffMembers?: {
    findUnique: (args: any) => Promise<{
      organizationId: string;
      userId: string;
      types: string[] | null;
      roleId?: string | null;
    } | null>;
  } | undefined;
  organizationRoles?: {
    findFirst: (args: any) => Promise<{
      id: string;
      organizationId: string;
    } | null>;
  } | undefined;
  organizationRolePermissions?: {
    findFirst: (args: any) => Promise<{
      permission: string;
    } | null>;
  } | undefined;
  invites?: {
    findMany: (args: any) => Promise<Array<{
      organizationId: string | null;
      userId: string | null;
      type: string;
      status: string | null;
    }>>;
  } | undefined;
};

const hasRazumlyAdminAccess = async (
  session: SessionLike,
  client: OrganizationLookupClient,
): Promise<boolean> => {
  if (!client.authUser?.findUnique) {
    return false;
  }
  const status = await evaluateRazumlyAdminAccess(session.userId, {
    authUser: client.authUser,
  });
  return status.allowed;
};

const canUseRolePermissions = (client: OrganizationLookupClient): boolean => (
  Boolean(client.organizationRoles?.findFirst && client.organizationRolePermissions?.findFirst)
);

const hasLegacyStaffTypeAccess = (
  staffMember: { types?: unknown } | null | undefined,
  allowedTypes: readonly StaffMemberType[],
): boolean => (
  Boolean(staffMember)
  && hasStaffMemberType({ types: normalizeStaffMemberTypes(staffMember?.types) }, allowedTypes)
);

const isManagementTypeCheck = (allowedTypes: readonly StaffMemberType[]): boolean => (
  allowedTypes.includes('HOST') || allowedTypes.includes('STAFF')
);

export const hasOrgPermission = async (
  session: SessionLike,
  organization: OrganizationAccessRecord | null | undefined,
  permission: OrganizationPermission,
  client: OrganizationLookupClient = prisma,
): Promise<boolean> => {
  if (session.isAdmin) {
    return true;
  }
  if (!organization) {
    return false;
  }
  if (organization.ownerId === session.userId) {
    return true;
  }
  const organizationId = typeof organization.id === 'string' ? organization.id : null;
  if (!organizationId) {
    return false;
  }

  if (await hasRazumlyAdminAccess(session, client)) {
    return true;
  }

  const [staffMember, invites] = await Promise.all([
    client.staffMembers?.findUnique
      ? client.staffMembers.findUnique({
        where: {
          organizationId_userId: {
            organizationId,
            userId: session.userId,
          },
        },
        select: {
          organizationId: true,
          userId: true,
          types: true,
          roleId: true,
        },
      })
      : Promise.resolve(null),
    client.invites?.findMany
      ? client.invites.findMany({
        where: {
          organizationId,
          userId: session.userId,
          type: 'STAFF',
        },
        select: {
          organizationId: true,
          userId: true,
          type: true,
          status: true,
        },
      })
      : Promise.resolve([]),
  ]);

  if (!staffMember) {
    return false;
  }
  if (getBlockingStaffInvite(invites, organizationId, session.userId)) {
    return false;
  }

  const roleId = typeof staffMember.roleId === 'string' && staffMember.roleId.trim().length > 0
    ? staffMember.roleId
    : null;
  if (roleId && canUseRolePermissions(client)) {
    const role = await client.organizationRoles?.findFirst({
      where: {
        id: roleId,
        organizationId,
      },
      select: {
        id: true,
        organizationId: true,
      },
    });
    if (!role) {
      return false;
    }
    const rolePermission = await client.organizationRolePermissions?.findFirst({
      where: {
        organizationRoleId: role.id,
        permission,
      },
      select: {
        permission: true,
      },
    });
    return Boolean(rolePermission);
  }

  if (permission === ORG_PERMISSIONS.ORGANIZATION_MANAGE) {
    return hasLegacyStaffTypeAccess(staffMember, STAFF_ACCESS_TYPES);
  }

  return false;
};

export const hasOrganizationStaffAccess = async (
  session: SessionLike,
  organization: OrganizationAccessRecord | null | undefined,
  allowedTypes: readonly StaffMemberType[],
  client: OrganizationLookupClient = prisma,
): Promise<boolean> => {
  if (isManagementTypeCheck(allowedTypes)) {
    return hasOrgPermission(session, organization, ORG_PERMISSIONS.ORGANIZATION_MANAGE, client);
  }

  if (session.isAdmin) {
    return true;
  }
  if (!organization) {
    return false;
  }
  if (organization.ownerId === session.userId) {
    return true;
  }
  const organizationId = typeof organization.id === 'string' ? organization.id : null;
  if (!organizationId) {
    return false;
  }

  if (await hasRazumlyAdminAccess(session, client)) {
    return true;
  }

  const [staffMember, invites] = await Promise.all([
    client.staffMembers?.findUnique
      ? client.staffMembers.findUnique({
        where: {
          organizationId_userId: {
            organizationId,
            userId: session.userId,
          },
        },
        select: {
          organizationId: true,
          userId: true,
          types: true,
        },
      })
      : Promise.resolve(null),
    client.invites?.findMany
      ? client.invites.findMany({
        where: {
          organizationId,
          userId: session.userId,
          type: 'STAFF',
        },
        select: {
          organizationId: true,
          userId: true,
          type: true,
          status: true,
        },
      })
      : Promise.resolve([]),
  ]);

  if (!hasLegacyStaffTypeAccess(staffMember, allowedTypes)) {
    return false;
  }

  return !getBlockingStaffInvite(invites, organizationId, session.userId);
};

export const canManageOrganization = async (
  session: SessionLike,
  organization: OrganizationAccessRecord | null | undefined,
  client: OrganizationLookupClient = prisma,
): Promise<boolean> => hasOrgPermission(session, organization, ORG_PERMISSIONS.ORGANIZATION_MANAGE, client);

export const canOfficialOrganization = async (
  session: SessionLike,
  organization: OrganizationAccessRecord | null | undefined,
  client: OrganizationLookupClient = prisma,
): Promise<boolean> => hasOrganizationStaffAccess(session, organization, ['OFFICIAL'], client);

export const canManageEventDirectly = (
  session: SessionLike,
  event: EventAccessRecord | null | undefined,
): boolean => {
  if (session.isAdmin) {
    return true;
  }
  if (!event) {
    return false;
  }
  if (event.hostId === session.userId) {
    return true;
  }
  return normalizeIdList(event.assistantHostIds).includes(session.userId);
};

const hasVerifiedOrganizationAuthority = (
  organization: OrganizationAccessRecord,
): boolean => (
  organization.ownershipStatus?.trim().toUpperCase() === 'CLAIMED'
);

const loadEventOrganization = async (
  event: EventAccessRecord | null | undefined,
  client: OrganizationLookupClient,
): Promise<OrganizationAccessRecord | null> => {
  const organizationId = event?.organizationId ?? null;
  if (!organizationId) {
    return null;
  }
  return client.organizations.findUnique({
    where: { id: organizationId },
    select: { id: true, ownerId: true, ownershipStatus: true },
  });
};


type EffectiveOrganizationEventHosts = {
  eventHostId: string | null;
  viewerIsAssignedHost: boolean;
};

export const resolveEffectiveOrganizationEventHosts = async (
  session: SessionLike | null,
  event: EventAccessRecord,
  organization: OrganizationAccessRecord,
  client: OrganizationLookupClient = prisma,
): Promise<EffectiveOrganizationEventHosts> => {
  const organizationId = organization.id?.trim() || null;
  const ownerId = organization.ownerId?.trim() || null;
  const storedHostId = typeof event.hostId === 'string' ? event.hostId.trim() || null : null;
  const assignedIds = new Set([
    ...(storedHostId ? [storedHostId] : []),
    ...normalizeIdList(event.assistantHostIds),
  ]);
  const isEligibleHost = async (userId: string | null): Promise<boolean> => {
    if (!userId) return false;
    if (userId === ownerId) return true;
    if (!client.staffMembers?.findUnique || !organizationId) return false;
    const membership = await client.staffMembers.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { organizationId: true, userId: true, types: true, roleId: true },
    });
    return Boolean(
      membership
      && normalizeStaffMemberTypes(membership.types).includes('HOST'),
    );
  };
  const storedHostIsEligible = await isEligibleHost(storedHostId);
  const viewerId = session?.userId ?? null;
  const viewerIsAssignedHost = Boolean(
    viewerId
    && assignedIds.has(viewerId)
    && await isEligibleHost(viewerId),
  );
  return {
    eventHostId: storedHostIsEligible ? storedHostId : ownerId,
    viewerIsAssignedHost,
  };
};
export const canManageEvent = async (
  session: SessionLike,
  event: EventAccessRecord | null | undefined,
  client: OrganizationLookupClient = prisma,
): Promise<boolean> => {
  if (!event) {
    return false;
  }
  if (session.isAdmin) {
    return true;
  }
  if (!event.organizationId) {
    if (canManageEventDirectly(session, event)) {
      return true;
    }
    return hasRazumlyAdminAccess(session, client);
  }
  const organization = await loadEventOrganization(event, client);
  if (!organization || !hasVerifiedOrganizationAuthority(organization)) {
    return hasRazumlyAdminAccess(session, client);
  }
  const effectiveHosts = await resolveEffectiveOrganizationEventHosts(
    session,
    event,
    organization,
    client,
  );
  if (effectiveHosts.viewerIsAssignedHost) {
    return true;
  }
  return hasOrgPermission(session, organization, ORG_PERMISSIONS.EVENTS_MANAGE, client);
};

export type EventAuthorityCapabilities = {
  canEdit: boolean;
  canManageStaff: boolean;
  canDelegateHost: boolean;
  readOnly: boolean;
  readOnlyReason: 'AUTHENTICATION_REQUIRED' | 'MANAGEMENT_AUTHORITY_UNVERIFIED' | 'NOT_AUTHORIZED' | null;
  managementAuthority: {
    type: 'ORGANIZATION';
    organizationId: string;
    ownerUserId: string;
  } | null;
  eventHostId: string | null;
  viewerIsEventHost: boolean;
};

export const projectEventAuthorityCapabilities = async (
  session: SessionLike | null | undefined,
  event: EventAccessRecord | null | undefined,
  client: OrganizationLookupClient = prisma,
): Promise<EventAuthorityCapabilities> => {
  const organization = await loadEventOrganization(event, client);
  const hasVerifiedAuthority = Boolean(
    organization && hasVerifiedOrganizationAuthority(organization),
  );
  const organizationId = typeof organization?.id === 'string'
    ? organization.id
    : event?.organizationId ?? null;
  const ownerUserId = typeof organization?.ownerId === 'string'
    ? organization.ownerId
    : null;
  const storedHostId = typeof event?.hostId === 'string' && event.hostId.trim().length > 0
    ? event.hostId.trim()
    : null;
  const effectiveHosts = (
    event && organization && hasVerifiedAuthority
      ? await resolveEffectiveOrganizationEventHosts(session ?? null, event, organization, client)
      : null
  );
  const eventHostId = effectiveHosts?.eventHostId
    ?? (event?.organizationId ? null : storedHostId);
  const managementAuthority = (
    hasVerifiedAuthority && organizationId && ownerUserId
      ? {
          type: 'ORGANIZATION' as const,
          organizationId,
          ownerUserId,
        }
      : null
  );

  if (!session) {
    return {
      canEdit: false,
      canManageStaff: false,
      canDelegateHost: false,
      readOnly: true,
      readOnlyReason: organizationId && !hasVerifiedAuthority
        ? 'MANAGEMENT_AUTHORITY_UNVERIFIED'
        : 'AUTHENTICATION_REQUIRED',
      managementAuthority,
      eventHostId,
      viewerIsEventHost: false,
    };
  }

  const canEdit = await canManageEvent(session, event, client);
  const isDirectEventHost = effectiveHosts
    ? effectiveHosts.viewerIsAssignedHost
    : event?.hostId === session.userId
      || normalizeIdList(event?.assistantHostIds).includes(session.userId);
  const isAuthorityOwner = Boolean(
    hasVerifiedAuthority && ownerUserId === session.userId,
  );
  let canDelegateHost = false;
  if (organizationId && hasVerifiedAuthority && organization) {
    canDelegateHost = await hasOrgPermission(
      session,
      organization,
      ORG_PERMISSIONS.ORGANIZATION_MANAGE,
      client,
    );
  } else if (!organizationId && event?.hostId === session.userId) {
    canDelegateHost = true;
  } else {
    canDelegateHost = session.isAdmin || await hasRazumlyAdminAccess(session, client);
  }
  const readOnlyReason = canEdit
    ? null
    : organizationId && !hasVerifiedAuthority
      ? 'MANAGEMENT_AUTHORITY_UNVERIFIED'
      : 'NOT_AUTHORIZED';

  return {
    canEdit,
    canManageStaff: canEdit,
    canDelegateHost,
    readOnly: !canEdit,
    readOnlyReason,
    managementAuthority,
    eventHostId,
    viewerIsEventHost: Boolean(isDirectEventHost || isAuthorityOwner),
  };
};

