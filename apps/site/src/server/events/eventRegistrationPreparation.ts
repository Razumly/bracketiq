import type { Prisma } from '@/generated/prisma/client';
import type { EventRegistrationScope } from '@/lib/contracts/eventRegistrationDraft';
import { acquireEventLock } from '@/server/repositories/locks';
import { serializeEventRegistrationSnapshot } from '@/server/teams/teamInviteEventSync';
import { buildEventRegistrationId } from './eventRegistrations';
import { readRegistrationDraft, RegistrationDraftError } from './eventRegistrationDrafts';

export async function prepareEventPlayer(
  client: Prisma.TransactionClient,
  scope: EventRegistrationScope,
  invitation: { id: string; teamId: string | null; userId: string | null; createdBy: string | null },
  now: Date,
) {
  const { teamId, userId, createdBy: accountId } = invitation;
  if (!teamId || !userId || !accountId) throw new RegistrationDraftError('Player preparation needs a Team and Account.', 400);
  await acquireEventLock(client, scope.eventId);
  const state = await readRegistrationDraft({ ...scope, accountId }, client);
  if (!state.available) throw new RegistrationDraftError(state.unavailableReason!, 409, state);
  if (!state.eligibleTeams.some((team) => team.id === teamId)) throw new RegistrationDraftError('You cannot register this Team for this Event.', 403, state);
  const eventTeams = await client.teams.findMany({ where: {
    eventId: scope.eventId, parentTeamId: teamId, archivedAt: null,
  } });
  if (!eventTeams.length) return;
  const source = await client.teamRegistrations.findUnique({ where: { teamId_userId: { teamId, userId } } });
  if (!source) throw new RegistrationDraftError('The saved Player roster entry is missing.', 409);
  const registrationId = buildEventRegistrationId({
    eventId: scope.eventId, registrantType: 'SELF', registrantId: userId,
    slotId: scope.slotId, occurrenceDate: scope.occurrenceDate,
  });
  for (const eventTeam of eventTeams) {
    const existing = await client.eventRegistrations.findUnique({ where: { id: registrationId } });
    if (existing?.eventTeamId && existing.eventTeamId !== eventTeam.id && existing.status !== 'CANCELLED') {
      throw new RegistrationDraftError('This Player already has a roster entry on another Team in this Event.', 409);
    }
    const hadPlayer = eventTeam.playerIds.includes(userId);
    if (hadPlayer) continue;
    await client.teamInviteEventSyncs.upsert({
      where: { inviteId_eventTeamId_userId: { inviteId: invitation.id, eventTeamId: eventTeam.id, userId } },
      create: {
        id: `${invitation.id}:${eventTeam.id}:${userId}`, inviteId: invitation.id, canonicalTeamId: teamId,
        eventId: scope.eventId, eventTeamId: eventTeam.id, userId, sourceTeamRegistrationId: source.id,
        registrationId,
        previousRegistrationSnapshot: serializeEventRegistrationSnapshot(existing) ?? undefined,
        eventTeamHadUser: false, eventTeamHadPendingUser: eventTeam.pending.includes(userId),
        status: 'PENDING', createdAt: now, updatedAt: now,
      },
      update: {},
    });
    await client.eventRegistrations.upsert({
      where: { id: registrationId },
      create: {
        id: registrationId, eventId: scope.eventId, registrantId: userId, registrantType: 'SELF',
        parentId: teamId, eventTeamId: eventTeam.id, sourceTeamRegistrationId: source.id,
        rosterRole: 'PARTICIPANT', status: 'PENDING', createdBy: accountId,
        slotId: scope.slotId || null, occurrenceDate: scope.occurrenceDate || null,
        divisionId: eventTeam.division, createdAt: now, updatedAt: now,
      },
      update: { eventTeamId: eventTeam.id, sourceTeamRegistrationId: source.id, parentId: teamId,
        rosterRole: 'PARTICIPANT', status: 'PENDING', acceptedAt: null, updatedAt: now },
    });
    await client.teams.update({ where: { id: eventTeam.id }, data: {
      pending: [...new Set([...eventTeam.pending, userId])],
      playerRegistrationIds: [...new Set([...eventTeam.playerRegistrationIds, registrationId])], updatedAt: now,
    } });
  }
}
