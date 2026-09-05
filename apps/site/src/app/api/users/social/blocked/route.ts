import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { applyNameCaseToUserFields } from '@/lib/nameCase';
import { sendModerationAlert } from '@/server/moderation';
import { blockUserInTransaction } from '@/server/userBlocking';
import { toSocialErrorResponse } from '@/app/api/users/social/shared';

const blockSchema = z.object({
  targetUserId: z.string().trim().min(1),
  leaveSharedChats: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const parsed = blockSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  try {
    const result = await prisma.$transaction((tx) => blockUserInTransaction(
      tx, session.userId, parsed.data.targetUserId, parsed.data.leaveSharedChats !== false,
    ));
    await sendModerationAlert(result.report).catch((error) => console.warn('Failed to send block moderation alert', error));
    return NextResponse.json({ user: applyNameCaseToUserFields(result.user), removedChatIds: result.removedChatIds });
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ error: await error.text() }, { status: error.status });
    return toSocialErrorResponse(error);
  }
}
