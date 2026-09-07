import { prisma } from '../src/lib/prisma';
import { prepareLegacyPlayerInvitations } from '../src/server/teams/legacyPlayerInvitationPreparation';

async function main() {
  const [action = 'inspect', ...ids] = process.argv.slice(2);
  if (action === 'apply') {
    console.log(JSON.stringify(await prepareLegacyPlayerInvitations(prisma, ids)));
    return;
  }
  if (action !== 'inspect') throw new Error('Use inspect or apply followed by reviewed invitation IDs.');
  const [cursor] = ids;
  const rows = await prisma.invites.findMany({
    where: { type: 'TEAM', role: 'player', supersededAt: null,
      OR: [{ status: null }, { status: { in: ['PENDING', 'SENT', 'FAILED', 'EXPIRED'] } }],
    }, select: { id: true, userId: true, teamId: true, eventId: true, status: true },
    orderBy: { id: 'asc' }, take: 101,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  console.log(JSON.stringify({ invitations: rows.slice(0, 100), nextCursor: rows.length > 100 ? rows[99].id : null,
    note: 'Review the stored identity, contact, and Event scope before apply. Use inspect with nextCursor to read the next page. Inspection does not change records.' }));
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
