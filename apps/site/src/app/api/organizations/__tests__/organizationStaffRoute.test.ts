/** @jest-environment node */

import { NextRequest } from "next/server";

const prismaMock = {
  organizations: {
    findUnique: jest.fn(),
  },
  events: {
    findFirst: jest.fn(),
  },
  staffMembers: {
    findUnique: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
  organizationRoles: {
    findFirst: jest.fn(),
  },
  organizationRolePermissions: {
    findMany: jest.fn(),
  },
  invites: {
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const requireSessionMock = jest.fn();
const hasOrgPermissionMock = jest.fn();
const hasDocumentEvidenceOwnerAccessMock = jest.fn();


jest.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
jest.mock("@/lib/permissions", () => ({ requireSession: requireSessionMock }));
jest.mock("@/server/accessControl", () => ({
  hasOrgPermission: (...args: unknown[]) => hasOrgPermissionMock(...args),
  hasDocumentEvidenceOwnerAccess: (...args: unknown[]) => hasDocumentEvidenceOwnerAccessMock(...args),
}));

import { DELETE, PATCH } from "@/app/api/organizations/[id]/staff/route";

describe("/api/organizations/[id]/staff", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: "owner_1", isAdmin: false });
    hasDocumentEvidenceOwnerAccessMock.mockResolvedValue(true);
    prismaMock.organizationRolePermissions.findMany.mockResolvedValue([]);
    hasOrgPermissionMock.mockResolvedValue(true);
    prismaMock.organizations.findUnique.mockResolvedValue({
      id: "org_1",
      ownerId: "owner_1",
    });
    prismaMock.events.findFirst.mockResolvedValue(null);
    prismaMock.staffMembers.findUnique.mockResolvedValue({
      id: "staff_1",
      organizationId: "org_1",
      userId: "user_1",
      types: ["STAFF"],
      roleId: null,
    });
  });

  it("rejects assigning a role that does not belong to the organization", async () => {
    prismaMock.organizationRoles.findFirst.mockResolvedValue(null);

    const response = await PATCH(
      new NextRequest("http://localhost/api/organizations/org_1/staff", {
        method: "PATCH",
        body: JSON.stringify({
          userId: "user_1",
          roleId: "role_other_org",
        }),
        headers: { "content-type": "application/json" },
      }),

      { params: Promise.resolve({ id: "org_1" }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe("Role not found");
    expect(prismaMock.staffMembers.update).not.toHaveBeenCalled();
  });
  it("requires role-management permission for explicit role assignment", async () => {
    hasOrgPermissionMock.mockImplementation(async (
      _session: unknown,
      _organization: unknown,
      permission: string,
    ) => permission !== "roles.manage");

    const response = await PATCH(
      new NextRequest("http://localhost/api/organizations/org_1/staff", {
        method: "PATCH",
        body: JSON.stringify({
          userId: "user_1",
          roleId: "role_staff",
        }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "org_1" }) },
    );

    expect(response.status).toBe(403);
    expect(prismaMock.organizationRoles.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.staffMembers.update).not.toHaveBeenCalled();
  });

  it("updates the staff member role and derives the staff type from the selected role", async () => {
    prismaMock.organizationRoles.findFirst.mockResolvedValue({
      id: "role_official",
      name: "Official",
      kind: "OFFICIAL",
      systemKey: "OFFICIAL",
    });
    prismaMock.staffMembers.update.mockResolvedValue({
      id: "staff_1",
      organizationId: "org_1",
      userId: "user_1",
      types: ["OFFICIAL"],
      roleId: "role_official",
    });

    const response = await PATCH(
      new NextRequest("http://localhost/api/organizations/org_1/staff", {
        method: "PATCH",
        body: JSON.stringify({
          userId: "user_1",
          roleId: "role_official",
        }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "org_1" }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.staffMember.roleId).toBe("role_official");
    expect(prismaMock.organizationRoles.findFirst).toHaveBeenCalledWith({
      where: {
        id: "role_official",
        organizationId: "org_1",
      },
      select: {
        id: true,
        name: true,
        kind: true,
        systemKey: true,
      },
    });
    expect(prismaMock.staffMembers.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "staff_1" },
        data: expect.objectContaining({
          types: ["OFFICIAL"],
          roleId: "role_official",
        }),
      }),
    );
  });

  it("rejects removing the Host role while the member retains delegated Event authority", async () => {
    prismaMock.organizationRoles.findFirst.mockResolvedValue({
      id: "role_official",
      name: "Official",
      kind: "OFFICIAL",
      systemKey: "OFFICIAL",
    });
    prismaMock.events.findFirst.mockResolvedValue({ id: "event_1" });

    const response = await PATCH(
      new NextRequest("http://localhost/api/organizations/org_1/staff", {
        method: "PATCH",
        body: JSON.stringify({ userId: "user_1", roleId: "role_official" }),
      }),
      { params: Promise.resolve({ id: "org_1" }) },
    );

    expect(response.status).toBe(409);
    expect(prismaMock.staffMembers.update).not.toHaveBeenCalled();
  });

  it("rejects deleting a Host member while the member retains delegated Event authority", async () => {
    prismaMock.events.findFirst.mockResolvedValue({ id: "event_1" });

    const response = await DELETE(
      new NextRequest("http://localhost/api/organizations/org_1/staff", {
        method: "DELETE",
        body: JSON.stringify({ userId: "user_1" }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "org_1" }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toBe(
      "Assign a replacement Event Host before removing this Organization Host.",
    );
    expect(prismaMock.staffMembers.deleteMany).not.toHaveBeenCalled();
  });
  it("blocks a protected document permission grant during role assignment", async () => {
    hasDocumentEvidenceOwnerAccessMock.mockResolvedValue(false);
    prismaMock.organizationRoles.findFirst.mockResolvedValue({
      id: "role_auditor",
      name: "Auditor",
      kind: "STAFF",
      systemKey: null,
    });
    prismaMock.organizationRolePermissions.findMany.mockResolvedValue([
      { permission: "documents.audit" },
    ]);

    const response = await PATCH(
      new NextRequest("http://localhost/api/organizations/org_1/staff", {
        method: "PATCH",
        body: JSON.stringify({ userId: "user_1", roleId: "role_auditor" }),
      }),
      { params: Promise.resolve({ id: "org_1" }) },
    );

    expect(response.status).toBe(403);
    expect(prismaMock.staffMembers.update).not.toHaveBeenCalled();
  });

  it("blocks revoking a protected document permission during staff deletion", async () => {
    hasDocumentEvidenceOwnerAccessMock.mockResolvedValue(false);
    prismaMock.staffMembers.findUnique.mockResolvedValue({
      roleId: "role_auditor",
    });
    prismaMock.organizationRolePermissions.findMany.mockResolvedValue([
      { permission: "documents.audit" },
    ]);

    const response = await DELETE(
      new NextRequest("http://localhost/api/organizations/org_1/staff", {
        method: "DELETE",
        body: JSON.stringify({ userId: "user_1" }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "org_1" }) },
    );

    expect(response.status).toBe(403);
    expect(prismaMock.staffMembers.deleteMany).not.toHaveBeenCalled();
  });

});
