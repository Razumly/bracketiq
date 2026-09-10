import type { Prisma } from '@/generated/prisma/client';
import { readRosterDocumentReadiness } from '@/server/events/rosterDocumentReadiness';
import { readByIdChunks } from '@/server/documentEvidence';
import { serializeMatchRoster } from './teamCheckIns';

// One read serves both Teams. Invitation records are not part of this response.
export async function readOperationalMatchRosters(
  client: Prisma.TransactionClient,
  event: { id: string; organizationId: string | null; start: Date | null; requiredTemplateIds: string[] },
  matchId: string,
  teamIds: string[],
) {
  const [teams, registrations, overrides, templates] = await Promise.all([
    client.teams.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true, playerIds: true, pending: true } }),
    client.eventRegistrations.findMany({
      where: { eventId: event.id, eventTeamId: { in: teamIds }, registrantType: { in: ['SELF', 'CHILD'] }, rosterRole: 'PARTICIPANT' },
      select: { eventTeamId: true, registrantId: true, status: true },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
    }),
    client.matchRosterEntries.findMany({
      where: { eventId: event.id, matchId, eventTeamId: { in: teamIds } },
      orderBy: [{ source: 'asc' }, { createdAt: 'asc' }],
    }),
    client.templateDocuments.findMany({
      where: { id: { in: event.requiredTemplateIds } },
      select: { id: true, title: true, type: true, signOnce: true, requiredSignerType: true },
    }),
  ]);
  if (teamIds.some((id) => !teams.some((team) => team.id === id && team.name.trim()))) {
    throw new Response('A match Team is missing its roster or name.', { status: 409 });
  }
  if (event.requiredTemplateIds.some((id) => !templates.some((template) => template.id === id))) {
    throw new Response('A required Document Template Version is unavailable.', { status: 409 });
  }
  const latest = new Map<string, typeof registrations[number]>();
  for (const row of registrations) {
    const key = `${row.eventTeamId}:${row.registrantId}`;
    if (!latest.has(key)) latest.set(key, row);
  }
  const playersByTeam = new Map(teams.map((team) => {
    const ids = new Set([...team.playerIds, ...team.pending,
      ...registrations.filter((row) => row.eventTeamId === team.id).map((row) => row.registrantId)]);
    for (const id of ids) {
      if (['CANCELLED', 'PAYMENT_FAILED'].includes(latest.get(`${team.id}:${id}`)?.status ?? '')) ids.delete(id);
    }
    return [team.id, ids] as const;
  }));
  const userIds = [...new Set([...playersByTeam.values()].flatMap((ids) => [...ids])
    .concat(overrides.flatMap((row) => row.userId ? [row.userId] : [])))];
  const users = await readByIdChunks(userIds, (ids) => client.userData.findMany({
    where: { id: { in: ids } },
    select: { id: true, firstName: true, lastName: true, userName: true, dateOfBirth: true },
  }));
  if (userIds.some((id) => !users.some((user) => user.id === id))) {
    throw new Response('A roster Player profile is unavailable.', { status: 409 });
  }
  const readiness = await readRosterDocumentReadiness(client, event, users, templates);
  return teamIds.map((eventTeamId) => {
    const roster = serializeMatchRoster(eventTeamId, users.filter((user) => playersByTeam.get(eventTeamId)?.has(user.id)),
      overrides.filter((row) => row.eventTeamId === eventTeamId));
    return { ...roster, teamName: teams.find((team) => team.id === eventTeamId)!.name, entries: roster.entries.map((entry) => ({
      ...entry,
      // Contact details belong to Team management, not match operations.
      email: null,
      documentReadiness: entry.userId ? readiness.get(entry.userId) ?? null : null,
    })) };
  });
}
