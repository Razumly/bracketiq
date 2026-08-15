import type { Prisma } from '@/generated/prisma/client';
import { collectOrganizationHostIds, normalizeEntityId } from '@/lib/organizationEventAccess';
import { projectEventAuthorityCapabilities } from '@/server/accessControl';

export type EventHostDelegationActor = {
  userId: string;
  isAdmin: boolean;
};

export type EventHostDelegationEvent = {
  id: string;
  hostId: string | null;
  assistantHostIds?: string[] | null;
  organizationId?: string | null;
};

export class EventHostDelegationError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'EVENT_HOST_REPLACEMENT_REQUIRED'
      | 'EVENT_HOST_DELEGATION_FORBIDDEN'
      | 'EVENT_HOST_NOT_FOUND'
      | 'EVENT_HOST_NOT_ELIGIBLE'
      | 'MANAGEMENT_AUTHORITY_UNVERIFIED',
    readonly status: number,
  ) {
    super(message);
    this.name = 'EventHostDelegationError';
  }
}

export const assertEventHostTransition = async ({
  client,
  actor,
  event,
  nextHostId: nextHostIdInput,
}: {
  client: Prisma.TransactionClient;
  actor: EventHostDelegationActor;
  event: EventHostDelegationEvent;
  nextHostId: string | null | undefined;
}): Promise<string | null> => {
  const currentHostId = normalizeEntityId(event.hostId);
  const nextHostId = normalizeEntityId(nextHostIdInput);
  const capabilities = await projectEventAuthorityCapabilities(actor, event, client);
  if (!capabilities.canDelegateHost) {
    throw new EventHostDelegationError(
      'Only the verified Organization Management Authority can delegate Event Host responsibility.',
      'EVENT_HOST_DELEGATION_FORBIDDEN',
      403,
    );
  }
  if (currentHostId === nextHostId) {
    return nextHostId;
  }
  if (!nextHostId) {
    throw new EventHostDelegationError(
      'Assign another eligible Event Host in the same change before removing the current host.',
      'EVENT_HOST_REPLACEMENT_REQUIRED',
      409,
    );
  }

  const hostUser = await client.authUser.findUnique({
    where: { id: nextHostId },
    select: { id: true, disabledAt: true },
  });
  if (!hostUser || hostUser.disabledAt) {
    throw new EventHostDelegationError(
      'The selected Event Host account was not found.',
      'EVENT_HOST_NOT_FOUND',
      404,
    );
  }

  const organizationId = normalizeEntityId(event.organizationId);
  if (!organizationId) {
    return nextHostId;
  }

  const [organization, staffMembers, staffInvites] = await Promise.all([
    client.organizations.findUnique({
      where: { id: organizationId },
      select: { id: true, ownerId: true, ownershipStatus: true },
    }),
    client.staffMembers.findMany({
      where: { organizationId },
      select: { organizationId: true, userId: true, types: true },
    }),
    client.invites.findMany({
      where: { organizationId, type: 'STAFF' },
      select: {
        organizationId: true,
        userId: true,
        type: true,
        status: true,
      },
    }),
  ]);
  if (!organization || organization.ownershipStatus !== 'CLAIMED') {
    throw new EventHostDelegationError(
      'Verify the Organization Management Authority before delegating its Event Host.',
      'MANAGEMENT_AUTHORITY_UNVERIFIED',
      409,
    );
  }

  const eligibleHostIds = collectOrganizationHostIds({
    ownerId: organization.ownerId,
    staffMembers,
    staffInvites,
  });
  if (!eligibleHostIds.includes(nextHostId)) {
    throw new EventHostDelegationError(
      'Organization Events can only be delegated to the owner or an active Organization Host.',
      'EVENT_HOST_NOT_ELIGIBLE',
      400,
    );
  }
  return nextHostId;
};
