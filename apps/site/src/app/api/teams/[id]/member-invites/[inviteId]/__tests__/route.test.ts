/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireSessionMock = jest.fn();
const sendInviteEmailsMock = jest.fn();
const canManageTeamInvitesMock = jest.fn();
const loadCanonicalTeamByIdMock = jest.fn();

const inviteRecord = {
  id: 'invite_1',
  type: 'TEAM',
  role: 'player',
  isAssigned: true,
  userId: null,
  status: 'PENDING',
  firstName: 'Alex',
  lastName: 'Player',
  email: 'alex@example.com',
  phone: null,
  teamId: 'team_1',
  linkVersion: 1,
  linkExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
};

const txMock = {
  invites: {
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};
const prismaMock = {
  $transaction: jest.fn((callback: (tx: typeof txMock) => Promise<unknown>) => callback(txMock)),
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: (...args: unknown[]) => requireSessionMock(...args) }));
jest.mock('@/server/inviteEmails', () => ({ sendInviteEmails: (...args: unknown[]) => sendInviteEmailsMock(...args) }));
jest.mock('@/lib/requestOrigin', () => ({ getRequestOrigin: () => 'http://localhost' }));
jest.mock('@/server/teams/teamMembership', () => ({
  loadCanonicalTeamById: (...args: unknown[]) => loadCanonicalTeamByIdMock(...args),
  normalizeId: (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null,
  normalizeIdList: () => [],
}));
jest.mock('@/server/accessControl', () => ({ canManageOrganization: jest.fn() }));
jest.mock('@/app/api/teams/[id]/member-invites/inviteHelpers', () => {
  class TestError extends Error {
    constructor(public readonly status: number, message: string) {
      super(message);
    }
  }
  return {
    MemberInviteRouteError: TestError,
    canManageTeamInvites: (...args: unknown[]) => canManageTeamInvitesMock(...args),
    assertEditableAccountlessTeamPlayer: (invite: unknown) => {
      if (!invite || typeof invite !== 'object') throw new TestError(404, 'Invite not found');
      const row = invite as Record<string, unknown>;
      if (row.userId || row.isAssigned !== true || row.role !== 'player') {
        throw new TestError(409, 'Only pending accountless player invites can be managed');
      }
      return row;
    },
    normalizedName: (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null,
    normalizeOptionalContact: (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null,
  };
});

import { DELETE, PATCH } from '@/app/api/teams/[id]/member-invites/[inviteId]/route';
import { POST as RESEND } from '@/app/api/teams/[id]/member-invites/[inviteId]/resend/route';

const params = Promise.resolve({ id: 'team_1', inviteId: 'invite_1' });
const request = (body: unknown, method = 'PATCH') => new NextRequest(
  'http://localhost/api/teams/team_1/member-invites/invite_1',
  { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } },
);

describe('accountless member invite management routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AUTH_SECRET = 'member-invite-route-test-secret';
    requireSessionMock.mockResolvedValue({ userId: 'manager_1', isAdmin: false });
    loadCanonicalTeamByIdMock.mockResolvedValue({ id: 'team_1' });
    canManageTeamInvitesMock.mockResolvedValue(true);
    txMock.invites.findFirst.mockResolvedValue({ ...inviteRecord });
    txMock.invites.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...inviteRecord, ...data }));
    sendInviteEmailsMock.mockResolvedValue([{ ...inviteRecord, status: 'PENDING' }]);
  });

  it('rejects an unauthorized manager edit', async () => {
    canManageTeamInvitesMock.mockResolvedValue(false);
    const response = await PATCH(request({ firstName: 'New', lastName: 'Name' }), { params });
    expect(response.status).toBe(403);
    expect(txMock.invites.update).not.toHaveBeenCalled();
  });

  it('rejects invalid names and email before opening a transaction', async () => {
    const response = await PATCH(request({ firstName: '', lastName: 'Name', email: 'not-an-email' }), { params });
    expect(response.status).toBe(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('updates contact fields, renews expiry, and returns a signed link', async () => {
    const response = await PATCH(request({
      firstName: 'Jordan', lastName: 'Player', email: 'jordan@example.com', phone: '+1 555 0100',
    }), { params });
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.invite.firstName).toBe('Jordan');
    expect(payload.shareUrl).toMatch(/^http:\/\/localhost\/i\/invite_1\?/);
    expect(txMock.invites.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'invite_1' },
      data: expect.objectContaining({ email: 'jordan@example.com', phone: '+1 555 0100' }),
    }));
  });

  it('rejects resend when the accountless invite has no email', async () => {
    txMock.invites.findFirst.mockResolvedValue({ ...inviteRecord, email: null });
    const response = await RESEND(request({}, 'POST'), { params });
    expect(response.status).toBe(409);
    expect(sendInviteEmailsMock).not.toHaveBeenCalled();
  });

  it('resends a valid accountless invite email', async () => {
    const response = await RESEND(request({}, 'POST'), { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, inviteId: 'invite_1' });
    expect(sendInviteEmailsMock).toHaveBeenCalledWith([expect.objectContaining({ id: 'invite_1' })], 'http://localhost');
  });
  it('rejects an unauthorized accountless invite removal', async () => {
    canManageTeamInvitesMock.mockResolvedValue(false);
    const response = await DELETE(request({}, 'DELETE'), { params });
    expect(response.status).toBe(403);
    expect(txMock.invites.delete).not.toHaveBeenCalled();
  });

  it('removes an authorized exact-team accountless invite', async () => {
    const response = await DELETE(request({}, 'DELETE'), { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, inviteId: 'invite_1' });
    expect(txMock.invites.findFirst).toHaveBeenCalledWith({
      where: { id: 'invite_1', teamId: 'team_1' },
    });
    expect(txMock.invites.delete).toHaveBeenCalledWith({ where: { id: 'invite_1' } });
  });
});
