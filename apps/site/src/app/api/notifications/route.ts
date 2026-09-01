import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  type: z.literal('documents').default('documents'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const updateSchema = z.object({
  notificationId: z.string().trim().min(1).optional(),
  isMarkAllRead: z.boolean().optional(),
  type: z.literal('documents').default('documents'),
}).refine((value) => Boolean(value.notificationId) || value.isMarkAllRead === true, {
  message: 'notificationId or isMarkAllRead is required',
});

const documentNotificationWhere = (userId: string) => ({
  userId,
  notificationType: 'documents',
});

export async function GET(request: NextRequest) {
  const session = await requireSession(request);
  const parsed = querySchema.safeParse({
    type: request.nextUrl.searchParams.get('type') ?? undefined,
    limit: request.nextUrl.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid notification query.' }, { status: 400 });
  }

  const where = documentNotificationWhere(session.userId);
  const [rows, unreadCount] = await Promise.all([
    prisma.userNotifications.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parsed.data.limit,
      select: {
        id: true,
        createdAt: true,
        notificationType: true,
        title: true,
        body: true,
        data: true,
        readAt: true,
      },
    }),
    prisma.userNotifications.count({
      where: { ...where, readAt: null },
    }),
  ]);

  return NextResponse.json({
    notifications: rows,
    unreadCount,
  }, { status: 200 });
}

export async function PATCH(request: NextRequest) {
  const session = await requireSession(request);
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid notification update.' }, { status: 400 });
  }

  const where = documentNotificationWhere(session.userId);
  const result = await prisma.userNotifications.updateMany({
    where: parsed.data.notificationId
      ? { ...where, id: parsed.data.notificationId }
      : { ...where, readAt: null },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ updatedCount: result.count }, { status: 200 });
}
