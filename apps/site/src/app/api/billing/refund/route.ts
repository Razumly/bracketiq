import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/permissions';
import { getRefundPolicy } from '@/lib/refundPolicy';
import {
  applyRefundAttempts,
  buildRefundScopeSnapshot,
  createStripeRefundAttempts,
  hasRefundScopeDrift,
  REFUND_SCOPE_VERSION,
  resolveRefundablePaymentsForRequest,
  isRefundScopeSnapshotValid,
  summarizeRefundAttempts,
  type RefundRequestRow,
  type StripeRefundAttempt,
} from '@/server/refunds/refundExecution';
import { getEventParticipantIdsForEvent } from '@/server/events/eventRegistrations';
import {
  acquireEventMutationTarget,
  isWeeklyParentEvent,
  resolveWeeklyOccurrence,
  resolveWeeklyOccurrenceStartAt,
} from '@/server/events/weeklyOccurrences';

export const dynamic = 'force-dynamic';

const schema = z.object({
  payloadEvent: z.record(z.string(), z.any()).optional(),
  user: z.record(z.string(), z.any()).optional(),
  userId: z.string().optional(),
  reason: z.string().optional(),
  slotId: z.string().optional(),
  occurrenceDate: z.string().optional(),
}).passthrough();

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const canManageLinkedChildRefund = async (params: {
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

export async function POST(req: NextRequest) {
  const session = await requireSession(req);
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const requestedEventId = normalizeId(
    parsed.data.payloadEvent?.$id
      ?? parsed.data.payloadEvent?.id
      ?? parsed.data.payloadEvent?.eventId,
  );
  if (!requestedEventId) {
    return NextResponse.json({ error: 'Event is required' }, { status: 400 });
  }

  const targetUserId = normalizeId(parsed.data.userId)
    ?? normalizeId(parsed.data.user?.$id)
    ?? normalizeId(parsed.data.user?.id)
    ?? session.userId;

  if (!session.isAdmin && targetUserId !== session.userId) {
    const canManageChild = await canManageLinkedChildRefund({
      parentId: session.userId,
      childId: targetUserId,
    });
    if (!canManageChild) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }
  const eventTarget = await prisma.$transaction((tx) => (
    acquireEventMutationTarget(tx, requestedEventId)
  ));
  if (!eventTarget) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }
  const event = eventTarget.parentEvent ?? eventTarget.event;
  let eventId = event.id;

  const hasOccurrenceInput = Boolean(parsed.data.slotId || parsed.data.occurrenceDate);
  const isWeeklyParent = isWeeklyParentEvent(event);
  const weeklyOccurrence = isWeeklyParent
    ? await resolveWeeklyOccurrence({
      event,
      occurrence: parsed.data,
      allowArchivedEvent: Boolean(event.archivedAt),
    })
    : null;
  if (weeklyOccurrence && !weeklyOccurrence.ok) {
    return NextResponse.json({ error: weeklyOccurrence.error }, { status: 400 });
  }
  if (isWeeklyParent && (!parsed.data.slotId || !parsed.data.occurrenceDate)) {
    return NextResponse.json(
      { error: 'Weekly event refunds require slotId and occurrenceDate.' },
      { status: 400 },
    );
  }
  if (!isWeeklyParent && hasOccurrenceInput) {
    return NextResponse.json(
      { error: 'Weekly occurrence selection is only valid for weekly events.' },
      { status: 400 },
    );
  }
  const resolvedOccurrence = weeklyOccurrence?.ok ? weeklyOccurrence.value : null;
  const occurrenceWhere = resolvedOccurrence
    ? {
      slotId: resolvedOccurrence.slotId,
      occurrenceDate: resolvedOccurrence.occurrenceDate,
    }
    : {
      slotId: null,
      occurrenceDate: null,
    };

  const participantIds = await getEventParticipantIdsForEvent(eventId, prisma, resolvedOccurrence);
  const registeredTeam = participantIds.teamIds.length > 0
    ? await prisma.teams.findFirst({
      where: {
        id: { in: participantIds.teamIds },
        OR: [
          { playerIds: { has: targetUserId } },
          { captainId: targetUserId },
          { managerId: targetUserId },
          { headCoachId: targetUserId },
          { coachIds: { has: targetUserId } },
        ],
      },
      select: { id: true },
    })
    : null;
  const isTargetInEvent = participantIds.userIds.includes(targetUserId)
    || participantIds.waitListIds.includes(targetUserId)
    || participantIds.freeAgentIds.includes(targetUserId)
    || Boolean(registeredTeam);

  if (!isTargetInEvent) {
    return NextResponse.json(
      { error: 'Selected user is not currently registered, waitlisted, or listed as a free agent for this event.' },
      { status: 400 },
    );
  }

  const now = new Date();
  const reason = normalizeId(parsed.data.reason) ?? 'requested_by_customer';
  const refundTeamId = registeredTeam?.id ?? null;
  const effectiveStart = resolvedOccurrence
    ? resolveWeeklyOccurrenceStartAt(resolvedOccurrence.slot, resolvedOccurrence.occurrenceDate) ?? event.start
    : event.start;
  const { canAutoRefund } = getRefundPolicy({
    start: effectiveStart,
    cancellationRefundHours: event.cancellationRefundHours,
  }, now);

  const requestSelect = {
    id: true,
    eventId: true,
    userId: true,
    hostId: true,
    teamId: true,
    organizationId: true,
    reason: true,
    status: true,
    requestedByUserId: true,
    slotId: true,
    occurrenceDate: true,
    billIds: true,
    paymentIds: true,
    paymentScope: true,
    requestedAmountCents: true,
    currency: true,
    policyDecision: true,
    scopeVersion: true,
    scopeHash: true,
  } as const;

  const buildRefundRequestRow = (id: string, status: RefundRequestRow['status']): RefundRequestRow => ({
    id,
    eventId,
    userId: targetUserId,
    hostId: event.hostId ?? parsed.data.payloadEvent?.hostId ?? null,
    teamId: refundTeamId,
    organizationId: event.organizationId ?? parsed.data.payloadEvent?.organizationId ?? null,
    reason,
    status,
    requestedByUserId: session.userId,
    slotId: resolvedOccurrence?.slotId ?? null,
    occurrenceDate: resolvedOccurrence?.occurrenceDate ?? null,
  });

  if (canAutoRefund) {
    const newRefundRequest = buildRefundRequestRow(crypto.randomUUID(), 'WAITING');
    const intent = await prisma.$transaction(async (tx) => {
      const target = await acquireEventMutationTarget(tx, eventId);
      if (!target) {
        return { kind: 'missing' as const };
      }

      const existingAutoRefund = await tx.refundRequests.findFirst({
        where: {
          eventId,
          userId: targetUserId,
          teamId: refundTeamId,
          slotId: resolvedOccurrence?.slotId ?? null,
          occurrenceDate: resolvedOccurrence?.occurrenceDate ?? null,
          status: { in: ['WAITING', 'APPROVED'] },
        },
        orderBy: {
          updatedAt: 'desc',
        },
        select: requestSelect,
      }) as RefundRequestRow | null;

      if (existingAutoRefund && !isRefundScopeSnapshotValid(existingAutoRefund)) {
        return { kind: 'invalid_scope' as const };
      }

      const targetArchived = Boolean(
        target.event.archivedAt || target.parentEvent?.archivedAt,
      );
      if (targetArchived && !existingAutoRefund) {
        return { kind: 'archived' as const };
      }

      const requestForIntent: RefundRequestRow = existingAutoRefund
        ? {
          ...existingAutoRefund,
          reason,
          slotId: resolvedOccurrence?.slotId ?? null,
          occurrenceDate: resolvedOccurrence?.occurrenceDate ?? null,
        }
        : newRefundRequest;
      const refundablePayments = await resolveRefundablePaymentsForRequest(
        tx,
        requestForIntent,
        { scopeMode: 'INDIVIDUAL' },
      );
      if (
        existingAutoRefund
        && hasRefundScopeDrift(existingAutoRefund, refundablePayments)
      ) {
        return { kind: 'scope_drift' as const };
      }
      if (!existingAutoRefund && !refundablePayments.length) {
        return { kind: 'no_payments' as const };
      }

      const persistedRequest = existingAutoRefund
        ? requestForIntent
        : {
          ...requestForIntent,
          status: 'WAITING' as const,
          ...buildRefundScopeSnapshot(
            requestForIntent,
            refundablePayments,
            'AUTO_APPROVED',
          ),
        };
      if (!existingAutoRefund) {
        await tx.refundRequests.create({
          data: {
            id: persistedRequest.id,
            eventId: persistedRequest.eventId,
            userId: persistedRequest.userId,
            requestedByUserId: persistedRequest.requestedByUserId,
            hostId: persistedRequest.hostId,
            teamId: persistedRequest.teamId,
            organizationId: persistedRequest.organizationId,
            slotId: persistedRequest.slotId ?? null,
            occurrenceDate: persistedRequest.occurrenceDate ?? null,
            billIds: persistedRequest.billIds ?? [],
            paymentIds: persistedRequest.paymentIds ?? [],
            paymentScope: persistedRequest.paymentScope ?? [],
            requestedAmountCents: persistedRequest.requestedAmountCents ?? 0,
            currency: persistedRequest.currency ?? 'usd',
            policyDecision: persistedRequest.policyDecision,
            scopeVersion: persistedRequest.scopeVersion ?? REFUND_SCOPE_VERSION,
            scopeHash: persistedRequest.scopeHash,
            reason: persistedRequest.reason,
            status: 'WAITING',
            createdAt: now,
            updatedAt: now,
          },
        });
      }

      return {
        kind: 'ready' as const,
        request: persistedRequest,
        refundablePayments,
      };
    });
    if (intent.kind === 'missing') {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    if (intent.kind === 'invalid_scope') {
      return NextResponse.json(
        { error: 'This legacy refund request has no verified payment scope. Submit a new request.' },
        { status: 409 },
      );
    }
    if (intent.kind === 'archived') {
      return NextResponse.json(
        { error: 'This event is archived and no longer accepts automatic refunds.' },
        { status: 409 },
      );
    }
    if (intent.kind === 'scope_drift') {
      return NextResponse.json(
        { error: 'The payment scope changed after this automatic refund was created. Submit a new refund request.' },
        { status: 409 },
      );
    }
    if (intent.kind === 'no_payments') {
      return NextResponse.json(
        { error: 'No refundable payment found for automatic refund.' },
        { status: 400 },
      );
    }

    let stripeRefundAttempts: StripeRefundAttempt[] = [];
    try {
      stripeRefundAttempts = await createStripeRefundAttempts({
        request: intent.request,
        payments: intent.refundablePayments,
        approvedByUserId: session.userId,
      });
    } catch (error) {
      console.error('Stripe refund failed during automatic refund processing', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to create refund.' },
        { status: 502 },
      );
    }

    if (!stripeRefundAttempts.length) {
      return NextResponse.json(
        { error: 'No refundable payment found for automatic refund.' },
        { status: 400 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const target = await acquireEventMutationTarget(tx, eventId);
      if (!target) {
        return { missing: true as const };
      }
      await tx.eventRegistrations.updateMany({
        where: {
          eventId,
          registrantId: targetUserId,
          registrantType: { in: ['SELF', 'CHILD'] },
          rosterRole: { in: ['PARTICIPANT', 'WAITLIST', 'FREE_AGENT'] },
          status: { in: ['STARTED', 'PENDING', 'ACTIVE', 'BLOCKED', 'CONSENTFAILED'] },
          ...occurrenceWhere,
        },
        data: {
          status: 'CANCELLED',
          updatedAt: now,
        },
      });

      const persistedRequest = await tx.refundRequests.update({
        where: { id: intent.request.id },
        data: {
          status: 'APPROVED',
          updatedAt: now,
        },
        select: { id: true, status: true },
      });
      const updatedPayments = await applyRefundAttempts(tx, stripeRefundAttempts, now);

      return {
        persistedRequest,
        updatedPayments,
      };
    });
    if ('missing' in result) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const refundSummary = summarizeRefundAttempts(stripeRefundAttempts);

    return NextResponse.json(
      {
        success: true,
        emailSent: false,
        targetUserId,
        refundId: result.persistedRequest.id,
        refundAlreadyPending: false,
        refundStatus: result.persistedRequest.status,
        refundedAmountCents: refundSummary.refundedAmountCents,
        stripeRefundIds: refundSummary.stripeRefundIds,
        refundedPaymentIds: result.updatedPayments.map((payment: { id: string }) => payment.id),
      },
      { status: 200 },
    );
  }

  const waitingRequest = buildRefundRequestRow(crypto.randomUUID(), 'WAITING');
  const waitingPayments = await resolveRefundablePaymentsForRequest(
    prisma,
    waitingRequest,
    { scopeMode: 'INDIVIDUAL' },
  );
  const waitingScope = buildRefundScopeSnapshot(waitingRequest, waitingPayments, 'HOST_REVIEW_REQUIRED');

  const result = await prisma.$transaction(async (tx) => {
    const target = await acquireEventMutationTarget(tx, eventId);
    if (!target) {
      return { missing: true as const };
    }
    const existingWaitingRequest = await tx.refundRequests.findFirst({
      where: {
        eventId,
        userId: targetUserId,
        teamId: refundTeamId,
        slotId: resolvedOccurrence?.slotId ?? null,
        occurrenceDate: resolvedOccurrence?.occurrenceDate ?? null,
        status: 'WAITING',
      },
      orderBy: { updatedAt: 'desc' },
      select: requestSelect,
    });

    await tx.eventRegistrations.updateMany({
      where: {
        eventId,
        registrantId: targetUserId,
        registrantType: { in: ['SELF', 'CHILD'] },
        rosterRole: { in: ['PARTICIPANT', 'WAITLIST', 'FREE_AGENT'] },
        status: { in: ['STARTED', 'PENDING', 'ACTIVE', 'BLOCKED', 'CONSENTFAILED'] },
        ...occurrenceWhere,
      },
      data: {
        status: 'CANCELLED',
        updatedAt: now,
      },
    });

    if (existingWaitingRequest && isRefundScopeSnapshotValid(existingWaitingRequest as RefundRequestRow)) {
      return {
        createdRefund: false,
        refundId: existingWaitingRequest.id,
      };
    }

    const createdRefund = await tx.refundRequests.create({
      data: {
        id: waitingRequest.id,
        eventId,
        userId: targetUserId,
        requestedByUserId: session.userId,
        hostId: event.hostId ?? parsed.data.payloadEvent?.hostId ?? null,
        teamId: refundTeamId,
        organizationId: event.organizationId ?? parsed.data.payloadEvent?.organizationId ?? null,
        slotId: resolvedOccurrence?.slotId ?? null,
        occurrenceDate: resolvedOccurrence?.occurrenceDate ?? null,
        billIds: waitingScope.billIds,
        paymentIds: waitingScope.paymentIds,
        paymentScope: waitingScope.paymentScope,
        requestedAmountCents: waitingScope.requestedAmountCents,
        currency: waitingScope.currency,
        policyDecision: waitingScope.policyDecision,
        scopeVersion: waitingScope.scopeVersion,
        scopeHash: waitingScope.scopeHash,
        reason,
        status: 'WAITING',
        createdAt: now,
        updatedAt: now,
      },
      select: {
        id: true,
      },
    });

    return {
      createdRefund: true,
      refundId: createdRefund.id,
    };
  });
  if ('missing' in result) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  return NextResponse.json(
    {
      success: true,
      emailSent: false,
      targetUserId,
      refundId: result.refundId,
      refundAlreadyPending: !result.createdRefund,
    },
    { status: 200 },
  );
}
