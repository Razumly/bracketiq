import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/lib/authServer';
import { createDocumentRequirementSatisfaction } from '../src/server/documentEvidence';

async function main() {
  const database = new URL(process.env.DATABASE_URL ?? '');
  if (!['127.0.0.1', 'localhost'].includes(database.hostname) || database.pathname !== '/bracketiq_e2e_152_codex') {
    throw new Error('Use the isolated issue 152 database.');
  }
  const [action = 'seed', eventId = 'issue152-roster'] = process.argv.slice(2);
  if (!eventId.startsWith('issue152-')) throw new Error('Use an issue 152 fixture Event.');
  const id = (suffix: string) => `${eventId}-${suffix}`;
  if (action === 'satisfy') {
    for (const [player, role, provenance] of [
      ['accepted', 'participant', 'BRACKETIQ'], ['managed', 'participant', 'IMPORTED'], ['child', 'parent_guardian', 'BRACKETIQ'],
    ] as const) {
      const version = id(role === 'parent_guardian' ? 'guardian-version' : 'version');
      const requirement = id(role === 'parent_guardian' ? 'guardian-requirement' : 'requirement');
      await prisma.signedDocuments.upsert({ where: { id: id(`${player}-evidence`) },
        create: { id: id(`${player}-evidence`), signedDocumentId: id(`${player}-evidence`), templateId: version,
          documentName: 'Event waiver', organizationId: id('org'), userId: id(player), signerUserId: role === 'parent_guardian' ? 'user_host' : id(player),
          documentSubjectId: id(`${player}-subject`), scopeType: 'EVENT_PARTICIPATION', scopeId: eventId,
          provenance, status: 'SIGNED', signedAt: '2026-08-01T00:00:00.000Z', signerRole: role }, update: {} });
      await createDocumentRequirementSatisfaction({ evidenceId: id(`${player}-evidence`), templateDocumentId: version,
        documentRequirementId: requirement, organizationId: id('org'), documentSubjectId: id(`${player}-subject`),
        scopeType: 'EVENT_PARTICIPATION', scopeId: eventId, requiredSignerRoles: [role], completedSignerRoles: [role] });
    }
    return;
  }
  if (action !== 'seed') throw new Error('Use seed or satisfy.');
  const passwordHash = await hashPassword('password123!');
  for (const [userId, email] of [['user_host', 'host@example.com'], ['user_participant', 'player@example.com'], ['user_member', 'member@example.com']]) {
    await prisma.userData.upsert({ where: { id: userId }, create: { id: userId, userName: userId, firstName: 'Taylor', lastName: 'River', dateOfBirth: new Date('1990-01-01'), onboardingIntent: 'DISCOVER_EVENTS' }, update: {} });
    await prisma.authUser.upsert({ where: { id: userId }, create: { id: userId, email, passwordHash, emailVerifiedAt: new Date() }, update: { passwordHash, emailVerifiedAt: new Date() } });
  }
  await prisma.organizations.upsert({ where: { id: id('org') }, create: { id: id('org'), name: 'River City Sports Club', ownerId: 'user_host', ownershipStatus: 'CLAIMED' }, update: {} });
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
  await prisma.eventRegistrations.upsert({ where: { id: id('accepted-registration') }, create: { id: id('accepted-registration'), eventId,
    eventTeamId: id('team1'), registrantId: id('accepted'), registrantType: 'SELF', rosterRole: 'PARTICIPANT', status: 'ACTIVE',
    createdBy: 'user_host', acceptedAt: new Date() }, update: {} });
  await prisma.invites.upsert({ where: { id: id('expired-invite') }, create: { id: id('expired-invite'), type: 'TEAM',
    teamId: id('team2'), eventId, userId: id('expired'), status: 'EXPIRED', linkExpiresAt: new Date('2026-01-01'),
    email: 'private-delivery@example.test', createdBy: 'user_host' }, update: {} });
  await prisma.matches.upsert({ where: { id: id('match') }, create: { id: id('match'), eventId, matchId: 1, team1Id: id('team1'), team2Id: id('team2'), officialId: 'user_participant', team1Points: [], team2Points: [], start: new Date('2026-09-07'), status: 'SCHEDULED' }, update: {} });
  await prisma.eventOfficials.upsert({ where: { eventId_userId: { eventId, userId: 'user_participant' } }, create: { id: id('official'), eventId, userId: 'user_participant', isActive: true }, update: {} });
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
