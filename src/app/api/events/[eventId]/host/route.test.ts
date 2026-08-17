/** @jest-environment node */

import { NextRequest } from 'next/server';

const eventsMock = {
  findUnique: jest.fn(),
  update: jest.fn(),
};
const prismaMock = {
  events: eventsMock,
  $transaction: jest.fn(),
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

import { PATCH } from '@/app/api/events/[eventId]/host/route';

const patchRequest = (body: unknown) => new NextRequest(
  'http://localhost/api/events/event_1/host',
  {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  },
);

describe('PATCH /api/events/[eventId]/host', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => Promise<unknown>) => (
      callback(prismaMock)
    ));
    requireSessionMock.mockResolvedValue({ userId: 'manager_1', isAdmin: false });
    canManageEventMock.mockResolvedValue(true);
    acquireEventLockMock.mockResolvedValue(undefined);
    eventsMock.findUnique.mockResolvedValue({
      id: 'event_1',
      hostId: 'old_host',
      assistantHostIds: [],
      organizationId: 'org_1',
    });
    eventsMock.update.mockResolvedValue({ id: 'event_1', hostId: 'new_host' });
  });

  it('updates only the host through the focused event-management route', async () => {
    const response = await PATCH(
      patchRequest({ hostId: ' new_host ' }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ event: { id: 'event_1', hostId: 'new_host' } });
    expect(acquireEventLockMock).toHaveBeenCalledWith(prismaMock, 'event_1');
    expect(eventsMock.update).toHaveBeenCalledWith({
      where: { id: 'event_1' },
      data: { hostId: 'new_host' },
      select: { id: true, hostId: true },
    });
  });

  it('rejects an unauthorized host update without writing', async () => {
    canManageEventMock.mockResolvedValue(false);

    const response = await PATCH(
      patchRequest({ hostId: 'new_host' }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(403);
    expect(eventsMock.update).not.toHaveBeenCalled();
  });

  it('rejects unknown body fields before opening a transaction', async () => {
    const response = await PATCH(
      patchRequest({ hostId: 'new_host', event: { hostId: 'other' } }),
      { params: Promise.resolve({ eventId: 'event_1' }) },
    );

    expect(response.status).toBe(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
