import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { normalizeOptionalName } from '@/lib/nameCase';
import { requireSession } from '@/lib/permissions';
import { calculateAgeOnDate } from '@/lib/age';
import { isFutureDateOfBirth, parseDateOfBirth } from '@/lib/dateOfBirth';
import { hasGuardianAge } from '@/server/guardianAuthority';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().optional(),
  dateOfBirth: z.string(),
  relationship: z.string().optional(),
}).passthrough();

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession(req);
    const links = await prisma.parentChildLinks.findMany({
      where: { parentId: session.userId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });

    const childIds = links.map((link) => link.childId);
    const children = childIds.length
      ? await prisma.userData.findMany({ where: { id: { in: childIds } } })
      : [];

    const childMap = new Map(children.filter((child) => hasGuardianAge(child.dateOfBirth)).map((child) => [child.id, child]));
    const authorizedIds = links.filter((link) => link.status === 'ACTIVE' && childMap.has(link.childId)).map((link) => link.childId);
    const sensitiveRows = authorizedIds.length
      ? await prisma.sensitiveUserData.findMany({
        where: { userId: { in: authorizedIds } },
        select: { userId: true, email: true },
      })
      : [];
    const emailByUserId = new Map(sensitiveRows.map((row) => [row.userId, row.email]));

    const payload = links.filter((link) => authorizedIds.includes(link.childId)).map((link) => {
      const child = childMap.get(link.childId);
      const email = emailByUserId.get(link.childId) ?? null;
      const now = new Date();
      const age = child?.dateOfBirth ? calculateAgeOnDate(child.dateOfBirth, now) : undefined;
      const firstName = normalizeOptionalName(child?.firstName) ?? '';
      const lastName = normalizeOptionalName(child?.lastName) ?? '';
      return {
        userId: link.childId,
        firstName,
        lastName,
        userName: child?.userName?.trim() || null,
        dateOfBirth: child?.dateOfBirth ? child.dateOfBirth.toISOString() : null,
        age,
        linkStatus: link.status.toLowerCase(),
        relationship: link.relationship ?? null,
        email,
        hasEmail: Boolean(email),
      };
    });

    return NextResponse.json({ children: payload }, { status: 200 });
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(req);
    const body = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const childId = crypto.randomUUID();
    const dob = parseDateOfBirth(parsed.data.dateOfBirth);
    if (!dob) {
      return NextResponse.json({ error: 'Invalid dateOfBirth' }, { status: 400 });
    }
    if (isFutureDateOfBirth(dob)) {
      return NextResponse.json({ error: 'dateOfBirth cannot be in the future' }, { status: 400 });
    }
    if (!hasGuardianAge(dob)) {
      return NextResponse.json({ error: 'A child must be under 18 with a known dateOfBirth' }, { status: 400 });
    }
    const firstName = normalizeOptionalName(parsed.data.firstName);
    const lastName = normalizeOptionalName(parsed.data.lastName);
    if (!firstName || !lastName) {
      return NextResponse.json({ error: 'First name and last name are required' }, { status: 400 });
    }

    const link = await prisma.$transaction(async (tx) => {
      await tx.userData.create({
        data: {
          id: childId,
          firstName,
          lastName,
          userName: `${firstName}.${lastName}.${childId.slice(0, 6)}`.toLowerCase(),
          dateOfBirth: dob,
          isManagedPlayer: true,
          friendIds: [],
          friendRequestIds: [],
          friendRequestSentIds: [],
          followingIds: [],
          uploadedImages: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      return tx.parentChildLinks.create({
        data: {
          id: crypto.randomUUID(),
          parentId: session.userId,
          childId,
          status: 'ACTIVE',
          relationship: parsed.data.relationship ?? null,
          createdBy: session.userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    });

    return NextResponse.json({ childUserId: childId, linkId: link.id, status: 'active' }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
}
