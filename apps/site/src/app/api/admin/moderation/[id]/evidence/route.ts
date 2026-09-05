import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRazumlyAdmin } from '@/server/razumlyAdmin';
import { readInvitationEvidence } from '@/server/invitationEvidence';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRazumlyAdmin(req);
    const { id } = await params;
    const evidence = await prisma.$transaction((tx) => readInvitationEvidence(tx, id));
    if (!evidence) return NextResponse.json({ evidence: null });
    const ids = [evidence.senderId, evidence.playerId, evidence.actingGuardianId].filter((id): id is string => Boolean(id));
    const [people, team] = await Promise.all([
      prisma.userData.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } }),
      evidence.teamId ? prisma.canonicalTeams.findUnique({ where: { id: evidence.teamId }, select: { name: true } }) : null,
    ]);
    const names = new Map(people.map((person) => [person.id, [person.firstName, person.lastName].filter(Boolean).join(' ') || null]));
    return NextResponse.json({ evidence: { ...evidence, teamName: team?.name ?? null,
      senderName: evidence.senderId ? names.get(evidence.senderId) ?? null : null,
      playerName: evidence.playerId ? names.get(evidence.playerId) ?? null : null,
      actingGuardianName: evidence.actingGuardianId ? names.get(evidence.actingGuardianId) ?? null : null,
    } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Failed to read invitation evidence', error);
    return NextResponse.json({ error: 'Invitation evidence could not be loaded.' }, { status: 500 });
  }
}
