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
};
const prismaMock = {
  ...txMock,
  $transaction: jest.fn(async (callback: (tx: typeof txMock) => unknown) => callback(txMock)),
};
const requireSessionMock = jest.fn();
const canManageEventMock = jest.fn();
const acquireEventLockMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));
jest.mock('@/server/accessControl', () => ({
  canManageEvent: (...args: unknown[]) => canManageEventMock(...args),
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
  canManageEventMock.mockResolvedValue(true);
  acquireEventLockMock.mockResolvedValue(undefined);
  txMock.events.findUnique.mockResolvedValue({
    id: 'event_1',
    hostId: 'old_host',
    assistantHostIds: [],
    organizationId: 'org_1',
  });
  txMock.authUser.findUnique.mockResolvedValue({ id: 'new_host' });
  txMock.events.update.mockResolvedValue({
    id: 'event_1',
    hostId: 'new_host',
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
    });
    expect(acquireEventLockMock).toHaveBeenCalledWith(txMock, 'event_1');
    expect(canManageEventMock).toHaveBeenCalledWith(
      { userId: 'manager_1', isAdmin: false },
      expect.objectContaining({ id: 'event_1' }),
      txMock,
    );
    expect(txMock.authUser.findUnique).toHaveBeenCalledWith({
      where: { id: 'new_host' },
      select: { id: true },
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

  it('returns authentication and authorization failures without writing', async () => {
    requireSessionMock.mockRejectedValueOnce(new Response('Unauthorized', { status: 401 }));
    const unauthenticated = await PUT(request({ hostId: 'new_host' }), params);
    expect(unauthenticated.status).toBe(401);

    canManageEventMock.mockResolvedValueOnce(false);
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
});
