/** @jest-environment node */
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { requireEventSignupTestDatabase } from '../../../scripts/event-signup-test-environment';

jest.mock('@/lib/permissions', () => ({
  requireSession: async (req: NextRequest) => ({ userId: req.headers.get('x-test-user'), isAdmin: false }),
  getOptionalSession: async (req: NextRequest) => ({ userId: req.headers.get('x-test-user'), isAdmin: false }),
}));

import { prisma } from '@/lib/prisma';
import { POST as claimProfile } from '@/app/api/user-profiles/[id]/claim/route';
import { GET as readProfile } from '@/app/api/users/[id]/route';
import { GET as readFamily } from '@/app/api/family/children/route';
import { PATCH as editChild } from '@/app/api/family/children/[childId]/route';
import { buildManagedPlayerClaimUrl } from '@/server/teamInviteLinks';
import type { Invites } from '@/generated/prisma/client';

const databaseTests = process.env.RUN_DATABASE_INTEGRATION === '1' ? describe : describe.skip;

databaseTests('Persisted Player and guardian claim journeys', () => {
  const prefix = `issue153-claim-${randomUUID()}`;
  const id = (suffix: string) => `${prefix}-${suffix}`;

  async function account(suffix: string, verified = true) {
    const userId = id(suffix);
    await prisma.userData.create({ data: { id: userId, userName: userId, firstName: 'Alex', lastName: 'Lake',
      dateOfBirth: new Date('1990-04-15'), blockedUserIds: [id('blocked')] } });
    await prisma.authUser.create({ data: { id: userId, email: `${userId}@example.test`, passwordHash: 'unused',
      emailVerifiedAt: verified ? new Date() : null } });
    return userId;
  }

  async function invitation(suffix: string, options: { guardian?: string; email?: string } = {}) {
    const profileId = id(`${suffix}-profile`);
    const teamId = id(`${suffix}-team`);
    await prisma.userData.create({ data: { id: profileId, userName: profileId, firstName: 'Jamie', lastName: 'River',
      dateOfBirth: new Date(options.guardian ? '2014-01-01' : '1995-01-01'), isManagedPlayer: true } });
    await prisma.canonicalTeams.create({ data: { id: teamId, name: 'River Crew', teamSize: 8 } });
    await prisma.teamRegistrations.create({ data: { id: id(`${suffix}-roster`), teamId, userId: profileId, status: 'INVITED' } });
    return prisma.invites.create({ data: { id: id(`${suffix}-invite`), type: 'TEAM', role: 'player', teamId,
      userId: profileId, isMinor: Boolean(options.guardian), guardianEmail: options.guardian,
      email: options.guardian ?? options.email, status: 'PENDING', linkExpiresAt: new Date('2040-01-01') } });
  }

  async function claim(invite: Invites, actor: string, extra: Record<string, unknown> = {}) {
    const signed = new URL(buildManagedPlayerClaimUrl(invite, 'http://localhost'));
    return claimProfile(new NextRequest(`http://localhost/api/user-profiles/${invite.userId}/claim${signed.search}`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-test-user': actor },
      body: JSON.stringify({ inviteId: invite.id, confirmation: true, ...extra }),
    }), { params: Promise.resolve({ id: invite.userId! }) });
  }

  async function family(actor: string) {
    const response = await readFamily(new NextRequest('http://localhost/api/family/children', { headers: { 'x-test-user': actor } }));
    expect(response.status).toBe(200);
    return (await response.json()).children;
  }

  beforeAll(() => {
    requireEventSignupTestDatabase(153);
    process.env.AUTH_SECRET = 'issue153-persisted-claim-secret';
  });

  afterAll(async () => {
    await prisma.userProfileClaims.deleteMany({ where: { profileId: { startsWith: prefix } } });
    await prisma.userProfileMerges.deleteMany({ where: { sourceProfileId: { startsWith: prefix } } });
    await prisma.parentChildLinks.deleteMany({ where: { childId: { startsWith: prefix } } });
    await prisma.invites.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.teamRegistrations.deleteMany({ where: { teamId: { startsWith: prefix } } });
    await prisma.canonicalTeams.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.authUser.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.userData.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.$disconnect();
  });

  it('requires confirmation and preserves the primary identity and blocks after a no-email claim', async () => {
    const actor = await account('no-email-account');
    const invite = await invitation('no-email');
    expect((await claim(invite, actor, { confirmation: false })).status).toBe(400);
    const accepted = await claim(invite, actor);
    expect(await accepted.json()).toMatchObject({ status: 'MERGED', primaryProfileId: actor });
    expect(accepted.status).toBe(200);
    const profile = await readProfile(new NextRequest(`http://localhost/api/users/${actor}`, { headers: { 'x-test-user': actor } }),
      { params: Promise.resolve({ id: actor }) });
    expect(await profile.json()).toMatchObject({ user: { firstName: 'Alex', lastName: 'Lake', blockedUserIds: [id('blocked')] } });
  });

  it('rejects wrong or unverified attached email before accepting the verified Account', async () => {
    const actor = await account('email-account', false);
    const other = await account('wrong-email-account');
    const invite = await invitation('email', { email: `${actor}@example.test` });
    expect((await claim(invite, other)).status).toBe(409);
    expect((await claim(invite, actor)).status).toBe(409);
    await prisma.authUser.update({ where: { id: actor }, data: { emailVerifiedAt: new Date() } });
    const accepted = await claim(invite, actor);
    expect(await accepted.json()).toMatchObject({ status: 'MERGED', primaryProfileId: actor });
    expect(accepted.status).toBe(200);
  });

  it('permits only one of two competing Accounts to claim the same profile', async () => {
    const first = await account('competing-first');
    const second = await account('competing-second');
    const invite = await invitation('competing');
    const responses = await Promise.all([claim(invite, first), claim(invite, second)]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 404]);
    const winner = await responses.find(response => response.status === 200)!.json();
    expect([first, second]).toContain(winner.primaryProfileId);
    const source = await prisma.userData.findUniqueOrThrow({ where: { id: invite.userId! } });
    expect(source.mergedIntoProfileId).toBe(winner.primaryProfileId);
  });

  it('activates the named child only after declaration and reuses guardian authority for another Team', async () => {
    const guardian = await account('guardian');
    const invite = await invitation('child', { guardian: `${guardian}@example.test` });
    expect((await claim(invite, guardian, { acceptTeamInvitation: true })).status).toBe(409);
    expect(await family(guardian)).toEqual([]);
    const accepted = await claim(invite, guardian, { guardianDeclaration: true, acceptTeamInvitation: true });
    expect(await accepted.json()).toMatchObject({ status: 'GUARDIAN_ACCEPTED', primaryProfileId: invite.userId });
    expect(accepted.status).toBe(200);
    expect(await family(guardian)).toEqual([expect.objectContaining({ userId: invite.userId, linkStatus: 'active' })]);
    const retry = await claim(invite, guardian, { acceptTeamInvitation: true });
    expect(retry.status).toBe(200);
    const secondTeam = await prisma.canonicalTeams.create({ data: { id: id('returning-team'), name: 'Summit United', teamSize: 8 } });
    const second = await prisma.invites.create({ data: { id: id('returning-invite'), type: 'TEAM', role: 'player', status: 'PENDING',
      userId: invite.userId, teamId: secondTeam.id, isMinor: true, guardianEmail: `${guardian}@example.test`, linkExpiresAt: new Date('2040-01-01') } });
    expect((await claim(second, guardian, { acceptTeamInvitation: true })).status).toBe(200);
    expect(await family(guardian)).toHaveLength(1);
  });

  it('ends guardian access at age 18 without deleting the child identity or accepting an adult claim', async () => {
    jest.useFakeTimers({ now: new Date('2031-12-31T23:59:59Z'), doNotFake: [
      'nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
      'queueMicrotask', 'performance', 'hrtime',
    ] });
    try {
      const guardian = await account('age-guardian');
      const invite = await invitation('age-child', { guardian: `${guardian}@example.test` });
      const acceptance = { guardianDeclaration: true, acceptTeamInvitation: true };
      expect((await claim(invite, guardian, acceptance)).status).toBe(200);
      expect(await family(guardian)).toHaveLength(1);
      const edit = () => editChild(new NextRequest(`http://localhost/api/family/children/${invite.userId}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json', 'x-test-user': guardian },
        body: JSON.stringify({ firstName: 'Jamie', lastName: 'River', dateOfBirth: '2014-01-01' }),
      }), { params: Promise.resolve({ childId: invite.userId! }) });
      expect((await edit()).status).toBe(200);
      jest.setSystemTime(new Date('2032-01-01T00:00:00Z'));
      expect(await family(guardian)).toEqual([]);
      expect((await edit()).status).toBe(403);
      const adultClaim = await claim(invite, guardian, acceptance);
      expect(adultClaim.status).toBe(400);
      expect((await adultClaim.json()).error).toContain('personal email');
      const profile = await prisma.userData.findUniqueOrThrow({ where: { id: invite.userId! } });
      expect(profile.mergedIntoProfileId).toBeNull();
      expect(profile.firstName).toBe('Jamie');
    } finally {
      jest.useRealTimers();
    }
  });
});
