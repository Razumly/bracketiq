import type { Invite, Organization, StaffMember, UserData } from "@/types";
import type { RoleRosterEntry } from "./RoleRosterManager";

const NAME_UNAVAILABLE = "Staff name unavailable";

function staffDisplayName(user: Partial<UserData> | undefined): string {
  if (user?.isIdentityHidden) return NAME_UNAVAILABLE;
  const first =
    typeof user?.firstName === "string" ? user.firstName.trim() : "";
  const last = typeof user?.lastName === "string" ? user.lastName.trim() : "";
  return first && last ? `${first} ${last}` : NAME_UNAVAILABLE;
}

function organizationOwner(org: Organization, viewer: UserData | null) {
  if (org.owner?.$id) return org.owner;
  if (org.ownerId && viewer?.$id === org.ownerId) return viewer;
  return null;
}

function ownerEntry(
  org: Organization,
  viewer: UserData | null,
): RoleRosterEntry | null {
  const owner = organizationOwner(org, viewer);
  const userId = owner?.$id ?? org.ownerId;
  if (!userId) return null;
  return {
    id: userId,
    userId,
    fullName: owner ? staffDisplayName(owner) : NAME_UNAVAILABLE,
    userName: owner?.userName || null,
    email: org.staffEmailsByUserId?.[userId] ?? null,
    user: owner,
    status: "active",
    subtitle: "Owner",
    types: ["HOST"],
    roleId: null,
    roleName: "Owner",
    canRemove: false,
    locked: true,
  };
}

function staffIdentity(member: StaffMember, org: Organization) {
  return {
    fullName: staffDisplayName(member.user),
    userName: member.user?.userName || null,
    email:
      org.staffEmailsByUserId?.[member.userId] ?? member.invite?.email ?? null,
    user: member.user ?? null,
  };
}

function memberEntry(member: StaffMember, org: Organization): RoleRosterEntry {
  return {
    id: member.$id,
    staffMemberId: member.$id,
    userId: member.userId,
    ...staffIdentity(member, org),
    status:
      member.invite?.status === "DECLINED"
        ? "declined"
        : member.invite
          ? "pending"
          : "active",
    subtitle: undefined,
    types: member.types,
    roleId: member.roleId ?? null,
    roleName:
      member.role?.name ??
      org.staffRoles?.find((role) => role.$id === member.roleId)?.name ??
      null,
    canRemove: true,
  };
}

function inviteEntry(invite: Invite, userId: string): RoleRosterEntry {
  return {
    id: invite.$id,
    userId,
    fullName:
      `${String(invite.firstName ?? "").trim()} ${String(invite.lastName ?? "").trim()}`.trim() ||
      NAME_UNAVAILABLE,
    userName: null,
    email: invite.email ?? null,
    user: null,
    status: invite.status === "DECLINED" ? "declined" : "pending",
    subtitle: undefined,
    types: invite.staffTypes ?? ["HOST"],
    roleId: null,
    roleName: "Pending",
    canRemove: true,
  };
}

function buildRoster(
  org: Organization,
  viewer: UserData | null,
): RoleRosterEntry[] {
  const owner = ownerEntry(org, viewer);
  const entries: RoleRosterEntry[] = owner ? [owner] : [];
  const seen = new Set(entries.map((entry) => entry.userId));
  const shouldInclude = (userId: string | null | undefined): userId is string =>
    Boolean(userId && !seen.has(userId) && userId !== org.ownerId);
  const members = Array.isArray(org.staffMembers) ? org.staffMembers : [];
  members.forEach((member) => {
    if (!shouldInclude(member.userId)) return;
    seen.add(member.userId);
    entries.push(memberEntry(member, org));
  });
  const invites = Array.isArray(org.staffInvites) ? org.staffInvites : [];
  invites.forEach((invite) => {
    if (!shouldInclude(invite.userId)) return;
    seen.add(invite.userId);
    entries.push(inviteEntry(invite, invite.userId));
  });
  return entries.sort((left, right) =>
    Number(right.id === owner?.id) - Number(left.id === owner?.id)
    || left.fullName.localeCompare(right.fullName, undefined, { sensitivity: "base" })
    || left.id.localeCompare(right.id),
  );
}

function hostLabels(org: Organization, viewer: UserData | null) {
  const labels = new Map<string, string>();
  if (org.owner?.$id) {
    labels.set(org.owner.$id, `${staffDisplayName(org.owner)} (Owner)`);
  } else if (org.ownerId) {
    labels.set(org.ownerId, `${NAME_UNAVAILABLE} (Owner)`);
  }
  (org.hosts ?? []).forEach((host) => {
    if (host?.$id) labels.set(host.$id, staffDisplayName(host));
  });
  if (viewer?.$id && !labels.has(viewer.$id))
    labels.set(viewer.$id, staffDisplayName(viewer));
  return labels;
}

function buildHostOptions(org: Organization, viewer: UserData | null) {
  const ids = new Set<string>();
  if (typeof org.ownerId === "string" && org.ownerId.length > 0)
    ids.add(org.ownerId);
  const hosts = Array.isArray(org.hosts) ? org.hosts : [];
  hosts.forEach((host) => {
    if (typeof host?.$id === "string" && host.$id.length > 0) ids.add(host.$id);
  });
  const labels = hostLabels(org, viewer);
  return Array.from(ids)
    .map((value) => ({ value, label: labels.get(value) ?? NAME_UNAVAILABLE }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function getOrganizationStaffPresentation(
  org: Organization | undefined,
  viewer: UserData | null,
) {
  const staffRosterEntries = org ? buildRoster(org, viewer) : [];
  const hasMissingNames = staffRosterEntries.some(
    (entry) => Boolean(entry.userId) && entry.fullName === NAME_UNAVAILABLE,
  );
  return {
    staffRosterEntries,
    staffRosterNameError: hasMissingNames
      ? "Staff names could not be loaded. Refresh and try again."
      : null,
    eventHostOptions: org ? buildHostOptions(org, viewer) : [],
    currentOfficials: org?.officials ?? [],
  };
}
