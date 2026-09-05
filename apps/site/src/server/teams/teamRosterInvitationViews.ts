import type { Prisma } from '@/generated/prisma/client';
import { expireTeamInvitations } from './teamInvitationState';

type RosterView = Record<string, unknown>;
const registrationsFor = (team: RosterView): Array<{ userId: string; status: string }> => (
  Array.isArray(team.playerRegistrations) ? team.playerRegistrations.filter((row): row is { userId: string; status: string } => (
    row && typeof row === 'object' && typeof row.userId === 'string' && typeof row.status === 'string'
  )) : []
);

// The caller must apply roster visibility before it requests this view.
export const withRosterInvitationViews = async <T extends RosterView>(client: Prisma.TransactionClient, teams: T[]): Promise<T[]> => {
  const scopes = teams.filter((team) => typeof team.id === 'string').flatMap((team) => registrationsFor(team)
    .filter((registration) => registration.status === 'INVITED')
    .map((registration) => ({ teamId: String(team.id), userId: registration.userId })));
  if (!scopes.length) return teams;
  await expireTeamInvitations(client, { OR: scopes });
  const latest = await client.invites.findMany({
    where: { type: 'TEAM', supersededAt: null, OR: scopes }, distinct: ['teamId', 'userId'],
    orderBy: [{ createdAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }], select: { id: true, teamId: true, userId: true, status: true },
  });
  const byPlayer = new Map(latest.map((invite) => [`${invite.teamId}:${invite.userId}`, invite]));
  return teams.map((team) => ({ ...team, playerRegistrations: registrationsFor(team).map((registration) => {
    const invite = byPlayer.get(`${team.id}:${registration.userId}`);
    return !invite ? registration : { ...registration, invitationId: invite.id,
      invitationLabel: invite.status === 'EXPIRED' ? 'Invitation expired' : `Invitation ${String(invite.status ?? 'pending').toLowerCase()}` };
  }) }));
};
