import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/lib/authServer';
import { requireEventSignupTestServer } from './event-signup-test-environment';
import { claimOperationalRosterPlayer } from './test-operational-roster-claim';

import { PDFDocument } from 'pdf-lib';

function issuedDocumentId(issued: { signLinks?: Array<{ documentId?: string }> }) {
  return issued.signLinks?.[0]?.documentId;
}

async function completeFixture(server: URL, eventId: string) {
  const id = (suffix: string) => `${eventId}-${suffix}`;
    const base = server.origin;
    const login = async (email: string) => {
      const response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: 'password123!' }) });
      if (!response.ok) throw new Error(`Login failed: ${response.status} ${await response.text()}`);
      return response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    };
    const post = async (cookie: string, path: string, body: unknown) => {
      const response = await fetch(base + path, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
      return response.json();
    };
    const hostCookie = await login('host@example.com');
    for (const player of ['accepted', 'child']) {
      const cookie = player === 'child' ? hostCookie : await login(`${id(player)}@example.test`);
      const templateId = id(player === 'child' ? 'guardian-version' : 'version');
      const signerContext = player === 'child' ? 'parent_guardian' : 'participant';
      const context = { templateId, signerContext, ...(player === 'child' ? { childUserId: id('child') } : {}) };
      const issued = await post(cookie, `/api/events/${eventId}/sign`, context);
      const documentId = issuedDocumentId(issued);
      if (!documentId) throw new Error(`No signing document for ${player}`);
      await post(cookie, '/api/documents/record-signature', { ...context, documentId, eventId, type: 'TEXT' });
    }
    const pdf = await PDFDocument.create();
    pdf.addPage().drawText('Fixture signed waiver: Sam River. Participant signature present.');
    const form = new FormData();
    form.set('file', new Blob([new Uint8Array(await pdf.save())], { type: 'application/pdf' }), 'signed-waiver.pdf');
    for (const [key, value] of Object.entries({ subjectUserId: id('managed'), templateId: id('version'),
      attestationAccepted: 'true', scopeType: 'EVENT_PARTICIPATION', scopeId: eventId, sourceNote: 'Local issue 152 test evidence.' })) form.set(key, value);
    const imported = await fetch(`${base}/api/organizations/${id('org')}/documents/import`, { method: 'POST', headers: { cookie: hostCookie }, body: form });
    if (!imported.ok) throw new Error(`Import failed: ${imported.status} ${await imported.text()}`);
    console.log('Player signing, guardian signing, and attested staff import passed through HTTP.');
}

async function seedFixture(eventId: string) {
  const id = (suffix: string) => `${eventId}-${suffix}`;
  const passwordHash = await hashPassword('password123!');
  for (const [userId, email] of [['user_host', 'host@example.com'], ['user_participant', 'player@example.com'], ['user_member', 'member@example.com']]) {
    await prisma.userData.upsert({ where: { id: userId }, create: { id: userId, userName: userId, firstName: 'Taylor', lastName: 'River', dateOfBirth: new Date('1990-01-01'), onboardingIntent: 'DISCOVER_EVENTS' }, update: {} });
    await prisma.authUser.upsert({ where: { id: userId }, create: { id: userId, email, passwordHash, emailVerifiedAt: new Date() }, update: { passwordHash, emailVerifiedAt: new Date() } });
  }
  await prisma.organizations.upsert({ where: { id: id('org') }, create: { id: id('org'), name: 'River City Sports Club', ownerId: 'user_host', originType: 'FIRST_PARTY', ownershipStatus: 'CLAIMED' }, update: {} });
  for (const [suffix, role, title] of [['', 'PARTICIPANT', 'Event waiver'], ['guardian-', 'PARENT_GUARDIAN', 'Guardian consent']]) {
    await prisma.documentRequirements.upsert({ where: { id: id(`${suffix}requirement`) }, create: { id: id(`${suffix}requirement`), organizationId: id('org'), title }, update: {} });
    await prisma.templateDocuments.upsert({ where: { id: id(`${suffix}version`) }, create: { id: id(`${suffix}version`), organizationId: id('org'), documentRequirementId: id(`${suffix}requirement`), versionSequence: 1, title, type: 'TEXT', signOnce: false, requiredSignerType: role, roleIndexes: [], signerRoles: [], frozenAt: new Date() }, update: {} });
  }
  await prisma.events.upsert({ where: { id: eventId }, create: { id: eventId, name: 'River City Cup', organizationId: id('org'), hostId: 'user_host', start: new Date('2026-09-07'), end: new Date('2026-09-08'), state: 'PUBLISHED', teamSignup: true, eventType: 'EVENT', location: 'River City', teamSizeLimit: 8, price: 0, coordinates: [0, 0], requiredTemplateIds: [id('version'), id('guardian-version')], allowMatchRosterEdits: true, allowTemporaryMatchPlayers: true }, update: {} });
  for (const [player, firstName, birthday] of [['accepted', 'Alex', '1990-01-01'], ['managed', 'Sam', '2000-01-01'], ['child', 'Jamie', '2014-01-01'], ['expired', 'Morgan', '1995-01-01']]) {
    await prisma.userData.upsert({ where: { id: id(player) }, create: { id: id(player), userName: id(player), firstName, lastName: 'River', dateOfBirth: new Date(birthday) }, update: {} });
    await prisma.documentSubjects.upsert({ where: { id: id(`${player}-subject`) }, create: { id: id(`${player}-subject`), organizationId: id('org'), userId: id(player) }, update: {} });
  }
  for (const team of ['team1', 'team2']) {
    await prisma.teams.upsert({ where: { id: id(team) }, create: { id: id(team), eventId, name: team === 'team1' ? 'River Crew' : 'Summit United', managerId: 'user_host', captainId: 'user_host', teamSize: 8, playerIds: team === 'team1' ? [id('accepted')] : [], pending: team === 'team1' ? [id('managed'), id('child')] : [id('expired')] }, update: {} });
    await prisma.eventRegistrations.upsert({ where: { id: id(`${team}-registration`) }, create: { id: id(`${team}-registration`), eventId, eventTeamId: id(team), registrantId: id(team), registrantType: 'TEAM', rosterRole: 'PARTICIPANT', status: 'ACTIVE', createdBy: 'user_host' }, update: {} });
  }
  await prisma.authUser.upsert({ where: { id: id('accepted') }, create: { id: id('accepted'), email: `${id('accepted')}@example.test`, passwordHash, emailVerifiedAt: new Date() }, update: {} });
  await prisma.parentChildLinks.upsert({ where: { id: id('guardian-link') }, create: { id: id('guardian-link'), parentId: 'user_host', childId: id('child'), status: 'ACTIVE', createdBy: 'user_host' }, update: {} });
  await prisma.eventRegistrations.upsert({ where: { id: id('accepted-registration') }, create: { id: id('accepted-registration'), eventId,
    eventTeamId: id('team1'), registrantId: id('accepted'), registrantType: 'SELF', rosterRole: 'PARTICIPANT', status: 'ACTIVE',
    createdBy: 'user_host', acceptedAt: new Date() }, update: {} });
  await prisma.invites.upsert({ where: { id: id('expired-invite') }, create: { id: id('expired-invite'), type: 'TEAM',
    teamId: id('team2'), eventId, userId: id('expired'), status: 'EXPIRED', linkExpiresAt: new Date('2026-01-01'),
    email: 'private-delivery@example.test', createdBy: 'user_host' }, update: {} });
  await prisma.matches.upsert({ where: { id: id('match') }, create: { id: id('match'), eventId, matchId: 1, team1Id: id('team1'), team2Id: id('team2'), officialId: 'user_participant', team1Points: [], team2Points: [], start: new Date('2026-09-07'), status: 'SCHEDULED' }, update: {} });
  await prisma.eventOfficials.upsert({ where: { eventId_userId: { eventId, userId: 'user_participant' } }, create: { id: id('official'), eventId, userId: 'user_participant', isActive: true }, update: {} });
}

async function main() {
  const server = requireEventSignupTestServer(152);
  const [action = 'seed', eventId = 'issue152-roster'] = process.argv.slice(2);
  if (!eventId.startsWith('issue152-')) throw new Error('Use an issue 152 fixture Event.');
  const id = (suffix: string) => `${eventId}-${suffix}`;
  if (action === 'complete') {
    await completeFixture(server, eventId);
    return;
  }
  if (action === 'claim') {
    await claimOperationalRosterPlayer(server, eventId);
    return;
  }
  if (action !== 'seed') throw new Error('Use seed, complete, or claim.');
  await seedFixture(eventId);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
