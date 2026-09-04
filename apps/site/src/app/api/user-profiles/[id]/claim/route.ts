import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { claimManagedPlayerProfile } from '@/server/managedPlayers';
import { verifyTeamInviteShareLink } from '@/server/teamInviteLinks';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  inviteId: z.string().min(1),
  confirmation: z.literal(true),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  version: z.string().optional(),
  expiresAt: z.string().optional(),
  signature: z.string().optional(),
}).passthrough();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(req);
  const { id: profileId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse({
    ...(body ?? {}),
    version: (body as any)?.version ?? req.nextUrl.searchParams.get('v') ?? undefined,
    expiresAt: (body as any)?.expiresAt ?? req.nextUrl.searchParams.get('e') ?? undefined,
    signature: (body as any)?.signature ?? req.nextUrl.searchParams.get('s') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Explicit profile claim confirmation is required' }, { status: 400 });
  }

  try {
    const result = await claimManagedPlayerProfile(prisma, {
      profileId,
      inviteId: parsed.data.inviteId,
      dateOfBirth: parsed.data.dateOfBirth,
      link: {
        version: parsed.data.version ?? null,
        expiresAt: parsed.data.expiresAt ?? null,
        signature: parsed.data.signature ?? null,
      },
      confirmation: parsed.data.confirmation,
      claimantUserId: session.userId,
      verifyLink: verifyTeamInviteShareLink,
    });
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Profile claim failed';
    const status = /invalid|expired|unavailable/i.test(message)
      ? 404
      : /required|does not match|another Account|controlled|already been claimed|minor/i.test(message)
        ? 409
        : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
