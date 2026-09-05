/** @jest-environment node */

import { NextRequest } from 'next/server';

const requireSessionMock = jest.fn();
const loadCanonicalTeamByIdMock = jest.fn();
const syncCanonicalTeamRosterMock = jest.fn();
const acceptTeamInviteEventSyncsMock = jest.fn();
const rollbackTeamInviteEventSyncsMock = jest.fn();
const removeCanonicalPendingInviteeMock = jest.fn();
const syncTeamChatInTxMock = jest.fn();

const txMock = {
  $executeRaw: jest.fn(),
  teamStaffAssignments: { updateMany: jest.fn() },
  teamBlocks: { upsert: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
  userData: { findUnique: jest.fn(), findMany: jest.fn() },
  parentChildLinks: { findFirst: jest.fn(), findMany: jest.fn() },
  invites: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  teams: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

const invite = {
  id: 'invite_1',
  type: 'TEAM',
  status: 'PENDING',
  teamId: 'team_1',
  userId: 'free_1',
  createdBy: 'manager_1',
};

const prismaMock = {
  authUser: { findMany: jest.fn() },
  inviteDeliveries: { findMany: jest.fn() },
  invites: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  userData: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  parentChildLinks: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  $transaction: jest.fn((callback: (tx: typeof txMock) => Promise<unknown>) => callback(txMock)),
};

jest.mock('@/server/moderation', () => ({ ...jest.requireActual('@/server/moderation'), sendModerationAlert: jest.fn(async () => undefined) }));
jest.mock('@/server/invitationEvidence', () => ({ reportInvitation: jest.fn(async () => ({ id: 'invitation-report' })) }));

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: (...args: any[]) => requireSessionMock(...args) }));
jest.mock('@/server/teams/teamMembership', () => ({
  loadCanonicalTeamById: (...args: any[]) => loadCanonicalTeamByIdMock(...args),
  normalizeId: (value: unknown) => (typeof value === 'string' && value.trim().length > 0 ? value.trim() : null),
  normalizeIdList: (value: unknown) => (
    Array.isArray(value)
      ? Array.from(new Set(value.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean)))
      : []
  ),
  syncCanonicalTeamRoster: (...args: any[]) => syncCanonicalTeamRosterMock(...args),
}));
jest.mock('@/server/teams/teamInviteEventSync', () => ({
  acceptTeamInviteEventSyncs: (...args: any[]) => acceptTeamInviteEventSyncsMock(...args),
  rollbackTeamInviteEventSyncs: (...args: any[]) => rollbackTeamInviteEventSyncsMock(...args),
  removeCanonicalPendingInvitee: (...args: any[]) => removeCanonicalPendingInviteeMock(...args),
}));
jest.mock('@/server/teamChatSync', () => ({
  getTeamChatBaseMemberIds: jest.fn(() => ['manager_1']),
  syncTeamChatInTx: (...args: any[]) => syncTeamChatInTxMock(...args),
}));
jest.mock('@/server/accessControl', () => ({
  canManageEvent: jest.fn(),
  canManageOrganization: jest.fn(),
}));

import { POST as acceptInvite } from '@/app/api/invites/[id]/accept/route';
import { POST as declineInvite } from '@/app/api/invites/[id]/decline/route';
import { DELETE as deleteInvite, GET as getInvite } from '@/app/api/invites/[id]/route';

describe('team invite event-team sync lifecycle routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    txMock.$executeRaw.mockResolvedValue(0);
    txMock.teamBlocks.findMany.mockResolvedValue([]);
    txMock.userData.findMany.mockResolvedValue([]);
    prismaMock.authUser.findMany.mockResolvedValue([]);
    prismaMock.userData.findMany.mockResolvedValue([]);
    txMock.teamStaffAssignments.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.inviteDeliveries.findMany.mockResolvedValue([]);
    prismaMock.invites.findMany.mockResolvedValue([invite]);
    prismaMock.parentChildLinks.findMany.mockResolvedValue([]);
    requireSessionMock.mockResolvedValue({ userId: 'free_1', isAdmin: false });
    prismaMock.invites.findUnique.mockResolvedValue(invite);
    txMock.invites.findUnique.mockResolvedValue(invite);
    prismaMock.userData.findUnique.mockResolvedValue({
      dateOfBirth: new Date('2000-01-01T00:00:00.000Z'),
    });
    prismaMock.parentChildLinks.findFirst.mockResolvedValue(null);
    txMock.userData.findUnique.mockResolvedValue({ dateOfBirth: new Date('2000-01-01T00:00:00.000Z') });
    txMock.parentChildLinks.findFirst.mockResolvedValue(null);
    loadCanonicalTeamByIdMock.mockResolvedValue({
      id: 'team_1',
      playerIds: ['manager_1'],
      pending: ['free_1'],
      captainId: 'manager_1',
      managerId: 'manager_1',
      headCoachId: null,
      coachIds: [],
    });
    syncCanonicalTeamRosterMock.mockResolvedValue(undefined);
    acceptTeamInviteEventSyncsMock.mockResolvedValue(undefined);
    rollbackTeamInviteEventSyncsMock.mockResolvedValue(undefined);
    removeCanonicalPendingInviteeMock.mockResolvedValue(undefined);
    syncTeamChatInTxMock.mockResolvedValue(undefined);
    txMock.invites.delete.mockResolvedValue({});
    txMock.invites.update.mockImplementation(async ({ data }) => ({ ...invite, ...data }));
    txMock.teams.findUnique.mockResolvedValue({
      id: 'team_1',
      pending: ['free_1'],
    });
    txMock.teams.update.mockResolvedValue({});
    txMock.teamBlocks.upsert.mockImplementation(async ({ create }) => create);
  });

  it('accepting a team invite activates its roster and event-sync rows while retaining invite history', async () => {
    const response = await acceptInvite(
      new NextRequest('http://localhost/api/invites/invite_1/accept', { method: 'POST' }),
      { params: Promise.resolve({ id: 'invite_1' }) },
    );

    expect(response.status).toBe(200);
    expect(syncCanonicalTeamRosterMock).toHaveBeenCalled();
    expect(acceptTeamInviteEventSyncsMock).toHaveBeenCalledWith(txMock, invite, expect.any(Date), {
      propagateToLinkedEventTeams: false,
    });
    expect(txMock.invites.update).toHaveBeenCalledWith({
      where: { id: 'invite_1' },
      data: {
        status: 'ACCEPTED',
        actedBy: 'free_1', actingGuardianId: null,
        finalizedAt: expect.any(Date),
        updatedAt: expect.any(Date),
      },
    });
    expect(txMock.invites.delete).not.toHaveBeenCalled();
  });

  it('treats a repeated accept as an idempotent success after the invite is accepted', async () => {
    prismaMock.invites.findUnique.mockResolvedValue({ ...invite, status: 'ACCEPTED' });

    const response = await acceptInvite(
      new NextRequest('http://localhost/api/invites/invite_1/accept', { method: 'POST' }),
      { params: Promise.resolve({ id: 'invite_1' }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ ok: true, alreadyAccepted: true });
    expect(acceptTeamInviteEventSyncsMock).not.toHaveBeenCalled();
    expect(txMock.invites.update).not.toHaveBeenCalled();
  });

  it('declining a team invite rolls back event-team sync rows and removes pending canonical membership', async () => {
    const response = await declineInvite(
      new NextRequest('http://localhost/api/invites/invite_1/decline', { method: 'POST' }),
      { params: Promise.resolve({ id: 'invite_1' }) },
    );

    expect(response.status).toBe(200);
    expect(rollbackTeamInviteEventSyncsMock).toHaveBeenCalledWith(txMock, invite, 'DECLINED', expect.any(Date));
    expect(removeCanonicalPendingInviteeMock).toHaveBeenCalledWith(txMock, invite, 'free_1', expect.any(Date));
    expect(txMock.invites.update).toHaveBeenCalledWith({
      where: { id: 'invite_1' },
      data: {
        status: 'DECLINED',
        actedBy: 'free_1', actingGuardianId: null, declineBlockScope: null,
        finalizedAt: expect.any(Date),
        updatedAt: expect.any(Date),
      },
    });
  });

  it('cancelling a team invite retains a readable terminal outcome', async () => {
    requireSessionMock.mockResolvedValue({ userId: 'manager_1', isAdmin: false });
    txMock.invites.update.mockImplementation(async ({ data }) => {
      const saved = { ...invite, ...data };
      prismaMock.invites.findUnique.mockResolvedValue(saved);
      txMock.invites.findUnique.mockResolvedValue(saved);
      return saved;
    });
    txMock.invites.delete.mockImplementation(async () => {
      prismaMock.invites.findUnique.mockResolvedValue(null);
      txMock.invites.findUnique.mockResolvedValue(null);
    });
    const response = await deleteInvite(
      new NextRequest('http://localhost/api/invites/invite_1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'invite_1' }) },
    );

    expect(response.status).toBe(200);
    requireSessionMock.mockResolvedValue({ userId: 'free_1', isAdmin: false });
    const read = await getInvite(new NextRequest('http://localhost/api/invites/invite_1'), {
      params: Promise.resolve({ id: 'invite_1' }),
    });
    expect(read.status).toBe(200);
    expect((await read.json()).invite).toMatchObject({ id: 'invite_1', status: 'CANCELLED' });
  });

  it('rejects direct acceptance after expiry and retains the expiry outcome', async () => {
    const expired = { ...invite, linkExpiresAt: new Date(Date.now() - 1000) };
    prismaMock.invites.findUnique.mockResolvedValue(expired);
    txMock.invites.findUnique.mockResolvedValue(expired);
    txMock.invites.updateMany.mockImplementation(async ({ data }) => {
      const saved = { ...expired, ...data };
      prismaMock.invites.findUnique.mockResolvedValue(saved);
      txMock.invites.findUnique.mockResolvedValue(saved);
      return { count: 1 };
    });
    const response = await acceptInvite(
      new NextRequest('http://localhost/api/invites/invite_1/accept', { method: 'POST' }),
      { params: Promise.resolve({ id: 'invite_1' }) },
    );
    expect(response.status).toBe(410);
    const read = await getInvite(new NextRequest('http://localhost/api/invites/invite_1'), {
      params: Promise.resolve({ id: 'invite_1' }),
    });
    expect((await read.json()).invite).toMatchObject({
      status: 'EXPIRED', finalizedAt: expired.linkExpiresAt.toISOString(),
    });
  });

  it('declines and blocks only the invited Player and Team in one command', async () => {
    const response = await declineInvite(new NextRequest('http://localhost/api/invites/invite_1/decline', {
      method: 'POST', body: JSON.stringify({ blockScope: 'team' }),
    }), { params: Promise.resolve({ id: 'invite_1' }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true, invite: { id: 'invite_1', status: 'DECLINED', actedBy: 'free_1' },
      block: { scope: 'team', playerId: 'free_1', teamId: 'team_1' },
    });
  });
});
