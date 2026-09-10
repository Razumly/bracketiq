import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/lib/authServer';
import { pruneExpiredTerminalInvites } from '../src/server/inviteListing';
import { requireEventSignupTestDatabase } from './event-signup-test-environment';

async function main() {
  requireEventSignupTestDatabase(150);
  const [action, teamId] = process.argv.slice(2);
  if (action === 'seed') {
    const passwordHash = await hashPassword('password123!');
    for (const [id, email, firstName] of [['user_host', 'host@example.com', 'Taylor'], ['user_participant', 'player@example.com', 'Jordan']]) {
      await prisma.userData.upsert({ where: { id }, create: { id, userName: id, firstName, lastName: 'Test', dateOfBirth: new Date('1990-01-01') }, update: {} });
      await prisma.authUser.upsert({ where: { id }, create: { id, email, passwordHash, emailVerifiedAt: new Date() }, update: { passwordHash, emailVerifiedAt: new Date() } });
    }
    return;
  }
  if (action !== 'cleanup' || !teamId) throw new Error('Use seed or cleanup <teamId>.');
  const team = await prisma.canonicalTeams.findUnique({ where: { id: teamId } });
  if (!team?.name.startsWith('Issue 150 ')) throw new Error('The Team must belong to the issue 150 test.');
  const now = new Date(Date.now() + 91 * 24 * 60 * 60 * 1000);
  await pruneExpiredTerminalInvites({ client: prisma, scope: { teamId, type: 'TEAM' }, now });
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
