import { normalizeOptionalName } from '@/lib/nameCase';
import { canManageOrganization } from '@/server/accessControl';
import { loadCanonicalTeamById, normalizeId, normalizeIdList } from '@/server/teams/teamMembership';

export type InviteSession = { userId: string; isAdmin: boolean };

export class MemberInviteRouteError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'MemberInviteRouteError';
  }
}

export const normalizeOptionalContact = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
};

const hasOrganizationTeamManagementAccess = async (
  teamId: string,
  session: InviteSession,
  client: Parameters<typeof loadCanonicalTeamById>[1],
): Promise<boolean> => {
  const organizationDelegate = (client as unknown as {
    organizations?: { findUnique?: (args: unknown) => Promise<unknown> };
  })?.organizations;
  if (!organizationDelegate?.findUnique) return false;
  const team = await (client as unknown as {
    canonicalTeams?: { findUnique?: (args: unknown) => Promise<unknown> };
  })?.canonicalTeams?.findUnique?.({
    where: { id: teamId },
    select: { organizationId: true },
  });
  const organizationId = normalizeId(
    team && typeof team === 'object' && 'organizationId' in team
      ? team.organizationId
      : null,
  );
  if (!organizationId) return false;
  const organization = await organizationDelegate.findUnique({
    where: { id: organizationId },
    select: { id: true, ownerId: true },
  });
  const organizationRecord = organization && typeof organization === 'object'
    ? {
      id: 'id' in organization && typeof organization.id === 'string' ? organization.id : organizationId,
      ownerId: 'ownerId' in organization && typeof organization.ownerId === 'string'
        ? organization.ownerId
        : null,
    }
    : null;
  return canManageOrganization(session, organizationRecord, client);
};

export const canManageTeamInvites = async (
  teamId: string,
  session: InviteSession,
  client: Parameters<typeof loadCanonicalTeamById>[1],
): Promise<boolean> => {
  if (session.isAdmin) return true;
  const team = await loadCanonicalTeamById(teamId, client);
  if (!team) return false;
  const teamRecord = team as unknown as Record<string, unknown>;
  const staffAssignments = Array.isArray(teamRecord.staffAssignments)
    ? teamRecord.staffAssignments
    : [];
  const isCaptain = normalizeId(teamRecord.captainId) === session.userId;
  const isManager = normalizeId(teamRecord.managerId) === session.userId
    || staffAssignments.some((row) => {
      if (!row || typeof row !== 'object') return false;
      const assignment = row as Record<string, unknown>;
      return assignment.userId === session.userId
        && assignment.status === 'ACTIVE'
        && String(assignment.role ?? '').toUpperCase() === 'MANAGER';
    });
  const isCoach = normalizeId(teamRecord.headCoachId) === session.userId
    || normalizeIdList(teamRecord.coachIds).includes(session.userId);
  return isCaptain || isManager || isCoach
    || hasOrganizationTeamManagementAccess(teamId, session, client);
};

export const assertEditableAccountlessTeamPlayer = (invite: unknown): Record<string, unknown> => {
  if (!invite || typeof invite !== 'object') {
    throw new MemberInviteRouteError(404, 'Invite not found');
  }
  const record = invite as Record<string, unknown>;
  const status = String(record.status ?? 'PENDING').toUpperCase();
  if (
    String(record.type ?? '').toUpperCase() !== 'TEAM'
    || String(record.role ?? '').toLowerCase() !== 'player'
    || record.isAssigned !== true
    || record.userId
    || !['PENDING', 'SENT'].includes(status)
  ) {
    throw new MemberInviteRouteError(409, 'Only pending accountless player invites can be managed');
  }
  return record;
};

export const normalizedName = (value: unknown): string | null => normalizeOptionalName(value);
