import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { listGuardianChildIds } from '@/server/guardianAuthority';

export async function GET(req: NextRequest) {
  const session = await requireSession(req);
  const playerIds = [session.userId, ...await listGuardianChildIds(prisma, session.userId)];
  const selected = req.nextUrl.searchParams.get('playerId');
  if (selected && !playerIds.includes(selected)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const blocks = await prisma.teamBlocks.findMany({
    where: { playerId: { in: selected ? [selected] : playerIds } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  const [players, teams] = blocks.length ? await Promise.all([
    prisma.userData.findMany({ where: { id: { in: [...new Set(blocks.map((block) => block.playerId))] } }, select: { id: true, firstName: true, lastName: true } }),
    prisma.canonicalTeams.findMany({ where: { id: { in: [...new Set(blocks.map((block) => block.teamId))] } }, select: { id: true, name: true } }),
  ]) : [[], []];
  const playerNames = new Map(players.map((player) => [player.id, [player.firstName, player.lastName].filter(Boolean).join(' ')]));
  const teamNames = new Map(teams.map((team) => [team.id, team.name]));
  return NextResponse.json({ blocks: blocks.map((block) => ({
    ...block, playerName: playerNames.get(block.playerId) ?? null, teamName: teamNames.get(block.teamId) ?? null,
  })) });
}
