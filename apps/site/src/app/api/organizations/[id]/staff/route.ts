import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { getStaffMemberTypesForOrganizationRole, normalizeStaffMemberTypes } from '@/lib/staff';
import {
  ORG_PERMISSIONS,
  RESTRICTED_DOCUMENT_PERMISSION_ERROR,
  RESTRICTED_DOCUMENT_PERMISSIONS,
} from '@/lib/organizationPermissions';
import { hasDocumentEvidenceOwnerAccess, hasOrgPermission } from '@/server/accessControl';
import {
  acquireOrganizationStaffAssignmentLock,
  acquireOrganizationStaffMemberLock,
} from '@/server/repositories/locks';
import {
  orderOrganizationRoleIdsForLock,
  resolveDefaultOrganizationRoleIdForStaffTypes,
} from '@/server/organizationRoles';


export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  userId: z.string(),
  types: z.array(z.string()).optional(),
  roleId: z.string().nullable().optional(),
}).passthrough();

const deleteSchema = z.object({
  userId: z.string(),
}).passthrough();
class RestrictedDocumentPermissionConflict extends Error {}


export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const org = await prisma.organizations.findUnique({
    where: { id },
    select: { id: true, ownerId: true },
  });
  if (!org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }
  if (!(await hasOrgPermission(session, org, ORG_PERMISSIONS.STAFF_MANAGE))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const hasExplicitRoleSelection = Object.prototype.hasOwnProperty.call(parsed.data, 'roleId');
  if (
    hasExplicitRoleSelection
    && !(await hasOrgPermission(session, org, ORG_PERMISSIONS.ROLES_MANAGE))
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }


  if (!Object.prototype.hasOwnProperty.call(parsed.data, 'types')
    && !Object.prototype.hasOwnProperty.call(parsed.data, 'roleId')) {
    return NextResponse.json({ error: 'At least one staff field is required' }, { status: 400 });
  }

  const existing = await prisma.staffMembers.findUnique({
    where: {
      organizationId_userId: {
        organizationId: id,
        userId: parsed.data.userId,
      },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
  }

  const data: Record<string, unknown> = {
    updatedAt: new Date(),
  };
  let nextTypes = normalizeStaffMemberTypes(existing.types);
  if (Object.prototype.hasOwnProperty.call(parsed.data, 'types')) {
    nextTypes = normalizeStaffMemberTypes(parsed.data.types);
    if (!nextTypes.length) {
      return NextResponse.json({ error: 'At least one staff type is required' }, { status: 400 });
    }
    data.types = nextTypes;
  }

  if (typeof parsed.data.roleId === 'string') {
    const role = await prisma.organizationRoles.findFirst({
      where: {
        id: parsed.data.roleId,
        organizationId: id,
      },
      select: {
        id: true,
        name: true,
        kind: true,
        systemKey: true,
      },
    });
    if (!role) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }
    nextTypes = getStaffMemberTypesForOrganizationRole(role);
    data.types = nextTypes;
    data.roleId = role.id;
  } else if (parsed.data.roleId === null) {
    data.roleId = await resolveDefaultOrganizationRoleIdForStaffTypes(prisma, id, nextTypes);
  } else if (!existing.roleId && Object.prototype.hasOwnProperty.call(parsed.data, 'types')) {
    data.roleId = await resolveDefaultOrganizationRoleIdForStaffTypes(prisma, id, nextTypes);
  }


  if (parsed.data.userId !== org.ownerId && !nextTypes.includes('HOST')) {
    const delegatedEvent = await prisma.events.findFirst({
      where: {
        organizationId: id,
        OR: [
          { hostId: parsed.data.userId },
          { assistantHostIds: { has: parsed.data.userId } },
        ],
      },
      select: { id: true },
    });
    if (delegatedEvent) {
      return NextResponse.json(
        { error: 'Assign a replacement Event Host before removing this Organization Host role.' },
        { status: 409 },
      );
    }
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      await acquireOrganizationStaffAssignmentLock(tx, id);
      await acquireOrganizationStaffMemberLock(tx, id, parsed.data.userId);
      const lockedStaffMember = await tx.staffMembers.update({
        where: { id: existing.id },
        data: { updatedAt: new Date() },
        select: { roleId: true },
      });
      const nextRoleId = Object.prototype.hasOwnProperty.call(data, 'roleId')
        ? (typeof data.roleId === 'string' || data.roleId === null
          ? data.roleId
          : lockedStaffMember.roleId)
        : lockedStaffMember.roleId;
      const roleIds = nextRoleId !== lockedStaffMember.roleId
        ? Array.from(new Set(
          [lockedStaffMember.roleId, nextRoleId]
            .filter((roleId): roleId is string => typeof roleId === 'string' && roleId.length > 0),
        ))
        : [];
      const orderedRoleIds = await orderOrganizationRoleIdsForLock(tx, roleIds);
      for (const roleId of orderedRoleIds) {
        await tx.organizationRoles.update({
          where: { id: roleId },
          data: { updatedAt: new Date() },
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
          && !(await hasDocumentEvidenceOwnerAccess(session, org, tx))
        ) {
          throw new RestrictedDocumentPermissionConflict(RESTRICTED_DOCUMENT_PERMISSION_ERROR);
        }
      }
      return tx.staffMembers.update({
        where: { id: existing.id },
        data,
      });
    });

    return NextResponse.json({ staffMember: updated }, { status: 200 });
  } catch (error) {
    if (error instanceof RestrictedDocumentPermissionConflict) {
      return NextResponse.json(
        { error: RESTRICTED_DOCUMENT_PERMISSION_ERROR },
        { status: 403 },
      );
    }
    throw error;
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const org = await prisma.organizations.findUnique({
    where: { id },
    select: { id: true, ownerId: true },
  });
  if (!org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }
  if (!(await hasOrgPermission(session, org, ORG_PERMISSIONS.STAFF_MANAGE))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const existing = await prisma.staffMembers.findUnique({
    where: {
      organizationId_userId: {
        organizationId: id,
        userId: parsed.data.userId,
      },
    },
    select: { id: true, roleId: true },
  });
  const canManageRestrictedDocumentPermissions = existing?.roleId
    ? await hasDocumentEvidenceOwnerAccess(session, org)
    : false;
  if (existing?.roleId) {
    const restrictedPermissions = await prisma.organizationRolePermissions.findMany({
      where: {
        organizationRoleId: existing.roleId,
        permission: { in: RESTRICTED_DOCUMENT_PERMISSIONS },
      },
      select: { permission: true },
    });
    if (
      restrictedPermissions.length > 0
      && !canManageRestrictedDocumentPermissions
    ) {
      return NextResponse.json(
        { error: RESTRICTED_DOCUMENT_PERMISSION_ERROR },
        { status: 403 },
      );
    }
  }


  if (parsed.data.userId !== org.ownerId) {
    const delegatedEvent = await prisma.events.findFirst({
      where: {
        organizationId: id,
        OR: [
          { hostId: parsed.data.userId },
          { assistantHostIds: { has: parsed.data.userId } },
        ],
      },
      select: { id: true },
    });
    if (delegatedEvent) {
      return NextResponse.json(
        { error: 'Assign a replacement Event Host before removing this Organization Host.' },
        { status: 409 },
      );
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      await acquireOrganizationStaffAssignmentLock(tx, id);
      await acquireOrganizationStaffMemberLock(tx, id, parsed.data.userId);
      const currentStaffMember = await tx.staffMembers.findUnique({
        where: {
          organizationId_userId: {
            organizationId: id,
            userId: parsed.data.userId,
          },
        },
        select: { id: true, roleId: true },
      });
      const lockedStaffMember = currentStaffMember?.id
        ? await tx.staffMembers.update({
          where: { id: currentStaffMember.id },
          data: { updatedAt: new Date() },
          select: { roleId: true },
        })
        : null;
      if (lockedStaffMember?.roleId) {
        const orderedRoleIds = await orderOrganizationRoleIdsForLock(tx, [lockedStaffMember.roleId]);
        for (const roleId of orderedRoleIds) {
          await tx.organizationRoles.update({
            where: { id: roleId },
            data: { updatedAt: new Date() },
          });
        }
        const restrictedPermissions = await tx.organizationRolePermissions.findMany({
          where: {
            organizationRoleId: { in: orderedRoleIds },
            permission: { in: RESTRICTED_DOCUMENT_PERMISSIONS },
          },
          select: { permission: true },
        });
        if (
          restrictedPermissions.length > 0
          && !(await hasDocumentEvidenceOwnerAccess(session, org, tx))
        ) {
          throw new RestrictedDocumentPermissionConflict(RESTRICTED_DOCUMENT_PERMISSION_ERROR);
        }
      }
      await tx.staffMembers.deleteMany({
        where: {
          organizationId: id,
          userId: parsed.data.userId,
        },
      });
      await tx.invites.deleteMany({
        where: {
          organizationId: id,
          userId: parsed.data.userId,
          type: 'STAFF',
        },
      });
    });
  } catch (error) {
    if (error instanceof RestrictedDocumentPermissionConflict) {
      return NextResponse.json(
        { error: RESTRICTED_DOCUMENT_PERMISSION_ERROR },
        { status: 403 },
      );
    }
    throw error;
  }

  return NextResponse.json({ deleted: true }, { status: 200 });
}
