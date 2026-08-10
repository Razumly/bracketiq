jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/server/inviteEmails', () => ({ sendInviteEmails: jest.fn() }));
jest.mock('@/server/repositories/locks', () => ({ acquireEventLock: jest.fn() }));

import { prisma } from '@/lib/prisma';
import { sendInviteEmails } from '@/server/inviteEmails';
import { acquireEventLock } from '@/server/repositories/locks';
import { deliverEventStaffInvitesAfterCommit } from '../eventStaffDelivery';

describe('deliverEventStaffInvitesAfterCommit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks committed pending invites failed when delivery fails', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = { invites: { updateMany } } as any;
    (prisma as any).$transaction = jest.fn(async (callback: (client: any) => unknown) => callback(tx));
    (sendInviteEmails as jest.Mock).mockRejectedValue(new Error('provider unavailable'));

    const delivery = await deliverEventStaffInvitesAfterCommit(
      'event_1',
      [{ id: 'invite_1', eventId: 'event_1', email: 'official@example.com' }],
      'https://app.example.com',
    );

    expect(delivery).toBe('FAILED');
    expect(acquireEventLock).toHaveBeenCalledWith(tx, 'event_1');
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: { in: ['invite_1'] },
        eventId: 'event_1',
        status: 'PENDING',
      }),
      data: expect.objectContaining({ status: 'FAILED', sentAt: null }),
    }));
  });

  it('reports queued without touching persistence after successful delivery', async () => {
    (sendInviteEmails as jest.Mock).mockResolvedValue([]);
    const delivery = await deliverEventStaffInvitesAfterCommit(
      'event_1',
      [{ id: 'invite_1', eventId: 'event_1', email: 'official@example.com' }],
      'https://app.example.com',
    );

    expect(delivery).toBe('QUEUED');
    expect((prisma as any).$transaction).not.toHaveBeenCalled();
  });
});
