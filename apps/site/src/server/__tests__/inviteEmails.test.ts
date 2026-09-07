/** @jest-environment node */

const storedInvites = new Map<string, any>();
const deliveries = new Map<string, any>();
const prismaMock = {
  $executeRaw: jest.fn(),
  $queryRaw: jest.fn(),
  $transaction: jest.fn((callback: any) => callback(prismaMock)),
  teamBlocks: { findMany: jest.fn() },
  parentChildLinks: { findMany: jest.fn() },
  authUser: { findMany: jest.fn() },
  inviteDeliveries: { findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  events: { findMany: jest.fn() },
  organizations: { findMany: jest.fn() },
  teams: { findMany: jest.fn() },
  userData: { findUnique: jest.fn(), findMany: jest.fn() },
  invites: { findMany: jest.fn(), update: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
};

const buildInviteEmailMock = jest.fn();
const isEmailEnabledMock = jest.fn();
const sendEmailMock = jest.fn();
const sendPushToUsersMock = jest.fn();
const isUserNotificationChannelEnabledMock = jest.fn();

jest.mock('@/server/teams/teamMembership', () => ({ loadCanonicalTeamById: async (id: string) => ({ id, managerId: 'manager' }), normalizeId: (id: string) => id, normalizeIdList: (ids: string[]) => ids ?? [] }));

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/server/emailTemplates', () => ({ buildInviteEmail: (...args: any[]) => buildInviteEmailMock(...args) }));
jest.mock('@/server/email', () => ({
  isEmailEnabled: () => isEmailEnabledMock(),
  sendEmail: (...args: any[]) => sendEmailMock(...args),
}));
jest.mock('@/server/pushNotifications', () => ({ sendPushToUsers: (...args: any[]) => sendPushToUsersMock(...args) }));
jest.mock('@/server/notificationPreferences', () => ({
  isUserNotificationChannelEnabled: (...args: any[]) => isUserNotificationChannelEnabledMock(...args),
}));

import { sendInviteEmails } from '@/server/inviteEmails';

const deliver = async (invites: Parameters<typeof sendInviteEmails>[0], url: string) => {
  const records = invites.map((invite) => ({ ...invite, teamId: 'team', createdBy: 'manager' }));
  records.forEach((invite) => storedInvites.set(invite.id, invite));
  return sendInviteEmails(records, url);
};

describe('sendInviteEmails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storedInvites.clear(); deliveries.clear();
    prismaMock.$executeRaw.mockResolvedValue(0);
    prismaMock.$queryRaw.mockResolvedValue([]);
    prismaMock.teamBlocks.findMany.mockResolvedValue([]);
    prismaMock.authUser.findMany.mockResolvedValue([]);
    prismaMock.parentChildLinks.findMany.mockResolvedValue([]);
    prismaMock.invites.findMany.mockResolvedValue([]);
    prismaMock.userData.findMany.mockResolvedValue([]);
    prismaMock.invites.findUnique.mockImplementation(async ({ where }) => storedInvites.get(where.id));
    prismaMock.invites.updateMany.mockImplementation(async ({ where, data }) => { storedInvites.set(where.id, { ...storedInvites.get(where.id), ...data }); return { count: 1 }; });
    prismaMock.inviteDeliveries.findUnique.mockImplementation(async ({ where }) => deliveries.get(`${where.inviteId_idempotencyKey.inviteId}:${where.inviteId_idempotencyKey.idempotencyKey}`));
    prismaMock.inviteDeliveries.create.mockImplementation(async ({ data }) => { const record = { ...data, createdAt: new Date() }; deliveries.set(`${data.inviteId}:${data.idempotencyKey}`, record); return record; });
    prismaMock.inviteDeliveries.updateMany.mockImplementation(async ({ where, data }) => { for (const row of deliveries.values()) if (row.id === where.id) Object.assign(row, data); return { count: 1 }; });
    prismaMock.events.findMany.mockResolvedValue([]);
    prismaMock.organizations.findMany.mockResolvedValue([]);
    prismaMock.teams.findMany.mockResolvedValue([]);
    prismaMock.userData.findUnique.mockResolvedValue({ notificationSettings: {} });
    prismaMock.invites.update.mockResolvedValue({});

    buildInviteEmailMock.mockReturnValue({
      subject: 'You are invited',
      text: 'Open BracketIQ to review your invite.',
      html: '<p>Open BracketIQ to review your invite.</p>',
    });
    isEmailEnabledMock.mockReturnValue(true);
    sendEmailMock.mockResolvedValue(undefined);
    isUserNotificationChannelEnabledMock.mockResolvedValue(true);
    sendPushToUsersMock.mockResolvedValue({
      attempted: true,
      recipientCount: 1,
      tokenCount: 1,
      successCount: 1,
      failureCount: 0,
      prunedTokenCount: 0,
    });
  });

  it('routes a known child Account invitation to the active guardian', async () => {
    prismaMock.userData.findMany.mockImplementation(async ({ select }) => select.blockedUserIds ? [] : [{ id: 'child', dateOfBirth: new Date('2015-01-01') }]);
    prismaMock.parentChildLinks.findMany.mockResolvedValue([{ id: 'link', childId: 'child', parentId: 'guardian' }]);
    prismaMock.authUser.findMany.mockResolvedValue([{ id: 'guardian', email: 'parent@example.com', passwordHash: 'active-password', disabledAt: null }]);
    await deliver([{ id: 'child-invite', type: 'TEAM', userId: 'child', email: 'child@example.com', isMinor: false, status: 'PENDING' }], 'http://localhost');
    expect(sendPushToUsersMock).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['guardian'] }));
    expect(buildInviteEmailMock).toHaveBeenCalledWith(expect.objectContaining({ isMinor: true, email: 'parent@example.com' }));
  });

  it('keeps another delivery successful when one recipient preference lookup fails', async () => {
    isUserNotificationChannelEnabledMock.mockImplementation(async (userId, _type, channel) => {
      if (userId === 'unavailable-user' && channel === 'email') throw new Error('Preference lookup failed');
      return false;
    });
    const invites = await sendInviteEmails([
      { id: 'unavailable', type: 'EVENT', userId: 'unavailable-user', email: 'one@example.test', status: 'PENDING' },
      { id: 'delivered', type: 'EVENT', email: 'two@example.test', status: 'PENDING' },
    ], 'http://localhost');
    expect(invites[0].delivery).toMatchObject({ status: 'FAILED', failed: true });
    expect(invites[1].delivery).toMatchObject({ status: 'SENT', failed: false });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'two@example.test' }));
  });

  it('uses push delivery for user-id invites when push targets exist', async () => {
    const invites = await deliver([{
      id: 'invite_1',
      email: 'player@example.com',
      userId: 'user_1',
      type: 'TEAM',
      status: 'PENDING',
    }], 'http://localhost');

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(sendPushToUsersMock).toHaveBeenCalledWith(expect.objectContaining({
      userIds: ['user_1'],
      title: 'You are invited',
      data: {
        notificationType: 'invitations',
        deepLink: 'mvp://profile/invites',
        inviteId: 'invite_1',
      },
    }));
    expect(invites).toEqual([expect.objectContaining({
      id: 'invite_1',
      status: 'PENDING',
      sentAt: expect.any(Date),
    })]);
    expect(prismaMock.invites.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'invite_1' }),
      data: expect.objectContaining({
        sentAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    }));
  });

  it('falls back to email when a user-id invite has no push targets', async () => {
    sendPushToUsersMock.mockResolvedValue({
      attempted: false,
      reason: 'no_tokens',
      recipientCount: 1,
      tokenCount: 0,
      successCount: 0,
      failureCount: 0,
      prunedTokenCount: 0,
    });

    const invites = await deliver([{
      id: 'invite_2',
      email: 'player@example.com',
      userId: 'user_1',
      type: 'TEAM',
      status: 'PENDING',
    }], 'http://localhost');

    expect(sendPushToUsersMock).toHaveBeenCalledWith(expect.objectContaining({
      userIds: ['user_1'],
    }));
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(invites).toEqual([expect.objectContaining({
      id: 'invite_2',
      status: 'PENDING',
      sentAt: expect.any(Date),
    })]);
    expect(prismaMock.invites.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'invite_2' }),
      data: expect.objectContaining({
        sentAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    }));
  });

  it('keeps the invitation pending when email fallback fails', async () => {
    sendPushToUsersMock.mockResolvedValue({
      attempted: false,
      reason: 'no_tokens',
      recipientCount: 1,
      tokenCount: 0,
      successCount: 0,
      failureCount: 0,
      prunedTokenCount: 0,
    });
    sendEmailMock.mockRejectedValue(new Error('smtp down'));
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const invites = await deliver([{
      id: 'invite_3',
      email: 'player@example.com',
      userId: 'user_1',
      type: 'TEAM',
      status: 'PENDING',
    }], 'http://localhost');

    expect(sendPushToUsersMock).toHaveBeenCalled();
    expect(invites).toEqual([expect.objectContaining({
      id: 'invite_3',
      status: 'PENDING',
      delivery: expect.objectContaining({ failed: true }),
    })]);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('isolates a per-invite preference failure after another invite delivers', async () => {
    isUserNotificationChannelEnabledMock.mockImplementation(async (userId: string) => {
      if (userId === 'user_bad') {
        throw new Error('preference lookup failed');
      }
      return true;
    });
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const invites = await deliver([
      {
        id: 'invite_delivered',
        email: 'delivered@example.com',
        userId: 'user_good',
        type: 'TEAM',
        status: 'PENDING',
      },
      {
        id: 'invite_failed',
        email: 'failed@example.com',
        userId: 'user_bad',
        type: 'TEAM',
        status: 'PENDING',
      },
    ], 'http://localhost');

    expect(invites).toEqual([
      expect.objectContaining({ id: 'invite_delivered', status: 'PENDING', sentAt: expect.any(Date) }),
      expect.objectContaining({ id: 'invite_failed', status: 'PENDING', delivery: expect.objectContaining({ failed: true }) }),
    ]);
    expect(deliveries.get('invite_failed:initial').status).toBe('FAILED');
    consoleErrorSpy.mockRestore();
  });
});
