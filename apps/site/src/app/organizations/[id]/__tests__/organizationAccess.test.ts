/** @jest-environment jsdom */

import type { Organization, UserData } from "@/types";
import { ORG_PERMISSIONS } from "@/lib/organizationPermissions";
import { getOrganizationAccess } from "../organizationAccess";

const organization = (values: Partial<Organization>): Organization =>
  ({ $id: "org-1", ...values }) as Organization;
const user = (values: Partial<UserData>): UserData =>
  ({ $id: "user-1", ...values }) as UserData;

describe("Organization access decisions", () => {
  it("keeps document audit permission explicit even for Organization managers", () => {
    const org = organization({ viewerCanManageOrganization: true });
    expect(getOrganizationAccess(org, null)).toMatchObject({
      canManageEvents: true,
      canManageFields: true,
      canImportDocuments: true,
      canManageFinance: true,
      canManageStaffCompensation: true,
      canViewDocumentAudit: false,
    });
    expect(
      getOrganizationAccess(
        { ...org, viewerPermissions: [ORG_PERMISSIONS.DOCUMENTS_AUDIT_VIEW] },
        null,
      ).canViewDocumentAudit,
    ).toBe(true);
  });

  it("allows role administration without granting staff compensation or unrelated operations", () => {
    const access = getOrganizationAccess(
      organization({ viewerPermissions: [ORG_PERMISSIONS.ROLES_MANAGE] }),
      user({}),
    );
    expect(access).toMatchObject({
      canManageRoles: true,
      canManageStaffSurface: true,
      canManageStaff: false,
      canManageStaffCompensation: false,
      canManageFinance: false,
      canManageEvents: false,
    });
    expect(access.availableTabs.some((tab) => tab.value === "staff")).toBe(
      true,
    );
    expect(access.availableTabs.some((tab) => tab.value === "finance")).toBe(
      false,
    );
  });

  it("requires event permission but permits event creation before resources exist", () => {
    const org = organization({
      viewerPermissions: [ORG_PERMISSIONS.EVENTS_MANAGE],
      fields: [],
    });
    expect(getOrganizationAccess(org, null).canCreateOrganizationEvents).toBe(
      true,
    );
    expect(
      getOrganizationAccess({ ...org, viewerPermissions: [] }, null)
        .canCreateOrganizationEvents,
    ).toBe(false);
  });

  it("distinguishes accepted membership from invitations and permits clearing a former home Organization", () => {
    const org = organization({
      staffMembers: [
        { userId: "user-1", invite: true },
      ] as Organization["staffMembers"],
    });
    expect(
      getOrganizationAccess(org, user({})).canToggleHomePagePreference,
    ).toBe(false);
    expect(
      getOrganizationAccess(org, user({ homePageOrganizationId: "org-1" })),
    ).toMatchObject({
      isOrganizationRoleMember: false,
      isCurrentOrganizationHomePage: true,
      canToggleHomePagePreference: true,
    });
    expect(
      getOrganizationAccess(
        {
          ...org,
          staffMembers: [
            { userId: "user-1", invite: false },
          ] as Organization["staffMembers"],
        },
        user({}),
      ).isOrganizationRoleMember,
    ).toBe(true);
  });
});
