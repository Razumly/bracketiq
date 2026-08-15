/** @jest-environment node */

import type { Prisma } from '@/generated/prisma/client';

const projectEventAuthorityCapabilitiesMock = jest.fn();

jest.mock('@/server/accessControl', () => ({
  projectEventAuthorityCapabilities: (...args: unknown[]) => (
    projectEventAuthorityCapabilitiesMock(...args)
  ),
}));

import { assertEventHostTransition } from '../eventHostDelegation';

const clientMock = {
  authUser: {
    findUnique: jest.fn(),
  },
  organizations: {
    findUnique: jest.fn(),
  },
  staffMembers: {
    findMany: jest.fn(),
  },
  invites: {
    findMany: jest.fn(),
  },
};
// The policy needs only this transaction-client subset; every used delegate is mocked above.
const transactionClient = clientMock as unknown as Prisma.TransactionClient;

const actor = { userId: 'owner_1', isAdmin: false };
const event = {
  id: 'event_1',
  hostId: 'host_1',
  assistantHostIds: [],
  organizationId: 'org_1',
};

beforeEach(() => {
  jest.clearAllMocks();
  projectEventAuthorityCapabilitiesMock.mockResolvedValue({
    canDelegateHost: true,
  });
  clientMock.authUser.findUnique.mockResolvedValue({ id: 'host_2' });
  clientMock.organizations.findUnique.mockResolvedValue({
    id: 'org_1',
    ownerId: 'owner_1',
    ownershipStatus: 'CLAIMED',
  });
  clientMock.staffMembers.findMany.mockResolvedValue([
    {
      organizationId: 'org_1',
      userId: 'host_2',
      types: ['HOST'],
    },
  ]);
  clientMock.invites.findMany.mockResolvedValue([]);
});

describe('Event Host delegation policy', () => {
  it('rejects removing the current host without an atomic eligible replacement', async () => {
    await expect(assertEventHostTransition({
      client: transactionClient,
      actor,
      event,
      nextHostId: null,
    })).rejects.toMatchObject({
      code: 'EVENT_HOST_REPLACEMENT_REQUIRED',
      status: 409,
    });

    expect(projectEventAuthorityCapabilitiesMock).toHaveBeenCalledWith(
      actor,
      event,
      transactionClient,
    );
    expect(clientMock.authUser.findUnique).not.toHaveBeenCalled();
  });

  it('accepts a replacement who is an active Organization Host', async () => {
    await expect(assertEventHostTransition({
      client: transactionClient,
      actor,
      event,
      nextHostId: 'host_2',
    })).resolves.toBe('host_2');

    expect(clientMock.organizations.findUnique).toHaveBeenCalledWith({
      where: { id: 'org_1' },
      select: { id: true, ownerId: true, ownershipStatus: true },
    });
  });

  it('rejects replacement by a user without active Organization Host eligibility', async () => {
    clientMock.staffMembers.findMany.mockResolvedValueOnce([]);

    await expect(assertEventHostTransition({
      client: transactionClient,
      actor,
      event,
      nextHostId: 'host_2',
    })).rejects.toMatchObject({
      code: 'EVENT_HOST_NOT_ELIGIBLE',
      status: 400,
    });
  });
});
