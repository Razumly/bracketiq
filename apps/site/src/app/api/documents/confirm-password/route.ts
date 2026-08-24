import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { signRecentAuthToken, verifyPassword } from '@/lib/authServer';

const schema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(1),
  eventId: z.string().optional(),
}).passthrough();

export async function POST(request: NextRequest) {
  const session = await requireSession(request);
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Password is required.' }, { status: 400 });
  }

  const requestedEmail = parsed.data.email?.trim().toLowerCase();
  const authUser = await prisma.authUser.findUnique({
    where: { id: session.userId },
  });
  if (!authUser) {
    return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });
  }

  if (requestedEmail && authUser.email.trim().toLowerCase() !== requestedEmail) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const ok = await verifyPassword(parsed.data.password, authUser.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    recentAuthToken: signRecentAuthToken({
      userId: session.userId,
      purpose: 'sensitive_action',
    }),
  }, { status: 200 });
}
