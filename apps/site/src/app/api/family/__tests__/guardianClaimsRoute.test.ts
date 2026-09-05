/** @jest-environment node */
import { NextRequest } from 'next/server';

let state: any;
let actor = 'guardian';
let failAcceptance = false;
const matches = (row: any, where: any): boolean => Object.entries(where).every(([key, value]) => (
  typeof value === 'object' && value !== null && 'in' in value
    ? (value as { in: unknown[] }).in.includes(row[key]) : row[key] === value
));
const prismaMock: any = {
  userData: {
    findUnique: async ({ where }: any) => state.profiles.find((row: any) => row.id === where.id),
    findMany: async ({ where }: any) => state.profiles.filter((row: any) => where.id.in.includes(row.id)),
    update: async ({ where, data }: any) => Object.assign(state.profiles.find((row: any) => row.id === where.id), data),
  },
  authUser: { findUnique: async ({ where }: any) => where.id === actor ? { id: actor, email: `${actor}@example.com`, emailVerifiedAt: new Date() } : null },
  sensitiveUserData: { findMany: async () => [] },
  parentChildLinks: {
    findFirst: async ({ where }: any) => state.links.find((row: any) => matches(row, where)) ?? null,
    findMany: async ({ where }: any) => state.links.filter((row: any) => matches(row, where)),
    create: async ({ data }: any) => { state.links.push(data); return data; },
    update: async ({ where, data }: any) => Object.assign(state.links.find((row: any) => row.id === where.id), data),
  },
  invites: {
    findUnique: async () => structuredClone(state.invite),
    update: async ({ data }: any) => {
      if (failAcceptance && data.status === 'ACCEPTED') throw new Error('Test save failure');
      return Object.assign(state.invite, data);
    },
  },
  canonicalTeams: { findUnique: async () => ({ id: 'team', name: 'River Club' }) },
  teamRegistrations: {
    findMany: async () => state.roster,
    upsert: async ({ where, create, update }: any) => {
      const row = state.roster.find((entry: any) => entry.userId === where.teamId_userId.userId);
      if (row) return Object.assign(row, update);
      state.roster.push(create); return create;
    },
    updateMany: async () => ({ count: 1 }),
  },
  teamStaffAssignments: { findMany: async () => [], upsert: async () => ({}), updateMany: async () => ({ count: 0 }) },
  userProfileClaims: { create: async ({ data }: any) => { state.claims.push(data); return data; } },
  $transaction: async (work: (tx: any) => Promise<unknown>) => {
    const before = structuredClone(state);
    try { return await work(prismaMock); } catch (error) { state = before; throw error; }
  },
};
jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/permissions', () => ({ requireSession: async () => ({ userId: actor }) }));

import { POST as claim } from '@/app/api/user-profiles/[id]/claim/route';
import { GET as family } from '@/app/api/family/children/route';
import { buildManagedPlayerClaimUrl } from '@/server/teamInviteLinks';

const accept = async (extra: Record<string, unknown> = {}) => {
  const signed = new URL(buildManagedPlayerClaimUrl(state.invite, 'http://localhost'));
  return claim(new NextRequest(`http://localhost/api/user-profiles/child/claim${signed.search}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ inviteId: 'invite', confirmation: true, guardianDeclaration: true, acceptTeamInvitation: true, ...extra }),
  }), { params: Promise.resolve({ id: 'child' }) });
};
const children = async () => (await (await family(new NextRequest('http://localhost/api/family/children'))).json()).children;

describe('guardian claim HTTP journey', () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = 'guardian-test-secret';
    actor = 'guardian'; failAcceptance = false;
    state = {
      profiles: [
        { id: 'child', firstName: 'Casey', lastName: 'River', dateOfBirth: new Date('2015-01-01'), isManagedPlayer: true },
        { id: 'guardian', firstName: 'Alex', dateOfBirth: new Date('1985-01-01') },
        { id: 'unrelated', dateOfBirth: new Date('1985-01-01') },
      ],
      invite: { id: 'invite', userId: 'child', teamId: 'team', type: 'TEAM', role: 'player', status: 'PENDING',
        isMinor: true, guardianEmail: 'guardian@example.com', email: 'guardian@example.com',
        linkVersion: 1, linkExpiresAt: new Date('2040-01-01') },
      roster: [{ id: 'roster', teamId: 'team', userId: 'child', status: 'INVITED' }], links: [], claims: [],
    };
  });

  it('accepts for a separate child and reuses the relationship on retry', async () => {
    expect((await accept()).status).toBe(200);
    expect(await children()).toEqual([expect.objectContaining({ userId: 'child', firstName: 'Casey', linkStatus: 'active' })]);
    const retry = await accept({ guardianDeclaration: false });
    expect(await retry.json()).toMatchObject({ status: 'GUARDIAN_ACCEPTED', primaryProfileId: 'child' });
    expect(await children()).toHaveLength(1);
  });

  it('does not activate a pending relationship when acceptance fails', async () => {
    state.links.push({ id: 'pending', parentId: 'guardian', childId: 'child', status: 'PENDING' });
    failAcceptance = true;
    expect((await accept()).status).toBe(400);
    expect(await children()).toEqual([]);
    failAcceptance = false;
    expect((await accept()).status).toBe(200);
    expect(await children()).toHaveLength(1);
  });

  it('requires a declaration for a first-time guardian', async () => {
    expect((await accept({ guardianDeclaration: false })).status).toBe(409);
    expect(await children()).toEqual([]);
  });

  it('does not grant an unrelated account authority through a pending link', async () => {
    actor = 'unrelated';
    state.links.push({ id: 'pending', parentId: actor, childId: 'child', status: 'PENDING' });
    expect((await accept()).status).toBe(409);
    expect(await children()).toEqual([]);
  });

  it('does not allow a child account to accept its own invitation', async () => {
    actor = 'child'; state.invite.guardianEmail = 'child@example.com';
    expect((await accept()).status).toBe(409);
  });

  it('does not use a legacy child personal email as guardian proof after collecting a birthdate', async () => {
    state.profiles[0].dateOfBirth = new Date(0);
    state.invite.guardianEmail = null;
    state.invite.playerEmail = 'guardian@example.com';
    const response = await accept({ dateOfBirth: '2015-01-01' });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'GUARDIAN_REQUIRED' });
    expect(await children()).toEqual([]);
    expect(state.invite.status).toBe('PENDING');
  });

  it('ends guardian authority on the eighteenth birthday without turning the guardian link into an adult claim', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2033-01-01T00:00:00Z'));
    state.links.push({ id: 'active', parentId: 'guardian', childId: 'child', status: 'ACTIVE' });
    try {
      const response = await accept();
      expect(response.status).toBe(400);
      expect((await response.json()).error).toContain('personal email');
      expect(await children()).toEqual([]);
    } finally { jest.useRealTimers(); }
  });
});
