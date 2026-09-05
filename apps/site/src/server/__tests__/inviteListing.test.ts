/** @jest-environment node */

import {
  listInviteRecordsPage,
} from '@/server/inviteListing';

describe('invite listing pagination', () => {
  it('uses a deterministic keyset cursor across equal timestamps', async () => {
    const createdAt = new Date('2026-07-01T12:00:00.000Z');
    const client = {
      invites: {
        findMany: jest.fn()
          .mockResolvedValueOnce([
            { id: 'invite_c', createdAt },
            { id: 'invite_b', createdAt },
            { id: 'invite_a', createdAt },
          ])
          .mockResolvedValueOnce([{ id: 'invite_a', createdAt }]),
      },
    };

    const firstPage = await listInviteRecordsPage(client, { status: 'PENDING' }, { limit: 2 });
    const secondPage = await listInviteRecordsPage(
      client,
      { status: 'PENDING' },
      { limit: 2, cursor: firstPage.nextCursor },
    );

    expect(firstPage.invites.map((invite) => invite.id)).toEqual(['invite_c', 'invite_b']);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    expect(secondPage.invites.map((invite) => invite.id)).toEqual(['invite_a']);
    expect(secondPage.nextCursor).toBeNull();
    expect(client.invites.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: {
        AND: [
          { status: 'PENDING' },
          {
            OR: [
              { createdAt: { lt: createdAt } },
              { createdAt, id: { lt: 'invite_b' } },
              { createdAt: null },
            ],
          },
        ],
      },
    }));
  });

});
