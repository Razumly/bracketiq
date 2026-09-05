import { requireSession } from '@/lib/permissions';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { POST as remindInvitation } from '@/app/api/invites/[id]/remind/route';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; inviteId: string }> }) {
  await requireSession(req);
  const { id, inviteId } = await params;
  const invite = await prisma.invites.findFirst({ where: { id: inviteId, teamId: id } });
  if (!invite) return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const request = new NextRequest(req.url, {
    method: 'POST', headers: req.headers,
    body: JSON.stringify({ idempotencyKey: body.idempotencyKey ?? req.headers.get('Idempotency-Key') ?? `legacy-reminder:${inviteId}` }),
  });
  return remindInvitation(request, { params: Promise.resolve({ id: inviteId }) });
}
