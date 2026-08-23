/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  organizations: {
    findUnique: jest.fn(),
  },
  organizationRoles: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  organizationRolePermissions: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  staffMembers: {
    findUnique: jest.fn(),
  },
  invites: {
    findMany: jest.fn(),
  },
  authUser: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

const requireSessionMock = jest.fn();
const hasOrgPermissionMock = jest.fn();
const hasDocumentEvidenceOwnerAccessMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/accessControl', () => ({
  hasOrgPermission: hasOrgPermissionMock,
  hasDocumentEvidenceOwnerAccess: hasDocumentEvidenceOwnerAccessMock,
}));
import { PATCH } from '@/app/api/organizations/[id]/roles/[roleId]/route';
import { POST as POST_ROLE } from '@/app/api/organizations/[id]/roles/route';

describe('/api/organizations/[id]/roles/[roleId]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    hasOrgPermissionMock.mockResolvedValue(true);
    hasDocumentEvidenceOwnerAccessMock.mockResolvedValue(true);
    requireSessionMock.mockResolvedValue({ userId: 'owner_1', isAdmin: false });
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: 'org_1',
      ownerId: 'owner_1',
    });
    prismaMock.staffMembers.findUnique.mockResolvedValue(null);
    prismaMock.invites.findMany.mockResolvedValue([]);
    prismaMock.authUser.findUnique.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation((callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock));
  });

  it('rejects changing a system role name', async () => {
    prismaMock.organizationRoles.findFirst.mockResolvedValue({
      id: 'role_host',
      organizationId: 'org_1',
      name: 'Host',
      isSystem: true,
    });

    const response = await PATCH(
      new NextRequest('http://localhost/api/organizations/org_1/roles/role_host', {
        method: 'PATCH',
        body: JSON.stringify({
          name: 'Lead Host',
        }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1', roleId: 'role_host' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('System role names cannot be changed.');
    expect(prismaMock.organizationRoles.update).not.toHaveBeenCalled();
  });

  it('replaces permissions for an organization role', async () => {
    prismaMock.organizationRoles.findFirst.mockResolvedValue({
      id: 'role_staff',
      organizationId: 'org_1',
      name: 'Staff',
      isSystem: false,
    });
    prismaMock.organizationRoles.findMany.mockResolvedValue([{
      id: 'role_staff',
      organizationId: 'org_1',
      name: 'Staff',
      kind: 'STAFF',
      systemKey: null,
      isSystem: false,
      isDefault: true,
    }]);
    prismaMock.organizationRolePermissions.findMany.mockResolvedValue([{
      organizationRoleId: 'role_staff',
      permission: 'organization.manage',
    }]);

    const response = await PATCH(
      new NextRequest('http://localhost/api/organizations/org_1/roles/role_staff', {
        method: 'PATCH',
        body: JSON.stringify({
          permissions: ['organization.manage', 'not-a-real-permission'],
        }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1', roleId: 'role_staff' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.role.permissions).toEqual(['organization.manage']);
    expect(prismaMock.organizationRolePermissions.deleteMany).toHaveBeenCalledWith({
      where: { organizationRoleId: 'role_staff' },
    });
    expect(prismaMock.organizationRolePermissions.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        organizationRoleId: 'role_staff',
        permission: 'organization.manage',
      })],
      skipDuplicates: true,
    }));
  });
  it('blocks non-owners from granting document void or audit permissions', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'manager_1', isAdmin: false });
    hasDocumentEvidenceOwnerAccessMock.mockResolvedValue(false);
    prismaMock.organizationRoles.findFirst.mockResolvedValue({
      id: 'role_staff',
      organizationId: 'org_1',
      name: 'Staff',
      isSystem: false,
    });

    const response = await PATCH(
      new NextRequest('http://localhost/api/organizations/org_1/roles/role_staff', {
        method: 'PATCH',
        body: JSON.stringify({
          permissions: [
            'documents.import',
            'documents.void',
            'documents.audit',
          ],
        }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1', roleId: 'role_staff' }) },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(expect.objectContaining({
      error: expect.stringContaining('Only the Organization owner'),
    }));
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
  it('blocks role creation from granting document void or audit permissions', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'manager_1', isAdmin: false });
    hasDocumentEvidenceOwnerAccessMock.mockResolvedValue(false);

    const response = await POST_ROLE(
      new NextRequest('http://localhost/api/organizations/org_1/roles', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Document reviewer',
          permissions: ['documents.audit'],
        }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1' }) },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(expect.objectContaining({
      error: expect.stringContaining('Only the Organization owner'),
    }));
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
  it('blocks non-owners from revoking document void or audit permissions', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'manager_1', isAdmin: false });
    hasDocumentEvidenceOwnerAccessMock.mockResolvedValue(false);
    prismaMock.organizationRoles.findFirst.mockResolvedValue({
      id: 'role_staff',
      organizationId: 'org_1',
      name: 'Staff',
      isSystem: false,
    });
    prismaMock.organizationRolePermissions.findMany.mockResolvedValue([
      { organizationRoleId: 'role_staff', permission: 'documents.void' },
    ]);

    const response = await PATCH(
      new NextRequest('http://localhost/api/organizations/org_1/roles/role_staff', {
        method: 'PATCH',
        body: JSON.stringify({ permissions: ['documents.import'] }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1', roleId: 'role_staff' }) },
    );

    expect(response.status).toBe(403);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('ignores official scheduling permission because scheduling is type-based', async () => {
    prismaMock.organizationRoles.findFirst.mockResolvedValue({
      id: 'role_staff',
      organizationId: 'org_1',
      name: 'Staff',
      isSystem: false,
    });
    prismaMock.organizationRoles.findMany.mockResolvedValue([{
      id: 'role_staff',
      organizationId: 'org_1',
      name: 'Staff',
      kind: 'STAFF',
      systemKey: null,
      isSystem: false,
      isDefault: true,
    }]);
    prismaMock.organizationRolePermissions.findMany.mockResolvedValue([]);

    const response = await PATCH(
      new NextRequest('http://localhost/api/organizations/org_1/roles/role_staff', {
        method: 'PATCH',
        body: JSON.stringify({
          permissions: ['officials.schedule'],
        }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'org_1', roleId: 'role_staff' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.role.permissions).toEqual([]);
    expect(prismaMock.organizationRolePermissions.createMany).not.toHaveBeenCalled();
  });
});
