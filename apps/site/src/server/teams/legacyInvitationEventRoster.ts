import type { Events, Invites, Prisma } from '@/generated/prisma/client';
import { acquireEventLock } from '@/server/repositories/locks';
import { buildEventRegistrationId } from '@/server/events/eventRegistrations';
import { serializeEventRegistrationSnapshot } from '@/server/teams/teamInviteEventSync';

function isHistorical(event: Pick<Events, 'archivedAt' | 'end'>) {
  return Boolean(event.archivedAt || (event.end && event.end <= new Date()));
}

/** Preserve historical snapshots and prepare only the Event named by the invitation. */
export async function prepareLegacyInvitationEventRoster(tx: Prisma.TransactionClient, invite: Invites, profileId: string) {
  if (!invite.eventId || !invite.teamId) return;
  await acquireEventLock(tx, invite.eventId);
  const event = await tx.events.findUnique({ where: { id: invite.eventId }, select: { end: true, state: true, archivedAt: true } });
  if (!event) throw new Error(`Resolve the Event for invitation ${invite.id}.`);
  if (isHistorical(event)) return;
  const registrationId = buildEventRegistrationId({ eventId: invite.eventId, registrantType: 'SELF', registrantId: profileId });
  const registration = await tx.eventRegistrations.findUnique({ where: { id: registrationId } });
  const snapshots = await tx.teams.findMany({ where: { eventId: invite.eventId, parentTeamId: invite.teamId } });
  for (const snapshot of snapshots) {
    const hadUser = snapshot.playerIds.includes(profileId);
    const hadPending = snapshot.pending.includes(profileId);
    if (!hadUser && !hadPending) {
      await tx.teams.update({ where: { id: snapshot.id }, data: { pending: [...snapshot.pending, profileId] } });
    }
    await tx.teamInviteEventSyncs.upsert({
      where: { inviteId_eventTeamId_userId: { inviteId: invite.id, eventTeamId: snapshot.id, userId: profileId } },
      create: {
        id: `legacy-invite:${invite.id}:${snapshot.id}`, inviteId: invite.id, canonicalTeamId: invite.teamId,
        eventId: invite.eventId, eventTeamId: snapshot.id, userId: profileId,
        eventTeamHadUser: hadUser, eventTeamHadPendingUser: hadPending, status: 'PENDING',
        registrationId, previousRegistrationSnapshot: serializeEventRegistrationSnapshot(registration) ?? undefined,
      },
      update: {},
    });
  }
}
