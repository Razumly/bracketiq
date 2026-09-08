import type { Organization, UserData } from "@/types";
import {
  IMPORTED_DOCUMENT_VIEW_PERMISSIONS,
  ORG_PERMISSIONS,
  type OrganizationPermission,
} from "@/lib/organizationPermissions";
import { getNextRentalOccurrence } from "@/app/discover/utils/rentals";
import { buildOrganizationTabs } from "./organizationTabs";
import { resolveOrganizationEventCreationState } from "./organizationEventCreation";

function permissionFlags(
  canManageOrganization: boolean,
  permissions: string[],
) {
  const hasPermission = (permission: OrganizationPermission) =>
    canManageOrganization || permissions.includes(permission);
  const canManageEvents = hasPermission(ORG_PERMISSIONS.EVENTS_MANAGE);
  const canManageTeams = hasPermission(ORG_PERMISSIONS.TEAMS_MANAGE);
  const canManageProducts = hasPermission(ORG_PERMISSIONS.PRODUCTS_MANAGE);
  const canManageStaff = hasPermission(ORG_PERMISSIONS.STAFF_MANAGE);
  const canManageRoles = hasPermission(ORG_PERMISSIONS.ROLES_MANAGE);
  const canManageFinance =
    hasPermission(ORG_PERMISSIONS.BILLING_MANAGE) ||
    hasPermission(ORG_PERMISSIONS.PAYMENTS_MANAGE);
  return {
    canManageEvents,
    canManageTeams,
    canManageProducts,
    canManageStaff,
    canManageRoles,
    canManageFinance,
    canManageFields: hasPermission(ORG_PERMISSIONS.FIELDS_MANAGE),
    canManageStaffSurface: canManageStaff || canManageRoles,
    canManageStaffCompensation:
      canManageStaff && hasPermission(ORG_PERMISSIONS.BILLING_MANAGE),
    canManageDiscounts:
      canManageEvents ||
      canManageProducts ||
      canManageTeams ||
      canManageFinance,
    canManageRefunds: hasPermission(ORG_PERMISSIONS.REFUNDS_MANAGE),
    canManageTemplates: hasPermission(ORG_PERMISSIONS.TEMPLATES_MANAGE),
    canImportDocuments: hasPermission(ORG_PERMISSIONS.DOCUMENTS_IMPORT),
    canVoidDocuments: hasPermission(ORG_PERMISSIONS.DOCUMENTS_VOID),
    canViewDocumentAudit: permissions.includes(
      ORG_PERMISSIONS.DOCUMENTS_AUDIT_VIEW,
    ),
    canViewImportedDocuments:
      IMPORTED_DOCUMENT_VIEW_PERMISSIONS.some(hasPermission),
    canManagePublicPage: hasPermission(ORG_PERMISSIONS.ORGANIZATION_MANAGE),
  };
}

function isOwner(
  org: Organization | null,
  user: UserData | null,
  canManageOrganization: boolean,
) {
  if (canManageOrganization) return true;
  if (!org || !user) return false;
  return user.$id === org.ownerId;
}

function isRoleMember(
  org: Organization | null,
  user: UserData | null,
  owner: boolean,
) {
  if (owner) return true;
  if (!org || !user) return false;
  return (org.staffMembers ?? []).some(
    (member) => member.userId === user.$id && !member.invite,
  );
}

function isHomePage(org: Organization | null, user: UserData | null) {
  if (!org || !user?.homePageOrganizationId) return false;
  return user.homePageOrganizationId === org.$id;
}

function organizationMembership(
  org: Organization | null,
  user: UserData | null,
  canManageOrganization: boolean,
) {
  const owner = isOwner(org, user, canManageOrganization);
  const isOrganizationRoleMember = isRoleMember(org, user, owner);
  const isCurrentOrganizationHomePage = isHomePage(org, user);
  return {
    isOwner: owner,
    isOrganizationRoleMember,
    isCurrentOrganizationHomePage,
    canToggleHomePagePreference:
      isOrganizationRoleMember || isCurrentOrganizationHomePage,
  };
}

const hasItems = (value: unknown): boolean =>
  Array.isArray(value) && value.length > 0;

function organizationFeatures(org: Organization | null) {
  const fields = Array.isArray(org?.fields) ? org.fields : [];
  const referenceDate = new Date();
  const organizationFieldCount = fields.filter(
    (field) => typeof field?.$id === "string" && field.$id.trim().length > 0,
  ).length;
  return {
    organizationFieldCount,
    hasTeams: hasItems(org?.teams),
    hasEvents: hasItems(org?.events),
    hasProducts: hasItems(org?.products),
    hasDivisions: hasItems(org?.divisions),
    hasResources: organizationFieldCount > 0,
    hasRentals: fields.some(
      (field) =>
        Array.isArray(field.rentalSlots) &&
        field.rentalSlots.some((slot) =>
          Boolean(getNextRentalOccurrence(slot, referenceDate)),
        ),
    ),
  };
}

export function getOrganizationAccess(
  organization: Organization | null | undefined,
  user: UserData | null,
) {
  const org = organization ?? null;
  const canManageOrganization = Boolean(org?.viewerCanManageOrganization);
  const permissions = Array.isArray(org?.viewerPermissions)
    ? org.viewerPermissions
    : [];
  const flags = permissionFlags(canManageOrganization, permissions);
  const membership = organizationMembership(org, user, canManageOrganization);
  const features = organizationFeatures(org);
  return {
    ...flags,
    ...membership,
    ...resolveOrganizationEventCreationState({
      canManageEvents: flags.canManageEvents,
      organizationFieldCount: features.organizationFieldCount,
    }),
    availableTabs: buildOrganizationTabs({
      ...flags,
      ...membership,
      ...features,
      canManageStaff: flags.canManageStaffSurface,
      enabledFeatures: org?.enabledFeatures,
      viewerCanAccessUsers: org?.viewerCanAccessUsers,
    }),
  };
}
