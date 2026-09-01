import {
  deriveOrganizationRoleIds,
  deriveStaffInviteTypes,
  getBlockingStaffInvite,
  getTeamInviteRole,
  normalizeStaffMemberTypes,
  normalizeTeamInviteRole,
} from '@/lib/staff';

describe('staff helpers', () => {
  it('normalizes and dedupes staff member types', () => {
    expect(normalizeStaffMemberTypes(['host', 'HOST', 'official', 'invalid'])).toEqual(['HOST', 'OFFICIAL']);
  });

  it('blocks active org role derivation when a staff invite is pending', () => {
    const staffMembers = [
      { organizationId: 'org_1', userId: 'user_host', types: ['HOST'] },
      { organizationId: 'org_1', userId: 'user_staff', types: ['STAFF'] },
      { organizationId: 'org_1', userId: 'user_ref', types: ['OFFICIAL'] },
    ];
    const invites = [
      { organizationId: 'org_1', userId: 'user_staff', type: 'STAFF', status: 'PENDING' },
      { organizationId: 'org_1', userId: 'user_ref', type: 'STAFF', status: 'DECLINED' },
    ];

    expect(getBlockingStaffInvite(invites, 'org_1', 'user_staff')).toBe('PENDING');
    expect(getBlockingStaffInvite(invites, 'org_1', 'user_ref')).toBe('DECLINED');
    expect(deriveOrganizationRoleIds(staffMembers, invites, 'HOST')).toEqual(['user_host']);
    expect(deriveOrganizationRoleIds(staffMembers, invites, 'OFFICIAL')).toEqual([]);
  });

  it('falls back to legacy single-type invites when staffTypes are absent', () => {
    expect(deriveStaffInviteTypes({ staffTypes: [] }, 'host')).toEqual(['HOST']);
    expect(deriveStaffInviteTypes({ staffTypes: ['staff', 'official'] }, 'host')).toEqual(['STAFF', 'OFFICIAL']);
  });

  it('prefers explicit team invite roles and falls back to legacy invite types', () => {
    expect(normalizeTeamInviteRole('team_assistant_coach')).toBe('team_assistant_coach');
    expect(getTeamInviteRole('player', 'TEAM_MANAGER')).toBe('player');
    expect(getTeamInviteRole(null, 'TEAM_MANAGER')).toBe('team_manager');
    expect(getTeamInviteRole(null, 'TEAM')).toBeNull();
  });
});
