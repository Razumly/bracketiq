import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { calculateAgeOnDate } from '@/lib/age';
import { dispatchRequiredEventDocuments } from '@/lib/eventConsentDispatch';
import {
  acquireEventLockAndLoadStructure,
  buildEventParticipantSnapshot,
  deleteEventRegistration,
  upsertEventRegistration,
} from '@/server/events/eventRegistrations';
import { requireVerifiedEmailForEventRegistrationIfPaid } from '@/server/paidRegistrationGate';
import { eventRegistrationErrorResponse } from '@/server/events/eventRegistrationErrorResponse';
import {
  isActiveWeeklyParentEvent,
  isArchivedWeeklyParentEvent,
  isWeeklyOccurrenceJoinClosed,
  resolveWeeklyOccurrence,
  WEEKLY_EVENT_ARCHIVED_ERROR,
  WEEKLY_OCCURRENCE_JOIN_CLOSED_ERROR,
} from '@/server/events/weeklyOccurrences';

export const dynamic = 'force-dynamic';

const payloadSchema = z.object({
  userId: z.string().optional(),
  slotId: z.string().optional(),
  occurrenceDate: z.string().optional(),
}).passthrough();

const normalizeUserId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const canManageChildFreeAgent = async (params: {
  parentId: string;
  childId: string;
}): Promise<boolean> => {
  const link = await prisma.parentChildLinks.findFirst({
    where: {
      parentId: params.parentId,
      childId: params.childId,
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  return Boolean(link);
};

const activeRegistrationStatuses = ['STARTED', 'PENDING', 'ACTIVE', 'BLOCKED', 'CONSENTFAILED', 'PAYMENT_FAILED'] as const;

const occurrenceWhere = (occurrence: { slotId: string; occurrenceDate: string } | null) => (
  occurrence
    ? {
        slotId: occurrence.slotId,
        occurrenceDate: occurrence.occurrenceDate,
      }
    : {
        slotId: null,
        occurrenceDate: null,
      }
);

const cancelRegistrationsConflictingWithFreeAgent = async ({
  client,
  eventId,
  targetUserId,
  actorUserId,
  includeActorTeamHolds,
  occurrence,
}: {
  client: NonNullable<Parameters<typeof upsertEventRegistration>[1]>;
  eventId: string;
  targetUserId: string;
  actorUserId: string;
  includeActorTeamHolds: boolean;
  occurrence: { slotId: string; occurrenceDate: string } | null;
}) => {
  const conflictingTargets: any[] = [
    {
      registrantType: { in: ['SELF', 'CHILD'] },
      registrantId: targetUserId,
    },
  ];

  if (includeActorTeamHolds) {
    conflictingTargets.push({
      registrantType: 'TEAM',
      status: 'STARTED',
      createdBy: actorUserId,
    });
  }

  await client.eventRegistrations.updateMany({
    where: {
      eventId,
      ...occurrenceWhere(occurrence),
      status: { in: [...activeRegistrationStatuses] as any[] },
      rosterRole: { in: ['PARTICIPANT', 'WAITLIST'] as any[] },
      OR: conflictingTargets,
    },
    data: {
      status: 'CANCELLED' as any,
      updatedAt: new Date(),
    },
  });
};

async function updateFreeAgents(
  req: NextRequest,
  params: Promise<{ eventId: string }>,
  mode: 'add' | 'remove',
) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { eventId } = await params;
  const targetUserId = normalizeUserId(parsed.data.userId) ?? session.userId;
  let managingLinkedChild = false;

  if (!session.isAdmin && targetUserId !== session.userId) {
    const canManageChild = await canManageChildFreeAgent({
      parentId: session.userId,
      childId: targetUserId,
    });
    if (!canManageChild) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    managingLinkedChild = true;
  }

  const [event, targetUser] = await Promise.all([
    prisma.events.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        teamSignup: true,
        requiredTemplateIds: true,
        organizationId: true,
        price: true,
        start: true,
        end: true,
        archivedAt: true,
        eventType: true,
        parentEvent: true,
        timeSlotIds: true,
        maxParticipants: true,
        singleDivision: true,
      },
    }),
    prisma.userData.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
      },
    }),
  ]);

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }
  if (isArchivedWeeklyParentEvent(event)) {
    return NextResponse.json({ error: WEEKLY_EVENT_ARCHIVED_ERROR }, { status: 409 });
  }
  if (!targetUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  if (mode === 'add' && !event.teamSignup) {
    return NextResponse.json(
      { error: 'Free-agent signup is only available for team registration events.' },
      { status: 403 },
    );
  }
  if (mode === 'add') {
    const emailVerificationRequired = await requireVerifiedEmailForEventRegistrationIfPaid({
      userId: session.userId,
      event,
      includeAnyPricedDivision: true,
    });
    if (emailVerificationRequired) {
      return emailVerificationRequired;
    }
  }

  const hasOccurrenceInput = Boolean(parsed.data.slotId || parsed.data.occurrenceDate);
  const occurrence = isActiveWeeklyParentEvent(event)
    ? await resolveWeeklyOccurrence({
      event,
      occurrence: parsed.data,
    })
    : null;
  if (occurrence && !occurrence.ok) {
    return NextResponse.json({ error: occurrence.error }, { status: 400 });
  }
  if (!isActiveWeeklyParentEvent(event) && hasOccurrenceInput) {
    return NextResponse.json({ error: 'Weekly occurrence selection is only valid for weekly events.' }, { status: 400 });
  }
  const resolvedOccurrence = occurrence?.ok ? occurrence.value : null;
  if (mode === 'add' && resolvedOccurrence && isWeeklyOccurrenceJoinClosed(resolvedOccurrence)) {
    return NextResponse.json({ error: WEEKLY_OCCURRENCE_JOIN_CLOSED_ERROR }, { status: 409 });
  }

  const targetUserAgeAtEvent = targetUser.dateOfBirth instanceof Date && event.start instanceof Date
    ? calculateAgeOnDate(targetUser.dateOfBirth, event.start)
    : Number.NaN;
  const isMinorTargetUser = Number.isFinite(targetUserAgeAtEvent) && targetUserAgeAtEvent < 18;

  if (mode === 'add' && isMinorTargetUser && !session.isAdmin && !managingLinkedChild) {
    return NextResponse.json(
      {
        error: 'A parent/guardian must approve free-agent registration for child accounts.',
        requiresParentApproval: true,
      },
      { status: 403 },
    );
  }

  if (mode === 'add') {
    const warnings: string[] = [];
    if (managingLinkedChild && Array.isArray(event.requiredTemplateIds) && event.requiredTemplateIds.length > 0) {
      const childSensitive = await prisma.sensitiveUserData.findFirst({
        where: { userId: targetUserId },
        select: { email: true },
      });
      const childEmail = normalizeUserId(childSensitive?.email ?? null);
      if (!childEmail && Number.isFinite(targetUserAgeAtEvent) && targetUserAgeAtEvent < 13) {
        const childName = `${(targetUser.firstName ?? '').trim()} ${(targetUser.lastName ?? '').trim()}`.trim() || targetUserId;
        warnings.push(
          `Under-13 child ${childName} is missing an email and cannot complete child signature steps until an email is added.`,
        );
      }
    }

    if (Array.isArray(event.requiredTemplateIds) && event.requiredTemplateIds.length > 0) {
      const consentDispatch = await dispatchRequiredEventDocuments({
        eventId,
        organizationId: event.organizationId ?? null,
        requiredTemplateIds: event.requiredTemplateIds,
        participantUserId: isMinorTargetUser ? null : targetUserId,
        parentUserId: isMinorTargetUser && managingLinkedChild ? session.userId : null,
        childUserId: isMinorTargetUser && managingLinkedChild ? targetUserId : null,
      });
      warnings.push(...consentDispatch.errors);
    }

    let registration: Awaited<ReturnType<typeof upsertEventRegistration>>;
    try {
      registration = await prisma.$transaction(async (tx) => {
        await acquireEventLockAndLoadStructure(tx, event.id, {
          eventType: event.eventType,
          teamSignup: event.teamSignup,
        });
        await cancelRegistrationsConflictingWithFreeAgent({
          client: tx,
          eventId,
          targetUserId,
          actorUserId: session.userId,
          includeActorTeamHolds: targetUserId === session.userId,
          occurrence: resolvedOccurrence,
        });
        return upsertEventRegistration({
          eventId,
          registrantType: managingLinkedChild ? 'CHILD' : 'SELF',
          registrantId: targetUserId,
          parentId: managingLinkedChild ? session.userId : null,
          rosterRole: 'FREE_AGENT',
          status: 'ACTIVE',
          ageAtEvent: Number.isFinite(targetUserAgeAtEvent) ? targetUserAgeAtEvent : null,
          createdBy: session.userId,
          occurrence: resolvedOccurrence,
        }, tx);
      });
    } catch (error) {
      const archivedResponse = eventRegistrationErrorResponse(error);
      if (archivedResponse) return archivedResponse;
      throw error;
    }

    const refreshedEvent = await prisma.events.findUnique({ where: { id: eventId } });
    const snapshot = await buildEventParticipantSnapshot({
      event: refreshedEvent ?? event,
      occurrence: resolvedOccurrence,
    });
    return NextResponse.json({
      event: {
        ...(refreshedEvent ? refreshedEvent : event),
        teamIds: snapshot.participants.teamIds,
        userIds: snapshot.participants.userIds,
        waitListIds: snapshot.participants.waitListIds,
        freeAgentIds: snapshot.participants.freeAgentIds,
      },
      participants: snapshot.participants,
      registration: registration,
      warnings: warnings.length ? warnings : undefined,
    }, { status: 200 });
  }

  try {
    await deleteEventRegistration({
      eventId,
      registrantType: managingLinkedChild ? 'CHILD' : 'SELF',
      registrantId: targetUserId,
      occurrence: resolvedOccurrence,
    });
  } catch (error) {
    const archivedResponse = eventRegistrationErrorResponse(error);
    if (archivedResponse) return archivedResponse;
    throw error;
  }

  const refreshedEvent = await prisma.events.findUnique({ where: { id: eventId } });
  const snapshot = await buildEventParticipantSnapshot({
    event: refreshedEvent ?? event,
    occurrence: resolvedOccurrence,
  });
  return NextResponse.json({
    event: {
      ...(refreshedEvent ? refreshedEvent : event),
      teamIds: snapshot.participants.teamIds,
      userIds: snapshot.participants.userIds,
      waitListIds: snapshot.participants.waitListIds,
      freeAgentIds: snapshot.participants.freeAgentIds,
    },
    participants: snapshot.participants,
  }, { status: 200 });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  return updateFreeAgents(req, params, 'add');
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  return updateFreeAgents(req, params, 'remove');
}
