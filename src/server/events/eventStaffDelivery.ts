import { prisma } from '@/lib/prisma';
import { sendInviteEmails } from '@/server/inviteEmails';
import { acquireEventLock } from '@/server/repositories/locks';

type InviteDeliveryCandidate = Parameters<typeof sendInviteEmails>[0][number];

export type EventStaffEmailDelivery = 'NOT_REQUESTED' | 'QUEUED' | 'FAILED';

/** Deliver already-committed staff invites without turning delivery into a save rollback. */
export const deliverEventStaffInvitesAfterCommit = async (
  eventId: string,
  candidates: InviteDeliveryCandidate[],
  requestOrigin: string,
): Promise<EventStaffEmailDelivery> => {
  if (candidates.length === 0) return 'NOT_REQUESTED';
  try {
    await sendInviteEmails(candidates, requestOrigin);
    return 'QUEUED';
  } catch (error) {
    console.error('Event staff invite delivery failed after commit', { eventId, error });
    try {
      await prisma.$transaction(async (tx) => {
        await acquireEventLock(tx, eventId);
        await tx.invites.updateMany({
          where: {
            id: { in: candidates.map((invite) => invite.id) },
            eventId,
            type: 'STAFF',
            status: 'PENDING',
          },
          data: {
            status: 'FAILED',
            sentAt: null,
            updatedAt: new Date(),
          },
        });
      });
    } catch (persistError) {
      console.error('Failed to mark undelivered event staff invites retryable', {
        eventId,
        persistError,
      });
    }
    return 'FAILED';
  }
};
