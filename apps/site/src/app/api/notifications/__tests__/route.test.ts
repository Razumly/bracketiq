/** @jest-environment node */

import { NextRequest } from 'next/server';

const prismaMock = {
  userNotifications: {
    findMany: jest.fn(),
    count: jest.fn(),
    updateMany: jest.fn(),
  },
};
const requireSessionMock = jest.fn();

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: requireSessionMock }));

import { GET, PATCH } from '@/app/api/notifications/route';

describe('/api/notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSessionMock.mockResolvedValue({ userId: 'user_1' });
  });

  it('lists only the signed-document notifications for the session user', async () => {
    prismaMock.userNotifications.findMany.mockResolvedValue([
      {
        id: 'notification_1',
        createdAt: new Date('2026-08-21T10:00:00.000Z'),
        notificationType: 'documents',
        title: 'Signed document added',
        body: 'A signed document was added.',
        data: { evidenceId: 'evidence_1' },
        readAt: null,
      },
    ]);
    prismaMock.userNotifications.count.mockResolvedValue(1);

    const response = await GET(new NextRequest('http://localhost/api/notifications?type=documents&limit=25'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      notifications: [expect.objectContaining({ id: 'notification_1' })],
      unreadCount: 1,
    });
    expect(prismaMock.userNotifications.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user_1', notificationType: 'documents' },
      take: 25,
    }));
    expect(prismaMock.userNotifications.count).toHaveBeenCalledWith({
      where: { userId: 'user_1', notificationType: 'documents', readAt: null },
    });
  });

  it('marks one notification as read only for the session user', async () => {
    prismaMock.userNotifications.updateMany.mockResolvedValue({ count: 1 });

    const response = await PATCH(new NextRequest('http://localhost/api/notifications', {
      method: 'PATCH',
      body: JSON.stringify({ notificationId: 'notification_1' }),
      headers: { 'content-type': 'application/json' },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ updatedCount: 1 });
    expect(prismaMock.userNotifications.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        notificationType: 'documents',
        id: 'notification_1',
      },
      data: { readAt: expect.any(Date) },
    });
  });

  it('marks all unread document notifications as read', async () => {
    prismaMock.userNotifications.updateMany.mockResolvedValue({ count: 2 });

    const response = await PATCH(new NextRequest('http://localhost/api/notifications', {
      method: 'PATCH',
      body: JSON.stringify({ markAllRead: true, type: 'documents' }),
      headers: { 'content-type': 'application/json' },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ updatedCount: 2 });
    expect(prismaMock.userNotifications.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user_1',
        notificationType: 'documents',
        readAt: null,
      },
      data: { readAt: expect.any(Date) },
    });
  });
});
