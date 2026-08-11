/** @jest-environment node */

import { NextRequest } from 'next/server';

const txMock = {
  events: {
    findUnique: jest.fn(),
    update: jest.fn(),
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

import { PATCH } from '@/app/api/events/[eventId]/time-slots/route';

const params = { params: Promise.resolve({ eventId: 'event_1' }) };
const request = (body: unknown) => new NextRequest('http://localhost/api/events/event_1/time-slots', {
  method: 'PATCH',
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
    hostId: 'host_1',
    assistantHostIds: [],
    organizationId: 'org_1',
    timeSlotIds: ['slot_existing', 'slot_remove'],
  });
  txMock.events.update.mockResolvedValue({
    id: 'event_1',
    timeSlotIds: ['slot_existing', 'slot_new'],
    updatedAt: new Date('2026-08-10T12:00:00.000Z'),
  });
});

describe('/api/events/[eventId]/time-slots', () => {
  it('applies additions and removals atomically without duplicate relation ids', async () => {
    const response = await PATCH(request({
      addTimeSlotIds: ['slot_existing', 'slot_new'],
      removeTimeSlotIds: ['slot_remove'],
    }), params);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      event: expect.objectContaining({
        id: 'event_1',
        timeSlotIds: ['slot_existing', 'slot_new'],
      }),
    });
    expect(acquireEventLockMock).toHaveBeenCalledWith(txMock, 'event_1');
    expect(txMock.events.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'event_1' },
      data: {
        timeSlotIds: ['slot_existing', 'slot_new'],
        updatedAt: expect.any(Date),
      },
    }));
  });

  it('rejects overlapping additions and removals before opening a transaction', async () => {
    const response = await PATCH(request({
      addTimeSlotIds: ['slot_1'],
      removeTimeSlotIds: ['slot_1'],
    }), params);

    expect(response.status).toBe(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('returns authentication and authorization failures without writing', async () => {
    requireSessionMock.mockRejectedValueOnce(new Response('Unauthorized', { status: 401 }));
    const unauthenticated = await PATCH(request({ addTimeSlotIds: ['slot_1'] }), params);
    expect(unauthenticated.status).toBe(401);

    canManageEventMock.mockResolvedValueOnce(false);
    const forbidden = await PATCH(request({ addTimeSlotIds: ['slot_1'] }), params);
    expect(forbidden.status).toBe(403);
    expect(txMock.events.update).not.toHaveBeenCalled();
  });
});
