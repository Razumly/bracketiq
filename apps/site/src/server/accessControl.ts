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
    findMany?: (args: any) => Promise<Array<{
      permission: string;
    }>>;
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

const loadStaffMembership = (organizationId: string, userId: string, client: OrganizationLookupClient) =>
  client.staffMembers?.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { organizationId: true, userId: true, types: true, roleId: true },
  }) ?? Promise.resolve(null);

const loadStaffInvites = (organizationId: string, userId: string, client: OrganizationLookupClient) =>
  client.invites?.findMany({
    where: { organizationId, userId, type: 'STAFF' },
    select: { organizationId: true, userId: true, type: true, status: true },
  }) ?? Promise.resolve([]);

const hasRolePermission = async (
  roleId: string,
  organizationId: string,
  requestedPermissions: OrganizationPermission[],
  client: OrganizationLookupClient,
): Promise<boolean> => {
  const role = await client.organizationRoles?.findFirst({
    where: { id: roleId, organizationId },
    select: { id: true, organizationId: true },
  });
  if (!role) return false;
  if (client.organizationRolePermissions?.findMany) {
    const permissions = await client.organizationRolePermissions.findMany({
      where: { organizationRoleId: role.id, permission: { in: requestedPermissions } },
      select: { permission: true },
    });
    return permissions.length > 0;
  }
  for (const permission of requestedPermissions) {
    const allowed = await client.organizationRolePermissions?.findFirst({
      where: { organizationRoleId: role.id, permission },
      select: { permission: true },
    });
    if (allowed) return true;
  }
  return false;
};

const nonBlankId = (value: unknown): string | null =>
  typeof value === 'string' ? value.trim() || null : null;

const hasStaffPermissions = async (
  session: SessionLike,
  organizationId: string,
  requestedPermissions: OrganizationPermission[],
  client: OrganizationLookupClient,
): Promise<boolean> => {
  const [staffMember, invites] = await Promise.all([
    loadStaffMembership(organizationId, session.userId, client),
    loadStaffInvites(organizationId, session.userId, client),
  ]);

  if (!staffMember) {
    return false;
  }
  if (getBlockingStaffInvite(invites, organizationId, session.userId)) {
    return false;
  }

  const roleId = nonBlankId(staffMember.roleId);
  if (roleId && canUseRolePermissions(client)) {
    return hasRolePermission(staffMember.roleId!, organizationId, requestedPermissions, client);
  }
  return requestedPermissions.includes(ORG_PERMISSIONS.ORGANIZATION_MANAGE)
    && hasLegacyStaffTypeAccess(staffMember, STAFF_ACCESS_TYPES);
};

const hasOrganizationPermissions = async (
  session: SessionLike,
  organization: OrganizationAccessRecord | null | undefined,
  permissions: readonly OrganizationPermission[],
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
  const requestedPermissions = Array.from(new Set(permissions));
  if (requestedPermissions.length === 0) {
    return false;
  }
  const organizationId = typeof organization.id === 'string' ? organization.id : null;
  if (!organizationId) {
    return false;
  }

  if (await hasRazumlyAdminAccess(session, client)) {
    return true;
  }

  return hasStaffPermissions(session, organizationId, requestedPermissions, client);
};

export const hasOrgPermission = async (
  session: SessionLike,
  organization: OrganizationAccessRecord | null | undefined,
  permission: OrganizationPermission,
  client: OrganizationLookupClient = prisma,
): Promise<boolean> => hasOrganizationPermissions(session, organization, [permission], client);

export const hasAnyOrgPermission = async (
  session: SessionLike,
  organization: OrganizationAccessRecord | null | undefined,
  permissions: readonly OrganizationPermission[],
  client: OrganizationLookupClient = prisma,
): Promise<boolean> => hasOrganizationPermissions(session, organization, permissions, client);
export const hasDocumentEvidenceOwnerAccess = async (
  session: SessionLike,
  organization: OrganizationAccessRecord | null | undefined,
  client: OrganizationLookupClient = prisma,
): Promise<boolean> => {
  if (session.isAdmin || !organization) {
    return Boolean(session.isAdmin);
  }
  if (organization.ownerId === session.userId) {
    return true;
  }
  if (await hasRazumlyAdminAccess(session, client)) {
    return true;
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
    loadStaffMembership(organizationId, session.userId, client),
    loadStaffInvites(organizationId, session.userId, client),
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
  const organizationId = nonBlankId(organization.id);
  const ownerId = nonBlankId(organization.ownerId);
  const storedHostId = nonBlankId(event.hostId);
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
  organizationOwnershipStatus?: string | null;
  viewerUserId?: string | null;
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

const authorityOrganizationId = (
  event: EventAccessRecord | null | undefined,
  organization: OrganizationAccessRecord | null,
): string | null => typeof organization?.id === 'string' ? organization.id : event?.organizationId ?? null;

const managementAuthorityFor = (
  verified: boolean,
  organizationId: string | null,
  ownerUserId: string | null,
): EventAuthorityCapabilities['managementAuthority'] =>
  verified && organizationId && ownerUserId
    ? { type: 'ORGANIZATION', organizationId, ownerUserId }
    : null;

const verifiedEventHosts = async (
  session: SessionLike | null | undefined,
  event: EventAccessRecord | null | undefined,
  organization: OrganizationAccessRecord | null,
  client: OrganizationLookupClient,
): Promise<EffectiveOrganizationEventHosts | null> => {
  if (!event || !organization || !hasVerifiedOrganizationAuthority(organization)) return null;
  return resolveEffectiveOrganizationEventHosts(session ?? null, event, organization, client);
};

const projectedEventHostId = (
  event: EventAccessRecord | null | undefined,
  hosts: EffectiveOrganizationEventHosts | null,
): string | null => hosts?.eventHostId ?? (event?.organizationId ? null : nonBlankId(event?.hostId));

const loadAuthorityContext = async (
  session: SessionLike | null | undefined,
  event: EventAccessRecord | null | undefined,
  client: OrganizationLookupClient,
) => {
  const organization = await loadEventOrganization(event, client);
  const organizationId = authorityOrganizationId(event, organization);
  const ownerUserId = typeof organization?.ownerId === 'string' ? organization.ownerId : null;
  const hasVerifiedAuthority = Boolean(organization && hasVerifiedOrganizationAuthority(organization));
  const effectiveHosts = await verifiedEventHosts(session, event, organization, client);
  return {
    organization,
    organizationId,
    ownerUserId,
    hasVerifiedAuthority,
    effectiveHosts,
    organizationOwnershipStatus: organization?.ownershipStatus ?? null,
    managementAuthority: managementAuthorityFor(hasVerifiedAuthority, organizationId, ownerUserId),
    eventHostId: projectedEventHostId(event, effectiveHosts),
  };
};

type AuthorityContext = Awaited<ReturnType<typeof loadAuthorityContext>>;

const canDelegateEventHost = async (
  session: SessionLike,
  event: EventAccessRecord | null | undefined,
  context: AuthorityContext,
  client: OrganizationLookupClient,
): Promise<boolean> => {
  if (context.organizationId && context.hasVerifiedAuthority && context.organization) {
    return hasOrgPermission(session, context.organization, ORG_PERMISSIONS.ORGANIZATION_MANAGE, client);
  }
  if (!context.organizationId && event?.hostId === session.userId) return true;
  return session.isAdmin || await hasRazumlyAdminAccess(session, client);
};

const viewerIsEventHost = (
  session: SessionLike | null | undefined,
  event: EventAccessRecord | null | undefined,
  context: AuthorityContext,
): boolean => {
  if (!session) return false;
  const directHost = context.effectiveHosts
    ? context.effectiveHosts.viewerIsAssignedHost
    : event?.hostId === session.userId || normalizeIdList(event?.assistantHostIds).includes(session.userId);
  return directHost || (context.hasVerifiedAuthority && context.ownerUserId === session.userId);
};

const authorityRestriction = (
  canEdit: boolean,
  authenticated: boolean,
  context: AuthorityContext,
): EventAuthorityCapabilities['readOnlyReason'] => {
  if (canEdit) return null;
  if (context.organizationId && !context.hasVerifiedAuthority) return 'MANAGEMENT_AUTHORITY_UNVERIFIED';
  return authenticated ? 'NOT_AUTHORIZED' : 'AUTHENTICATION_REQUIRED';
};

export const projectEventAuthorityCapabilities = async (
  session: SessionLike | null | undefined,
  event: EventAccessRecord | null | undefined,
  client: OrganizationLookupClient = prisma,
): Promise<EventAuthorityCapabilities> => {
  const context = await loadAuthorityContext(session, event, client);
  const canEdit = session ? await canManageEvent(session, event, client) : false;
  return {
    viewerUserId: session?.userId ?? null,
    organizationOwnershipStatus: context.organizationOwnershipStatus,
    canEdit,
    canManageStaff: canEdit,
    canDelegateHost: session ? await canDelegateEventHost(session, event, context, client) : false,
    readOnly: !canEdit,
    readOnlyReason: authorityRestriction(canEdit, Boolean(session), context),
    managementAuthority: context.managementAuthority,
    eventHostId: context.eventHostId,
    viewerIsEventHost: viewerIsEventHost(session, event, context),
  };
};
