import type { Prisma } from '@/generated/prisma/client';
import { expireTeamInvitations } from './teamInvitationState';
import { teamInvitationLabel } from './teamInvitationLabel';

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
  const [latest, players] = await Promise.all([client.invites.findMany({
    where: { type: 'TEAM', supersededAt: null, OR: scopes }, distinct: ['teamId', 'userId'],
    orderBy: [{ createdAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }], select: { id: true, teamId: true, userId: true, status: true, linkExpiresAt: true, dateOfBirth: true, isMinor: true },
  }), client.userData.findMany({ where: { id: { in: [...new Set(scopes.map(scope => scope.userId))] } },
    select: { id: true, dateOfBirth: true } })]);
  const birthdays = new Map(players.map(player => [player.id, player.dateOfBirth]));
  const byPlayer = new Map(latest.map((invite) => [`${invite.teamId}:${invite.userId}`, invite]));
  return teams.map((team) => ({ ...team, playerRegistrations: registrationsFor(team).map((registration) => {
    const invite = byPlayer.get(`${team.id}:${registration.userId}`);
    return !invite ? registration : { ...registration, invitationId: invite.id,
      invitationLabel: teamInvitationLabel(invite, birthdays.get(registration.userId)) };
  }) }));
};
