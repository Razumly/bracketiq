/** @jest-environment node */

import { NextRequest } from 'next/server';

const txMock = {
  events: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
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
const prismaMock = {
  ...txMock,
  $transaction: jest.fn(async (callback: (tx: typeof txMock) => unknown) => callback(txMock)),
};
const requireSessionMock = jest.fn();
const projectEventAuthorityCapabilitiesMock = jest.fn();
const acquireEventLockMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/accessControl', () => ({
  projectEventAuthorityCapabilities: (...args: unknown[]) => (
    projectEventAuthorityCapabilitiesMock(...args)
  ),
}));
jest.mock('@/server/repositories/locks', () => ({
  acquireEventLock: (...args: unknown[]) => acquireEventLockMock(...args),
}));

import { PUT } from '@/app/api/events/[eventId]/host/route';

const params = { params: Promise.resolve({ eventId: 'event_1' }) };
const request = (body: unknown) => new NextRequest('http://localhost/api/events/event_1/host', {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

beforeEach(() => {
  jest.clearAllMocks();
  requireSessionMock.mockResolvedValue({ userId: 'manager_1', isAdmin: false });
  projectEventAuthorityCapabilitiesMock.mockResolvedValue({
    canEdit: true,
    canManageStaff: true,
    canDelegateHost: true,
    readOnly: false,
    readOnlyReason: null,
    managementAuthority: {
      type: 'ORGANIZATION',
      organizationId: 'org_1',
      ownerUserId: 'manager_1',
    },
    eventHostId: 'new_host',
    viewerIsEventHost: true,
  });
  acquireEventLockMock.mockResolvedValue(undefined);
  txMock.events.findUnique.mockResolvedValue({
    id: 'event_1',
    hostId: 'old_host',
    assistantHostIds: [],
    organizationId: 'org_1',
  });
  txMock.authUser.findUnique.mockResolvedValue({ id: 'new_host' });
  txMock.organizations.findUnique.mockResolvedValue({
    id: 'org_1',
    ownerId: 'manager_1',
    ownershipStatus: 'CLAIMED',
  });
  txMock.staffMembers.findMany.mockResolvedValue([
    {
      organizationId: 'org_1',
      userId: 'new_host',
      types: ['HOST'],
    },
  ]);
  txMock.invites.findMany.mockResolvedValue([]);
  txMock.events.update.mockResolvedValue({
    id: 'event_1',
    hostId: 'new_host',
    assistantHostIds: [],
    organizationId: 'org_1',
    updatedAt: new Date('2026-08-10T12:00:00.000Z'),
  });
});

describe('/api/events/[eventId]/host', () => {
  it('updates the host through one locked, permission-checked mutation', async () => {
    const response = await PUT(request({ hostId: 'new_host' }), params);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      event: expect.objectContaining({ id: 'event_1', hostId: 'new_host' }),
      capabilities: expect.objectContaining({
        canEdit: true,
        canDelegateHost: true,
      }),
    });
    expect(acquireEventLockMock).toHaveBeenCalledWith(txMock, 'event_1');
    expect(projectEventAuthorityCapabilitiesMock).toHaveBeenCalledWith(
      { userId: 'manager_1', isAdmin: false },
      expect.objectContaining({ id: 'event_1' }),
      txMock,
    );
    expect(txMock.authUser.findUnique).toHaveBeenCalledWith({
      where: { id: 'new_host' },
      select: { id: true, disabledAt: true },
    });
    expect(txMock.events.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'event_1' },
      data: { hostId: 'new_host', updatedAt: expect.any(Date) },
    }));
  });

  it('rejects malformed input before opening a transaction', async () => {
    const response = await PUT(request({ hostId: '' }), params);

    expect(response.status).toBe(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('requires an eligible replacement in the same host change', async () => {
    const response = await PUT(request({ hostId: null }), params);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      code: 'EVENT_HOST_REPLACEMENT_REQUIRED',
    }));
    expect(txMock.events.update).not.toHaveBeenCalled();
  });

  it('returns authentication and authorization failures without writing', async () => {
    requireSessionMock.mockRejectedValueOnce(new Response('Unauthorized', { status: 401 }));
    const unauthenticated = await PUT(request({ hostId: 'new_host' }), params);
    expect(unauthenticated.status).toBe(401);

    projectEventAuthorityCapabilitiesMock.mockResolvedValueOnce({
      canEdit: true,
      canManageStaff: true,
      canDelegateHost: false,
      readOnly: false,
      readOnlyReason: null,
      managementAuthority: null,
      eventHostId: 'old_host',
      viewerIsEventHost: false,
    });
    const forbidden = await PUT(request({ hostId: 'new_host' }), params);
    expect(forbidden.status).toBe(403);
    expect(txMock.events.update).not.toHaveBeenCalled();
  });

  it('rejects an unknown host without changing the event', async () => {
    txMock.authUser.findUnique.mockResolvedValueOnce(null);

    const response = await PUT(request({ hostId: 'missing_host' }), params);

    expect(response.status).toBe(404);
    expect(txMock.events.update).not.toHaveBeenCalled();
  });

  it('rejects a user who is not an active Organization Host', async () => {
    txMock.staffMembers.findMany.mockResolvedValueOnce([]);

    const response = await PUT(request({ hostId: 'outside_user' }), params);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      code: 'EVENT_HOST_NOT_ELIGIBLE',
    }));
    expect(txMock.events.update).not.toHaveBeenCalled();
  });
});
