import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { findGuardianAuthority } from '@/server/guardianAuthority';
import { acquireTeamRosterLock } from '@/server/repositories/locks';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ teamId: string }> }) {
  const session = await requireSession(req);
  const { teamId } = await params;
  const playerId = req.nextUrl.searchParams.get('playerId')?.trim() || session.userId;
  const result = await prisma.$transaction(async (tx) => {
    await acquireTeamRosterLock(tx, teamId);
    if (playerId !== session.userId && !(await findGuardianAuthority(tx, session.userId, playerId))) {
      return { status: 403, body: { error: 'Forbidden' } };
    }
    await tx.teamBlocks.deleteMany({ where: { playerId, teamId } });
    return { status: 200, body: { ok: true, playerId, teamId } };
  });
  return NextResponse.json(result.body, { status: result.status });
}
