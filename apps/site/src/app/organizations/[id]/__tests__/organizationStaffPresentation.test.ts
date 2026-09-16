/** @jest-environment jsdom */

import type { Invite, Organization, StaffMember, UserData } from "@/types";
import { getOrganizationStaffPresentation } from "../organizationStaffPresentation";

const owner = {
  $id: "owner-1",
  firstName: "Casey",
  lastName: "Morgan",
} as UserData;
const member = {
  $id: "staff-1",
  userId: "user-1",
  types: ["STAFF"],
  user: { $id: "user-1", firstName: "Alex", lastName: "Green" },
} as StaffMember;

it("keeps name order after a role update returns staff in a different order", () => {
  const jordan: StaffMember = {
    ...member, $id: "staff-2", userId: "user-2",
    user: { ...member.user!, $id: "user-2", firstName: "Jordan", lastName: "Smith" },
  };
  const sameName: StaffMember = { ...member, $id: "staff-3", userId: "user-3" };
  const org = {
    $id: "org-1", ownerId: owner.$id, owner,
    staffMembers: [jordan, sameName, member],
  } as Organization;
  const ids = (value: Organization) => getOrganizationStaffPresentation(value, null)
    .staffRosterEntries.map((entry) => entry.id);
  const expected = [owner.$id, member.$id, sameName.$id, jordan.$id];
  expect(ids(org)).toEqual(expected);
  expect(ids({ ...org, staffMembers: [sameName, { ...jordan, roleId: "official-role", types: ["OFFICIAL"] }, member] })).toEqual(expected);
  expect(org.staffMembers?.map((entry) => entry.$id)).toEqual([jordan.$id, sameName.$id, member.$id]);
});

it("keeps the owner locked and removes duplicate staff and invitation entries", () => {
  const org = {
    $id: "org-1",
    ownerId: owner.$id,
    owner,
    staffMembers: [{ ...member, userId: owner.$id }, member, member],
    staffInvites: [
      { $id: "invite-duplicate", userId: member.userId },
      {
        $id: "invite-1",
        userId: "user-2",
        firstName: "Jordan",
        lastName: "Smith",
        status: "DECLINED",
        staffTypes: ["OFFICIAL"],
      },
    ] as Invite[],
  } as Organization;
  expect(
    getOrganizationStaffPresentation(org, null).staffRosterEntries,
  ).toMatchObject([
    {
      id: owner.$id,
      fullName: "Casey Morgan",
      canRemove: false,
      locked: true,
      roleName: "Owner",
    },
    {
      id: member.$id,
      userId: member.userId,
      fullName: "Alex Green",
      status: "active",
    },
    {
      id: "invite-1",
      fullName: "Jordan Smith",
      status: "declined",
      types: ["OFFICIAL"],
    },
  ]);
});

it("uses hydrated roles and contact data while reporting hidden identities explicitly", () => {
  const org = {
    $id: "org-1",
    ownerId: owner.$id,
    owner,
    staffMembers: [
      {
        ...member,
        roleId: "role-1",
        user: { ...member.user, isIdentityHidden: true },
        invite: { status: "PENDING", email: "invite@test.com" },
      },
    ],
    staffRoles: [{ $id: "role-1", name: "Scheduler" }],
    staffEmailsByUserId: { [member.userId]: "staff@test.com" },
    hosts: [member.user, owner],
  } as Organization;
  const model = getOrganizationStaffPresentation(org, null);
  expect(model.staffRosterEntries[1]).toMatchObject({
    fullName: "Staff name unavailable",
    roleId: "role-1",
    roleName: "Scheduler",
    email: "staff@test.com",
    status: "pending",
  });
  expect(model.staffRosterNameError).toBe(
    "Staff names could not be loaded. Refresh and try again.",
  );
  expect(model.eventHostOptions).toEqual([
    { value: member.userId, label: "Alex Green" },
    { value: owner.$id, label: "Casey Morgan" },
  ]);
});
