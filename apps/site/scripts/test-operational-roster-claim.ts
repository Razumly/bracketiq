import assert from 'node:assert/strict';
import { prisma } from '../src/lib/prisma';
import { buildTeamInviteShareUrl } from '../src/server/teamInviteLinks';
import { hashPassword } from '../src/lib/authServer';

/** Claim the imported-evidence Subject into the fixture's existing Player Account. */
export async function claimOperationalRosterPlayer(base: URL, eventId: string) {
  const id = (suffix: string) => `${eventId}-${suffix}`;
  await prisma.userData.update({ where: { id: id('managed') }, data: { isManagedPlayer: true } });
  await prisma.userData.create({ data: { id: id('claimant'), userName: id('claimant'), firstName: 'Alex', lastName: 'Lake',
    dateOfBirth: new Date('1991-04-15'), blockedUserIds: [id('blocked-account')] } });
  await prisma.authUser.create({ data: { id: id('claimant'), email: `${id('claimant')}@example.test`,
    passwordHash: await hashPassword('password123!'), emailVerifiedAt: new Date() } });
  await prisma.canonicalTeams.create({ data: { id: id('canonical'), name: 'River Crew', teamSize: 8 } });
  await prisma.teams.update({ where: { id: id('team1') }, data: { parentTeamId: id('canonical') } });
  await prisma.teamRegistrations.create({ data: { id: id('managed-roster'), teamId: id('canonical'), userId: id('managed'), status: 'INVITED' } });
  const invite = await prisma.invites.create({ data: {
    id: id('managed-claim'), type: 'TEAM', role: 'player', teamId: id('canonical'), eventId,
    userId: id('managed'), status: 'PENDING', createdBy: 'user_host', linkExpiresAt: new Date(Date.now() + 86_400_000),
  } });
  const login = await fetch(new URL('/api/auth/login', base), { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${id('claimant')}@example.test`, password: 'password123!' }) });
  assert.equal(login.status, 200, 'The existing Player can sign in.');
  const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const link = new URL(buildTeamInviteShareUrl(invite, base.origin));
  const url = new URL(`/api/user-profiles/${id('managed')}/claim${link.search}`, base);
  const send = (confirmation: boolean) => fetch(url, { method: 'POST', headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ inviteId: invite.id, confirmation }) });
  assert.equal((await send(false)).status, 400, 'The claim requires explicit confirmation.');
  const claimed = await send(true);
  const result = await claimed.json();
  assert.equal(claimed.status, 200, JSON.stringify(result));
  assert.equal(result.status, 'MERGED');
  assert.equal(result.primaryProfileId, id('claimant'));
  const profile = await fetch(new URL(`/api/users/${id('claimant')}`, base), { headers: { cookie } });
  assert.equal(profile.status, 200);
  const payload = await profile.json();
  const user = payload.user ?? payload;
  assert.equal(user.firstName, 'Alex');
  assert.ok(user.blockedUserIds.includes(id('blocked-account')), 'The primary Account keeps its blocks.');
  console.log('Confirmed no-email claim merged the profile and preserved primary identity and blocks through HTTP.');
}
